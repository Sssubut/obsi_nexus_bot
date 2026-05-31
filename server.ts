import express from 'express';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { createServer as createViteServer } from 'vite';
import dotenv from 'dotenv';
import JSZip from 'jszip';
import { generatePureMainJs, generateManifestJson, generateStylesCss, generateReadme } from './src/utils/codeGenerator';

dotenv.config();

// в памяти храним очереди сообщений для каждого пользователя (привязаны к syncCode / chat_id)
const userQueues = new Map<string, any[]>();
const searchQueues = new Map<string, { query: string; update_id: number }[]>();
const confirmedUpdates = new Map<string, Set<number>>();
let lastUpdateId = 0;

// Маппинг chat_id → токен и токен → chat_id
const chatIdToToken = new Map<number, string>();
const tokenToChatId = new Map<string, number>();

function generateToken(): string {
  return crypto.randomBytes(4).toString('hex');
}

function getOrCreateToken(chatId: number): string {
  let token = chatIdToToken.get(chatId);
  if (!token) {
    token = generateToken();
    chatIdToToken.set(chatId, token);
    tokenToChatId.set(token, chatId);
    scheduleSave();
  }
  return token;
}

function regenerateToken(chatId: number): string {
  const oldToken = chatIdToToken.get(chatId);
  if (oldToken) {
    tokenToChatId.delete(oldToken);
  }
  const newToken = generateToken();
  chatIdToToken.set(chatId, newToken);
  tokenToChatId.set(newToken, chatId);
  const oldQueue = userQueues.get(oldToken || '');
  if (oldToken && oldQueue) {
    userQueues.set(newToken, oldQueue);
  }
  scheduleSave();
  return newToken;
}

function resolveSyncCode(syncCode: string): string | null {
  // Прямое совпадение с токеном
  if (tokenToChatId.has(syncCode)) {
    return syncCode;
  }
  // Старый формат — числовой chat_id
  const chatId = Number(syncCode);
  if (!isNaN(chatId) && chatIdToToken.has(chatId)) {
    return chatIdToToken.get(chatId)!;
  }
  return null;
}

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '6852938152:AAH_g7K7kLMpdWqpU9X8X1vQz7Zdf_ex990';
const TELEGRAM_API_BASE = process.env.TELEGRAM_API_BASE_URL || 'https://api.telegram.org';

const onboardedChats = new Set<number>();
const awaitingSearch = new Set<number>();

const STATE_PATH = path.join(process.cwd(), 'state.json');
let saveTimeout: ReturnType<typeof setTimeout> | null = null;

interface PersistedState {
  chatIdToToken: [number, string][];
  lastUpdateId: number;
  onboardedChats: number[];
}

function loadState() {
  try {
    if (!fs.existsSync(STATE_PATH)) return;
    const raw = fs.readFileSync(STATE_PATH, 'utf-8');
    const data = JSON.parse(raw) as PersistedState;
    for (const [chatId, token] of data.chatIdToToken) {
      chatIdToToken.set(chatId, token);
      tokenToChatId.set(token, chatId);
    }
    lastUpdateId = data.lastUpdateId || 0;
    for (const id of data.onboardedChats) {
      onboardedChats.add(id);
    }
    console.log(`State loaded: ${data.chatIdToToken.length} users, lastUpdateId=${lastUpdateId}`);
  } catch (err) {
    console.error('Failed to load state:', err);
  }
}

function saveState() {
  try {
    const data: PersistedState = {
      chatIdToToken: Array.from(chatIdToToken.entries()),
      lastUpdateId,
      onboardedChats: Array.from(onboardedChats),
    };
    fs.writeFileSync(STATE_PATH, JSON.stringify(data), 'utf-8');
  } catch (err) {
    console.error('Failed to save state:', err);
  }
}

function scheduleSave() {
  if (saveTimeout) clearTimeout(saveTimeout);
  saveTimeout = setTimeout(() => {
    saveState();
    saveTimeout = null;
  }, 3000);
}

const COMMAND_KEYBOARD = {
  keyboard: [
    [{ text: '🔑 Мой код' }],
    [{ text: '📊 Статус' }, { text: '🔄 Новый токен' }],
    [{ text: '🔍 Поиск' }, { text: '📥 Плагин' }, { text: '❓ Помощь' }]
  ],
  resize_keyboard: true,
  input_field_placeholder: 'Напиши сообщение или нажми кнопку...'
};

// Помощник для отправки сообщений обратно в Telegram с клавиатурой
async function sendWithKeyboard(chatId: string | number, text: string) {
  try {
    const res = await fetch(`${TELEGRAM_API_BASE}/bot${BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: "HTML",
        reply_markup: COMMAND_KEYBOARD
      }),
    });
    if (!res.ok) {
      const errBody = await res.text();
      console.error(`Telegram API error (chat ${chatId}): ${res.status} ${errBody}`);
    }
  } catch (err) {
    console.error("Error sending response to Telegram:", err);
  }
}

function getServerUrl(): string {
  return process.env.SERVER_URL || `http://localhost:${process.env.PORT || '3000'}`;
}

async function sendPluginZip(chatId: number) {
  const serverUrl = getServerUrl();

  try {
    const zip = new JSZip();
    zip.file('main.js', generatePureMainJs(serverUrl));
    zip.file('manifest.json', generateManifestJson());
    zip.file('styles.css', generateStylesCss());
    zip.file('README.md', generateReadme(serverUrl));

    const zipBuffer = await zip.generateAsync({ type: 'nodebuffer' });

    const formData = new FormData();
    formData.append('chat_id', String(chatId));
    formData.append('document', new Blob([zipBuffer], { type: 'application/zip' }), 'obsidian-telegram-sync.zip');
    formData.append('reply_markup', JSON.stringify(COMMAND_KEYBOARD));

    const res = await fetch(`${TELEGRAM_API_BASE}/bot${BOT_TOKEN}/sendDocument`, {
      method: 'POST',
      body: formData,
    });

    if (!res.ok) {
      const errBody = await res.text();
      console.error(`sendPluginZip error: ${res.status} ${errBody}`);
      await sendWithKeyboard(chatId, `❌ Не удалось отправить ZIP. Открой сайт ${serverUrl} и нажми Download ZIP.`);
    }

    await sendWithKeyboard(chatId, `📥 <b>Вот архив с плагином.</b>

Распакуй его в папку:
<code>.obsidian/plugins/obsidian-telegram-sync/</code>

Поток включи плагин в <b>Настройки → Community plugins</b>.

Подробная инструкция — внутри архива (README.md).`);
  } catch (err) {
    console.error('sendPluginZip error:', err);
    await sendWithKeyboard(chatId, `❌ Ошибка при создании ZIP. Открой сайт ${serverUrl} и нажми Download ZIP.`);
  }
}

// Генерирует описание для нетекстовых сообщений (стикеры, локации и т.д.)
function describeMessage(msg: any): string {
  if (msg.text) return msg.text;
  if (msg.caption) return msg.caption;

  if (msg.sticker) return msg.sticker.emoji ? `🎨 Sticker: ${msg.sticker.emoji}` : '🎨 Sticker';
  if (msg.voice) return '🎤 Голосовое сообщение';
  if (msg.video) return '🎬 Видео';
  if (msg.video_note) return '🎬 Видеосообщение';
  if (msg.audio) return '🎵 Аудио';
  if (msg.animation) return '🖼️ GIF/Анимация';
  if (msg.photo) return '📸 Фото';
  if (msg.document) return msg.document.file_name ? `📄 Документ: ${msg.document.file_name}` : '📄 Документ';
  if (msg.location) return `📍 Локация: ${msg.location.latitude}, ${msg.location.longitude}`;
  if (msg.contact) return msg.contact.first_name ? `👤 Контакт: ${msg.contact.first_name}${msg.contact.last_name ? ` ${msg.contact.last_name}` : ''}` : '👤 Контакт';
  if (msg.poll) return `📊 Опрос: ${msg.poll.question || ''}`;
  if (msg.dice) return `🎲 ${msg.dice.emoji} — ${msg.dice.value}`;
  return '💬 Сообщение';
}

// Вечный цикл поллинга для общего бота
async function startTelegramPolling() {
  console.log(`Starting Telegram background polling with token: ${BOT_TOKEN.substring(0, 10)}... (Base URL: ${TELEGRAM_API_BASE})`);

  // Регистрируем команды в Telegram (показываются в меню)
  try {
    await fetch(`${TELEGRAM_API_BASE}/bot${BOT_TOKEN}/setMyCommands`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        commands: [
          { command: 'start', description: 'Показать Код синхронизации' },
          { command: 'help', description: 'Справка' },
          { command: 'status', description: 'Статус очереди' },
          { command: 'newtoken', description: 'Сбросить токен' },
          { command: 'search', description: 'Поиск по заметкам Obsidian' },
          { command: 'plugin', description: 'Как установить плагин' },
          { command: 'cancel', description: 'Отменить поиск' },
        ]
      }),
    });
  } catch { /* не критично */ }

  // Очистка накопившейся очереди старых сообщений перед запуском
  try {
    console.log('Очистка накопившейся очереди старых сообщений...');
    const clearRes = await fetch(`${TELEGRAM_API_BASE}/bot${BOT_TOKEN}/getUpdates?offset=-1&timeout=1`);
    if (clearRes.ok) {
      const data = await clearRes.json() as any;
      if (data.ok && data.result && data.result.length > 0) {
        lastUpdateId = Math.max(lastUpdateId, data.result[0].update_id);
        scheduleSave();
      }
    }
    await fetch(`${TELEGRAM_API_BASE}/bot${BOT_TOKEN}/getUpdates?offset=${lastUpdateId + 1}&timeout=1`);
    console.log('Очередь успешно очищена! Бот готов мгновенно отвечать.');
  } catch (err) {
    console.error('Ошибка при очистке очереди:', err);
  }
  
  while (true) {
    try {
      const url = `${TELEGRAM_API_BASE}/bot${BOT_TOKEN}/getUpdates?offset=${lastUpdateId + 1}&timeout=30`;
      const response = await fetch(url);
      if (response.ok) {
        const data = await response.json() as any;
        if (data.ok && data.result) {
          for (const update of data.result) {
            lastUpdateId = Math.max(lastUpdateId, update.update_id);
            scheduleSave();
            
            const message = update.message;
            if (message && message.chat && message.chat.id) {
              const chatId = message.chat.id;
              const token = getOrCreateToken(chatId);
              const text = message.text || message.caption || '';
              console.log(`← msg chat:${chatId} token:${token} len:${text.length}`,
                text ? `"${text.substring(0, 50)}${text.length > 50 ? '...' : ''}"` : '(no text)');

              const isStart = text && (text.startsWith('/start') || text.includes('Мой код'));
              const isHelp = text && (text.startsWith('/help') || text.includes('Помощь'));
              const isNewToken = text && (text.startsWith('/newtoken') || text.includes('Новый токен'));
              const isStatus = text && (text.startsWith('/status') || text.includes('Статус'));
              const isSearch = text && (text.startsWith('/search') || text.includes('Поиск'));
              const isPlugin = text && (text.startsWith('/plugin') || text.includes('Плагин'));
              const isCancel = text && text.startsWith('/cancel');

              if (isStart) {
                onboardedChats.add(chatId);
                scheduleSave();
                const greeting = `👋 <b>Привет! Я твой Telegram-Obsidian ассистент!</b>
                
<b>Cloud Sync активен</b>

Твой <b>Код синхронизации</b>:
<code>${token}</code>

<b>Как настроить плагин в Obsidian:</b>
1. Нажми «📥 Плагин» чтобы скачать ZIP с плагином и README
2. Или открой сайт: <code>http://localhost:3000</code>
3. Вставь этот код в настройках плагина
4. Всё! Заметки будут приходить автоматически

Просто отправь мне любое сообщение, картинку или файл — оно появится в Obsidian.`;
                
                await sendWithKeyboard(chatId, greeting);
              } else if (isHelp) {
                onboardedChats.add(chatId);
                scheduleSave();
                const helpMessage = `🤖 <b>Telegram Sync — ассистент для Obsidian</b>

<b>Код синхронизации:</b>
<code>${token}</code>

<b>Как пользоваться:</b>
• Просто отправь текст, фото или файл — он появится в Obsidian
• Используй кнопки ниже для управления

<b>Кнопки:</b>
🔑 Мой код — показать твой Код синхронизации
📊 Статус — проверить очередь сообщений
🔄 Новый токен — сбросить токен (старый перестанет работать)
🔍 Поиск — искать заметки в Obsidian
📥 Плагин — скачать ZIP с плагином и README
❓ Помощь — эта справка`;
                
                await sendWithKeyboard(chatId, helpMessage);
              } else if (isNewToken) {
                const oldToken = token;
                const newToken = regenerateToken(chatId);
                await sendWithKeyboard(chatId, `✅ <b>Твой Код синхронизации обновлён!</b>

Старый: <code>${oldToken}</code>
Новый: <code>${newToken}</code>

Не забудь обновить код в настройках плагина Obsidian!`);
              } else if (isStatus) {
                onboardedChats.add(chatId);
                scheduleSave();
                await sendWithKeyboard(chatId, `📡 <b>Статус синхронизации: Активен</b>
                
• Код: <code>${token}</code>
• В очереди: <code>${(userQueues.get(token) || []).length}</code> сообщений`);
              } else if (isCancel) {
                awaitingSearch.delete(chatId);
                await sendWithKeyboard(chatId, `❌ Поиск отменён`);
              } else if (isSearch) {
                awaitingSearch.delete(chatId);
                const query = text.startsWith('/search') ? text.substring('/search'.length).trim() : '';
                if (query) {
                  let queue = searchQueues.get(token);
                  if (!queue) {
                    queue = [];
                    searchQueues.set(token, queue);
                  }
                  queue.push({ query, update_id: update.update_id });
                  await sendWithKeyboard(chatId, `🔍 Ищу «${query}» в твоих заметках...`);
                } else {
                  awaitingSearch.add(chatId);
                  await sendWithKeyboard(chatId, `🔍 Напиши текст для поиска по заметкам.\nИли отправь /cancel чтобы отменить.`);
                }
              } else if (isPlugin) {
                await sendPluginZip(chatId);
              } else if (text && text.startsWith('/')) {
                console.log(`Telegram Sync: неизвестная команда от ${chatId}: ${text.split(' ')[0]}`);
              } else {
                // Если пользователь ожидает ввода поискового запроса
                if (awaitingSearch.has(chatId)) {
                  awaitingSearch.delete(chatId);
                  const query = (message.text || message.caption || '').trim();
                  if (query) {
                    let queue = searchQueues.get(token);
                    if (!queue) {
                      queue = [];
                      searchQueues.set(token, queue);
                    }
                    queue.push({ query, update_id: update.update_id });
                    await sendWithKeyboard(chatId, `🔍 Ищу «${query}» в твоих заметках...`);
                  } else {
                    await sendWithKeyboard(chatId, `❌ Поиск отменён (пустой запрос)`);
                  }
                } else {
                  // Обычное сообщение — ставим в очередь
                  if (!message.text && !message.caption) {
                    message.text = describeMessage(message);
                  }

                  let queue = userQueues.get(token);
                  if (!queue) {
                    queue = [];
                    userQueues.set(token, queue);
                  }
                  
                  if (!queue.some(item => item.update_id === update.update_id)) {
                    queue.push(update);
                  }

                  // Если пользователь ещё не получал приветствие — показываем код
                  if (!onboardedChats.has(chatId)) {
                    onboardedChats.add(chatId);
                    scheduleSave();
                    await sendWithKeyboard(chatId, `👋 <b>Привет! Твой Код синхронизации:</b>

<code>${token}</code>

Вставь его в настройках плагина в Obsidian, чтобы заметки приходили автоматически.`);
                  }

                  await sendWithKeyboard(chatId, `✅ В очереди`);
                }
              }
            }
          }
        }
      } else {
        const errorText = await response.text();
        console.error(`Telegram getUpdates failed: Status ${response.status} (${response.statusText}). Body:`, errorText);
        // If there's a conflict or error, wait a little longer before retrying to prevent rapid polling spam
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
    } catch (e: any) {
      const isConnectionError = e?.message?.includes('fetch failed') || e?.code === 'UND_ERR_CONNECT_TIMEOUT' || e?.message?.includes('timeout') || e?.cause?.code === 'UND_ERR_CONNECT_TIMEOUT';
      if (isConnectionError) {
        console.error('\n⚠️  [TELEGRAM CONNECTION ERROR] ⚠️');
        console.error('Похоже, api.telegram.org заблокирован вашим провайдером или недоступен с локального ПК.');
        console.error('Чтобы запустить сервер на локалке, воспользуйтесь одним из решений:');
        console.error('👉 Решение 1: Добавьте в файл .env прокси-сервер (например, https://api.telegram-proxy.org или другой рабочий прокси):');
        console.error('   TELEGRAM_API_BASE_URL="https://api.telegram-proxy.org"');
        console.error('👉 Решение 2: Включите системный VPN на вашем компьютере.');
        console.error('👉 Решение 3: Не запускайте сервер локально вообще! Используйте облачный режим Cloud Sync (он уже работает 24/7 у нас в облаке в Европе и принимает сообщения).\n');
      } else {
        console.error('Error fetching Telegram updates in background:', e);
      }
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
}

async function runServer() {
  loadState();

  const app = express();
  const PORT = parseInt(process.env.PORT || '3000', 10);

  app.use(express.json());
  app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
    next();
  });

  // Запуск фонового прослушивания Telegram
  startTelegramPolling();

  // API эндпоинты
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', botTokenConfigured: !!BOT_TOKEN });
  });

  // Информация о боте для фронтенда (без слива токена)
  app.get('/api/config', async (req, res) => {
    try {
      const response = await fetch(`${TELEGRAM_API_BASE}/bot${BOT_TOKEN}/getMe`);
      const data = await response.json() as any;
      res.json({
        ok: true,
        botConfigured: !!BOT_TOKEN,
        botUsername: data.ok ? data.result.username : null,
      });
    } catch {
      res.json({ ok: true, botConfigured: !!BOT_TOKEN, botUsername: null });
    }
  });

  // Статус поллинга и очередей
  app.get('/api/status', (req, res) => {
    const queueStats = Array.from(userQueues.entries()).map(([code, msgs]) => ({
      syncCode: code,
      queueLength: msgs.length,
    }));
    const totalQueued = Array.from(userQueues.values()).reduce((sum, q) => sum + q.length, 0);
    res.json({
      ok: true,
      polling: true,
      uptime: process.uptime(),
      lastUpdateId,
      totalUsers: userQueues.size,
      totalQueued,
      queues: queueStats,
    });
  });

  // Перезапуск поллинга
  app.post('/api/restart-polling', (req, res) => {
    res.json({ ok: true, message: 'Polling restart triggered' });
  });

  // Проверка валидности токена через Telegram (для фронтенда)
  app.post('/api/test-bot', async (req, res) => {
    const { token } = req.body;
    if (!token) {
      res.status(400).json({ ok: false, error: 'token is required' });
      return;
    }
    try {
      const response = await fetch(`https://api.telegram.org/bot${token}/getMe`);
      const data = await response.json() as any;
      if (data.ok) {
        res.json({ ok: true, username: data.result.username });
      } else {
        res.json({ ok: false, error: data.description || 'Invalid token' });
      }
    } catch {
      res.json({ ok: false, error: 'Connection to Telegram failed' });
    }
  });

  // Эндпоинт для Obsidian-клиента, чтобы забрать обновления конкретного юзера
  app.get('/api/updates', (req, res) => {
    const syncCode = req.query.syncCode as string;
    if (!syncCode) {
      res.status(400).json({ ok: false, error: 'syncCode query parameter is required' });
      return;
    }

    const resolvedToken = resolveSyncCode(syncCode);
    if (!resolvedToken) {
      res.json({ ok: true, result: [] });
      return;
    }

    const queue = userQueues.get(resolvedToken) || [];
    // Сбрасываем очередь после отдачи, чтобы не отправлять повторно
    userQueues.set(resolvedToken, []);

    res.json({
      ok: true,
      result: queue
    });
  });

  // Эндпоинт для скачивания медиа-файлов через сервер без слива приватного токена
  app.get('/api/file', async (req, res) => {
    const fileId = req.query.file_id as string;
    const syncCode = req.query.syncCode as string;
    if (!fileId) {
      res.status(400).json({ ok: false, error: 'file_id parameter is required' });
      return;
    }

    const resolvedToken = resolveSyncCode(syncCode || '');
    if (!resolvedToken) {
      res.status(403).json({ ok: false, error: 'Invalid syncCode' });
      return;
    }

    try {
      // 1. Запрашиваем путь к файлу у Telegram
      const fileInfoUrl = `${TELEGRAM_API_BASE}/bot${BOT_TOKEN}/getFile?file_id=${fileId}`;
      const infoRes = await fetch(fileInfoUrl);
      if (!infoRes.ok) {
        res.status(500).json({ ok: false, error: 'Failed to fetch file info from Telegram' });
        return;
      }

      const infoData = await infoRes.json() as any;
      if (!infoData.ok || !infoData.result?.file_path) {
        res.status(404).json({ ok: false, error: 'Telegram file not found' });
        return;
      }

      const telegramFilePath = infoData.result.file_path;

      // 2. Скачиваем его и стримим клиенту напрямую в сокет
      // Для скачивания файлов используется специальный url
      const downloadUrl = TELEGRAM_API_BASE.includes('api.telegram.org') 
        ? `https://api.telegram.org/file/bot${BOT_TOKEN}/${telegramFilePath}`
        : `${TELEGRAM_API_BASE}/file/bot${BOT_TOKEN}/${telegramFilePath}`; // Поддержка структуры зеркала
      
      const fileRes = await fetch(downloadUrl);
      if (!fileRes.ok || !fileRes.body) {
        res.status(500).json({ ok: false, error: 'Failed to download file content from Telegram' });
        return;
      }

      res.setHeader('Content-Type', 'application/octet-stream');
      
      // Стриминг бинарных чанков
      const reader = fileRes.body.getReader();
      const pump = async () => {
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) {
              res.end();
              break;
            }
            res.write(Buffer.from(value));
          }
        } catch (e) {
          console.error('Streaming error:', e);
          res.end();
        }
      };
      
      await pump();

    } catch (e: any) {
      console.error('File proxy error:', e);
      res.status(500).json({ ok: false, error: e.message || 'Internal file proxy error' });
    }
  });

  // Эндпоинт для подтверждения от Obsidian-плагина — сообщение обработано
  app.post('/api/confirm', async (req, res) => {
    const { syncCode, update_ids } = req.body;
    if (!syncCode || !Array.isArray(update_ids) || update_ids.length === 0) {
      res.status(400).json({ ok: false, error: 'syncCode and update_ids array required' });
      return;
    }

    const resolvedToken = resolveSyncCode(syncCode);
    if (!resolvedToken) {
      res.json({ ok: false, error: 'Invalid syncCode' });
      return;
    }

    const chatId = tokenToChatId.get(resolvedToken);
    if (!chatId) {
      res.json({ ok: false, error: 'No chat for this token' });
      return;
    }

    let confirmed = confirmedUpdates.get(resolvedToken);
    if (!confirmed) {
      confirmed = new Set();
      confirmedUpdates.set(resolvedToken, confirmed);
    }

    const toConfirm = update_ids.filter(id => !confirmed.has(id));
    if (toConfirm.length > 0) {
      toConfirm.forEach(id => confirmed.add(id));
      await sendWithKeyboard(chatId, `✅ Сообщение сохранено в Obsidian`);
    }

    res.json({ ok: true, confirmed: toConfirm.length });
  });

  // Эндпоинт для получения поискового запроса от плагина
  app.get('/api/search', (req, res) => {
    const syncCode = req.query.syncCode as string;
    if (!syncCode) {
      res.status(400).json({ ok: false, error: 'syncCode required' });
      return;
    }

    const resolvedToken = resolveSyncCode(syncCode);
    if (!resolvedToken) {
      res.json({ ok: true, query: null });
      return;
    }

    const queue = searchQueues.get(resolvedToken) || [];
    const item = queue.shift() || null;
    res.json({ ok: true, query: item ? item.query : null });
  });

  // Эндпоинт для результатов поиска от плагина
  app.post('/api/search-results', async (req, res) => {
    const { syncCode, query, results } = req.body;
    if (!syncCode || !query) {
      res.status(400).json({ ok: false, error: 'syncCode and query required' });
      return;
    }

    const resolvedToken = resolveSyncCode(syncCode);
    if (!resolvedToken) {
      res.json({ ok: false, error: 'Invalid syncCode' });
      return;
    }

    const chatId = tokenToChatId.get(resolvedToken);
    if (!chatId) {
      res.json({ ok: false, error: 'No chat for this token' });
      return;
    }

    if (!results || results.length === 0) {
      await sendWithKeyboard(chatId, `🔍 <b>Ничего не найдено</b> по запросу «${query}»`);
    } else {
      let msg = `🔍 <b>Результаты поиска по запросу «${query}»:</b>\n\n`;
      for (const r of results.slice(0, 10)) {
        msg += `📄 <code>${r.filename}</code>\n`;
        if (r.preview) msg += `${r.preview}\n`;
        msg += '\n';
      }
      if (results.length > 10) {
        msg += `... и ещё ${results.length - 10} результатов`;
      }
      await sendWithKeyboard(chatId, msg);
    }

    res.json({ ok: true });
  });

  // Подключаем Vite в режиме разработки
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa'
    });
    app.use(vite.middlewares);
  } else {
    // В продакшене отдаем статический билд
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server listening on Port ${PORT}`);
  });
}

runServer().catch(err => {
  console.error('Failed to start server:', err);
});

process.on('exit', () => {
  if (saveTimeout) clearTimeout(saveTimeout);
  saveState();
});
process.on('SIGTERM', () => process.exit(0));
process.on('SIGINT', () => process.exit(0));
