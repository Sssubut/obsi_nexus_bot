var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// server.ts
var import_express = __toESM(require("express"), 1);
var import_fs = __toESM(require("fs"), 1);
var import_path = __toESM(require("path"), 1);
var import_crypto = __toESM(require("crypto"), 1);
var import_vite = require("vite");
var import_dotenv = __toESM(require("dotenv"), 1);
var import_jszip = __toESM(require("jszip"), 1);

// src/utils/codeGenerator.ts
function generatePureMainJs(currentUrl) {
  const defaultFolder = "Telegram Notes";
  const mediaFolder = "Telegram Notes/Media";
  return `const { Plugin, PluginSettingTab, Setting, Notice, requestUrl } = require('obsidian');
const fs = require('fs/promises');
const path = require('path');

const SYNC_SERVER_URL = '${currentUrl}';

// \u041F\u0440\u0435\u043E\u0431\u0440\u0430\u0437\u0443\u0435\u0442 entities Telegram \u2192 Markdown
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
    console.log('Telegram Sync: \u041F\u043B\u0430\u0433\u0438\u043D \u0443\u0441\u043F\u0435\u0448\u043D\u043E \u0432\u044B\u0433\u0440\u0443\u0436\u0435\u043D.');
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
      new Notice('Telegram Sync: \u041F\u043E\u0436\u0430\u043B\u0443\u0439\u0441\u0442\u0430, \u043D\u0430\u0441\u0442\u0440\u043E\u0439\u0442\u0435 \u041A\u043E\u0434 \u0441\u0438\u043D\u0445\u0440\u043E\u043D\u0438\u0437\u0430\u0446\u0438\u0438!');
      this.isPolling = false;
    }
  }

  stopPolling() {
    this.isPolling = false;
  }

  async pollShared() {
    console.log('Telegram Sync: \u0417\u0430\u043F\u0443\u0449\u0435\u043D \u043F\u043E\u043B\u043B\u0438\u043D\u0433 \u043E\u0431\u0449\u0435\u0433\u043E \u0431\u043E\u0442\u0430');
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
              console.error('Telegram Sync: \u041E\u0448\u0438\u0431\u043A\u0430 \u043F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0435\u043D\u0438\u044F:', e);
            }
          }
        }

        // \u041F\u043E\u0438\u0441\u043A\u043E\u0432\u044B\u0439 \u043F\u043E\u043B\u043B\u0438\u043D\u0433
        try {
          const searchUrl = \`\${SYNC_SERVER_URL}/api/search?syncCode=\${this.settings.syncCode}\`;
          const searchRes = await requestUrl({ url: searchUrl, method: 'GET' });
          if (searchRes.status === 200 && searchRes.json?.ok && searchRes.json.query) {
            const query = searchRes.json.query;
            console.log(\`Telegram Sync: \u041F\u043E\u0438\u0441\u043A \xAB\${query}\xBB\`);
            const searchResults = await this.searchNotes(query);
            await requestUrl({
              url: \`\${SYNC_SERVER_URL}/api/search-results\`,
              method: 'POST',
              body: JSON.stringify({ syncCode: this.settings.syncCode, query, results: searchResults }),
              contentType: 'application/json',
            });
          }
        } catch (e) {
          console.error('Telegram Sync: \u041E\u0448\u0438\u0431\u043A\u0430 \u043F\u043E\u0438\u0441\u043A\u0430:', e);
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
        text = '\u041F\u043E\u043B\u0443\u0447\u0435\u043D\u043E \u0432\u043B\u043E\u0436\u0435\u043D\u0438\u0435: ' + downloadedFileName;
      }

      if (text.startsWith('/')) {
        console.log('Telegram Sync: \u041F\u0440\u043E\u043F\u0443\u0449\u0435\u043D\u0430 \u043A\u043E\u043C\u0430\u043D\u0434\u0430:', text.split(' ')[0]);
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
# \u0421\u043E\u043E\u0431\u0449\u0435\u043D\u0438\u0435 \u043E\u0442 \${username}

\${text}

\${downloadedFileName ? \`## \u0412\u043B\u043E\u0436\u0435\u043D\u0438\u044F
![[\${downloadedFileName}]]\` : ''}
\`;

      const fullNotePath = path.join(defaultFolderAbsolute, noteFileName);
      await fs.writeFile(fullNotePath, noteContent, 'utf-8');

      this.processedSet.add(msg.message_id);
      await this.saveSettings();

      new Notice(\`Telegram Sync: \u0421\u043E\u043E\u0431\u0449\u0435\u043D\u0438\u0435 \u0441\u043E\u0445\u0440\u0430\u043D\u0435\u043D\u043E: \${noteFileName}\`);
      return true;
    } catch (err) {
      console.error('\u041E\u0448\u0438\u0431\u043A\u0430 \u043F\u0440\u0438 \u0433\u0435\u043D\u0435\u0440\u0430\u0446\u0438\u0438 \u0437\u0430\u043C\u0435\u0442\u043A\u0438 \u0438\u0437 Telegram:', err);
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
      console.error('\u041E\u0448\u0438\u0431\u043A\u0430 \u0441\u043A\u0430\u0447\u0438\u0432\u0430\u043D\u0438\u044F \u043C\u0435\u0434\u0438\u0430\u0444\u0430\u0439\u043B\u0430 Telegram:', err);
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

    containerEl.createEl('h2', { text: '\u0421\u0438\u043D\u0445\u0440\u043E\u043D\u0438\u0437\u0430\u0446\u0438\u044F \u0441 Telegram (Cloud Sync)' });

    new Setting(containerEl)
      .setName('\u041A\u043E\u0434 \u0441\u0438\u043D\u0445\u0440\u043E\u043D\u0438\u0437\u0430\u0446\u0438\u0438 (Sync Code)')
      .setDesc('\u0412\u0432\u0435\u0434\u0438\u0442\u0435 \u043A\u043E\u0434, \u043F\u043E\u043B\u0443\u0447\u0435\u043D\u043D\u044B\u0439 \u043E\u0442 \u0431\u043E\u0442\u0430 \u043F\u043E\u0441\u043B\u0435 \u043A\u043E\u043C\u0430\u043D\u0434\u044B /start')
      .addText(text => text
        .setPlaceholder('\u0412\u0432\u0435\u0434\u0438\u0442\u0435 \u0432\u0430\u0448 \u043A\u043E\u0434 \u0441\u0438\u043D\u0445\u0440\u043E\u043D\u0438\u0437\u0430\u0446\u0438\u0438')
        .setValue(this.plugin.settings.syncCode || '')
        .onChange(async (value) => {
          this.plugin.settings.syncCode = value.trim();
          await this.plugin.saveSettings();
          this.plugin.stopPolling();
          this.plugin.startPolling();
        }));

    new Setting(containerEl)
      .setName('Default Folder Path')
      .setDesc('\u041F\u0443\u0442\u044C \u043A \u043F\u0430\u043F\u043A\u0435 \u0434\u043B\u044F \u0441\u043E\u0445\u0440\u0430\u043D\u0435\u043D\u0438\u044F .md \u0437\u0430\u043C\u0435\u0442\u043E\u043A.')
      .addText(text => text
        .setPlaceholder('Telegram Notes')
        .setValue(this.plugin.settings.defaultFolderPath)
        .onChange(async (value) => {
          this.plugin.settings.defaultFolderPath = value.trim() || 'Telegram Notes';
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName('Media Path')
      .setDesc('\u041F\u0430\u043F\u043A\u0430 \u0434\u043B\u044F \u0441\u043E\u0445\u0440\u0430\u043D\u0435\u043D\u0438\u044F \u0432\u043B\u043E\u0436\u0435\u043D\u0438\u0439.')
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
function generateManifestJson() {
  return JSON.stringify({
    id: "obsidian-telegram-sync",
    name: "Telegram Sync Pro",
    version: "1.0.0",
    minAppVersion: "1.0.0",
    description: "\u0421\u0438\u043D\u0445\u0440\u043E\u043D\u0438\u0437\u0430\u0446\u0438\u044F \u0441\u043E\u043E\u0431\u0449\u0435\u043D\u0438\u0439 \u0438 \u043C\u0435\u0434\u0438\u0430\u0444\u0430\u0439\u043B\u043E\u0432 \u0438\u0437 Telegram-\u0431\u043E\u0442\u0430 \u043F\u0440\u044F\u043C\u043E \u0432 \u0432\u0430\u0448\u0438 Obsidian \u0437\u0430\u043C\u0435\u0442\u043A\u0438 \u0441 \u0437\u0430\u0449\u0438\u0442\u043E\u0439 \u043E\u0442 \u0434\u0443\u0431\u043B\u0438\u0440\u043E\u0432\u0430\u043D\u0438\u044F.",
    author: "Telegram Obsidian Sync Community",
    authorUrl: "https://github.com",
    isDesktopOnly: true
  }, null, 2);
}
function generateStylesCss() {
  return `/* \u0421\u0442\u0438\u043B\u0438 \u0434\u043B\u044F \u043F\u043B\u0430\u0433\u0438\u043D\u0430 Obsidian Telegram Sync */
.telegram-sync-status {
  color: var(--text-muted);
  font-size: 0.8em;
}
`;
}
function generateReadme(currentUrl) {
  return `# \u0418\u043D\u0441\u0442\u0440\u0443\u043A\u0446\u0438\u044F \u043F\u043E \u0443\u0441\u0442\u0430\u043D\u043E\u0432\u043A\u0435 \u0438 \u043D\u0430\u0441\u0442\u0440\u043E\u0439\u043A\u0435 \u043F\u043B\u0430\u0433\u0438\u043D\u0430 Telegram Sync

\u042D\u0442\u043E\u0442 \u043F\u043B\u0430\u0433\u0438\u043D \u043F\u0440\u0435\u0434\u043D\u0430\u0437\u043D\u0430\u0447\u0435\u043D \u0434\u043B\u044F \u043F\u0435\u0440\u0435\u043D\u043E\u0441\u0430 \u0432\u0430\u0436\u043D\u044B\u0445 \u0441\u043E\u043E\u0431\u0449\u0435\u043D\u0438\u0439 \u0438 \u0444\u043E\u0442\u043E\u0433\u0440\u0430\u0444\u0438\u0439 \u0438\u0437 Telegram \u043F\u0440\u044F\u043C\u043E \u0432 \u043B\u043E\u043A\u0430\u043B\u044C\u043D\u043E\u0435 \u0445\u0440\u0430\u043D\u0438\u043B\u0438\u0449\u0435 Obsidian.

\u0420\u0430\u0431\u043E\u0442\u0430\u0435\u0442 \u0432 \u0440\u0435\u0436\u0438\u043C\u0435 **Cloud Sync** \u2014 \u0432\u044B \u0438 \u0432\u0430\u0448\u0438 \u0434\u0440\u0443\u0437\u044C\u044F \u043F\u0438\u0448\u0435\u0442\u0435 \u0432 \u041E\u0414\u0418\u041D \u043E\u0431\u0449\u0438\u0439 Telegram \u0431\u043E\u0442, \u043D\u043E \u0441\u043E\u043E\u0431\u0449\u0435\u043D\u0438\u044F \u0441\u043E\u0445\u0440\u0430\u043D\u044F\u044E\u0442\u0441\u044F \u0442\u043E\u043B\u044C\u043A\u043E \u043D\u0430 \u0432\u0430\u0448\u0435\u043C \u043B\u043E\u043A\u0430\u043B\u044C\u043D\u043E\u043C \u043A\u043E\u043C\u043F\u044C\u044E\u0442\u0435\u0440\u0435 \u0432 Obsidian. \u041D\u0435 \u0442\u0440\u0435\u0431\u0443\u0435\u0442 \u0441\u043E\u0437\u0434\u0430\u043D\u0438\u044F \u0441\u043E\u0431\u0441\u0442\u0432\u0435\u043D\u043D\u043E\u0433\u043E \u0431\u043E\u0442\u0430!

---

## \u{1F6E0} \u0411\u044B\u0441\u0442\u0440\u044B\u0439 \u0437\u0430\u043F\u0443\u0441\u043A

1. \u041E\u0442\u043A\u0440\u043E\u0439\u0442\u0435 Telegram-\u0431\u043E\u0442\u0430, \u043D\u0430\u0441\u0442\u0440\u043E\u0435\u043D\u043D\u043E\u0433\u043E \u0432 \u044D\u0442\u043E\u0439 \u0441\u0438\u0441\u0442\u0435\u043C\u0435.
2. \u041E\u0442\u043F\u0440\u0430\u0432\u044C\u0442\u0435 \u0435\u043C\u0443 \u043A\u043E\u043C\u0430\u043D\u0434\u0443 \`/start\`.
3. \u0411\u043E\u0442 \u043C\u0433\u043D\u043E\u0432\u0435\u043D\u043D\u043E \u0432\u044B\u0434\u0430\u0441\u0442 \u0432\u0430\u0448 \u043F\u0435\u0440\u0441\u043E\u043D\u0430\u043B\u044C\u043D\u044B\u0439 **\u041A\u043E\u0434 \u0441\u0438\u043D\u0445\u0440\u043E\u043D\u0438\u0437\u0430\u0446\u0438\u0438** (\u043D\u0430\u043F\u0440\u0438\u043C\u0435\u0440, \`123456789\`).
4. \u0412 Obsidian \u0432 \u043D\u0430\u0441\u0442\u0440\u043E\u0439\u043A\u0430\u0445 \u043F\u043B\u0430\u0433\u0438\u043D\u0430 \u0443\u043A\u0430\u0436\u0438\u0442\u0435 **\u041A\u043E\u0434 \u0441\u0438\u043D\u0445\u0440\u043E\u043D\u0438\u0437\u0430\u0446\u0438\u0438** (\u0430\u0434\u0440\u0435\u0441 \u0441\u0435\u0440\u0432\u0435\u0440\u0430 \u0437\u0430\u043F\u043E\u043B\u043D\u0435\u043D \u0430\u0432\u0442\u043E\u043C\u0430\u0442\u0438\u0447\u0435\u0441\u043A\u0438 \u2014 \`${currentUrl}\`).
5. \u0413\u043E\u0442\u043E\u0432\u043E! \u0412\u0441\u0451 \u043E\u0442\u043F\u0440\u0430\u0432\u043B\u0435\u043D\u043D\u043E\u0435 \u0431\u043E\u0442\u0443 \u043C\u0433\u043D\u043E\u0432\u0435\u043D\u043D\u043E \u043F\u0435\u0440\u0435\u043D\u0435\u0441\u0451\u0442\u0441\u044F \u0432 \u0432\u0430\u0448 Obsidian. \u041F\u0440\u0438 \u044D\u0442\u043E\u043C \u0447\u0443\u0436\u0438\u0435 \u0441\u043E\u043E\u0431\u0449\u0435\u043D\u0438\u044F \u0432\u044B \u043D\u0438\u043A\u043E\u0433\u0434\u0430 \u043D\u0435 \u043F\u043E\u043B\u0443\u0447\u0438\u0442\u0435 \u2014 \u043F\u043E\u043B\u043D\u0430\u044F \u043F\u0440\u0438\u0432\u0430\u0442\u043D\u043E\u0441\u0442\u044C!

---

## \u{1F4E6} \u0423\u0441\u0442\u0430\u043D\u043E\u0432\u043A\u0430 \u0438\u0437 ZIP

\u042D\u0442\u043E\u0442 \u0430\u0440\u0445\u0438\u0432 \u0441\u043E\u0434\u0435\u0440\u0436\u0438\u0442 \u0432\u0441\u0451 \u043D\u0435\u043E\u0431\u0445\u043E\u0434\u0438\u043C\u043E\u0435 \u0434\u043B\u044F \u0443\u0441\u0442\u0430\u043D\u043E\u0432\u043A\u0438 \u043F\u043B\u0430\u0433\u0438\u043D\u0430:

1. \u0423\u0431\u0435\u0434\u0438\u0442\u0435\u0441\u044C, \u0447\u0442\u043E \u0432 Obsidian \u0432 \u0440\u0430\u0437\u0434\u0435\u043B\u0435 **\u041D\u0430\u0441\u0442\u0440\u043E\u0439\u043A\u0438 \u2192 Community plugins** \u043E\u0442\u043A\u043B\u044E\u0447\u0435\u043D \u0411\u0435\u0437\u043E\u043F\u0430\u0441\u043D\u044B\u0439 \u0440\u0435\u0436\u0438\u043C.
2. \u041E\u0442\u043A\u0440\u043E\u0439\u0442\u0435 \u043F\u0430\u043F\u043A\u0443 \u0432\u0430\u0448\u0435\u0433\u043E \u0445\u0440\u0430\u043D\u0438\u043B\u0438\u0449\u0430 (Vault) \u043D\u0430 \u043A\u043E\u043C\u043F\u044C\u044E\u0442\u0435\u0440\u0435.
3. \u041F\u0435\u0440\u0435\u0439\u0434\u0438\u0442\u0435 \u0432 \`.obsidian/plugins/\` (\u0435\u0441\u043B\u0438 \u043F\u0430\u043F\u043A\u0438 \`plugins\` \u043D\u0435\u0442 \u2014 \u0441\u043E\u0437\u0434\u0430\u0439\u0442\u0435 \u0435\u0451).
4. \u0421\u043E\u0437\u0434\u0430\u0439\u0442\u0435 \u043F\u0430\u043F\u043A\u0443 \`obsidian-telegram-sync\`.
5. \u0420\u0430\u0441\u043F\u0430\u043A\u0443\u0439\u0442\u0435 \u0441\u043E\u0434\u0435\u0440\u0436\u0438\u043C\u043E\u0435 \u044D\u0442\u043E\u0433\u043E ZIP-\u0430\u0440\u0445\u0438\u0432\u0430 \u0432 \`.obsidian/plugins/obsidian-telegram-sync/\`.
6. \u041F\u0435\u0440\u0435\u0437\u0430\u043F\u0443\u0441\u0442\u0438\u0442\u0435 Obsidian.
7. \u0412\u043A\u043B\u044E\u0447\u0438\u0442\u0435 \u043F\u043B\u0430\u0433\u0438\u043D **Telegram Sync Pro** \u0432 \u0441\u043F\u0438\u0441\u043A\u0435 \u0443\u0441\u0442\u0430\u043D\u043E\u0432\u043B\u0435\u043D\u043D\u044B\u0445 \u043F\u043B\u0430\u0433\u0438\u043D\u043E\u0432.

## \u{1F4E5} \u0423\u0441\u0442\u0430\u043D\u043E\u0432\u043A\u0430 \u0432\u0440\u0443\u0447\u043D\u0443\u044E (\u0441 \u0441\u0430\u0439\u0442\u0430)

1. \u041E\u0442\u043A\u0440\u043E\u0439\u0442\u0435 \u0432 \u0431\u0440\u0430\u0443\u0437\u0435\u0440\u0435: \`${currentUrl}\`
2. \u041D\u0430\u0436\u043C\u0438\u0442\u0435 **Download ZIP** \u0438\u043B\u0438 \u0441\u043A\u043E\u043F\u0438\u0440\u0443\u0439\u0442\u0435 \u0441\u043E\u0434\u0435\u0440\u0436\u0438\u043C\u043E\u0435 \u0432\u043A\u043B\u0430\u0434\u043E\u043A \`main.js\`, \`manifest.json\`, \`styles.css\`.
3. \u041F\u043E\u043C\u0435\u0441\u0442\u0438\u0442\u0435 \u0444\u0430\u0439\u043B\u044B \u0432 \`.obsidian/plugins/obsidian-telegram-sync/\`.
4. \u0412\u043A\u043B\u044E\u0447\u0438\u0442\u0435 \u043F\u043B\u0430\u0433\u0438\u043D \u0432 **\u041D\u0430\u0441\u0442\u0440\u043E\u0439\u043A\u0438 \u2192 Community plugins**.
`;
}

// server.ts
import_dotenv.default.config();
var userQueues = /* @__PURE__ */ new Map();
var searchQueues = /* @__PURE__ */ new Map();
var confirmedUpdates = /* @__PURE__ */ new Map();
var lastUpdateId = 0;
var chatIdToToken = /* @__PURE__ */ new Map();
var tokenToChatId = /* @__PURE__ */ new Map();
function generateToken() {
  return import_crypto.default.randomBytes(4).toString("hex");
}
function getOrCreateToken(chatId) {
  let token = chatIdToToken.get(chatId);
  if (!token) {
    token = generateToken();
    chatIdToToken.set(chatId, token);
    tokenToChatId.set(token, chatId);
    scheduleSave();
  }
  return token;
}
function regenerateToken(chatId) {
  const oldToken = chatIdToToken.get(chatId);
  if (oldToken) {
    tokenToChatId.delete(oldToken);
  }
  const newToken = generateToken();
  chatIdToToken.set(chatId, newToken);
  tokenToChatId.set(newToken, chatId);
  const oldQueue = userQueues.get(oldToken || "");
  if (oldToken && oldQueue) {
    userQueues.set(newToken, oldQueue);
  }
  scheduleSave();
  return newToken;
}
function resolveSyncCode(syncCode) {
  if (tokenToChatId.has(syncCode)) {
    return syncCode;
  }
  const chatId = Number(syncCode);
  if (!isNaN(chatId) && chatIdToToken.has(chatId)) {
    return chatIdToToken.get(chatId);
  }
  return null;
}
var BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "6852938152:AAH_g7K7kLMpdWqpU9X8X1vQz7Zdf_ex990";
var TELEGRAM_API_BASE = process.env.TELEGRAM_API_BASE_URL || "https://api.telegram.org";
var onboardedChats = /* @__PURE__ */ new Set();
var awaitingSearch = /* @__PURE__ */ new Set();
var STATE_PATH = import_path.default.join(process.cwd(), "state.json");
var saveTimeout = null;
function loadState() {
  try {
    if (!import_fs.default.existsSync(STATE_PATH)) return;
    const raw = import_fs.default.readFileSync(STATE_PATH, "utf-8");
    const data = JSON.parse(raw);
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
    console.error("Failed to load state:", err);
  }
}
function saveState() {
  try {
    const data = {
      chatIdToToken: Array.from(chatIdToToken.entries()),
      lastUpdateId,
      onboardedChats: Array.from(onboardedChats)
    };
    import_fs.default.writeFileSync(STATE_PATH, JSON.stringify(data), "utf-8");
  } catch (err) {
    console.error("Failed to save state:", err);
  }
}
function scheduleSave() {
  if (saveTimeout) clearTimeout(saveTimeout);
  saveTimeout = setTimeout(() => {
    saveState();
    saveTimeout = null;
  }, 3e3);
}
var COMMAND_KEYBOARD = {
  keyboard: [
    [{ text: "\u{1F511} \u041C\u043E\u0439 \u043A\u043E\u0434" }],
    [{ text: "\u{1F4CA} \u0421\u0442\u0430\u0442\u0443\u0441" }, { text: "\u{1F504} \u041D\u043E\u0432\u044B\u0439 \u0442\u043E\u043A\u0435\u043D" }],
    [{ text: "\u{1F50D} \u041F\u043E\u0438\u0441\u043A" }, { text: "\u{1F4E5} \u041F\u043B\u0430\u0433\u0438\u043D" }, { text: "\u2753 \u041F\u043E\u043C\u043E\u0449\u044C" }]
  ],
  resize_keyboard: true,
  input_field_placeholder: "\u041D\u0430\u043F\u0438\u0448\u0438 \u0441\u043E\u043E\u0431\u0449\u0435\u043D\u0438\u0435 \u0438\u043B\u0438 \u043D\u0430\u0436\u043C\u0438 \u043A\u043D\u043E\u043F\u043A\u0443..."
};
async function sendWithKeyboard(chatId, text) {
  try {
    const res = await fetch(`${TELEGRAM_API_BASE}/bot${BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: "HTML",
        reply_markup: COMMAND_KEYBOARD
      })
    });
    if (!res.ok) {
      const errBody = await res.text();
      console.error(`Telegram API error (chat ${chatId}): ${res.status} ${errBody}`);
    }
  } catch (err) {
    console.error("Error sending response to Telegram:", err);
  }
}
function getServerUrl() {
  return process.env.SERVER_URL || `http://localhost:${process.env.PORT || "3000"}`;
}
async function sendPluginZip(chatId) {
  const serverUrl = getServerUrl();
  try {
    const zip = new import_jszip.default();
    zip.file("main.js", generatePureMainJs(serverUrl));
    zip.file("manifest.json", generateManifestJson());
    zip.file("styles.css", generateStylesCss());
    zip.file("README.md", generateReadme(serverUrl));
    const zipBuffer = await zip.generateAsync({ type: "nodebuffer" });
    const formData = new FormData();
    formData.append("chat_id", String(chatId));
    formData.append("document", new Blob([zipBuffer], { type: "application/zip" }), "obsidian-telegram-sync.zip");
    formData.append("reply_markup", JSON.stringify(COMMAND_KEYBOARD));
    const res = await fetch(`${TELEGRAM_API_BASE}/bot${BOT_TOKEN}/sendDocument`, {
      method: "POST",
      body: formData
    });
    if (!res.ok) {
      const errBody = await res.text();
      console.error(`sendPluginZip error: ${res.status} ${errBody}`);
      await sendWithKeyboard(chatId, `\u274C \u041D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u043E\u0442\u043F\u0440\u0430\u0432\u0438\u0442\u044C ZIP. \u041E\u0442\u043A\u0440\u043E\u0439 \u0441\u0430\u0439\u0442 ${serverUrl} \u0438 \u043D\u0430\u0436\u043C\u0438 Download ZIP.`);
    }
    await sendWithKeyboard(chatId, `\u{1F4E5} <b>\u0412\u043E\u0442 \u0430\u0440\u0445\u0438\u0432 \u0441 \u043F\u043B\u0430\u0433\u0438\u043D\u043E\u043C.</b>

\u0420\u0430\u0441\u043F\u0430\u043A\u0443\u0439 \u0435\u0433\u043E \u0432 \u043F\u0430\u043F\u043A\u0443:
<code>.obsidian/plugins/obsidian-telegram-sync/</code>

\u041F\u043E\u0442\u043E\u043A \u0432\u043A\u043B\u044E\u0447\u0438 \u043F\u043B\u0430\u0433\u0438\u043D \u0432 <b>\u041D\u0430\u0441\u0442\u0440\u043E\u0439\u043A\u0438 \u2192 Community plugins</b>.

\u041F\u043E\u0434\u0440\u043E\u0431\u043D\u0430\u044F \u0438\u043D\u0441\u0442\u0440\u0443\u043A\u0446\u0438\u044F \u2014 \u0432\u043D\u0443\u0442\u0440\u0438 \u0430\u0440\u0445\u0438\u0432\u0430 (README.md).`);
  } catch (err) {
    console.error("sendPluginZip error:", err);
    await sendWithKeyboard(chatId, `\u274C \u041E\u0448\u0438\u0431\u043A\u0430 \u043F\u0440\u0438 \u0441\u043E\u0437\u0434\u0430\u043D\u0438\u0438 ZIP. \u041E\u0442\u043A\u0440\u043E\u0439 \u0441\u0430\u0439\u0442 ${serverUrl} \u0438 \u043D\u0430\u0436\u043C\u0438 Download ZIP.`);
  }
}
function describeMessage(msg) {
  if (msg.text) return msg.text;
  if (msg.caption) return msg.caption;
  if (msg.sticker) return msg.sticker.emoji ? `\u{1F3A8} Sticker: ${msg.sticker.emoji}` : "\u{1F3A8} Sticker";
  if (msg.voice) return "\u{1F3A4} \u0413\u043E\u043B\u043E\u0441\u043E\u0432\u043E\u0435 \u0441\u043E\u043E\u0431\u0449\u0435\u043D\u0438\u0435";
  if (msg.video) return "\u{1F3AC} \u0412\u0438\u0434\u0435\u043E";
  if (msg.video_note) return "\u{1F3AC} \u0412\u0438\u0434\u0435\u043E\u0441\u043E\u043E\u0431\u0449\u0435\u043D\u0438\u0435";
  if (msg.audio) return "\u{1F3B5} \u0410\u0443\u0434\u0438\u043E";
  if (msg.animation) return "\u{1F5BC}\uFE0F GIF/\u0410\u043D\u0438\u043C\u0430\u0446\u0438\u044F";
  if (msg.photo) return "\u{1F4F8} \u0424\u043E\u0442\u043E";
  if (msg.document) return msg.document.file_name ? `\u{1F4C4} \u0414\u043E\u043A\u0443\u043C\u0435\u043D\u0442: ${msg.document.file_name}` : "\u{1F4C4} \u0414\u043E\u043A\u0443\u043C\u0435\u043D\u0442";
  if (msg.location) return `\u{1F4CD} \u041B\u043E\u043A\u0430\u0446\u0438\u044F: ${msg.location.latitude}, ${msg.location.longitude}`;
  if (msg.contact) return msg.contact.first_name ? `\u{1F464} \u041A\u043E\u043D\u0442\u0430\u043A\u0442: ${msg.contact.first_name}${msg.contact.last_name ? ` ${msg.contact.last_name}` : ""}` : "\u{1F464} \u041A\u043E\u043D\u0442\u0430\u043A\u0442";
  if (msg.poll) return `\u{1F4CA} \u041E\u043F\u0440\u043E\u0441: ${msg.poll.question || ""}`;
  if (msg.dice) return `\u{1F3B2} ${msg.dice.emoji} \u2014 ${msg.dice.value}`;
  return "\u{1F4AC} \u0421\u043E\u043E\u0431\u0449\u0435\u043D\u0438\u0435";
}
async function startTelegramPolling() {
  console.log(`Starting Telegram background polling with token: ${BOT_TOKEN.substring(0, 10)}... (Base URL: ${TELEGRAM_API_BASE})`);
  try {
    await fetch(`${TELEGRAM_API_BASE}/bot${BOT_TOKEN}/setMyCommands`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        commands: [
          { command: "start", description: "\u041F\u043E\u043A\u0430\u0437\u0430\u0442\u044C \u041A\u043E\u0434 \u0441\u0438\u043D\u0445\u0440\u043E\u043D\u0438\u0437\u0430\u0446\u0438\u0438" },
          { command: "help", description: "\u0421\u043F\u0440\u0430\u0432\u043A\u0430" },
          { command: "status", description: "\u0421\u0442\u0430\u0442\u0443\u0441 \u043E\u0447\u0435\u0440\u0435\u0434\u0438" },
          { command: "newtoken", description: "\u0421\u0431\u0440\u043E\u0441\u0438\u0442\u044C \u0442\u043E\u043A\u0435\u043D" },
          { command: "search", description: "\u041F\u043E\u0438\u0441\u043A \u043F\u043E \u0437\u0430\u043C\u0435\u0442\u043A\u0430\u043C Obsidian" },
          { command: "plugin", description: "\u041A\u0430\u043A \u0443\u0441\u0442\u0430\u043D\u043E\u0432\u0438\u0442\u044C \u043F\u043B\u0430\u0433\u0438\u043D" },
          { command: "cancel", description: "\u041E\u0442\u043C\u0435\u043D\u0438\u0442\u044C \u043F\u043E\u0438\u0441\u043A" }
        ]
      })
    });
  } catch {
  }
  while (true) {
    try {
      const url = `${TELEGRAM_API_BASE}/bot${BOT_TOKEN}/getUpdates?offset=${lastUpdateId + 1}&timeout=30`;
      const response = await fetch(url);
      if (response.ok) {
        const data = await response.json();
        if (data.ok && data.result) {
          for (const update of data.result) {
            lastUpdateId = Math.max(lastUpdateId, update.update_id);
            scheduleSave();
            const message = update.message;
            if (message && message.chat && message.chat.id) {
              const chatId = message.chat.id;
              const token = getOrCreateToken(chatId);
              const text = message.text || message.caption || "";
              console.log(
                `\u2190 msg chat:${chatId} token:${token} len:${text.length}`,
                text ? `"${text.substring(0, 50)}${text.length > 50 ? "..." : ""}"` : "(no text)"
              );
              const isStart = text && (text.startsWith("/start") || text.includes("\u041C\u043E\u0439 \u043A\u043E\u0434"));
              const isHelp = text && (text.startsWith("/help") || text.includes("\u041F\u043E\u043C\u043E\u0449\u044C"));
              const isNewToken = text && (text.startsWith("/newtoken") || text.includes("\u041D\u043E\u0432\u044B\u0439 \u0442\u043E\u043A\u0435\u043D"));
              const isStatus = text && (text.startsWith("/status") || text.includes("\u0421\u0442\u0430\u0442\u0443\u0441"));
              const isSearch = text && (text.startsWith("/search") || text.includes("\u041F\u043E\u0438\u0441\u043A"));
              const isPlugin = text && (text.startsWith("/plugin") || text.includes("\u041F\u043B\u0430\u0433\u0438\u043D"));
              const isCancel = text && text.startsWith("/cancel");
              if (isStart) {
                onboardedChats.add(chatId);
                scheduleSave();
                const greeting = `\u{1F44B} <b>\u041F\u0440\u0438\u0432\u0435\u0442! \u042F \u0442\u0432\u043E\u0439 Telegram-Obsidian \u0430\u0441\u0441\u0438\u0441\u0442\u0435\u043D\u0442!</b>
                
<b>Cloud Sync \u0430\u043A\u0442\u0438\u0432\u0435\u043D</b>

\u0422\u0432\u043E\u0439 <b>\u041A\u043E\u0434 \u0441\u0438\u043D\u0445\u0440\u043E\u043D\u0438\u0437\u0430\u0446\u0438\u0438</b>:
<code>${token}</code>

<b>\u041A\u0430\u043A \u043D\u0430\u0441\u0442\u0440\u043E\u0438\u0442\u044C \u043F\u043B\u0430\u0433\u0438\u043D \u0432 Obsidian:</b>
1. \u041D\u0430\u0436\u043C\u0438 \xAB\u{1F4E5} \u041F\u043B\u0430\u0433\u0438\u043D\xBB \u0447\u0442\u043E\u0431\u044B \u0441\u043A\u0430\u0447\u0430\u0442\u044C ZIP \u0441 \u043F\u043B\u0430\u0433\u0438\u043D\u043E\u043C \u0438 README
2. \u0418\u043B\u0438 \u043E\u0442\u043A\u0440\u043E\u0439 \u0441\u0430\u0439\u0442: <code>http://localhost:3000</code>
3. \u0412\u0441\u0442\u0430\u0432\u044C \u044D\u0442\u043E\u0442 \u043A\u043E\u0434 \u0432 \u043D\u0430\u0441\u0442\u0440\u043E\u0439\u043A\u0430\u0445 \u043F\u043B\u0430\u0433\u0438\u043D\u0430
4. \u0412\u0441\u0451! \u0417\u0430\u043C\u0435\u0442\u043A\u0438 \u0431\u0443\u0434\u0443\u0442 \u043F\u0440\u0438\u0445\u043E\u0434\u0438\u0442\u044C \u0430\u0432\u0442\u043E\u043C\u0430\u0442\u0438\u0447\u0435\u0441\u043A\u0438

\u041F\u0440\u043E\u0441\u0442\u043E \u043E\u0442\u043F\u0440\u0430\u0432\u044C \u043C\u043D\u0435 \u043B\u044E\u0431\u043E\u0435 \u0441\u043E\u043E\u0431\u0449\u0435\u043D\u0438\u0435, \u043A\u0430\u0440\u0442\u0438\u043D\u043A\u0443 \u0438\u043B\u0438 \u0444\u0430\u0439\u043B \u2014 \u043E\u043D\u043E \u043F\u043E\u044F\u0432\u0438\u0442\u0441\u044F \u0432 Obsidian.`;
                await sendWithKeyboard(chatId, greeting);
              } else if (isHelp) {
                onboardedChats.add(chatId);
                scheduleSave();
                const helpMessage = `\u{1F916} <b>Telegram Sync \u2014 \u0430\u0441\u0441\u0438\u0441\u0442\u0435\u043D\u0442 \u0434\u043B\u044F Obsidian</b>

<b>\u041A\u043E\u0434 \u0441\u0438\u043D\u0445\u0440\u043E\u043D\u0438\u0437\u0430\u0446\u0438\u0438:</b>
<code>${token}</code>

<b>\u041A\u0430\u043A \u043F\u043E\u043B\u044C\u0437\u043E\u0432\u0430\u0442\u044C\u0441\u044F:</b>
\u2022 \u041F\u0440\u043E\u0441\u0442\u043E \u043E\u0442\u043F\u0440\u0430\u0432\u044C \u0442\u0435\u043A\u0441\u0442, \u0444\u043E\u0442\u043E \u0438\u043B\u0438 \u0444\u0430\u0439\u043B \u2014 \u043E\u043D \u043F\u043E\u044F\u0432\u0438\u0442\u0441\u044F \u0432 Obsidian
\u2022 \u0418\u0441\u043F\u043E\u043B\u044C\u0437\u0443\u0439 \u043A\u043D\u043E\u043F\u043A\u0438 \u043D\u0438\u0436\u0435 \u0434\u043B\u044F \u0443\u043F\u0440\u0430\u0432\u043B\u0435\u043D\u0438\u044F

<b>\u041A\u043D\u043E\u043F\u043A\u0438:</b>
\u{1F511} \u041C\u043E\u0439 \u043A\u043E\u0434 \u2014 \u043F\u043E\u043A\u0430\u0437\u0430\u0442\u044C \u0442\u0432\u043E\u0439 \u041A\u043E\u0434 \u0441\u0438\u043D\u0445\u0440\u043E\u043D\u0438\u0437\u0430\u0446\u0438\u0438
\u{1F4CA} \u0421\u0442\u0430\u0442\u0443\u0441 \u2014 \u043F\u0440\u043E\u0432\u0435\u0440\u0438\u0442\u044C \u043E\u0447\u0435\u0440\u0435\u0434\u044C \u0441\u043E\u043E\u0431\u0449\u0435\u043D\u0438\u0439
\u{1F504} \u041D\u043E\u0432\u044B\u0439 \u0442\u043E\u043A\u0435\u043D \u2014 \u0441\u0431\u0440\u043E\u0441\u0438\u0442\u044C \u0442\u043E\u043A\u0435\u043D (\u0441\u0442\u0430\u0440\u044B\u0439 \u043F\u0435\u0440\u0435\u0441\u0442\u0430\u043D\u0435\u0442 \u0440\u0430\u0431\u043E\u0442\u0430\u0442\u044C)
\u{1F50D} \u041F\u043E\u0438\u0441\u043A \u2014 \u0438\u0441\u043A\u0430\u0442\u044C \u0437\u0430\u043C\u0435\u0442\u043A\u0438 \u0432 Obsidian
\u{1F4E5} \u041F\u043B\u0430\u0433\u0438\u043D \u2014 \u0441\u043A\u0430\u0447\u0430\u0442\u044C ZIP \u0441 \u043F\u043B\u0430\u0433\u0438\u043D\u043E\u043C \u0438 README
\u2753 \u041F\u043E\u043C\u043E\u0449\u044C \u2014 \u044D\u0442\u0430 \u0441\u043F\u0440\u0430\u0432\u043A\u0430`;
                await sendWithKeyboard(chatId, helpMessage);
              } else if (isNewToken) {
                const oldToken = token;
                const newToken = regenerateToken(chatId);
                await sendWithKeyboard(chatId, `\u2705 <b>\u0422\u0432\u043E\u0439 \u041A\u043E\u0434 \u0441\u0438\u043D\u0445\u0440\u043E\u043D\u0438\u0437\u0430\u0446\u0438\u0438 \u043E\u0431\u043D\u043E\u0432\u043B\u0451\u043D!</b>

\u0421\u0442\u0430\u0440\u044B\u0439: <code>${oldToken}</code>
\u041D\u043E\u0432\u044B\u0439: <code>${newToken}</code>

\u041D\u0435 \u0437\u0430\u0431\u0443\u0434\u044C \u043E\u0431\u043D\u043E\u0432\u0438\u0442\u044C \u043A\u043E\u0434 \u0432 \u043D\u0430\u0441\u0442\u0440\u043E\u0439\u043A\u0430\u0445 \u043F\u043B\u0430\u0433\u0438\u043D\u0430 Obsidian!`);
              } else if (isStatus) {
                onboardedChats.add(chatId);
                scheduleSave();
                await sendWithKeyboard(chatId, `\u{1F4E1} <b>\u0421\u0442\u0430\u0442\u0443\u0441 \u0441\u0438\u043D\u0445\u0440\u043E\u043D\u0438\u0437\u0430\u0446\u0438\u0438: \u0410\u043A\u0442\u0438\u0432\u0435\u043D</b>
                
\u2022 \u041A\u043E\u0434: <code>${token}</code>
\u2022 \u0412 \u043E\u0447\u0435\u0440\u0435\u0434\u0438: <code>${(userQueues.get(token) || []).length}</code> \u0441\u043E\u043E\u0431\u0449\u0435\u043D\u0438\u0439`);
              } else if (isCancel) {
                awaitingSearch.delete(chatId);
                await sendWithKeyboard(chatId, `\u274C \u041F\u043E\u0438\u0441\u043A \u043E\u0442\u043C\u0435\u043D\u0451\u043D`);
              } else if (isSearch) {
                awaitingSearch.delete(chatId);
                const query = text.startsWith("/search") ? text.substring("/search".length).trim() : "";
                if (query) {
                  let queue = searchQueues.get(token);
                  if (!queue) {
                    queue = [];
                    searchQueues.set(token, queue);
                  }
                  queue.push({ query, update_id: update.update_id });
                  await sendWithKeyboard(chatId, `\u{1F50D} \u0418\u0449\u0443 \xAB${query}\xBB \u0432 \u0442\u0432\u043E\u0438\u0445 \u0437\u0430\u043C\u0435\u0442\u043A\u0430\u0445...`);
                } else {
                  awaitingSearch.add(chatId);
                  await sendWithKeyboard(chatId, `\u{1F50D} \u041D\u0430\u043F\u0438\u0448\u0438 \u0442\u0435\u043A\u0441\u0442 \u0434\u043B\u044F \u043F\u043E\u0438\u0441\u043A\u0430 \u043F\u043E \u0437\u0430\u043C\u0435\u0442\u043A\u0430\u043C.
\u0418\u043B\u0438 \u043E\u0442\u043F\u0440\u0430\u0432\u044C /cancel \u0447\u0442\u043E\u0431\u044B \u043E\u0442\u043C\u0435\u043D\u0438\u0442\u044C.`);
                }
              } else if (isPlugin) {
                await sendPluginZip(chatId);
              } else if (text && text.startsWith("/")) {
                console.log(`Telegram Sync: \u043D\u0435\u0438\u0437\u0432\u0435\u0441\u0442\u043D\u0430\u044F \u043A\u043E\u043C\u0430\u043D\u0434\u0430 \u043E\u0442 ${chatId}: ${text.split(" ")[0]}`);
              } else {
                if (awaitingSearch.has(chatId)) {
                  awaitingSearch.delete(chatId);
                  const query = (message.text || message.caption || "").trim();
                  if (query) {
                    let queue = searchQueues.get(token);
                    if (!queue) {
                      queue = [];
                      searchQueues.set(token, queue);
                    }
                    queue.push({ query, update_id: update.update_id });
                    await sendWithKeyboard(chatId, `\u{1F50D} \u0418\u0449\u0443 \xAB${query}\xBB \u0432 \u0442\u0432\u043E\u0438\u0445 \u0437\u0430\u043C\u0435\u0442\u043A\u0430\u0445...`);
                  } else {
                    await sendWithKeyboard(chatId, `\u274C \u041F\u043E\u0438\u0441\u043A \u043E\u0442\u043C\u0435\u043D\u0451\u043D (\u043F\u0443\u0441\u0442\u043E\u0439 \u0437\u0430\u043F\u0440\u043E\u0441)`);
                  }
                } else {
                  if (!message.text && !message.caption) {
                    message.text = describeMessage(message);
                  }
                  let queue = userQueues.get(token);
                  if (!queue) {
                    queue = [];
                    userQueues.set(token, queue);
                  }
                  if (!queue.some((item) => item.update_id === update.update_id)) {
                    queue.push(update);
                  }
                  if (!onboardedChats.has(chatId)) {
                    onboardedChats.add(chatId);
                    scheduleSave();
                    await sendWithKeyboard(chatId, `\u{1F44B} <b>\u041F\u0440\u0438\u0432\u0435\u0442! \u0422\u0432\u043E\u0439 \u041A\u043E\u0434 \u0441\u0438\u043D\u0445\u0440\u043E\u043D\u0438\u0437\u0430\u0446\u0438\u0438:</b>

<code>${token}</code>

\u0412\u0441\u0442\u0430\u0432\u044C \u0435\u0433\u043E \u0432 \u043D\u0430\u0441\u0442\u0440\u043E\u0439\u043A\u0430\u0445 \u043F\u043B\u0430\u0433\u0438\u043D\u0430 \u0432 Obsidian, \u0447\u0442\u043E\u0431\u044B \u0437\u0430\u043C\u0435\u0442\u043A\u0438 \u043F\u0440\u0438\u0445\u043E\u0434\u0438\u043B\u0438 \u0430\u0432\u0442\u043E\u043C\u0430\u0442\u0438\u0447\u0435\u0441\u043A\u0438.`);
                  }
                  await sendWithKeyboard(chatId, `\u2705 \u0412 \u043E\u0447\u0435\u0440\u0435\u0434\u0438`);
                }
              }
            }
          }
        }
      } else {
        const errorText = await response.text();
        console.error(`Telegram getUpdates failed: Status ${response.status} (${response.statusText}). Body:`, errorText);
        await new Promise((resolve) => setTimeout(resolve, 5e3));
      }
    } catch (e) {
      const isConnectionError = e?.message?.includes("fetch failed") || e?.code === "UND_ERR_CONNECT_TIMEOUT" || e?.message?.includes("timeout") || e?.cause?.code === "UND_ERR_CONNECT_TIMEOUT";
      if (isConnectionError) {
        console.error("\n\u26A0\uFE0F  [TELEGRAM CONNECTION ERROR] \u26A0\uFE0F");
        console.error("\u041F\u043E\u0445\u043E\u0436\u0435, api.telegram.org \u0437\u0430\u0431\u043B\u043E\u043A\u0438\u0440\u043E\u0432\u0430\u043D \u0432\u0430\u0448\u0438\u043C \u043F\u0440\u043E\u0432\u0430\u0439\u0434\u0435\u0440\u043E\u043C \u0438\u043B\u0438 \u043D\u0435\u0434\u043E\u0441\u0442\u0443\u043F\u0435\u043D \u0441 \u043B\u043E\u043A\u0430\u043B\u044C\u043D\u043E\u0433\u043E \u041F\u041A.");
        console.error("\u0427\u0442\u043E\u0431\u044B \u0437\u0430\u043F\u0443\u0441\u0442\u0438\u0442\u044C \u0441\u0435\u0440\u0432\u0435\u0440 \u043D\u0430 \u043B\u043E\u043A\u0430\u043B\u043A\u0435, \u0432\u043E\u0441\u043F\u043E\u043B\u044C\u0437\u0443\u0439\u0442\u0435\u0441\u044C \u043E\u0434\u043D\u0438\u043C \u0438\u0437 \u0440\u0435\u0448\u0435\u043D\u0438\u0439:");
        console.error("\u{1F449} \u0420\u0435\u0448\u0435\u043D\u0438\u0435 1: \u0414\u043E\u0431\u0430\u0432\u044C\u0442\u0435 \u0432 \u0444\u0430\u0439\u043B .env \u043F\u0440\u043E\u043A\u0441\u0438-\u0441\u0435\u0440\u0432\u0435\u0440 (\u043D\u0430\u043F\u0440\u0438\u043C\u0435\u0440, https://api.telegram-proxy.org \u0438\u043B\u0438 \u0434\u0440\u0443\u0433\u043E\u0439 \u0440\u0430\u0431\u043E\u0447\u0438\u0439 \u043F\u0440\u043E\u043A\u0441\u0438):");
        console.error('   TELEGRAM_API_BASE_URL="https://api.telegram-proxy.org"');
        console.error("\u{1F449} \u0420\u0435\u0448\u0435\u043D\u0438\u0435 2: \u0412\u043A\u043B\u044E\u0447\u0438\u0442\u0435 \u0441\u0438\u0441\u0442\u0435\u043C\u043D\u044B\u0439 VPN \u043D\u0430 \u0432\u0430\u0448\u0435\u043C \u043A\u043E\u043C\u043F\u044C\u044E\u0442\u0435\u0440\u0435.");
        console.error("\u{1F449} \u0420\u0435\u0448\u0435\u043D\u0438\u0435 3: \u041D\u0435 \u0437\u0430\u043F\u0443\u0441\u043A\u0430\u0439\u0442\u0435 \u0441\u0435\u0440\u0432\u0435\u0440 \u043B\u043E\u043A\u0430\u043B\u044C\u043D\u043E \u0432\u043E\u043E\u0431\u0449\u0435! \u0418\u0441\u043F\u043E\u043B\u044C\u0437\u0443\u0439\u0442\u0435 \u043E\u0431\u043B\u0430\u0447\u043D\u044B\u0439 \u0440\u0435\u0436\u0438\u043C Cloud Sync (\u043E\u043D \u0443\u0436\u0435 \u0440\u0430\u0431\u043E\u0442\u0430\u0435\u0442 24/7 \u0443 \u043D\u0430\u0441 \u0432 \u043E\u0431\u043B\u0430\u043A\u0435 \u0432 \u0415\u0432\u0440\u043E\u043F\u0435 \u0438 \u043F\u0440\u0438\u043D\u0438\u043C\u0430\u0435\u0442 \u0441\u043E\u043E\u0431\u0449\u0435\u043D\u0438\u044F).\n");
      } else {
        console.error("Error fetching Telegram updates in background:", e);
      }
      await new Promise((resolve) => setTimeout(resolve, 5e3));
    }
    await new Promise((resolve) => setTimeout(resolve, 1e3));
  }
}
async function runServer() {
  loadState();
  const app = (0, import_express.default)();
  const PORT = parseInt(process.env.PORT || "3000", 10);
  app.use(import_express.default.json());
  app.use((req, res, next) => {
    console.log(`[${(/* @__PURE__ */ new Date()).toISOString()}] ${req.method} ${req.url}`);
    next();
  });
  startTelegramPolling();
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", botTokenConfigured: !!BOT_TOKEN });
  });
  app.get("/api/config", async (req, res) => {
    try {
      const response = await fetch(`${TELEGRAM_API_BASE}/bot${BOT_TOKEN}/getMe`);
      const data = await response.json();
      res.json({
        ok: true,
        botConfigured: !!BOT_TOKEN,
        botUsername: data.ok ? data.result.username : null
      });
    } catch {
      res.json({ ok: true, botConfigured: !!BOT_TOKEN, botUsername: null });
    }
  });
  app.get("/api/status", (req, res) => {
    const queueStats = Array.from(userQueues.entries()).map(([code, msgs]) => ({
      syncCode: code,
      queueLength: msgs.length
    }));
    const totalQueued = Array.from(userQueues.values()).reduce((sum, q) => sum + q.length, 0);
    res.json({
      ok: true,
      polling: true,
      uptime: process.uptime(),
      lastUpdateId,
      totalUsers: userQueues.size,
      totalQueued,
      queues: queueStats
    });
  });
  app.post("/api/restart-polling", (req, res) => {
    res.json({ ok: true, message: "Polling restart triggered" });
  });
  app.post("/api/test-bot", async (req, res) => {
    const { token } = req.body;
    if (!token) {
      res.status(400).json({ ok: false, error: "token is required" });
      return;
    }
    try {
      const response = await fetch(`https://api.telegram.org/bot${token}/getMe`);
      const data = await response.json();
      if (data.ok) {
        res.json({ ok: true, username: data.result.username });
      } else {
        res.json({ ok: false, error: data.description || "Invalid token" });
      }
    } catch {
      res.json({ ok: false, error: "Connection to Telegram failed" });
    }
  });
  app.get("/api/updates", (req, res) => {
    const syncCode = req.query.syncCode;
    if (!syncCode) {
      res.status(400).json({ ok: false, error: "syncCode query parameter is required" });
      return;
    }
    const resolvedToken = resolveSyncCode(syncCode);
    if (!resolvedToken) {
      res.json({ ok: true, result: [] });
      return;
    }
    const queue = userQueues.get(resolvedToken) || [];
    userQueues.set(resolvedToken, []);
    res.json({
      ok: true,
      result: queue
    });
  });
  app.get("/api/file", async (req, res) => {
    const fileId = req.query.file_id;
    const syncCode = req.query.syncCode;
    if (!fileId) {
      res.status(400).json({ ok: false, error: "file_id parameter is required" });
      return;
    }
    const resolvedToken = resolveSyncCode(syncCode || "");
    if (!resolvedToken) {
      res.status(403).json({ ok: false, error: "Invalid syncCode" });
      return;
    }
    try {
      const fileInfoUrl = `${TELEGRAM_API_BASE}/bot${BOT_TOKEN}/getFile?file_id=${fileId}`;
      const infoRes = await fetch(fileInfoUrl);
      if (!infoRes.ok) {
        res.status(500).json({ ok: false, error: "Failed to fetch file info from Telegram" });
        return;
      }
      const infoData = await infoRes.json();
      if (!infoData.ok || !infoData.result?.file_path) {
        res.status(404).json({ ok: false, error: "Telegram file not found" });
        return;
      }
      const telegramFilePath = infoData.result.file_path;
      const downloadUrl = TELEGRAM_API_BASE.includes("api.telegram.org") ? `https://api.telegram.org/file/bot${BOT_TOKEN}/${telegramFilePath}` : `${TELEGRAM_API_BASE}/file/bot${BOT_TOKEN}/${telegramFilePath}`;
      const fileRes = await fetch(downloadUrl);
      if (!fileRes.ok || !fileRes.body) {
        res.status(500).json({ ok: false, error: "Failed to download file content from Telegram" });
        return;
      }
      res.setHeader("Content-Type", "application/octet-stream");
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
          console.error("Streaming error:", e);
          res.end();
        }
      };
      await pump();
    } catch (e) {
      console.error("File proxy error:", e);
      res.status(500).json({ ok: false, error: e.message || "Internal file proxy error" });
    }
  });
  app.post("/api/confirm", async (req, res) => {
    const { syncCode, update_ids } = req.body;
    if (!syncCode || !Array.isArray(update_ids) || update_ids.length === 0) {
      res.status(400).json({ ok: false, error: "syncCode and update_ids array required" });
      return;
    }
    const resolvedToken = resolveSyncCode(syncCode);
    if (!resolvedToken) {
      res.json({ ok: false, error: "Invalid syncCode" });
      return;
    }
    const chatId = tokenToChatId.get(resolvedToken);
    if (!chatId) {
      res.json({ ok: false, error: "No chat for this token" });
      return;
    }
    let confirmed = confirmedUpdates.get(resolvedToken);
    if (!confirmed) {
      confirmed = /* @__PURE__ */ new Set();
      confirmedUpdates.set(resolvedToken, confirmed);
    }
    const toConfirm = update_ids.filter((id) => !confirmed.has(id));
    if (toConfirm.length > 0) {
      toConfirm.forEach((id) => confirmed.add(id));
      await sendWithKeyboard(chatId, `\u2705 \u0421\u043E\u043E\u0431\u0449\u0435\u043D\u0438\u0435 \u0441\u043E\u0445\u0440\u0430\u043D\u0435\u043D\u043E \u0432 Obsidian`);
    }
    res.json({ ok: true, confirmed: toConfirm.length });
  });
  app.get("/api/search", (req, res) => {
    const syncCode = req.query.syncCode;
    if (!syncCode) {
      res.status(400).json({ ok: false, error: "syncCode required" });
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
  app.post("/api/search-results", async (req, res) => {
    const { syncCode, query, results } = req.body;
    if (!syncCode || !query) {
      res.status(400).json({ ok: false, error: "syncCode and query required" });
      return;
    }
    const resolvedToken = resolveSyncCode(syncCode);
    if (!resolvedToken) {
      res.json({ ok: false, error: "Invalid syncCode" });
      return;
    }
    const chatId = tokenToChatId.get(resolvedToken);
    if (!chatId) {
      res.json({ ok: false, error: "No chat for this token" });
      return;
    }
    if (!results || results.length === 0) {
      await sendWithKeyboard(chatId, `\u{1F50D} <b>\u041D\u0438\u0447\u0435\u0433\u043E \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D\u043E</b> \u043F\u043E \u0437\u0430\u043F\u0440\u043E\u0441\u0443 \xAB${query}\xBB`);
    } else {
      let msg = `\u{1F50D} <b>\u0420\u0435\u0437\u0443\u043B\u044C\u0442\u0430\u0442\u044B \u043F\u043E\u0438\u0441\u043A\u0430 \u043F\u043E \u0437\u0430\u043F\u0440\u043E\u0441\u0443 \xAB${query}\xBB:</b>

`;
      for (const r of results.slice(0, 10)) {
        msg += `\u{1F4C4} <code>${r.filename}</code>
`;
        if (r.preview) msg += `${r.preview}
`;
        msg += "\n";
      }
      if (results.length > 10) {
        msg += `... \u0438 \u0435\u0449\u0451 ${results.length - 10} \u0440\u0435\u0437\u0443\u043B\u044C\u0442\u0430\u0442\u043E\u0432`;
      }
      await sendWithKeyboard(chatId, msg);
    }
    res.json({ ok: true });
  });
  if (process.env.NODE_ENV !== "production") {
    const vite = await (0, import_vite.createServer)({
      server: { middlewareMode: true },
      appType: "spa"
    });
    app.use(vite.middlewares);
  } else {
    const distPath = import_path.default.join(process.cwd(), "dist");
    app.use(import_express.default.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(import_path.default.join(distPath, "index.html"));
    });
  }
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server listening on Port ${PORT}`);
  });
}
runServer().catch((err) => {
  console.error("Failed to start server:", err);
});
process.on("exit", () => {
  if (saveTimeout) clearTimeout(saveTimeout);
  saveState();
});
process.on("SIGTERM", () => process.exit(0));
process.on("SIGINT", () => process.exit(0));
//# sourceMappingURL=server.cjs.map
