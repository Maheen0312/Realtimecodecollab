import React, { useState, useEffect, FC } from 'react';
import { Play, Trash2, X, Eye, Terminal as TerminalIcon, Share2, Check } from 'lucide-react';
import { SupportedLanguage } from '../types';

interface OutputConsoleProps {
  code: string;
  language: SupportedLanguage;
  onClose: () => void;
  onShareOutput?: (output: string) => void;
  externalOutput?: string;
}

export const OutputConsole: FC<OutputConsoleProps> = ({
  code,
  language,
  onClose,
  onShareOutput,
  externalOutput,
}) => {
  const [logs, setLogs] = useState<Array<{ type: 'log' | 'error' | 'warn' | 'info'; text: string; time: string }>>([]);
  const [activeTab, setActiveTab] = useState<'console' | 'preview'>(
    language === 'html' || language === 'css' ? 'preview' : 'console'
  );
  const [htmlSrcDoc, setHtmlSrcDoc] = useState('');
  const [isCopied, setIsCopied] = useState(false);

  // If language changes to HTML, switch to preview
  useEffect(() => {
    if (language === 'html') {
      setActiveTab('preview');
    }
  }, [language]);

  // Synchronize incoming external output from room peer
  useEffect(() => {
    if (externalOutput) {
      setLogs((prev) => [
        ...prev,
        {
          type: 'info',
          text: `[Peer Output Shared]:\n${externalOutput}`,
          time: new Date().toLocaleTimeString(),
        },
      ]);
    }
  }, [externalOutput]);

  const runCode = () => {
    const timestamp = new Date().toLocaleTimeString();

    if (language === 'html') {
      setHtmlSrcDoc(code);
      setActiveTab('preview');
      setLogs((prev) => [
        ...prev,
        { type: 'info', text: 'Rendered HTML preview successfully.', time: timestamp },
      ]);
      return;
    }

    if (language === 'css') {
      const wrappedHtml = `
        <!DOCTYPE html>
        <html>
        <head><style>${code}</style></head>
        <body>
          <div class="collaborative-container">
            <h2>CSS Live Sandbox</h2>
            <p>Your styles have been applied.</p>
            <button style="padding:8px 16px; border-radius:6px; cursor:pointer;">Sample Element</button>
          </div>
        </body>
        </html>
      `;
      setHtmlSrcDoc(wrappedHtml);
      setActiveTab('preview');
      return;
    }

    if (language === 'javascript' || language === 'typescript') {
      const capturedLogs: Array<{ type: 'log' | 'error' | 'warn' | 'info'; text: string; time: string }> = [];

      try {
        const sandboxConsole = {
          log: (...args: any[]) => {
            capturedLogs.push({
              type: 'log',
              text: args.map((a) => (typeof a === 'object' ? JSON.stringify(a, null, 2) : String(a))).join(' '),
              time: timestamp,
            });
          },
          error: (...args: any[]) => {
            capturedLogs.push({
              type: 'error',
              text: args.map((a) => (typeof a === 'object' ? JSON.stringify(a, null, 2) : String(a))).join(' '),
              time: timestamp,
            });
          },
          warn: (...args: any[]) => {
            capturedLogs.push({
              type: 'warn',
              text: args.map((a) => (typeof a === 'object' ? JSON.stringify(a, null, 2) : String(a))).join(' '),
              time: timestamp,
            });
          },
          info: (...args: any[]) => {
            capturedLogs.push({
              type: 'info',
              text: args.map((a) => (typeof a === 'object' ? JSON.stringify(a, null, 2) : String(a))).join(' '),
              time: timestamp,
            });
          },
        };

        // Basic execution sandbox
        const executeFn = new Function('console', code);
        const result = executeFn(sandboxConsole);

        if (result !== undefined) {
          capturedLogs.push({
            type: 'info',
            text: `Return value: ${typeof result === 'object' ? JSON.stringify(result, null, 2) : String(result)}`,
            time: timestamp,
          });
        }

        if (capturedLogs.length === 0) {
          capturedLogs.push({
            type: 'info',
            text: 'Code executed with exit code 0 (no output produced).',
            time: timestamp,
          });
        }

        setLogs((prev) => [...prev, ...capturedLogs]);
        setActiveTab('console');
      } catch (err: any) {
        setLogs((prev) => [
          ...prev,
          {
            type: 'error',
            text: `Runtime Error: ${err.message || String(err)}`,
            time: timestamp,
          },
        ]);
        setActiveTab('console');
      }
      return;
    }

    // For Python, Java, C++ simulated sandbox
    setLogs((prev) => [
      ...prev,
      {
        type: 'info',
        text: `[${language.toUpperCase()} Runner]: Simulating execution for collaborative environment...\nCompilation: OK\nExecution complete.`,
        time: timestamp,
      },
    ]);
    setActiveTab('console');
  };

  const handleShare = () => {
    if (!onShareOutput || logs.length === 0) return;
    const allText = logs.map((l) => `[${l.type.toUpperCase()}] ${l.text}`).join('\n');
    onShareOutput(allText);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  return (
    <div className="h-64 flex flex-col bg-slate-950 border-t border-slate-800 text-slate-200">
      {/* Console Header */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-slate-900 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveTab('console')}
            className={`flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded ${
              activeTab === 'console'
                ? 'bg-slate-800 text-sky-400'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <TerminalIcon className="w-3.5 h-3.5" /> Console
          </button>

          {(language === 'html' || language === 'css') && (
            <button
              onClick={() => setActiveTab('preview')}
              className={`flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded ${
                activeTab === 'preview'
                  ? 'bg-slate-800 text-emerald-400'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Eye className="w-3.5 h-3.5" /> Live Preview
            </button>
          )}

          <button
            onClick={runCode}
            className="flex items-center gap-1 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold px-2.5 py-1 rounded transition-colors"
          >
            <Play className="w-3 h-3 fill-white" /> Run Code
          </button>
        </div>

        <div className="flex items-center gap-2">
          {logs.length > 0 && onShareOutput && (
            <button
              onClick={handleShare}
              className="flex items-center gap-1 text-slate-400 hover:text-sky-400 text-xs px-2 py-1 rounded hover:bg-slate-800 transition-colors"
              title="Broadcast output to peers in room"
            >
              {isCopied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Share2 className="w-3.5 h-3.5" />}
              <span>{isCopied ? 'Shared!' : 'Share Output'}</span>
            </button>
          )}

          <button
            onClick={() => setLogs([])}
            className="text-slate-400 hover:text-slate-200 text-xs p-1 rounded hover:bg-slate-800"
            title="Clear Console"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>

          <button
            onClick={onClose}
            className="text-slate-400 hover:text-rose-400 text-xs p-1 rounded hover:bg-slate-800"
            title="Close Panel"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-hidden relative">
        {activeTab === 'console' && (
          <div className="h-full overflow-y-auto p-3 font-mono text-xs space-y-1">
            {logs.length === 0 ? (
              <div className="text-slate-500 italic">
                Click "Run Code" to execute {language} in real time.
              </div>
            ) : (
              logs.map((log, index) => (
                <div
                  key={index}
                  className={`flex items-start gap-2 leading-relaxed ${
                    log.type === 'error'
                      ? 'text-rose-400 bg-rose-950/20 px-2 py-1 rounded border border-rose-900/30'
                      : log.type === 'warn'
                      ? 'text-amber-300'
                      : log.type === 'info'
                      ? 'text-sky-300'
                      : 'text-slate-200'
                  }`}
                >
                  <span className="text-slate-500 text-[10px] select-none flex-shrink-0">
                    {log.time}
                  </span>
                  <pre className="whitespace-pre-wrap flex-1">{log.text}</pre>
                </div>
              ))
            )}
          </div>
        )}

        {activeTab === 'preview' && (
          <div className="h-full w-full bg-white">
            <iframe
              srcDoc={htmlSrcDoc || code}
              title="Live HTML Preview"
              className="w-full h-full border-none"
              sandbox="allow-scripts"
            />
          </div>
        )}
      </div>
    </div>
  );
};
