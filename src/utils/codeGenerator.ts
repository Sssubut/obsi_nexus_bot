export function generateMainTs(): string {
  const defaultFolder = 'Telegram Notes';
  const mediaFolder = 'Telegram Notes/Media';

  return `import { App, Plugin, PluginSettingTab, Setting, Notice } from 'obsidian';
import * as fs from 'fs/promises';
import * as path from 'path';

interface TelegramSyncSettings {
  syncCode: string;
  defaultFolderPath: string;
  mediaPath: string;
  processedMessageIds: string[];
  lastUpdateId: number;
}

const SYNC_SERVER_URL = 'https://bot-1780261529-9605-sssubut.bothost.tech';

const DEFAULT_SETTINGS: TelegramSyncSettings = {
  syncCode: '',
  defaultFolderPath: '${defaultFolder}',
  mediaPath: '${mediaFolder}',
  processedMessageIds: [],
  lastUpdateId: 0
};

// Преобразует entities Telegram → Markdown
function formatTelegramText(text: string, entities: any[] | undefined): string {
  if (!entities || entities.length === 0) return text || '';

  const events: { pos: number; type: string; open: boolean; meta: string }[] = [];
  for (const e of entities) {
    events.push({ pos: e.offset, type: e.type, open: true, meta: e.type === 'text_link' ? e.url : (e.type === 'pre' ? (e.language || '') : '') });
    events.push({ pos: e.offset + e.length, type: e.type, open: false, meta: e.type === 'text_link' ? e.url : '' });
  }
  events.sort((a, b) => a.pos - b.pos || (a.open ? 1 : -1) - (b.open ? 1 : -1));

  let result = '';
  let last = 0;
  const stack: any[] = [];

  for (const ev of events) {
    if (ev.pos > last) result += text.substring(last, ev.pos);

    if (ev.open) {
      switch (ev.type) {
        case 'bold': result += '**'; break;
        case 'italic': result += '*'; break;
        case 'code': result += '\`'; break;
        case 'strikethrough': result += '~~'; break;
        case 'underline': result += '<u>'; break;
        case 'spoiler': result += '||'; break;
        case 'pre': result += '\`\`\`' + ev.meta + '\\n'; break;
        case 'text_link': result += '['; break;
      }
      stack.push(ev);
    } else {
      const prev = stack.pop();
      if (prev) {
        switch (ev.type) {
          case 'bold': result += '**'; break;
          case 'italic': result += '*'; break;
          case 'code': result += '\`'; break;
          case 'strikethrough': result += '~~'; break;
          case 'underline': result += '</u>'; break;
          case 'spoiler': result += '||'; break;
          case 'pre': result += '\\n\`\`\`'; break;
          case 'text_link': result += '](' + (ev.meta || prev.meta || '') + ')'; break;
        }
      }
    }

    last = ev.pos;
  }

  if (last < text.length) result += text.substring(last);
  return result;
}

export default class TelegramSyncPlugin extends Plugin {
  settings: TelegramSyncSettings;
  processedSet: Set<number> = new Set();
  isPolling = false;

  async onload() {
    await this.loadSettings();

    this.processedSet = new Set(
      this.settings.processedMessageIds.map(id => parseInt(id, 10)).filter(id => !isNaN(id))
    );

    this.startPolling();

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
    this.settings.processedMessageIds = Array.from(this.processedSet).map(String);
    await this.saveData(this.settings);
  }

  startPolling() {
    if (this.isPolling) return;
    this.isPolling = true;

    if (this.settings.syncCode) {
      this.pollShared();
    } else {
      new Notice('Telegram Sync: Пожалуйста, настройте Код синхронизации!');
      this.isPolling = false;
    }
  }

  stopPolling() {
    this.isPolling = false;
  }

  async pollShared() {
    console.log('Telegram Sync: Запущен поллинг общего бота');
    while (this.isPolling) {
      if (!this.settings.syncCode) {
        this.stopPolling();
        break;
      }
      try {
        const url = \`\${SYNC_SERVER_URL}/api/updates?syncCode=\${this.settings.syncCode}\`;
        // @ts-ignore
        const { requestUrl } = require('obsidian');
        const response = await requestUrl({ url, method: 'GET' });
        
        if (response.status === 200 && response.json && response.json.ok) {
          const updates = response.json.result;
          const confirmedIds: number[] = [];
          for (const update of updates) {
            this.settings.lastUpdateId = Math.max(this.settings.lastUpdateId || 0, update.update_id);
            if (update.message) {
              const ok = await this.handleTelegramMessage(update.message);
              if (ok) confirmedIds.push(update.update_id);
            }
          }
          if (updates.length > 0) {
            await this.saveSettings();
          }
          if (confirmedIds.length > 0) {
            try {
              await requestUrl({
                url: \`\${SYNC_SERVER_URL}/api/confirm\`,
                method: 'POST',
                body: JSON.stringify({ syncCode: this.settings.syncCode, update_ids: confirmedIds }),
                contentType: 'application/json',
              });
            } catch (e) {
              console.error('Telegram Sync: Ошибка подтверждения:', e);
            }
          }
        }

        // Поисковый поллинг
        try {
          const searchUrl = \`\${SYNC_SERVER_URL}/api/search?syncCode=\${this.settings.syncCode}\`;
          const searchRes = await requestUrl({ url: searchUrl, method: 'GET' });
          if (searchRes.status === 200 && searchRes.json?.ok && searchRes.json.query) {
            const query = searchRes.json.query;
            console.log(\`Telegram Sync: Поиск «\${query}»\`);
            const searchResults = await this.searchNotes(query);
            await requestUrl({
              url: \`\${SYNC_SERVER_URL}/api/search-results\`,
              method: 'POST',
              body: JSON.stringify({ syncCode: this.settings.syncCode, query, results: searchResults }),
              contentType: 'application/json',
            });
          }
        } catch (e) {
          console.error('Telegram Sync: Ошибка поиска:', e);
        }
      } catch (err) {
        console.error('Telegram Sync: Ошибка поллинга сервера общего бота:', err);
        await new Promise(resolve => setTimeout(resolve, 8000));
      }
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }

  async handleTelegramMessage(msg: any): Promise<boolean> {
    if (!msg.message_id) return false;

    if (this.processedSet.has(msg.message_id)) {
      return;
    }

    try {
      const username = msg.from?.username || msg.from?.first_name || 'unknown_user';
      const dateObj = new Date(msg.date * 1000);

      const formattedDateForName = dateObj.toISOString()
        .slice(0, 19)
        .replace('T', ' ')
        .replace(/:/g, '-');

      const formattedDateForContent = dateObj.toLocaleString();

      let text = formatTelegramText(msg.text || msg.caption || '', msg.entities || msg.caption_entities);
      let downloadedFileName = '';

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

      if (!text && downloadedFileName) {
        text = 'Получено вложение: ' + downloadedFileName;
      }

      if (text.startsWith('/')) {
        console.log(\`Telegram Sync: Пропущена команда: \${text.split(' ')[0]}\`);
        return false;
      }

      const sanitizedText = text
        .replace(/[\\\\/:*?"<>|\\n\\r]/g, ' ')
        .substring(0, 30)
        .trim();

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

      this.processedSet.add(msg.message_id);
      
      await this.saveSettings();

      new Notice(\`Telegram Sync: Сообщение успешно сохранено: \${noteFileName}\`);
      return true;
    } catch (error) {
      console.error('Telegram Sync: Ошибка при обработке сообщения:', error);
      return false;
    }
  }

  // Загрузка файлов
  async downloadTelegramFile(fileId: string, type: 'photo' | 'document', originalName?: string): Promise<string | null> {
    try {
      // @ts-ignore
      const { requestUrl } = require('obsidian');
      const downloadUrl = \`\${SYNC_SERVER_URL}/api/file?file_id=\${fileId}&syncCode=\${this.settings.syncCode}\`;
      const fileDataRes = await requestUrl({ url: downloadUrl, method: 'GET', contentType: 'application/octet-stream' });

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

  // Поиск по заметкам в vault
  async searchNotes(query: string): Promise<{ filename: string; preview: string }[]> {
    const vaultBasePath = this.app.vault.adapter.getBasePath();
    const results: { filename: string; preview: string }[] = [];

    const scanDir = async (dir: string) => {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory() && !entry.name.startsWith('.')) {
          await scanDir(fullPath);
        } else if (entry.name.endsWith('.md')) {
          const content = await fs.readFile(fullPath, 'utf-8');
          if (content.toLowerCase().includes(query.toLowerCase())) {
            const relativePath = path.relative(vaultBasePath, fullPath);
            const lines = content.split('\\n');
            const matchLine = lines.find((l: string) => l.toLowerCase().includes(query.toLowerCase())) || '';
            results.push({ filename: relativePath, preview: matchLine.trim().substring(0, 100) });
          }
        }
      }
    };

    await scanDir(vaultBasePath);
    return results;
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

    containerEl.createEl('h2', { text: 'Синхронизация с Telegram (Cloud Sync)' });

    new Setting(containerEl)
      .setName('Код синхронизации (Sync Code)')
      .setDesc('Введите код, полученный от бота после команды /start')
      .addText(text => text
        .setPlaceholder('Введите ваш код синхронизации')
        .setValue(this.plugin.settings.syncCode || '')
        .onChange(async (value) => {
          this.plugin.settings.syncCode = value.trim();
          await this.plugin.saveSettings();
          this.plugin.stopPolling();
          this.plugin.startPolling();
        }));

    new Setting(containerEl)
      .setName('Default Folder Path')
      .setDesc('Путь к папке для сохранения .md заметок.')
      .addText(text => text
        .setPlaceholder('Telegram Notes')
        .setValue(this.plugin.settings.defaultFolderPath)
        .onChange(async (value) => {
          this.plugin.settings.defaultFolderPath = value.trim() || 'Telegram Notes';
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName('Media Path')
      .setDesc('Папка для сохранения вложений.')
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

export function generatePureMainJs(): string {
  const defaultFolder = 'Telegram Notes';
  const mediaFolder = 'Telegram Notes/Media';

  return `const { Plugin, PluginSettingTab, Setting, Notice, requestUrl } = require('obsidian');
const fs = require('fs/promises');
const path = require('path');

const SYNC_SERVER_URL = 'https://bot-1780261529-9605-sssubut.bothost.tech';

// Преобразует entities Telegram → Markdown
function formatTelegramText(text, entities) {
  if (!entities || entities.length === 0) return text || '';

  const events = [];
  for (const e of entities) {
    events.push({ pos: e.offset, type: e.type, open: true, meta: e.type === 'text_link' ? e.url : (e.type === 'pre' ? (e.language || '') : '') });
    events.push({ pos: e.offset + e.length, type: e.type, open: false, meta: e.type === 'text_link' ? e.url : '' });
  }
  events.sort((a, b) => a.pos - b.pos || (a.open ? 1 : -1) - (b.open ? 1 : -1));

  let result = '';
  let last = 0;
  const stack = [];

  for (const ev of events) {
    if (ev.pos > last) result += text.substring(last, ev.pos);

    if (ev.open) {
      switch (ev.type) {
        case 'bold': result += '**'; break;
        case 'italic': result += '*'; break;
        case 'code': result += '\`'; break;
        case 'strikethrough': result += '~~'; break;
        case 'underline': result += '<u>'; break;
        case 'spoiler': result += '||'; break;
        case 'pre': result += '\`\`\`' + ev.meta + '\\n'; break;
        case 'text_link': result += '['; break;
      }
      stack.push(ev);
    } else {
      const prev = stack.pop();
      if (prev) {
        switch (ev.type) {
          case 'bold': result += '**'; break;
          case 'italic': result += '*'; break;
          case 'code': result += '\`'; break;
          case 'strikethrough': result += '~~'; break;
          case 'underline': result += '</u>'; break;
          case 'spoiler': result += '||'; break;
          case 'pre': result += '\\n\`\`\`'; break;
          case 'text_link': result += '](' + (ev.meta || prev.meta || '') + ')'; break;
        }
      }
    }

    last = ev.pos;
  }

  if (last < text.length) result += text.substring(last);
  return result;
}

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
      syncCode: '',
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

    if (this.settings.syncCode) {
      this.pollShared();
    } else {
      new Notice('Telegram Sync: Пожалуйста, настройте Код синхронизации!');
      this.isPolling = false;
    }
  }

  stopPolling() {
    this.isPolling = false;
  }

  async pollShared() {
    console.log('Telegram Sync: Запущен поллинг общего бота');
    while (this.isPolling) {
      if (!this.settings.syncCode) {
        this.stopPolling();
        break;
      }
      try {
        const url = \`\${SYNC_SERVER_URL}/api/updates?syncCode=\${this.settings.syncCode}\`;
        const response = await requestUrl({ url, method: 'GET' });
        
        if (response.status === 200 && response.json && response.json.ok) {
          const updates = response.json.result;
          const confirmedIds = [];
          for (const update of updates) {
            this.settings.lastUpdateId = Math.max(this.settings.lastUpdateId || 0, update.update_id);
            if (update.message) {
              const ok = await this.handleTelegramMessage(update.message);
              if (ok) confirmedIds.push(update.update_id);
            }
          }
          if (updates.length > 0) {
            await this.saveSettings();
          }
          if (confirmedIds.length > 0) {
            try {
              await requestUrl({
                url: \`\${SYNC_SERVER_URL}/api/confirm\`,
                method: 'POST',
                body: JSON.stringify({ syncCode: this.settings.syncCode, update_ids: confirmedIds }),
                contentType: 'application/json',
              });
            } catch (e) {
              console.error('Telegram Sync: Ошибка подтверждения:', e);
            }
          }
        }

        // Поисковый поллинг
        try {
          const searchUrl = \`\${SYNC_SERVER_URL}/api/search?syncCode=\${this.settings.syncCode}\`;
          const searchRes = await requestUrl({ url: searchUrl, method: 'GET' });
          if (searchRes.status === 200 && searchRes.json?.ok && searchRes.json.query) {
            const query = searchRes.json.query;
            console.log(\`Telegram Sync: Поиск «\${query}»\`);
            const searchResults = await this.searchNotes(query);
            await requestUrl({
              url: \`\${SYNC_SERVER_URL}/api/search-results\`,
              method: 'POST',
              body: JSON.stringify({ syncCode: this.settings.syncCode, query, results: searchResults }),
              contentType: 'application/json',
            });
          }
        } catch (e) {
          console.error('Telegram Sync: Ошибка поиска:', e);
        }
      } catch (err) {
        console.error('Telegram Sync Polling Error (Shared):', err);
        await new Promise(resolve => setTimeout(resolve, 8000));
      }
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }

  async handleTelegramMessage(msg) {
    if (!msg.message_id) return false;
    
    if (this.processedSet.has(msg.message_id)) {
      return false;
    }

    try {
      const username = msg.from?.username || msg.from?.first_name || 'unknown_user';
      const dateObj = new Date(msg.date * 1000);
      const formattedDateForName = dateObj.toISOString().slice(0, 19).replace('T', ' ').replace(/:/g, '-');
      const formattedDateForContent = dateObj.toLocaleString();

      let text = formatTelegramText(msg.text || msg.caption || '', msg.entities || msg.caption_entities);
      let downloadedFileName = '';

      if (msg.photo && msg.photo.length > 0) {
        const photo = msg.photo[msg.photo.length - 1];
        const fileId = photo.file_id;
        const localPath = await this.downloadTelegramFile(fileId, 'photo');
        if (localPath) {
          downloadedFileName = path.basename(localPath);
        }
      } else if (msg.document) {
        const fileId = msg.document.file_id;
        const localPath = await this.downloadTelegramFile(fileId, 'document', msg.document.file_name);
        if (localPath) {
          downloadedFileName = path.basename(localPath);
        }
      }

      if (!text && downloadedFileName) {
        text = 'Получено вложение: ' + downloadedFileName;
      }

      if (text.startsWith('/')) {
        console.log('Telegram Sync: Пропущена команда:', text.split(' ')[0]);
        return false;
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
![[\${downloadedFileName}]]\` : ''}
\`;

      const fullNotePath = path.join(defaultFolderAbsolute, noteFileName);
      await fs.writeFile(fullNotePath, noteContent, 'utf-8');

      this.processedSet.add(msg.message_id);
      await this.saveSettings();

      new Notice(\`Telegram Sync: Сообщение сохранено: \${noteFileName}\`);
      return true;
    } catch (err) {
      console.error('Ошибка при генерации заметки из Telegram:', err);
      return false;
    }
  }

  async downloadTelegramFile(fileId, type, originalName) {
    try {
      const downloadUrl = \`\${SYNC_SERVER_URL}/api/file?file_id=\${fileId}&syncCode=\${this.settings.syncCode}\`;
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

  async searchNotes(query) {
    const vaultBasePath = this.app.vault.adapter.getBasePath();
    const results = [];

    const scanDir = async (dir) => {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory() && !entry.name.startsWith('.')) {
          await scanDir(fullPath);
        } else if (entry.name.endsWith('.md')) {
          const content = await fs.readFile(fullPath, 'utf-8');
          if (content.toLowerCase().includes(query.toLowerCase())) {
            const relativePath = path.relative(vaultBasePath, fullPath);
            const lines = content.split('\\n');
            const matchLine = lines.find(l => l.toLowerCase().includes(query.toLowerCase())) || '';
            results.push({ filename: relativePath, preview: matchLine.trim().substring(0, 100) });
          }
        }
      }
    };

    await scanDir(vaultBasePath);
    return results;
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

    containerEl.createEl('h2', { text: 'Синхронизация с Telegram (Cloud Sync)' });

    new Setting(containerEl)
      .setName('Код синхронизации (Sync Code)')
      .setDesc('Введите код, полученный от бота после команды /start')
      .addText(text => text
        .setPlaceholder('Введите ваш код синхронизации')
        .setValue(this.plugin.settings.syncCode || '')
        .onChange(async (value) => {
          this.plugin.settings.syncCode = value.trim();
          await this.plugin.saveSettings();
          this.plugin.stopPolling();
          this.plugin.startPolling();
        }));

    new Setting(containerEl)
      .setName('Default Folder Path')
      .setDesc('Путь к папке для сохранения .md заметок.')
      .addText(text => text
        .setPlaceholder('Telegram Notes')
        .setValue(this.plugin.settings.defaultFolderPath)
        .onChange(async (value) => {
          this.plugin.settings.defaultFolderPath = value.trim() || 'Telegram Notes';
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName('Media Path')
      .setDesc('Папка для сохранения вложений.')
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
    dependencies: {}
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

export function generateReadme(): string {
  return `# Инструкция по установке и настройке плагина Telegram Sync

Этот плагин предназначен для переноса важных сообщений и фотографий из Telegram прямо в локальное хранилище Obsidian.

Работает в режиме **Cloud Sync** — вы и ваши друзья пишете в ОДИН общий Telegram бот, но сообщения сохраняются только на вашем локальном компьютере в Obsidian. Не требует создания собственного бота!

---

## 🛠 Быстрый запуск

1. Откройте Telegram-бота: \`@obsi123123bot\`
2. Отправьте команду \`/start\`.
3. Бот выдаст ваш персональный **Код синхронизации**.
4. Установите плагин (инструкция ниже).
5. В настройках плагина укажите **Код синхронизации**.
6. Готово! Сообщения будут приходить в Obsidian автоматически.

---

## 📦 Установка из ZIP

1. В Obsidian отключите **Безопасный режим** (Настройки → Community plugins).
2. Откройте папку хранилища (Vault), перейдите в \`.obsidian/plugins/\`.
3. Создайте папку \`obsidian-telegram-sync\` и распакуйте туда этот архив.
4. Перезапустите Obsidian, включите **Telegram Sync Pro**.

## ⚙️ Настройка

Откройте **Настройки → Community plugins → Telegram Sync Pro** и введите **Код синхронизации**, полученный от бота.
`;
}
