import { useState, useMemo } from 'react';
import { 
  Bot, 
  Settings, 
  FolderClosed, 
  Image as ImageIcon, 
  Download, 
  Check, 
  Copy, 
  FileText, 
  BookOpen, 
  RefreshCw, 
  ExternalLink, 
  Eye, 
  Layers, 
  Terminal,
  AlertCircle,
  HelpCircle,
  Sparkles,
  Wifi
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { PluginSettings, MockMessage } from './types';
import { 
  generateMainTs, 
  generatePureMainJs,
  generateManifestJson, 
  generatePackageJson, 
  generateStylesCss, 
  generateReadme 
} from './utils/codeGenerator';

export default function App() {
  // 1. Core Config state
  const [settings, setSettings] = useState<PluginSettings>({
    botToken: '6852938152:AAH_g7K7kLMpdWqpU9X8X1vQz7Zdf_ex990',
    defaultFolderPath: 'Telegram Notes',
    mediaPath: 'Telegram Notes/Media'
  });

  // 2. Active View Tabs
  const [activeTab, setActiveTab] = useState<'main' | 'purejs' | 'manifest' | 'package' | 'styles' | 'readme'>('purejs'); // Default to purejs for an instant working copy-paste code!
  const [copiedFile, setCopiedFile] = useState<string | null>(null);

  // 3. Mock Sandbox Message
  const [mockMessage, setMockMessage] = useState<MockMessage>({
    id: 10243,
    from: {
      username: 'zalupov_nikolaj',
      first_name: 'Николай'
    },
    text: 'Привет Obsidian! Вот важная идея по настройке проекта и несколько ключевых мыслей по поводу плагина.',
    date: Math.floor(Date.now() / 1000) - 300,
    photoName: 'idea_scheme.png'
  });

  // Connection testing feedback state.
  const [isTestingConnection, setIsTestingConnection] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  // Dynamic code blocks computation
  const mainTsCode = useMemo(() => generateMainTs(settings), [settings]);
  const pureJsCode = useMemo(() => generatePureMainJs(settings), [settings]);
  const manifestJsonCode = useMemo(() => generateManifestJson(), []);
  const packageJsonCode = useMemo(() => generatePackageJson(), []);
  const stylesCssCode = useMemo(() => generateStylesCss(), []);
  const readmeMarkdown = useMemo(() => generateReadme(settings), [settings]);

  // Handle connection test
  const handleTestConnection = () => {
    setIsTestingConnection(true);
    setTestResult(null);
    setTimeout(() => {
      setIsTestingConnection(false);
      if (settings.botToken && settings.botToken.length > 20 && settings.botToken.includes(':')) {
        setTestResult({
          success: true,
          message: `Успешное подключение! Найден bot @ObsidianNotesSync_bot`
        });
      } else {
        setTestResult({
          success: false,
          message: 'Неверный формат API токена. Токен должен содержать двоеточие и соответствовать формату @BotFather.'
        });
      }
    }, 1200);
  };

  // Copy to clipboard helper
  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopiedFile(label);
    setTimeout(() => setCopiedFile(null), 2500);
  };

  // Download files as direct single downloads
  const downloadTextFile = (content: string, fileName: string) => {
    const element = document.createElement("a");
    const file = new Blob([content], { type: 'text/plain;charset=utf-8' });
    element.href = URL.createObjectURL(file);
    element.download = fileName;
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  };

  // Generate mock md file output based on specifications
  const formattedMockDateForName = useMemo(() => {
    const d = new Date(mockMessage.date * 1000);
    return d.toISOString().slice(0, 19).replace('T', ' ').replace(/:/g, '-');
  }, [mockMessage.date]);

  const formattedMockDateForContent = useMemo(() => {
    return new Date(mockMessage.date * 1000).toLocaleString('ru-RU');
  }, [mockMessage.date]);

  const mockFileName = useMemo(() => {
    const textSnippet = mockMessage.text
      .replace(/[\\/:*?"<>|\n\r]/g, ' ')
      .substring(0, 30)
      .trim();
    const user = mockMessage.from.username.replace(/[\\/:*?"<>|\n\r]/g, '');
    return `${formattedMockDateForName} - ${user} - ${textSnippet || 'photo'}.md`;
  }, [mockMessage, formattedMockDateForName]);

  const mockFileContent = useMemo(() => {
    return `---
source: telegram
from: ${mockMessage.from.username}
date: ${formattedMockDateForContent}
---
# Сообщение от ${mockMessage.from.username}

${mockMessage.text}

${mockMessage.photoName ? `## Вложения\n![[${mockMessage.photoName}]]` : ''}
`;
  }, [mockMessage, formattedMockDateForContent]);

  return (
    <div className="min-h-screen bg-[#1e1e1e] text-[#dcddde] font-sans selection:bg-[#7b61ff]/30 selection:text-white">
      
      {/* Premium Obsidian-themed Header */}
      <header className="border-b border-[#3e3e3e] bg-[#262626]/95 backdrop-blur-md sticky top-0 z-50 px-6 py-4">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="bg-[#7b61ff]/15 p-2 rounded-xl border border-[#7b61ff]/30">
              <Bot className="h-6 w-6 text-[#7b61ff]" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base font-bold tracking-tight text-white font-mono uppercase">Telegram Sync Pro</h1>
                <span className="text-[10px] bg-[#7b61ff]/15 text-[#7b61ff] font-mono px-2 py-0.5 rounded border border-[#7b61ff]/20">API v1.0+</span>
              </div>
              <p className="text-xs text-zinc-400">Спецификация и генерация шаблона плагина для Obsidian с защитой файлов</p>
            </div>
          </div>
          
          <div className="flex items-center gap-3 self-start md:self-auto">
            <a 
              href="https://github.com/obsidianmd/obsidian-api" 
              target="_blank" 
              referrerPolicy="no-referrer"
              className="text-xs text-zinc-400 hover:text-white flex items-center gap-1.5 transition-colors bg-[#161616] hover:bg-[#262626] px-3.5 py-2 rounded border border-[#3e3e3e]"
            >
              <ExternalLink className="h-3.5 w-3.5 text-[#7b61ff]" />
              Obsidian API Docs
            </a>
          </div>
        </div>
      </header>

      {/* Main Grid View */}
      <main className="max-w-7xl mx-auto px-6 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          
          {/* Column 1: Config Section (Settings) - Left (col-span-4) */}
          <div className="lg:col-span-4 lg:sticky lg:top-24 h-fit space-y-6">
            
            {/* Visual configuration Group in Solid Dark Theme */}
            <div className="bg-[#262626] border border-[#3e3e3e] rounded-xl p-6 shadow-xl relative overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-[#7b61ff]/5 rounded-full blur-2xl pointer-events-none" />
              
              <div className="flex items-center justify-between pb-4 border-b border-[#3e3e3e] mb-6">
                <div className="flex items-center gap-2.5">
                  <Settings className="w-4 h-4 text-[#7b61ff] animate-pulse" />
                  <h2 className="text-xs font-bold tracking-wider text-white uppercase font-mono">Параметры Плагина</h2>
                </div>
                <span className="text-[10px] bg-zinc-800 text-zinc-400 font-mono px-1.5 py-0.5 rounded">Obsidian-UI</span>
              </div>

              {/* Input for Bot Token */}
              <div className="space-y-5">
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <label className="text-xs font-semibold text-zinc-300">Telegram Bot Token</label>
                    <span className="text-[10px] text-zinc-500 font-mono">@BotFather</span>
                  </div>
                  <div className="relative">
                    <input 
                      type="text" 
                      className="w-full bg-[#161616] text-xs font-mono border border-[#3e3e3e] rounded px-3 py-2.5 focus:border-[#7b61ff] focus:ring-1 focus:ring-[#7b61ff]/25 outline-none transition-all placeholder-zinc-700 text-[#dcddde]" 
                      placeholder="123456789:ABCdefGhIJKlm..."
                      value={settings.botToken}
                      onChange={(e) => setSettings({ ...settings, botToken: e.target.value })}
                    />
                  </div>
                  <p className="text-[10px] text-zinc-500 leading-relaxed">
                    Этот токен используется плагином внутри <code className="text-[#a78bfa] font-mono">startPolling()</code> для аутентификации на сервере.
                  </p>
                </div>

                {/* Connection verification button */}
                <div className="pt-1">
                  <button
                    onClick={handleTestConnection}
                    disabled={isTestingConnection}
                    className="w-full flex items-center justify-center gap-2 bg-[#7b61ff] hover:bg-[#684be8] disabled:opacity-50 text-white font-medium text-xs px-4 py-2.5 rounded transition-all cursor-pointer shadow-sm active:scale-[0.98]"
                  >
                    {isTestingConnection ? (
                      <>
                        <RefreshCw className="h-3.5 w-3.5 animate-spin text-white" />
                        <span className="font-mono text-[11px]">Проверка токена...</span>
                      </>
                    ) : (
                      <>
                        <Wifi className="h-3.5 w-3.5 text-white" />
                        <span className="font-mono text-[11px] uppercase tracking-wider">Проверить подключение</span>
                      </>
                    )}
                  </button>

                  <AnimatePresence mode="wait">
                    {testResult && (
                      <motion.div
                        initial={{ opacity: 0, y: -4 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -4 }}
                        className={`mt-3 p-3 rounded border text-[11px] leading-relaxed flex items-start gap-2 font-mono ${
                          testResult.success 
                            ? 'bg-emerald-950/25 border-emerald-500/25 text-emerald-300' 
                            : 'bg-red-950/25 border-red-500/25 text-red-300'
                        }`}
                      >
                        <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                        <span>{testResult.message}</span>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                <hr className="border-[#3e3e3e] my-2" />

                {/* Default notes folder path */}
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <label className="text-xs font-semibold text-zinc-300">Default Folder Path</label>
                    <span className="text-[10px] text-zinc-500 font-mono">Папка заметок</span>
                  </div>
                  <div className="relative">
                    <span className="absolute left-3 top-2.5 text-zinc-500">
                      <FolderClosed className="h-4 w-4 text-[#7b61ff]" />
                    </span>
                    <input 
                      type="text" 
                      className="w-full bg-[#161616] text-xs font-mono border border-[#3e3e3e] rounded pl-9 pr-3 py-2.5 focus:border-[#7b61ff] focus:ring-1 focus:ring-[#7b61ff]/25 outline-none transition-all placeholder-zinc-700 text-[#dcddde]" 
                      placeholder="Telegram Notes"
                      value={settings.defaultFolderPath}
                      onChange={(e) => setSettings({ ...settings, defaultFolderPath: e.target.value })}
                    />
                  </div>
                </div>

                {/* Media assets assets folder */}
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <label className="text-xs font-semibold text-zinc-300">Media Path</label>
                    <span className="text-[10px] text-zinc-500 font-mono">Картинки и файлы</span>
                  </div>
                  <div className="relative">
                    <span className="absolute left-3 top-2.5 text-zinc-500">
                      <ImageIcon className="h-4 w-4 text-[#a78bfa]" />
                    </span>
                    <input 
                      type="text" 
                      className="w-full bg-[#161616] text-xs font-mono border border-[#3e3e3e] rounded pl-9 pr-3 py-2.5 focus:border-[#7b61ff] focus:ring-1 focus:ring-[#7b61ff]/25 outline-none transition-all placeholder-zinc-700 text-[#dcddde]" 
                      placeholder="Telegram Notes/Media"
                      value={settings.mediaPath}
                      onChange={(e) => setSettings({ ...settings, mediaPath: e.target.value })}
                    />
                  </div>
                  <p className="text-[10px] text-zinc-500 leading-normal">
                    Куда складываются скачанные вложения согласно спецификации.
                  </p>
                </div>
              </div>
            </div>

            {/* Quick Sandbox Tester */}
            <div className="bg-[#262626] border border-[#3e3e3e] rounded-xl p-6 shadow-xl">
              <div className="flex items-center gap-2 mb-4 pb-3 border-b border-[#3e3e3e]">
                <Terminal className="w-4 h-4 text-[#7b61ff]" />
                <h3 className="text-xs font-bold tracking-wider text-white uppercase font-mono">Конструктор тестового контента</h3>
              </div>

              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-semibold text-zinc-400 font-mono uppercase">User отправителя</label>
                  <input 
                    type="text" 
                    className="w-full bg-[#161616] text-xs font-mono border border-[#3e3e3e] rounded px-2.5 py-1.5 focus:border-[#7b61ff] outline-none text-zinc-300"
                    value={mockMessage.from.username}
                    onChange={(e) => setMockMessage({
                      ...mockMessage,
                      from: { ...mockMessage.from, username: e.target.value }
                    })}
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-semibold text-zinc-400 font-mono uppercase">Текст входящего сообщения</label>
                  <textarea 
                    rows={2}
                    className="w-full bg-[#161616] text-xs border border-[#3e3e3e] rounded p-2.5 focus:border-[#7b61ff] outline-none text-zinc-300 resize-none font-sans"
                    value={mockMessage.text}
                    onChange={(e) => setMockMessage({ ...mockMessage, text: e.target.value })}
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-semibold text-zinc-400 font-mono uppercase">Вложение / Фото файла</label>
                  <input 
                    type="text" 
                    className="w-full bg-[#161616] text-xs font-mono border border-[#3e3e3e] rounded px-2.5 py-1.5 focus:border-[#7b61ff] outline-none text-zinc-300"
                    placeholder="Название файла"
                    value={mockMessage.photoName || ''}
                    onChange={(e) => setMockMessage({ ...mockMessage, photoName: e.target.value })}
                  />
                </div>
              </div>
            </div>

          </div>

          {/* Column 2: Code Viewer and Dynamic previews - Right (col-span-8) */}
          <div className="lg:col-span-8 space-y-6">
            
            {/* Visual Tabs Picker & Source actions in Obsidian Style */}
            <div className="bg-[#262626] border border-[#3e3e3e] rounded-xl p-2.5 shadow-xl flex flex-wrap gap-2 items-center justify-between">
              
              <div className="flex flex-wrap gap-1 bg-[#161616] p-1 rounded">
                <button
                  onClick={() => setActiveTab('purejs')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded font-bold transition-all cursor-pointer ${
                    activeTab === 'purejs' 
                      ? 'bg-[#3e3e3e] text-amber-300 shadow-sm border-l-2 border-amber-500' 
                      : 'text-gray-400 hover:text-white hover:bg-[#2f2f2f]'
                  }`}
                >
                  <Sparkles className="w-3.5 h-3.5 text-amber-400 animate-pulse" />
                  <span className="font-mono">main.js (БЕЗ СБОРКИ) ⭐</span>
                </button>

                <button
                  onClick={() => setActiveTab('main')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded font-medium transition-all cursor-pointer ${
                    activeTab === 'main' 
                      ? 'bg-[#3e3e3e] text-white shadow-sm border-l-2 border-[#7b61ff]' 
                      : 'text-gray-400 hover:text-white hover:bg-[#2f2f2f]'
                  }`}
                >
                  <FileText className="w-3.5 h-3.5 text-[#7b61ff]" />
                  <span className="font-mono">main.ts (Исходник)</span>
                </button>

                <button
                  onClick={() => setActiveTab('readme')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded font-medium transition-all cursor-pointer ${
                    activeTab === 'readme' 
                      ? 'bg-[#3e3e3e] text-white shadow-sm border-l-2 border-[#7b61ff]' 
                      : 'text-gray-400 hover:text-white hover:bg-[#2f2f2f]'
                  }`}
                >
                  <BookOpen className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="font-mono">Инструкция</span>
                </button>

                <button
                  onClick={() => setActiveTab('manifest')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded font-medium transition-all cursor-pointer ${
                    activeTab === 'manifest' 
                      ? 'bg-[#3e3e3e] text-white shadow-sm border-l-2 border-[#7b61ff]' 
                      : 'text-gray-400 hover:text-white hover:bg-[#2f2f2f]'
                  }`}
                >
                  <Layers className="w-3.5 h-3.5 text-indigo-400" />
                  <span className="font-mono">manifest.json</span>
                </button>

                <button
                  onClick={() => setActiveTab('package')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded font-medium transition-all cursor-pointer ${
                    activeTab === 'package' 
                      ? 'bg-[#3e3e3e] text-white shadow-sm border-l-2 border-[#7b61ff]' 
                      : 'text-gray-400 hover:text-white hover:bg-[#2f2f2f]'
                  }`}
                >
                  <Settings className="w-3.5 h-3.5 text-amber-400" />
                  <span className="font-mono">package.json</span>
                </button>

                <button
                  onClick={() => setActiveTab('styles')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded font-medium transition-all cursor-pointer ${
                    activeTab === 'styles' 
                      ? 'bg-[#3e3e3e] text-white shadow-sm border-l-2 border-[#7b61ff]' 
                      : 'text-gray-400 hover:text-white hover:bg-[#2f2f2f]'
                  }`}
                >
                  <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
                  <span className="font-mono">styles.css</span>
                </button>
              </div>

              {/* Action buttons on the side */}
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    const activeContent = 
                      activeTab === 'purejs' ? pureJsCode :
                      activeTab === 'main' ? mainTsCode :
                      activeTab === 'manifest' ? manifestJsonCode :
                      activeTab === 'package' ? packageJsonCode :
                      activeTab === 'styles' ? stylesCssCode : readmeMarkdown;
                    copyToClipboard(activeContent, activeTab);
                  }}
                  className="flex items-center gap-1.5 bg-[#161616] hover:bg-[#262626] transition-all text-zinc-300 font-medium text-xs px-3.5 py-1.5 rounded border border-[#3e3e3e] cursor-pointer shadow-sm active:scale-95"
                >
                  {copiedFile === activeTab ? (
                    <>
                      <Check className="h-4 w-4 text-emerald-400" />
                      <span className="text-emerald-400 font-mono">Скопировано!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="h-4 w-4 text-[#7b61ff]" />
                      <span className="font-mono">Копировать</span>
                    </>
                  )}
                </button>

                <button
                  onClick={() => {
                    const activeContent = 
                      activeTab === 'purejs' ? pureJsCode :
                      activeTab === 'main' ? mainTsCode :
                      activeTab === 'manifest' ? manifestJsonCode :
                      activeTab === 'package' ? packageJsonCode :
                      activeTab === 'styles' ? stylesCssCode : readmeMarkdown;
                    const fileName = 
                      activeTab === 'purejs' ? 'main.js' :
                      activeTab === 'main' ? 'main.ts' :
                      activeTab === 'manifest' ? 'manifest.json' :
                      activeTab === 'package' ? 'package.json' :
                      activeTab === 'styles' ? 'styles.css' : 'README.md';
                    downloadTextFile(activeContent, fileName);
                  }}
                  className="flex items-center gap-1.5 bg-[#7b61ff] hover:bg-[#684be8] font-medium text-xs text-white px-3.5 py-1.5 rounded transition-all cursor-pointer shadow-sm active:scale-95"
                >
                  <Download className="h-4 w-4" />
                  <span className="font-mono">Скачать файл</span>
                </button>
              </div>

            </div>

            {/* Dynamic Card for Code / Instructions Screen */}
            <div className="bg-[#262626] border border-[#3e3e3e] rounded-xl shadow-xl overflow-hidden flex flex-col min-h-[500px]">
              
              {/* Dynamic Tabs headers */}
              <div className="bg-[#1c1c1c] border-b border-[#3e3e3e] px-6 py-3.5 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="flex gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-red-500/80" />
                    <span className="w-2.5 h-2.5 rounded-full bg-amber-500/80" />
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500/80" />
                  </div>
                  <span className="text-xs font-mono text-zinc-400 border-l border-[#3e3e3e] pl-3.5 ml-1.5 italic">
                    {activeTab === 'purejs' ? 'telegram-sync/main.js (ГОТОВЫЙ ВАРИАНТ)' :
                     activeTab === 'main' ? 'telegram-sync/main.ts (ТРЕБУЕТ СБОРКИ)' :
                     activeTab === 'manifest' ? 'telegram-sync/manifest.json' :
                     activeTab === 'package' ? 'telegram-sync/package.json' :
                     activeTab === 'styles' ? 'telegram-sync/styles.css' : 'README.md'}
                  </span>
                </div>

                <div className="text-[10px] font-mono text-[#a78bfa] bg-[#161616] px-2.5 py-1 rounded">
                  {activeTab === 'purejs' ? 'JavaScript (Установка в 1 клик)' :
                   activeTab === 'main' ? 'TypeScript (TypeScript исходник)' :
                   activeTab === 'manifest' ? 'JSON Manifest' :
                   activeTab === 'package' ? 'JSON Package' :
                   activeTab === 'styles' ? 'CSS' : 'Markdown Guide'}
                </div>
              </div>

              {/* Box container for actual display - Matching the Dark Polish design */}
              <div className="flex-1 p-6 font-mono text-xs leading-relaxed overflow-x-auto text-zinc-300 max-h-[645px] overflow-y-auto bg-[#161616]">
                {activeTab === 'purejs' && (
                  <pre className="text-zinc-300 whitespace-pre scrollbar-thin">{pureJsCode}</pre>
                )}
                {activeTab === 'main' && (
                  <pre className="text-zinc-300 whitespace-pre scrollbar-thin">{mainTsCode}</pre>
                )}
                {activeTab === 'manifest' && (
                  <pre className="text-zinc-300 whitespace-pre">{manifestJsonCode}</pre>
                )}
                {activeTab === 'package' && (
                  <pre className="text-zinc-300 whitespace-pre">{packageJsonCode}</pre>
                )}
                {activeTab === 'styles' && (
                  <pre className="text-zinc-300 whitespace-pre">{stylesCssCode}</pre>
                )}
                {activeTab === 'readme' && (
                  <div className="font-sans text-sm space-y-4 text-zinc-300 whitespace-pre-line leading-relaxed">
                    {readmeMarkdown}
                  </div>
                )}
              </div>

            </div>

            {/* Note Output Simulation Screen (Fulfills note template UI specification) */}
            <div className="bg-[#262626] border border-[#3e3e3e] rounded-xl shadow-xl overflow-hidden">
              <div className="bg-[#1c1c1c] border-b border-[#3e3e3e] px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <div className="bg-[#7b61ff]/10 p-1.5 rounded border border-[#7b61ff]/20">
                    <Eye className="w-4 h-4 text-[#7b61ff]" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-white">Рендеринг Заметки в Obsidian</h3>
                    <p className="text-[11px] text-zinc-400">Симуляция сгенерированного markdown-файла на основе введённых данных</p>
                  </div>
                </div>

                <div className="flex items-center gap-2 text-xs text-zinc-400 font-mono bg-[#161616] border border-[#3e3e3e] px-3 py-1.5 rounded">
                  <span className="text-[#7b61ff]">Имя файла:</span>
                  <span className="text-zinc-200 text-[11px] truncate max-w-[280px]">{mockFileName}</span>
                </div>
              </div>

              <div className="p-6 bg-[#161616] grid grid-cols-1 md:grid-cols-2 gap-6">
                
                {/* Generated raw markdown block */}
                <div>
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider font-mono">Содержимое .md файла</span>
                    <button 
                      onClick={() => copyToClipboard(mockFileContent, 'mockMd')}
                      className="text-[10px] text-zinc-400 hover:text-white flex items-center gap-1 bg-zinc-850 hover:bg-zinc-800 px-2.5 py-1 rounded"
                    >
                      {copiedFile === 'mockMd' ? (
                        <>
                          <Check className="w-3 h-3 text-emerald-400" />
                          <span className="text-emerald-400">Скопировано!</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3 h-3 text-[#7b61ff]" />
                          <span>Скопировать</span>
                        </>
                      )}
                    </button>
                  </div>
                  <pre className="bg-[#121318] text-zinc-300 font-mono text-[11px] leading-relaxed p-4 rounded border border-[#3e3e3e] overflow-x-auto min-h-[300px]">
                    {mockFileContent}
                  </pre>
                </div>

                {/* Simulated Obsidian Preview UI */}
                <div className="flex flex-col">
                  <span className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider mb-2 font-mono">Вид в режиме чтения Obsidian</span>
                  <div className="flex-1 bg-[#1e1e1e] border border-[#3e3e3e] rounded p-5 shadow-inner text-zinc-300 text-sm overflow-y-auto font-sans leading-relaxed min-h-[300px] flex flex-col justify-between">
                    <div>
                      {/* Frontmatter YAML Preview block */}
                      <div className="bg-[#161616] border-l-2 border-[#7b61ff] p-3 rounded mb-5 text-[11px] font-mono text-zinc-400">
                        <div className="text-zinc-600 select-none">---</div>
                        <div>source: <span className="text-emerald-400">telegram</span></div>
                        <div>from: <span className="text-amber-400">@{mockMessage.from.username}</span></div>
                        <div>date: <span className="text-indigo-400">{formattedMockDateForContent}</span></div>
                        <div className="text-zinc-600 select-none">---</div>
                      </div>

                      <h1 className="text-xl font-bold text-white border-b border-[#3e3e3e] pb-2 mb-4">
                        Сообщение от {mockMessage.from.username}
                      </h1>

                      <p className="text-zinc-200 text-xs sm:text-sm whitespace-pre-wrap leading-relaxed mb-6">
                        {mockMessage.text}
                      </p>

                      {mockMessage.photoName && (
                        <div>
                          <h4 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2 font-mono">Вложения</h4>
                          <div className="bg-[#161616] border border-[#3e3e3e] rounded p-3 max-w-[280px] shadow-sm select-none">
                            <div className="flex items-center gap-2 mb-2">
                              <ImageIcon className="w-4 h-4 text-[#7b61ff]" />
                              <span className="text-[11px] font-mono text-zinc-300 truncate">{mockMessage.photoName}</span>
                            </div>
                            <div className="aspect-video bg-[#262626] rounded border border-[#3e3e3e] flex items-center justify-center">
                              <span className="text-[10px] text-zinc-500">Симуляция скачанного файла</span>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="mt-8 border-t border-[#3e3e3e] pt-3 flex justify-between items-center text-[10px] text-zinc-500 font-mono">
                      <span>Папка: {settings.defaultFolderPath}</span>
                      <span>Файл: {mockFileName}</span>
                    </div>
                  </div>
                </div>

              </div>
            </div>

          </div>

        </div>
      </main>

      {/* Info Banner Footer */}
      <footer className="mt-16 border-t border-[#3e3e3e] bg-[#161616]/95 py-10 px-6 font-mono text-center text-xs text-zinc-500">
        <div className="max-w-7xl mx-auto space-y-2">
          <p>© 2026 Obsidian Telegram Sync Pro. Все права защищены.</p>
          <p className="text-[11px] text-zinc-600">Соответствует спецификациям Obsidian API 1.0+ • Профессиональное исполнение</p>
        </div>
      </footer>
    </div>
  );
}
