import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import dotenv from 'dotenv';

dotenv.config();

// в памяти храним очереди сообщений для каждого пользователя (привязаны к syncCode / chat_id)
const userQueues = new Map<string, any[]>();
let lastUpdateId = 0;

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '6852938152:AAH_g7K7kLMpdWqpU9X8X1vQz7Zdf_ex990';
const TELEGRAM_API_BASE = process.env.TELEGRAM_API_BASE_URL || 'https://api.telegram.org';

// Помощник для отправки сообщений обратно в Telegram
async function sendTelegramMessage(chatId: string | number, text: string) {
  try {
    await fetch(`${TELEGRAM_API_BASE}/bot${BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: "HTML",
      }),
    });
  } catch (err) {
    console.error("Error sending response to Telegram:", err);
  }
}

// Вечный цикл поллинга для общего бота
async function startTelegramPolling() {
  console.log(`Starting Telegram background polling with token: ${BOT_TOKEN.substring(0, 10)}... (Base URL: ${TELEGRAM_API_BASE})`);
  
  while (true) {
    try {
      const url = `${TELEGRAM_API_BASE}/bot${BOT_TOKEN}/getUpdates?offset=${lastUpdateId + 1}&timeout=30`;
      const response = await fetch(url);
      if (response.ok) {
        const data = await response.json() as any;
        if (data.ok && data.result) {
          for (const update of data.result) {
            lastUpdateId = Math.max(lastUpdateId, update.update_id);
            
            const message = update.message;
            if (message && message.chat && message.chat.id) {
              const syncCode = String(message.chat.id);
              const text = message.text || message.caption || '';
              
              if (text && (text.startsWith('/start') || text.startsWith('/help'))) {
                const greeting = `👋 <b>Привет! Я твой Telegram-Obsidian ассистент!</b>
                
У тебя включен <b>Облачный режим (Cloud Sync)</b>.

Твой персональный <b>Код синхронизации</b>:
<code>${syncCode}</code>

<b>Как настроить плагин в Obsidian:</b>
1. Открой настройки плагина Telegram Sync во вкладке "Сторонние плагины".
2. Измени "Режим подключения" на <b>"Общий бот (Cloud Sync)"</b>.
3. Вставь твой <b>Код синхронизации</b>: <code>${syncCode}</code>.
4. Нажмите "Запустить" и плагин начнёт работать!

Теперь отправь мне любой текст, ссылку, картинку или документ, и твоя Obsidian-копия мгновенно загрузит это к себе в виде красивой .md заметки в режиме реального времени!`;
                
                await sendTelegramMessage(syncCode, greeting);
              } else if (text && text.startsWith('/status')) {
                const statusInfo = `📡 <b>Статус синхронизации: Активен!</b>
                
• Код синхронизации: <code>${syncCode}</code>
• Сообщений в очереди: <code>${(userQueues.get(syncCode) || []).length}</code> ожидают загрузки в Obsidian.`;
                
                await sendTelegramMessage(syncCode, statusInfo);
              } else {
                // Обычное сообщение — ставим в очередь для этого пользователя
                let queue = userQueues.get(syncCode);
                if (!queue) {
                  queue = [];
                  userQueues.set(syncCode, queue);
                }
                
                // Защита от дублей
                if (!queue.some(item => item.update_id === update.update_id)) {
                  queue.push(update);
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
  const app = express();
  const PORT = 3000;

  // Запуск фонового прослушивания Telegram
  startTelegramPolling();

  // API эндпоинты
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', botTokenConfigured: !!BOT_TOKEN });
  });

  // Эндпоинт для Obsidian-клиента, чтобы забрать обновления конкретного юзера
  app.get('/api/updates', (req, res) => {
    const syncCode = req.query.syncCode as string;
    if (!syncCode) {
      res.status(400).json({ ok: false, error: 'syncCode query parameter is required' });
      return;
    }

    const queue = userQueues.get(syncCode) || [];
    // Сбрасываем очередь после отдачи, чтобы не отправлять повторно
    userQueues.set(syncCode, []);

    res.json({
      ok: true,
      result: queue
    });
  });

  // Эндпоинт для скачивания медиа-файлов через сервер без слива приватного токена
  app.get('/api/file', async (req, res) => {
    const fileId = req.query.file_id as string;
    if (!fileId) {
      res.status(400).json({ ok: false, error: 'file_id parameter is required' });
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
      // Для скачивания файлов используется специальный url, который тоже заменяем с api.telegram.org/file на base_url/file
      const fileBaseUrl = TELEGRAM_API_BASE.replace('https://api.telegram.org', 'https://api.telegram.org/file') + `/bot${BOT_TOKEN}/${telegramFilePath}`;
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
