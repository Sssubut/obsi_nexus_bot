import { PluginSettings } from '../types';

export function generateMainTs(settings: PluginSettings): string {
  const defaultFolder = settings.defaultFolderPath || 'Telegram Notes';
  const mediaFolder = settings.mediaPath || 'Telegram Notes/Media';

  return `import { App, Plugin, PluginSettingTab, Setting, Notice } from 'obsidian';
import * as fs from 'fs/promises';
import * as path from 'path';
import TelegramBot from 'node-telegram-bot-api';

interface TelegramSyncSettings {
  botToken: string;
  defaultFolderPath: string;
  mediaPath: string;
  processedMessageIds: string[];
}

const DEFAULT_SETTINGS: TelegramSyncSettings = {
  botToken: '',
  defaultFolderPath: '${defaultFolder}',
  mediaPath: '${mediaFolder}',
  processedMessageIds: []
};

export default class TelegramSyncPlugin extends Plugin {
  settings: TelegramSyncSettings;
  bot: TelegramBot | null = null;
  processedSet: Set<number> = new Set();

  async onload() {
    await this.loadSettings();

    // Восстанавливаем ID обработанных сообщений из настроек
    this.processedSet = new Set(
      this.settings.processedMessageIds.map(id => parseInt(id, 10)).filter(id => !isNaN(id))
    );

    // Автоматически запускаем бота, если токен настроен
    if (this.settings.botToken) {
      this.startPolling();
    } else {
      new Notice('Telegram Sync: Пожалуйста, настройте Bot Token в настройках плагина!');
    }

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
    if (this.bot) {
      this.stopPolling();
    }

    try {
      // Инициализация бота с включенным поллингом
      this.bot = new TelegramBot(this.settings.botToken, { polling: true });

      // Слушаем входящие сообщения
      this.bot.on('message', async (msg) => {
        await this.handleTelegramMessage(msg);
      });

      this.bot.on('polling_error', (error) => {
        console.error('Telegram Sync: Ошибка поллинга (polling_error):', error);
      });

      console.log('Telegram Sync: Успешный запуск бота.');
    } catch (error) {
      console.error('Telegram Sync: Ошибка инициализации бота:', error);
      new Notice('Telegram Sync: Ошибка при запуске бота. Проверьте ваш токен!');
    }
  }

  stopPolling() {
    if (this.bot) {
      try {
        this.bot.stopPolling();
      } catch (e) {
        console.error('Telegram Sync: Не удалось корректно остановить polling:', e);
      }
      this.bot = null;
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

      // Обработка фотографий
      if (msg.photo && msg.photo.length > 0 && this.bot) {
        // Выбираем самое качественное изображение (последнее в массиве)
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
      if (msg.document && this.bot) {
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
      // @ts-ignore (так как getBasePath не описан в стандартных типах)
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

      // Добавляем ID сообщения в набор обработанных
      this.processedSet.add(msg.message_id);
      
      // Сохраняем новое состояние на диск
      await this.saveSettings();

      new Notice(\`Telegram Sync: Сообщение успешно сохранено: \${noteFileName}\`);
    } catch (error) {
      console.error('Telegram Sync: Ошибка при обработке сообщения:', error);
    }
  }

  // Загрузка файлов через Telegram API и сохранение на диск с использованием fs/promises
  async downloadTelegramFile(fileId: string, type: 'photo' | 'document', originalName?: string): Promise<string | null> {
    if (!this.bot) return null;

    try {
      // Получаем путь к файлу на серверах Telegram
      const fileInfo = await this.bot.getFile(fileId);
      const filePathOnTelegram = fileInfo.file_path;
      if (!filePathOnTelegram) return null;

      // Получаем физический путь к Media Path хранилища
      // @ts-ignore
      const vaultBasePath = this.app.vault.adapter.getBasePath();
      const mediaAbsoluteFolder = path.join(vaultBasePath, this.settings.mediaPath);

      // Создаем директорию для медиа на диске
      await fs.mkdir(mediaAbsoluteFolder, { recursive: true });

      // Формируем красивое уникальное имя файла
      let finalFileName = '';
      if (type === 'photo') {
        finalFileName = \`tg_photo_\${fileId.substring(0, 8)}_\${Date.now()}.png\`;
      } else {
        finalFileName = originalName || \`tg_doc_\${fileId.substring(0, 8)}_\${Date.now()}\`;
      }

      // Скачиваем файл в папку (bot.downloadFile возвращает временный путь скачанного файла)
      const tempDownloadedPath = await this.bot.downloadFile(fileId, mediaAbsoluteFolder);
      
      // Переименовываем файл в красивое название
      const finalAbsolutePath = path.join(mediaAbsoluteFolder, finalFileName);
      await fs.rename(tempDownloadedPath, finalAbsolutePath);

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
      .setName('Bot Token')
      .setDesc('Введите HTTP API токен вашего бота (от @BotFather)')
      .addText(text => text
        .setPlaceholder('123456789:ABCdefGh...')
        .setValue(this.plugin.settings.botToken)
        .onChange(async (value) => {
          this.plugin.settings.botToken = value.trim();
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName('Проверить подключение')
      .setDesc('Проверка валидности указанного токена бота.')
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
            const tempBot = new TelegramBot(token, { polling: false });
            const botInfo = await tempBot.getMe();
            new Notice(\`Успешно подключено к боту: @\${botInfo.username}\`);
          } catch (err: any) {
            new Notice(\`Ошибка подключения: \${err.message || err}\`);
          }
        }));

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

export function generatePureMainJs(settings: PluginSettings): string {
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
    this.lastUpdateId = this.settings.lastUpdateId || 0;

    if (this.settings.botToken) {
      this.startPolling();
    } else {
      new Notice('Telegram Sync: Пожалуйста, настройте Bot Token в настройках!');
    }

    this.addSettingTab(new TelegramSyncSettingTab(this.app, this));
  }

  onunload() {
    this.stopPolling();
    console.log('Telegram Sync: Плагин успешно выгружен.');
  }

  async loadSettings() {
    this.settings = Object.assign({
      botToken: '',
      defaultFolderPath: '${defaultFolder}',
      mediaPath: '${mediaFolder}',
      processedMessageIds: [],
      lastUpdateId: 0
    }, await this.loadData());
  }

  async saveSettings() {
    this.settings.processedMessageIds = Array.from(this.processedSet);
    this.settings.lastUpdateId = this.lastUpdateId;
    await this.saveData(this.settings);
  }

  startPolling() {
    if (this.isPolling) return;
    this.isPolling = true;
    this.poll();
    console.log('Telegram Sync: Запущен поллинг обновлений.');
  }

  stopPolling() {
    this.isPolling = false;
  }

  async poll() {
    while (this.isPolling) {
      if (!this.settings.botToken) {
        this.stopPolling();
        break;
      }
      try {
        const url = \`https://api.telegram.org/bot\${this.settings.botToken}/getUpdates?offset=\${this.lastUpdateId + 1}&timeout=30\`;
        const response = await requestUrl({ url, method: 'GET' });
        
        if (response.status === 200 && response.json && response.json.ok) {
          const updates = response.json.result;
          for (const update of updates) {
            this.lastUpdateId = Math.max(this.lastUpdateId, update.update_id);
            if (update.message) {
              await this.handleTelegramMessage(update.message);
            }
          }
          if (updates.length > 0) {
            await this.saveSettings();
          }
        }
      } catch (err) {
        console.error('Telegram Sync Polling Error:', err);
        // Задержка при ошибке во избежание бесконечного быстрого цикла
        await new Promise(resolve => setTimeout(resolve, 8000));
      }
      // Небольшая задержка перед следующим запросом
      await new Promise(resolve => setTimeout(resolve, 1500));
    }
  }

  async handleTelegramMessage(msg) {
    if (!msg.message_id) return;
    
    // Защита от дубликатов
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

      // Очистка от запрещенных символов в Windows/macOS системных путях
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
![[\${downloadedFileName}]]\` : ''}
\`;

      const fullNotePath = path.join(defaultFolderAbsolute, noteFileName);
      await fs.writeFile(fullNotePath, noteContent, 'utf-8');

      // Сохраняем ID, чтобы предотвратить дублирование при перезапуске
      this.processedSet.add(msg.message_id);
      await this.saveSettings();

      new Notice(\`Telegram Sync: Сообщение сохранено: \${noteFileName}\`);
    } catch (err) {
      console.error('Ошибка при генерации заметки из Telegram:', err);
    }
  }

  async downloadTelegramFile(fileId, type, originalName) {
    try {
      const getFileUrl = \`https://api.telegram.org/bot\${this.settings.botToken}/getFile?file_id=\${fileId}\`;
      const fileInfoRes = await requestUrl({ url: getFileUrl, method: 'GET' });
      if (fileInfoRes.status !== 200 || !fileInfoRes.json?.ok) return null;

      const filePathOnTelegram = fileInfoRes.json.result.file_path;
      if (!filePathOnTelegram) return null;

      const downloadUrl = \`https://api.telegram.org/file/bot\${this.settings.botToken}/\${filePathOnTelegram}\`;
      const fileDataRes = await requestUrl({ url: downloadUrl, method: 'GET', contentType: 'application/octet-stream' });
      
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
      .setName('Bot Token')
      .setDesc('Введите HTTP API токен вашего бота (от @BotFather)')
      .addText(text => text
        .setPlaceholder('123456789:ABCdefGh...')
        .setValue(this.plugin.settings.botToken)
        .onChange(async (value) => {
          this.plugin.settings.botToken = value.trim();
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName('Проверить подключение')
      .setDesc('Проверка валидности указанного токена бота.')
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

export function generateReadme(settings: PluginSettings): string {
  const defaultFolder = settings.defaultFolderPath || 'Telegram Notes';
  const mediaFolder = settings.mediaPath || 'Telegram Notes/Media';

  return `# Инструкция по установке и настройке плагина Telegram Sync

Этот плагин предназначен для переноса важных сообщений и фотографий из вашего личного Telegram-бота прямо в локальное хранилище Obsidian.

## 🛠 Экран 1: Создание и настройка Telegram бота

1. Найдите бота **@BotFather** в Telegram.
2. Отправьте ему команду \`/newbot\` для создания нового бота.
3. Введите название бота (например, \`Мой Обсидиан Синкер\`) и юзернейм, заканчивающийся на \`_bot\` (например, \`my_obsidian_notes_bot\`).
4. **Скопируйте полученный HTTP API Token** (выглядит как \`123456789:ABCdef...\`).
5. Запустите созданного бота кнопкой **Запустить** (или командой \`/start\`).

## 📥 Экран 2: Установка в Obsidian (Ручной способ)

1. Перейдите в настройки хранилища Obsidian -> **Сторонние плагины** (Community plugins) и убедитесь, что **Безопасный режим** отключен.
2. Откройте директорию вашего сейфа на компьютере (Vault).
3. Перейдите по пути \`.obsidian/plugins/\` (если папки \`plugins\` нет, создайте ее).
4. Создайте в ней новую папку \`obsidian-telegram-sync\`.
5. Поместите туда следующие файлы:
   - \`main.js\` (скомпилированный плагин) или скопируйте исходный код для сборки.
   - \`manifest.json\` (манифест плагина)
   - \`styles.css\` (стили оформления)
6. Вернитесь в Obsidian, откройте список сторонних плагинов, нажмите кнопку **Обновить** и активируйте ползунок напротив **Telegram Sync**.

## ⚙ Настройки плагина в Obsidian

При активации перейдите во вкладку настроек плагина:
- **Bot Token**: Вставьте токен, полученный на шаге 1.
- **Проверить подключение**: Нажмите кнопку для проверки связи с серверами Telegram. При успешном тесте появится всплывающее окно Obsidian.
- **Default Folder Path**: Путь (по умолчанию \`${defaultFolder}\`), куда будут сохраняться \`.md\` заметки.
- **Media Path**: Путь к папке (по умолчанию \`${mediaFolder}\`), куда будут загружаться изображения и документы.

## 📝 Формат создаваемых заметок

Для каждого сообщения будет сгенерирован файл с именем:
\`{{дата_из_сообщения}} - {{отправитель}} - {{первые 30 символов}}.md\`

Файл будет иметь следующую структуру метаданных фронтматера и заголовков:
\`\`\`yaml
---
source: telegram
from: {{отправитель}}
date: {{красивая_дата}}
---
# Сообщение от {{отправитель}}

{{текст_сообщения}}

## Вложения
![[загруженная_картинка.png]]
\`\`\`

Управление дубликатами осуществляется автоматически: плагин сохраняет ID обработанных сообщений в локальный файл данных и гарантирует, что при перезапуске Obsidian заметки не будут продублированы.
`;
}
