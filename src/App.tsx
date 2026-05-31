import { useState, useMemo } from 'react';
import { 
  Bot, 
  Download, 
  Check, 
  Copy, 
  FileText, 
  BookOpen, 
  ExternalLink, 
  Layers, 
  Settings,
  Sparkles
} from 'lucide-react';
import JSZip from 'jszip';
import { 
  generateMainTs, 
  generatePureMainJs,
  generateManifestJson, 
  generatePackageJson, 
  generateStylesCss, 
  generateReadme 
} from './utils/codeGenerator';

export default function App() {
  const [activeTab, setActiveTab] = useState<'main' | 'purejs' | 'manifest' | 'package' | 'styles' | 'readme'>('purejs');
  const [copiedFile, setCopiedFile] = useState<string | null>(null);

  const currentUrl = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';

  const mainTsCode = useMemo(() => generateMainTs(currentUrl), [currentUrl]);
  const pureJsCode = useMemo(() => generatePureMainJs(currentUrl), [currentUrl]);
  const manifestJsonCode = useMemo(() => generateManifestJson(), []);
  const packageJsonCode = useMemo(() => generatePackageJson(), []);
  const stylesCssCode = useMemo(() => generateStylesCss(), []);
  const readmeMarkdown = useMemo(() => generateReadme(currentUrl), [currentUrl]);

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopiedFile(label);
    setTimeout(() => setCopiedFile(null), 2500);
  };

  const downloadTextFile = (content: string, fileName: string) => {
    const element = document.createElement("a");
    const file = new Blob([content], { type: 'text/plain;charset=utf-8' });
    element.href = URL.createObjectURL(file);
    element.download = fileName;
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  };

  const downloadAllPlugin = async () => {
    const zip = new JSZip();
    zip.file('main.js', generatePureMainJs(currentUrl));
    zip.file('manifest.json', generateManifestJson());
    zip.file('styles.css', generateStylesCss());
    zip.file('README.md', generateReadme(currentUrl));

    const blob = await zip.generateAsync({ type: 'blob' });
    const element = document.createElement("a");
    element.href = URL.createObjectURL(blob);
    element.download = 'obsidian-telegram-sync.zip';
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  };

  return (
    <div className="min-h-screen bg-[#1e1e1e] text-[#dcddde] font-sans selection:bg-[#7b61ff]/30 selection:text-white">
      
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
              <p className="text-xs text-zinc-400">Генерация шаблона плагина для Obsidian</p>
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

      <main className="max-w-5xl mx-auto px-6 py-8">
        <div className="space-y-6">
          
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

              <button
                onClick={downloadAllPlugin}
                className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 font-medium text-xs text-white px-3.5 py-1.5 rounded transition-all cursor-pointer shadow-sm active:scale-95"
              >
                <Download className="h-4 w-4" />
                <span className="font-mono">Скачать весь плагин (.zip)</span>
              </button>
            </div>

          </div>

          <div className="bg-[#262626] border border-[#3e3e3e] rounded-xl shadow-xl overflow-hidden flex flex-col min-h-[500px]">
            
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

        </div>
      </main>

      <footer className="mt-16 border-t border-[#3e3e3e] bg-[#161616]/95 py-10 px-6 font-mono text-center text-xs text-zinc-500">
        <div className="max-w-7xl mx-auto space-y-2">
          <p>© 2026 Obsidian Telegram Sync Pro. Все права защищены.</p>
          <p className="text-[11px] text-zinc-600">Соответствует спецификациям Obsidian API 1.0+</p>
        </div>
      </footer>
    </div>
  );
}
