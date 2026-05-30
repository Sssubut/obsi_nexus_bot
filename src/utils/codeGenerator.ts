import { PluginSettings } from '../types';

export function generateMainTs(settings: PluginSettings, currentUrl: string): string {
  const defaultFolder = settings.defaultFolderPath || 'Telegram Notes';
  const mediaFolder = settings.mediaPath || 'Telegram Notes/Media';

  return `import { App, Plugin, PluginSettingTab, Setting, Notice } from 'obsidian';
import * as fs from 'fs/promises';
import * as path from 'path';
import TelegramBot from 'node-telegram-bot-api';

interface TelegramSyncSettings {
  mode: 'private' | 'shared';
  botToken: string;
  syncCode: string;
  syncServerUrl: string;
  defaultFolderPath: string;
  mediaPath: string;
  processedMessageIds: string[];
  lastUpdateId: number;
}

const DEFAULT_SETTINGS: TelegramSyncSettings = {
  mode: 'shared',
  botToken: '',
  syncCode: '',
  syncServerUrl: '${currentUrl}',
  defaultFolderPath: '${defaultFolder}',
  mediaPath: '${mediaFolder}',
  processedMessageIds: [],
  lastUpdateId: 0
};

export default class TelegramSyncPlugin extends Plugin {
  settings: TelegramSyncSettings;
  bot: TelegramBot | null = null;
  processedSet: Set<number> = new Set();
  isPolling = false;

  async onload() {
    await this.loadSettings();

    // Восстанавливаем ID обработанных сообщений из настроек
    this.processedSet = new Set(
      this.settings.processedMessageIds.map(id => parseInt(id, 10)).filter(id => !isNaN(id))
    );

    this.startPolling();

    // Регистрация вкладки настроек
    this.addSettingTab(new TelegramSyncSettingTab(this.app, this));
  }

  onunload() {
    this.stopPolling();
    console.log('Telegram Sync: Плагин выгружен, polling остановлен.');
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    // Сериализуем Set обратно в массив для сохранения в JSON
    this.settings.processedMessageIds = Array.from(this.processedSet).map(String);
    await this.saveData(this.settings);
  }

  startPolling() {
    if (this.isPolling) return;
    this.isPolling = true;

    if (this.settings.mode === 'private') {
      if (this.settings.botToken) {
        try {
          // Инициализация бота с включенным поллингом
          this.bot = new TelegramBot(this.settings.botToken, { polling: true });

          // Слушаем входящие сообщения
          this.bot.on('message', async (msg) => {
            await this.handleTelegramMessage(msg);
          });

          this.bot.on('polling_error', (error) => {
            console.error('Telegram Sync: Ошибка поллинга приватного бота (polling_error):', error);
          });

          console.log('Telegram Sync: Успешный запуск приватного бота.');
        } catch (error) {
          console.error('Telegram Sync: Ошибка инициализации бота:', error);
          new Notice('Telegram Sync: Ошибка при запуске личного бота. Проверьте ваш токен!');
          this.isPolling = false;
        }
      } else {
        new Notice('Telegram Sync: Пожалуйста, настройте Bot Token личного бота!');
        this.isPolling = false;
      }
    } else {
      // Общий бот (сообщения получаем с нашего сервера-посредника)
      if (this.settings.syncCode) {
        this.pollShared();
      } else {
        new Notice('Telegram Sync: Пожалуйста, настройте Код синхронизации для общего бота!');
        this.isPolling = false;
      }
    }
  }

  stopPolling() {
    this.isPolling = false;
    if (this.bot) {
      try {
        this.bot.stopPolling();
      } catch (e) {
        console.error('Telegram Sync: Не удалось корректно остановить polling личного бота:', e);
      }
      this.bot = null;
    }
  }

  async pollShared() {
    console.log('Telegram Sync: Запущен поллинг общего бота с сервера:', this.settings.syncServerUrl);
    while (this.isPolling && this.settings.mode === 'shared') {
      if (!this.settings.syncCode) {
        this.stopPolling();
        break;
      }
      try {
        const url = \`\${this.settings.syncServerUrl}/api/updates?syncCode=\${this.settings.syncCode}\`;
        // @ts-ignore
        const { requestUrl } = require('obsidian');
        const response = await requestUrl({ url, method: 'GET' });
        
        if (response.status === 200 && response.json && response.json.ok) {
          const updates = response.json.result;
          for (const update of updates) {
            this.settings.lastUpdateId = Math.max(this.settings.lastUpdateId || 0, update.update_id);
            if (update.message) {
              await this.handleTelegramMessage(update.message);
            }
          }
          if (updates.length > 0) {
            await this.saveSettings();
          }
        }
      } catch (err) {
        console.error('Telegram Sync: Ошибка поллинга сервера общего бота:', err);
        await new Promise(resolve => setTimeout(resolve, 8000));
      }
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }

  async handleTelegramMessage(msg: TelegramBot.Message) {
    if (!msg.message_id) return;

    // Защита от дублирования сообщений при перезапуске плагина
    if (this.processedSet.has(msg.message_id)) {
      return;
    }

    try {
      const username = msg.from?.username || msg.from?.first_name || 'unknown_user';
      const dateObj = new Date(msg.date * 1000);

      // Форматируем дату для имени файла (YYYY-MM-DD HH-mm-ss)
      const formattedDateForName = dateObj.toISOString()
        .slice(0, 19)
        .replace('T', ' ')
        .replace(/:/g, '-');

      // Форматируем красивую дату для контента
      const formattedDateForContent = dateObj.toLocaleString();

      // Вытаскиваем текст сообщения или caption (если это фото с подписью)
      let text = msg.text || msg.caption || '';
      let downloadedFileName = '';

      // Обработка системных команд бота (/start, /help, /status) только в приватном режиме (в общем это обрабатывает сервер)
      if (this.settings.mode === 'private' && text && text.startsWith('/')) {
        const command = text.split(' ')[0].toLowerCase();
        
        if (command === '/start' || command === '/help') {
          const startMsg = \`👋 <b>Привет! Я твой Telegram-Obsidian ассистент!</b>

Отправь мне любой текст, мысль, ссылку, картинку или документ, и я мгновенно сохраню это в твой локальный архив Obsidian.

<b>Доступные действия:</b>
• Просто отправь текст — создам .md заметку с YAML метаданными.
• Прикрепи картинку/фото — скачаю в Media и встрою в заметку.
• Отправь документ или файл — бережно сохраню в твой сейф.
• Отправь команду /status — чтобы проверить состояние подключения.

<i>Плагин запущен и ожидает твоих заметок!</i>\`;
          
          if (this.bot) {
            await this.bot.sendMessage(msg.chat.id, startMsg, { parse_mode: 'HTML' });
          }
          this.processedSet.add(msg.message_id);
          await this.saveSettings();
          return;
        }

        if (command === '/status') {
          const statusMsg = \`📡 <b>Telegram Sync: Статус активен!</b>

• Папка заметок: <code>\${this.settings.defaultFolderPath}</code>
• Папка вложений: <code>\${this.settings.mediaPath}</code>
• Сообщений сохранено: <code>\${this.processedSet.size}</code> (за сессию)
• Синхронизация: <b>Работает (Private Bot)</b>\`;

          if (this.bot) {
            await this.bot.sendMessage(msg.chat.id, statusMsg, { parse_mode: 'HTML' });
          }
          this.processedSet.add(msg.message_id);
          await this.saveSettings();
          return;
        }
      }

      // Обработка фотографий
      if (msg.photo && msg.photo.length > 0) {
        const photo = msg.photo[msg.photo.length - 1];
        const fileId = photo.file_id;

        try {
          const localPath = await this.downloadTelegramFile(fileId, 'photo');
          if (localPath) {
            downloadedFileName = path.basename(localPath);
          }
        } catch (error) {
          console.error('Telegram Sync: Ошибка при скачивании фотографии:', error);
        }
      }

      // Обработка оригинальных файлов/документов
      if (msg.document) {
        const fileId = msg.document.file_id;
        try {
          const localPath = await this.downloadTelegramFile(fileId, 'document', msg.document.file_name);
          if (localPath) {
            downloadedFileName = path.basename(localPath);
          }
        } catch (error) {
          console.error('Telegram Sync: Ошибка при скачивании документа:', error);
        }
      }

      // Если текста нет, но было загружено вложение, создаем пояснение
      if (!text && downloadedFileName) {
        text = 'Получено вложение: ' + downloadedFileName;
      }

      // Очищаем текст от недопустимых символов для имени файла
      const sanitizedText = text
        .replace(/[\\\\/:*?"<>|\\n\\r]/g, ' ')
        .substring(0, 30)
        .trim();

      const sanitizedUser = username.replace(/[\\\\/:*?"<>|\\n\\r]/g, '');

      // Формируем имя файла: {{date}} - {{user}} - {{first 30 chars of text}}.md
      const noteFileName = \`\${formattedDateForName} - \${sanitizedUser} - \${sanitizedText || 'vlozhenie'}.md\`;

      // Получаем физический путь к хранилищу Obsidian
      // @ts-ignore
      const vaultBasePath = this.app.vault.adapter.getBasePath();
      const defaultFolderAbsolute = path.join(vaultBasePath, this.settings.defaultFolderPath);

      // Создаем директорию для заметок, если она не существует
      await fs.mkdir(defaultFolderAbsolute, { recursive: true });

      // Генерируем контент заметки в строгом соответствии с ТЗ
      const noteContent = \`---
source: telegram
from: \${username}
date: \${formattedDateForContent}
---
# Сообщение от \${username}

\${text}

\${downloadedFileName ? \`## Вложения
![[\${downloadedFileName}]]\` : ''}
\`;

      const fullNotePath = path.join(defaultFolderAbsolute, noteFileName);

      // Записываем .md файл с контентом на диск через fs/promises
      await fs.writeFile(fullNotePath, noteContent, 'utf-8');

      // В приватном режиме шлём подтверждение сразу через класс бота
      if (this.settings.mode === 'private' && this.bot) {
        const confirmationMsg = \`✅ <b>Заметка успешно создана в Obsidian!</b>
• Файл: <code>\s\${noteFileName}</code>
• Папка: <code>\s\${this.settings.defaultFolderPath}</code>\`;
        await this.bot.sendMessage(msg.chat.id, confirmationMsg, { parse_mode: 'HTML' });
      }

      // Добавляем ID сообщения в набор обработанных
      this.processedSet.add(msg.message_id);
      
      // Сохраняем новое состояние на диск
      await this.saveSettings();

      new Notice(\`Telegram Sync: Сообщение успешно сохранено: \s\${noteFileName}\`);
    } catch (error) {
      console.error('Telegram Sync: Ошибка при обработке сообщения:', error);
    }
  }

  // Загрузка файлов
  async downloadTelegramFile(fileId: string, type: 'photo' | 'document', originalName?: string): Promise<string | null> {
    try {
      // @ts-ignore
      const { requestUrl } = require('obsidian');
      let fileDataRes;

      if (this.settings.mode === 'shared') {
        const downloadUrl = \`\${this.settings.syncServerUrl}/api/file?file_id=\${fileId}&syncCode=\${this.settings.syncCode}\`;
        fileDataRes = await requestUrl({ url: downloadUrl, method: 'GET', contentType: 'application/octet-stream' });
      } else {
        if (!this.bot) return null;
        const fileInfo = await this.bot.getFile(fileId);
        const filePathOnTelegram = fileInfo.file_path;
        if (!filePathOnTelegram) return null;

        const downloadUrl = \`https://api.telegram.org/file/bot\${this.settings.botToken}/\${filePathOnTelegram}\`;
        fileDataRes = await requestUrl({ url: downloadUrl, method: 'GET', contentType: 'application/octet-stream' });
      }

      // @ts-ignore
      const vaultBasePath = this.app.vault.adapter.getBasePath();
      const mediaAbsoluteFolder = path.join(vaultBasePath, this.settings.mediaPath);

      await fs.mkdir(mediaAbsoluteFolder, { recursive: true });

      let finalFileName = '';
      if (type === 'photo') {
        finalFileName = \`tg_photo_\${fileId.substring(0, 8)}_\${Date.now()}.png\`;
      } else {
        finalFileName = originalName || \`tg_doc_\${fileId.substring(0, 8)}_\${Date.now()}\`;
      }

      const finalAbsolutePath = path.join(mediaAbsoluteFolder, finalFileName);
      const buffer = Buffer.from(fileDataRes.arrayBuffer);
      await fs.writeFile(finalAbsolutePath, buffer);

      return finalAbsolutePath;
    } catch (error) {
      console.error('Telegram Sync: Не удалось скачать файл:', error);
      return null;
    }
  }
}

class TelegramSyncSettingTab extends PluginSettingTab {
  plugin: TelegramSyncPlugin;

  constructor(app: App, plugin: TelegramSyncPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl('h2', { text: 'Синхронизация с Telegram' });

    new Setting(containerEl)
      .setName('Режим подключения')
      .setDesc('Выберите: Общий/Облачный бот (без настроек своего бота) или Свой бот (созданный через @BotFather)')
      .addDropdown(dropdown => dropdown
        .addOption('shared', 'Общий/Облачный бот (Cloud Sync) ⭐')
        .addOption('private', 'Свой личный бот (Private Bot)')
        .setValue(this.plugin.settings.mode || 'shared')
        .onChange(async (value: 'shared' | 'private') => {
          this.plugin.settings.mode = value;
          await this.plugin.saveSettings();
          this.display(); // Перерисовываем вкладку для скрытия/вывода соответствующих полей
          
          this.plugin.stopPolling();
          this.plugin.startPolling();
        }));

    if (this.plugin.settings.mode === 'shared') {
      new Setting(containerEl)
        .setName('Код синхронизации (Sync Code)')
        .setDesc('Введите числовой код, полученный от бота при старте (например, 123456789)')
        .addText(text => text
          .setPlaceholder('Введите ваш код синхронизации')
          .setValue(this.plugin.settings.syncCode || '')
          .onChange(async (value) => {
            this.plugin.settings.syncCode = value.trim();
            await this.plugin.saveSettings();
          }));

      new Setting(containerEl)
        .setName('Сервер синхронизации')
        .setDesc('Адрес облачного сервера интеграции')
        .addText(text => text
          .setPlaceholder('https://...')
          .setValue(this.plugin.settings.syncServerUrl || '${currentUrl}')
          .onChange(async (value) => {
            this.plugin.settings.syncServerUrl = value.trim();
            await this.plugin.saveSettings();
          }));
    } else {
      new Setting(containerEl)
        .setName('Bot Token')
        .setDesc('Введите HTTP API токен вашего личного бота (полученный от @BotFather)')
        .addText(text => text
          .setPlaceholder('123456789:ABCdefGh...')
          .setValue(this.plugin.settings.botToken || '')
          .onChange(async (value) => {
            this.plugin.settings.botToken = value.trim();
            await this.plugin.saveSettings();
          }));

      new Setting(containerEl)
        .setName('Проверить подключение приватного бота')
        .setDesc('Проверка валидности указанного токена личного бота.')
        .addButton(btn => btn
          .setButtonText('Проверить')
          .onClick(async () => {
            const token = this.plugin.settings.botToken;
            if (!token) {
              new Notice('Сначала введите Bot Token!');
              return;
            }
            new Notice('Подключаемся к серверам Telegram...');
            try {
              // @ts-ignore
              const { requestUrl } = require('obsidian');
              const res = await requestUrl({ url: \`https://api.telegram.org/bot\${token}/getMe\`, method: 'GET' });
              if (res.status === 200 && res.json?.ok) {
                new Notice(\`Успешно подключено к боту: @\${res.json.result.username}\`);
              } else {
                new Notice('Ошибка подключения. Проверьте токен.');
              }
            } catch (err: any) {
              new Notice(\`Ошибка подключения: \${err.message || err}\`);
            }
          }));
    }

    new Setting(containerEl)
      .setName('Default Folder Path')
      .setDesc('Путь к папке в сейфе Obsidian для сохранения .md заметок.')
      .addText(text => text
        .setPlaceholder('Telegram Notes')
        .setValue(this.plugin.settings.defaultFolderPath)
        .onChange(async (value) => {
          this.plugin.settings.defaultFolderPath = value.trim() || 'Telegram Notes';
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName('Media Path')
      .setDesc('Папка внутри вашего хранилища для сохранения медиафайлов и оригинальных вложений.')
      .addText(text => text
        .setPlaceholder('Telegram Notes/Media')
        .setValue(this.plugin.settings.mediaPath)
        .onChange(async (value) => {
          this.plugin.settings.mediaPath = value.trim() || 'Telegram Notes/Media';
          await this.plugin.saveSettings();
        }));
  }
}
`;
}

export function generatePureMainJs(settings: PluginSettings, currentUrl: string): string {
  const defaultFolder = settings.defaultFolderPath || 'Telegram Notes';
  const mediaFolder = settings.mediaPath || 'Telegram Notes/Media';

  return `const { Plugin, PluginSettingTab, Setting, Notice, requestUrl } = require('obsidian');
const fs = require('fs/promises');
const path = require('path');

module.exports = class TelegramSyncPlugin extends Plugin {
  async onload() {
    await this.loadSettings();
    this.processedSet = new Set(this.settings.processedMessageIds || []);
    this.isPolling = false;

    this.startPolling();

    this.addSettingTab(new TelegramSyncSettingTab(this.app, this));
  }

  onunload() {
    this.stopPolling();
    console.log('Telegram Sync: Плагин успешно выгружен.');
  }

  async loadSettings() {
    this.settings = Object.assign({
      mode: 'shared',
      botToken: '',
      syncCode: '',
      syncServerUrl: '${currentUrl}',
      defaultFolderPath: '${defaultFolder}',
      mediaPath: '${mediaFolder}',
      processedMessageIds: [],
      lastUpdateId: 0
    }, await this.loadData());
  }

  async saveSettings() {
    this.settings.processedMessageIds = Array.from(this.processedSet);
    await this.saveData(this.settings);
  }

  startPolling() {
    if (this.isPolling) return;
    this.isPolling = true;

    if (this.settings.mode === 'private') {
      if (this.settings.botToken) {
        this.pollPrivate();
      } else {
        new Notice('Telegram Sync: Пожалуйста, настройте Bot Token в настройках!');
        this.isPolling = false;
      }
    } else {
      if (this.settings.syncCode) {
        this.pollShared();
      } else {
        new Notice('Telegram Sync: Пожалуйста, настройте Код синхронизации в настройках!');
        this.isPolling = false;
      }
    }
  }

  stopPolling() {
    this.isPolling = false;
  }

  async pollPrivate() {
    console.log('Telegram Sync: Запущен поллинг (Private Bot)');
    while (this.isPolling && this.settings.mode === 'private') {
      if (!this.settings.botToken) {
        this.stopPolling();
        break;
      }
      try {
        const url = \`https://api.telegram.org/bot\${this.settings.botToken}/getUpdates?offset=\${(this.settings.lastUpdateId || 0) + 1}&timeout=30\`;
        const response = await requestUrl({ url, method: 'GET' });
        
        if (response.status === 200 && response.json && response.json.ok) {
          const updates = response.json.result;
          for (const update of updates) {
            this.settings.lastUpdateId = Math.max(this.settings.lastUpdateId || 0, update.update_id);
            if (update.message) {
              await this.handleTelegramMessage(update.message);
            }
          }
          if (updates.length > 0) {
            await this.saveSettings();
          }
        }
      } catch (err) {
        console.error('Telegram Sync Polling Error (Private):', err);
        await new Promise(resolve => setTimeout(resolve, 8000));
      }
      await new Promise(resolve => setTimeout(resolve, 1500));
    }
  }

  async pollShared() {
    console.log('Telegram Sync: Запущен поллинг общего бота с сервера:', this.settings.syncServerUrl);
    while (this.isPolling && this.settings.mode === 'shared') {
      if (!this.settings.syncCode) {
        this.stopPolling();
        break;
      }
      try {
        const url = \`\${this.settings.syncServerUrl}/api/updates?syncCode=\${this.settings.syncCode}\`;
        const response = await requestUrl({ url, method: 'GET' });
        
        if (response.status === 200 && response.json && response.json.ok) {
          const updates = response.json.result;
          for (const update of updates) {
            this.settings.lastUpdateId = Math.max(this.settings.lastUpdateId || 0, update.update_id);
            if (update.message) {
              await this.handleTelegramMessage(update.message);
            }
          }
          if (updates.length > 0) {
            await this.saveSettings();
          }
        }
      } catch (err) {
        console.error('Telegram Sync Polling Error (Shared):', err);
        await new Promise(resolve => setTimeout(resolve, 8000));
      }
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }

  async sendTelegramMessage(chatId, text) {
    if (this.settings.mode === 'shared') return; // Общий бот шлет подтверждения из бэкенда
    if (!this.settings.botToken) return;
    try {
      const url = \`https://api.telegram.org/bot\${this.settings.botToken}/sendMessage\`;
      await requestUrl({
        url,
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: text,
          parse_mode: 'HTML'
        })
      });
    } catch (err) {
      console.error('Telegram Sync: Ошибка при отправке ответа в Telegram:', err);
    }
  }

  async handleTelegramMessage(msg) {
    if (!msg.message_id) return;
    
    if (this.processedSet.has(msg.message_id)) {
      return;
    }

    try {
      const username = msg.from?.username || msg.from?.first_name || 'unknown_user';
      const dateObj = new Date(msg.date * 1000);
      const formattedDateForName = dateObj.toISOString().slice(0, 19).replace('T', ' ').replace(/:/g, '-');
      const formattedDateForContent = dateObj.toLocaleString();

      let text = msg.text || msg.caption || '';
      let downloadedFileName = '';

      // Системные команды только для приватного режима
      if (this.settings.mode === 'private' && text && text.startsWith('/')) {
        const command = text.split(' ')[0].toLowerCase();
        
        if (command === '/start' || command === '/help') {
          const startMsg = \`👋 <b>Привет! Я твой Telegram-Obsidian ассистент!</b>

Отправь мне любой текст, мысль, ссылку, картинку или документ, и я мгновенно сохраню это в твой локальный архив Obsidian.

<b>Доступные действия:</b>
• Просто отправь текст — создам .md заметку с YAML метаданными.
• Прикрепи картинку/фото — скачаю в Media и встрою в заметку.
• Отправь документ или файл — бережно сохраню в твой сейф.
• Отправь команду /status — чтобы проверить состояние подключения.

<i>Плагин запущен и ожидает твоих заметок!</i>\`;
          
          await this.sendTelegramMessage(msg.chat.id, startMsg);
          this.processedSet.add(msg.message_id);
          await this.saveSettings();
          return;
        }

        if (command === '/status') {
          const statusMsg = \`📡 <b>Telegram Sync: Статус активен!</b>

• Папка заметок: <code>\${this.settings.defaultFolderPath}</code>
• Папка вложений: <code>\${this.settings.mediaPath}</code>
• Сообщений сохранено: <code>\${this.processedSet.size}</code> (за сессию)
• Синхронизация: <b>Работает (Private Polling)</b>\`;

          await this.sendTelegramMessage(msg.chat.id, statusMsg);
          this.processedSet.add(msg.message_id);
          await this.saveSettings();
          return;
        }
      }

      // Скачивание фото
      if (msg.photo && msg.photo.length > 0) {
        const photo = msg.photo[msg.photo.length - 1];
        const fileId = photo.file_id;
        const localPath = await this.downloadTelegramFile(fileId, 'photo');
        if (localPath) {
          downloadedFileName = path.basename(localPath);
        }
      } 
      // Скачивание файлов
      else if (msg.document) {
        const fileId = msg.document.file_id;
        const localPath = await this.downloadTelegramFile(fileId, 'document', msg.document.file_name);
        if (localPath) {
          downloadedFileName = path.basename(localPath);
        }
      }

      if (!text && downloadedFileName) {
        text = 'Получено вложение: ' + downloadedFileName;
      }

      const sanitizedText = text.replace(/[\\\\/:*?"<>|\\n\\r]/g, ' ').substring(0, 30).trim();
      const sanitizedUser = username.replace(/[\\\\/:*?"<>|\\n\\r]/g, '');
      const noteFileName = \`\${formattedDateForName} - \${sanitizedUser} - \${sanitizedText || 'vlozhenie'}.md\`;

      const vaultBasePath = this.app.vault.adapter.getBasePath();
      const defaultFolderAbsolute = path.join(vaultBasePath, this.settings.defaultFolderPath);
      await fs.mkdir(defaultFolderAbsolute, { recursive: true });

      const noteContent = \`---
source: telegram
from: \${username}
date: \${formattedDateForContent}
---
# Сообщение от \${username}

\${text}

\${downloadedFileName ? \`## Вложения
![[\s\${downloadedFileName}]]\` : ''}
\`;

      const fullNotePath = path.join(defaultFolderAbsolute, noteFileName);
      await fs.writeFile(fullNotePath, noteContent, 'utf-8');

      if (this.settings.mode === 'private') {
        const confirmationMsg = \`✅ <b>Заметка успешно создана в Obsidian!</b>
• Файл: <code>\s\${noteFileName}</code>
• Папка: <code>\s\${this.settings.defaultFolderPath}</code>\`;
        await this.sendTelegramMessage(msg.chat.id, confirmationMsg);
      }

      this.processedSet.add(msg.message_id);
      await this.saveSettings();

      new Notice(\`Telegram Sync: Сообщение сохранено: \s\${noteFileName}\`);
    } catch (err) {
      console.error('Ошибка при генерации заметки из Telegram:', err);
    }
  }

  async downloadTelegramFile(fileId, type, originalName) {
    try {
      let fileDataRes;
      if (this.settings.mode === 'shared') {
        const downloadUrl = \`\s\${this.settings.syncServerUrl}/api/file?file_id=\${fileId}&syncCode=\s\${this.settings.syncCode}\`;
        fileDataRes = await requestUrl({ url: downloadUrl, method: 'GET', contentType: 'application/octet-stream' });
      } else {
        const getFileUrl = \`https://api.telegram.org/bot\${this.settings.botToken}/getFile?file_id=\${fileId}\`;
        const fileInfoRes = await requestUrl({ url: getFileUrl, method: 'GET' });
        if (fileInfoRes.status !== 200 || !fileInfoRes.json?.ok) return null;

        const filePathOnTelegram = fileInfoRes.json.result.file_path;
        if (!filePathOnTelegram) return null;

        const downloadUrl = \`https://api.telegram.org/file/bot\${this.settings.botToken}/\s\${filePathOnTelegram}\`;
        fileDataRes = await requestUrl({ url: downloadUrl, method: 'GET', contentType: 'application/octet-stream' });
      }
      
      const vaultBasePath = this.app.vault.adapter.getBasePath();
      const mediaAbsoluteFolder = path.join(vaultBasePath, this.settings.mediaPath);
      await fs.mkdir(mediaAbsoluteFolder, { recursive: true });

      let finalFileName = '';
      if (type === 'photo') {
        finalFileName = \`tg_photo_\${fileId.substring(0, 8)}_\${Date.now()}.png\`;
      } else {
        finalFileName = originalName || \`tg_doc_\${fileId.substring(0, 8)}_\${Date.now()}\`;
      }

      const finalAbsolutePath = path.join(mediaAbsoluteFolder, finalFileName);
      const buffer = Buffer.from(fileDataRes.arrayBuffer);
      await fs.writeFile(finalAbsolutePath, buffer);

      return finalAbsolutePath;
    } catch (err) {
      console.error('Ошибка скачивания медиафайла Telegram:', err);
      return null;
    }
  }
}

class TelegramSyncSettingTab extends PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display() {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl('h2', { text: 'Синхронизация с Telegram' });

    new Setting(containerEl)
      .setName('Режим подключения')
      .setDesc('Выберите: Общий/Облачный бот (без настроек своего бота) или Свой бот (созданный через @BotFather)')
      .addDropdown(dropdown => dropdown
        .addOption('shared', 'Общий/Облачный бот (Cloud Sync) ⭐')
        .addOption('private', 'Свой личный бот (Private Bot)')
        .setValue(this.plugin.settings.mode || 'shared')
        .onChange(async (value) => {
          this.plugin.settings.mode = value;
          await this.plugin.saveSettings();
          this.display();
          
          this.plugin.stopPolling();
          this.plugin.startPolling();
        }));

    if (this.plugin.settings.mode === 'shared') {
      new Setting(containerEl)
        .setName('Код синхронизации (Sync Code)')
        .setDesc('Введите числовой код, полученный от бота при старте (например, 123456789)')
        .addText(text => text
          .setPlaceholder('Введите ваш код синхронизации')
          .setValue(this.plugin.settings.syncCode || '')
          .onChange(async (value) => {
            this.plugin.settings.syncCode = value.trim();
            await this.plugin.saveSettings();
          }));

      new Setting(containerEl)
        .setName('Сервер синхронизации')
        .setDesc('Адрес облачного сервера интеграции')
        .addText(text => text
          .setPlaceholder('https://...')
          .setValue(this.plugin.settings.syncServerUrl || '${currentUrl}')
          .onChange(async (value) => {
            this.plugin.settings.syncServerUrl = value.trim();
            await this.plugin.saveSettings();
          }));
    } else {
      new Setting(containerEl)
        .setName('Bot Token')
        .setDesc('Введите HTTP API токен вашего личного бота')
        .addText(text => text
          .setPlaceholder('123456789:ABCdefGh...')
          .setValue(this.plugin.settings.botToken)
          .onChange(async (value) => {
            this.plugin.settings.botToken = value.trim();
            await this.plugin.saveSettings();
          }));

      new Setting(containerEl)
        .setName('Проверить подключение приватного бота')
        .addButton(btn => btn
          .setButtonText('Проверить')
          .onClick(async () => {
            const token = this.plugin.settings.botToken;
            if (!token) {
              new Notice('Сначала введите Bot Token!');
              return;
            }
            new Notice('Подключаемся к серверам Telegram...');
            try {
              const url = \`https://api.telegram.org/bot\${token}/getMe\`;
              const res = await requestUrl({ url, method: 'GET' });
              if (res.status === 200 && res.json?.ok) {
                new Notice(\`Успешно подключено к боту: @\${res.json.result.username}\`);
              } else {
                new Notice('Ошибка подключения. Проверьте токен.');
              }
            } catch (err) {
              new Notice(\`Ошибка подключения: \${err.message || err}\`);
            }
          }));
    }

    new Setting(containerEl)
      .setName('Default Folder Path')
      .setDesc('Имя или путь папки в вашем хранилище для сохранения .md файлов заметок.')
      .addText(text => text
        .setPlaceholder('Telegram Notes')
        .setValue(this.plugin.settings.defaultFolderPath)
        .onChange(async (value) => {
          this.plugin.settings.defaultFolderPath = value.trim() || 'Telegram Notes';
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName('Media Path')
      .setDesc('Папка внутри вашего хранилища для сохранения вложенных картинок и файлов.')
      .addText(text => text
        .setPlaceholder('Telegram Notes/Media')
        .setValue(this.plugin.settings.mediaPath)
        .onChange(async (value) => {
          this.plugin.settings.mediaPath = value.trim() || 'Telegram Notes/Media';
          await this.plugin.saveSettings();
        }));
  }
}
`;
}

export function generateManifestJson(): string {
  return JSON.stringify({
    id: 'obsidian-telegram-sync',
    name: 'Telegram Sync Pro',
    version: '1.0.0',
    minAppVersion: '1.0.0',
    description: 'Синхронизация сообщений и медиафайлов из Telegram-бота прямо в ваши Obsidian заметки с защитой от дублирования.',
    author: 'Telegram Obsidian Sync Community',
    authorUrl: 'https://github.com',
    isDesktopOnly: true
  }, null, 2);
}

export function generatePackageJson(): string {
  return JSON.stringify({
    name: 'obsidian-telegram-sync',
    version: '1.0.0',
    description: 'Obsidian Telegram Sync Plugin',
    main: 'main.js',
    scripts: {
      dev: 'rollup --config rollup.config.js -w',
      build: 'rollup --config rollup.config.js --environment BUILD:production'
    },
    keywords: ['obsidian', 'obsidian-plugin', 'telegram', 'sync', 'bot'],
    author: 'Telegram Obsidian Sync',
    license: 'MIT',
    devDependencies: {
      '@types/node': '^18.0.0',
      'obsidian': '^1.0.0',
      'tslib': '^2.4.0',
      'typescript': '^5.0.0',
      'rollup': '^2.77.0',
      '@rollup/plugin-commonjs': '^22.0.0',
      '@rollup/plugin-node-resolve': '^13.3.0',
      '@rollup/plugin-typescript': '^8.3.0'
    },
    dependencies: {
      'node-telegram-bot-api': '^0.61.0'
    }
  }, null, 2);
}

export function generateStylesCss(): string {
  return `/* Стили для плагина Obsidian Telegram Sync */
.telegram-sync-status {
  color: var(--text-muted);
  font-size: 0.8em;
}
`;
}

export function generateReadme(settings: PluginSettings, currentUrl: string): string {
  const defaultFolder = settings.defaultFolderPath || 'Telegram Notes';
  const mediaFolder = settings.mediaPath || 'Telegram Notes/Media';

  return `# Инструкция по установке и настройке плагина Telegram Sync

Этот плагин предназначен для переноса важных сообщений и фотографий из Telegram прямо в локальное хранилище Obsidian.

Поддерживается 2 классных режима:
1. **Режим общего/облачного бота (Cloud Sync) ⭐** — вы и ваши друзья пишите в ОДИН общий Telegram бот, но сообщения сохраняются только на вашем локальном компьютере в Obsidian. Не требует создания собственного бота!
2. **Приватный режим (Private Bot)** — вы запускаете своего личного бота у @BotFather.

---

## 🛠 Вариант А: Быстрый запуск в Общем режиме (Cloud Sync)

1. Откройте Telegram-бота, настроенного в этой системе.
2. Отправьте ему команду \`/start\`.
3. Бот мгновенно выдаст ваш персональный **Код синхронизации** (например, \`123456789\`).
4. В Obsidian в настройках плагина переключите **Режим подключения** на **"Общий/Облачный бот (Cloud Sync)"**.
5. Укажите свой **Код синхронизации** и адрес сервера: \`${currentUrl}\`.
6. Готово! Всё отправленное боту мгновенно перенесётся в ваш Obsidian. При этом чужие сообщения вы никогда не получите — полная приватность!

---

## 🛠 Вариант Б: Приватный режим (Ваш собственный бот)

1. Найдите бота **@BotFather** в Telegram.
2. Отправьте команду \`/newbot\`.
3. Задайте имя бота и получить свой **Bot Token** (\`123456789:ABCdef...\`).
4. Нажмите **Запустить** (\`/start\`) в вашем свежем боте.
5. Инсталлируйте плагин, выберите в настройках **"Свой личный бот"** и вставьте скопированный токен.

---

## 📥 Установка плагина в Obsidian (Ручной способ)

1. Убедитесь, что в Obsidian в разделе **Сторонние плагины** (Community plugins) отключен Безопасный режим.
2. Перейдите в папку вашего локального сейфа на компьютере (Vault).
3. Перейдите по скрытому пути \`.obsidian/plugins/\` (если папки \`plugins\` нет — создайте).
4. Создайте в ней новую папку \`obsidian-telegram-sync\`.
5. Поместите туда следующие три сгенерированных файла:
   - \`main.js\` (содержимое вкладки "main.js")
   - \`manifest.json\` (содержимое вкладки "manifest.json")
   - \`styles.css\` (содержимое вкладки "styles.css")
6. Перезапустите Obsidian (или обновите список плагинов в настройках), затем включите тумблер напротив **Telegram Sync**.
`;
}
