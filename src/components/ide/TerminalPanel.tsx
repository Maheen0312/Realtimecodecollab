import React, { 
  useState, 
  useRef, 
  useEffect, 
  FC, 
  KeyboardEvent as ReactKeyboardEvent, 
  MouseEvent as ReactMouseEvent, 
  FormEvent as ReactFormEvent 
} from 'react';
import { 
  Terminal as TerminalIcon, 
  Trash2, 
  X, 
  Maximize2, 
  Minimize2, 
  Play, 
  Square,
  RefreshCw,
  AlertCircle, 
  Bug, 
  Share2, 
  Copy, 
  Check,
  Sparkles,
  Zap,
  ExternalLink,
  Globe
} from 'lucide-react';
import { TerminalPanelTab, Diagnostic } from '../../types';
import toast from 'react-hot-toast';

interface ProjectScript {
  name: string;
  command: string;
}

interface TerminalPanelProps {
  isOpen: boolean;
  onClose: () => void;
  roomId: string;
  projectName?: string;
  activeFileId: string;
  activeFilePath?: string;
  outputContent: string;
  diagnostics: Diagnostic[];
  onSelectDiagnostic: (d: Diagnostic) => void;
  onShareOutput?: (output: string) => void;
  onRunCurrentFile?: () => void;
  projectScripts?: ProjectScript[];
  detectedScripts?: ProjectScript[];
  isProcessRunning?: boolean;
  onKillProcess?: () => void;
  onClearOutput?: () => void;
  onTriggerAIFix?: (errorText: string, context?: string) => void;
  socket?: any;
}

interface TerminalHistoryEntry {
  command: string;
  stdout?: string;
  stderr?: string;
  exitCode?: number;
  timestamp: string;
  prompt?: string;
}

export const TerminalPanel: FC<TerminalPanelProps> = ({
  isOpen,
  onClose,
  roomId,
  projectName = 'workspace',
  activeFileId,
  activeFilePath,
  outputContent,
  diagnostics,
  onSelectDiagnostic,
  onShareOutput,
  onRunCurrentFile,
  projectScripts = [],
  detectedScripts,
  isProcessRunning = false,
  onKillProcess,
  onClearOutput,
  onTriggerAIFix,
  socket,
}) => {
  const [activeTab, setActiveTab] = useState<TerminalPanelTab>('terminal');
  const [isMaximized, setIsMaximized] = useState(false);
  const [inputVal, setInputVal] = useState('');
  const [commandHistory, setCommandHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState<number>(-1);
  const [isRunning, setIsRunning] = useState(isProcessRunning);
  const [currentRunningCmd, setCurrentRunningCmd] = useState<string | null>(null);
  const [serverPort, setServerPort] = useState<number | null>(null);
  const [currentRelCwd, setCurrentRelCwd] = useState('');

  const scriptsToDisplay = detectedScripts && detectedScripts.length > 0 ? detectedScripts : projectScripts;
  const cleanProjectName = (projectName || 'workspace').replace(/[^a-zA-Z0-9._-]/g, '_');
  const promptLabel = `developer@code-death:~/workspace/${cleanProjectName}${currentRelCwd ? '/' + currentRelCwd : ''}$`;

  const [terminalEntries, setTerminalEntries] = useState<TerminalHistoryEntry[]>([
    {
      command: 'init',
      stdout: `⚡ CODE DEATH Real-Time Sandbox Terminal
Workspace Root: /workspace/workspaces/${cleanProjectName}
Type 'help' for commands, 'run' to execute project dev/build scripts, or click project scripts below.`,
      exitCode: 0,
      timestamp: new Date().toLocaleTimeString(),
      prompt: `developer@code-death:~/workspace/${cleanProjectName}$`,
    },
  ]);

  const [debugLogs, setDebugLogs] = useState<string[]>([
    'Debugger attached to in-browser JavaScript VM.',
    'Type any JavaScript expression to evaluate (e.g. 2 + 2, Date.now()).',
  ]);
  const [debugInput, setDebugInput] = useState('');
  const [panelHeight, setPanelHeight] = useState<number>(() => {
    if (typeof window !== 'undefined') {
      return Math.min(220, Math.max(160, Math.floor(window.innerHeight * 0.3)));
    }
    return 210;
  });

  const terminalEndRef = useRef<HTMLDivElement>(null);
  const terminalInputRef = useRef<HTMLInputElement>(null);
  const isDraggingRef = useRef(false);
  const startYRef = useRef(0);
  const startHeightRef = useRef(210);

  const isValidWebPort = (p: number | null | undefined): boolean => {
    return typeof p === 'number' && p >= 1000 && p <= 65535 && p !== 24678 && p !== 24679 && p !== 8080 && p !== 8000;
  };

  // Sync initial process status from backend on mount or roomId change
  useEffect(() => {
    if (!roomId) return;
    let isSubscribed = true;
    fetch(`/api/terminal/status?roomId=${encodeURIComponent(roomId)}`)
      .then((res) => res.json())
      .then((data) => {
        if (!isSubscribed) return;
        if (data.isRunning) {
          setIsRunning(true);
          if (isValidWebPort(data.detectedPort)) setServerPort(data.detectedPort);
          if (data.command) setCurrentRunningCmd(data.command);
        } else {
          setIsRunning(false);
          setServerPort(null);
          setCurrentRunningCmd(null);
        }
      })
      .catch(() => {});
    return () => {
      isSubscribed = false;
    };
  }, [roomId]);

  // Real-time socket stream and process status listeners
  useEffect(() => {
    if (!socket) return;

    const handleStream = (data: { roomId?: string; text: string; stream: 'stdout' | 'stderr'; port?: number | null }) => {
      if (data.roomId && data.roomId !== roomId) return;
      if (isValidWebPort(data.port)) {
        setServerPort(data.port);
      }

      setTerminalEntries((prev) => {
        if (prev.length === 0) return prev;
        const last = prev[prev.length - 1];
        // Append streamed chunks to the active command entry
        return [
          ...prev.slice(0, -1),
          {
            ...last,
            stdout: data.stream === 'stdout' ? (last.stdout || '') + data.text : last.stdout,
            stderr: data.stream === 'stderr' ? (last.stderr || '') + data.text : last.stderr,
          },
        ];
      });
    };

    const handleStatus = (data: { isRunning: boolean; status: string; port?: number | null; command?: string }) => {
      setIsRunning(data.isRunning);
      if (data.isRunning) {
        if (isValidWebPort(data.port)) setServerPort(data.port);
        if (data.command) setCurrentRunningCmd(data.command);
      } else {
        setServerPort(null);
        setCurrentRunningCmd(null);
      }
    };

    socket.on('terminal-stream', handleStream);
    socket.on('terminal-status', handleStatus);

    return () => {
      socket.off('terminal-stream', handleStream);
      socket.off('terminal-status', handleStatus);
    };
  }, [socket, roomId]);

  useEffect(() => {
    if (isOpen && activeTab === 'terminal') {
      terminalEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [terminalEntries, isOpen, activeTab]);

  const executeCommand = async (cmdText: string) => {
    const trimmed = cmdText.trim();
    if (!trimmed) return;

    if (trimmed.toLowerCase() === 'clear') {
      setTerminalEntries([]);
      setInputVal('');
      return;
    }

    setCommandHistory((prev) => [...prev, trimmed]);
    setHistoryIndex(-1);
    setIsRunning(true);
    setCurrentRunningCmd(trimmed);

    try {
      const res = await fetch('/api/terminal/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          command: trimmed,
          roomId,
          activeFileId,
          activeFilePath,
        }),
      });

      const data = await res.json();
      setTerminalEntries((prev) => [
        ...prev,
        {
          command: trimmed,
          stdout: data.stdout,
          stderr: data.stderr,
          exitCode: data.exitCode,
          timestamp: new Date().toLocaleTimeString(),
          prompt: promptLabel,
        },
      ]);
      if (data.relCwd !== undefined) {
        setCurrentRelCwd(data.relCwd);
      }
      if (isValidWebPort(data.detectedPort)) {
        setServerPort(data.detectedPort);
        toast.success(`Port ${data.detectedPort} is open (development server active)`, { icon: '🚀' });
      } else if (!data.isRunning) {
        setServerPort(null);
      }
      if (data.isRunning) {
        setIsRunning(true);
        if (data.command) setCurrentRunningCmd(data.command);
      } else {
        setIsRunning(false);
        setServerPort(null);
        setCurrentRunningCmd(null);
      }
    } catch (err: any) {
      setIsRunning(false);
      setServerPort(null);
      setCurrentRunningCmd(null);
      setTerminalEntries((prev) => [
        ...prev,
        {
          command: trimmed,
          stderr: `Failed to execute: ${err.message}`,
          exitCode: 1,
          timestamp: new Date().toLocaleTimeString(),
          prompt: promptLabel,
        },
      ]);
    }

    setInputVal('');
  };

  const handleStopProcess = async () => {
    try {
      if (onKillProcess) {
        onKillProcess();
      }
      await fetch('/api/terminal/kill', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomId }),
      });
      setIsRunning(false);
      setServerPort(null);
      setCurrentRunningCmd(null);
      setTerminalEntries((prev) => [
        ...prev,
        {
          command: 'kill',
          stderr: '^C Process terminated and port released',
          exitCode: 130,
          timestamp: new Date().toLocaleTimeString(),
          prompt: promptLabel,
        },
      ]);
      toast.success('Development process terminated');
    } catch (err) {
      toast.error('Failed to stop process');
    }
  };

  const handleRestartProcess = async () => {
    setIsRunning(true);
    toast.loading('Restarting development server...', { id: 'restart-srv' });
    try {
      const res = await fetch('/api/terminal/restart', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomId }),
      });
      const data = await res.json();
      toast.success('Development server restarted!', { id: 'restart-srv' });
      if (data.detectedPort) {
        setServerPort(data.detectedPort);
      }
      if (data.command) {
        setCurrentRunningCmd(data.command);
      }
      setIsRunning(data.isRunning ?? true);
      setTerminalEntries((prev) => [
        ...prev,
        {
          command: 'restart',
          stdout: `[CODE DEATH]: Server restarted (${data.command || 'dev'})\n${data.stdout || ''}`,
          stderr: data.stderr,
          exitCode: data.exitCode,
          timestamp: new Date().toLocaleTimeString(),
          prompt: promptLabel,
        },
      ]);
    } catch (err: any) {
      toast.error(`Restart failed: ${err.message}`, { id: 'restart-srv' });
    }
  };

  const handleKeyDown = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      executeCommand(inputVal);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (commandHistory.length > 0) {
        const nextIdx = historyIndex === -1 ? commandHistory.length - 1 : Math.max(0, historyIndex - 1);
        setHistoryIndex(nextIdx);
        setInputVal(commandHistory[nextIdx]);
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (historyIndex !== -1) {
        const nextIdx = historyIndex + 1;
        if (nextIdx < commandHistory.length) {
          setHistoryIndex(nextIdx);
          setInputVal(commandHistory[nextIdx]);
        } else {
          setHistoryIndex(-1);
          setInputVal('');
        }
      }
    }
  };

  const handleMouseDownResize = (e: ReactMouseEvent) => {
    isDraggingRef.current = true;
    startYRef.current = e.clientY;
    startHeightRef.current = panelHeight;
    document.body.style.cursor = 'row-resize';
    document.body.style.userSelect = 'none';

    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!isDraggingRef.current) return;
      const deltaY = startYRef.current - moveEvent.clientY;
      const maxPanelHeight = Math.max(120, window.innerHeight - 180);
      const newHeight = Math.max(90, Math.min(maxPanelHeight, startHeightRef.current + deltaY));
      setPanelHeight(newHeight);
    };

    const handleMouseUp = () => {
      isDraggingRef.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  const handleDebugEval = (e: ReactFormEvent) => {
    e.preventDefault();
    if (!debugInput.trim()) return;
    const expr = debugInput.trim();
    try {
      // eslint-disable-next-line no-eval
      const result = window.eval(expr);
      setDebugLogs((prev) => [
        ...prev,
        `> ${expr}`,
        `= ${typeof result === 'object' ? JSON.stringify(result, null, 2) : String(result)}`,
      ]);
    } catch (err: any) {
      setDebugLogs((prev) => [...prev, `> ${expr}`, `! Error: ${err.message}`]);
    }
    setDebugInput('');
  };

  if (!isOpen) return null;

  return (
    <div
      style={{ height: isMaximized ? 'min(70vh, calc(100% - 140px))' : `${panelHeight}px` }}
      className="border-t border-slate-800 bg-[#0b1120] flex flex-col z-20 font-sans shrink-0 min-h-0 relative select-none"
    >
      {/* Top Drag Resize Handle */}
      <div
        onMouseDown={handleMouseDownResize}
        title="Drag to resize terminal panel"
        className="h-1.5 w-full cursor-row-resize bg-slate-800/60 hover:bg-cyan-500/80 active:bg-cyan-400 transition-colors shrink-0 z-30 group flex items-center justify-center"
      >
        <div className="w-10 h-0.5 rounded-full bg-slate-600 group-hover:bg-cyan-200 transition-colors" />
      </div>

      {/* Tab Navigation Header */}
      <div className="flex items-center justify-between px-3 bg-slate-950 border-b border-slate-800 h-9 select-none">
        {/* Left Tabs */}
        <div className="flex items-center h-full space-x-1">
          <button
            onClick={() => setActiveTab('terminal')}
            className={`px-3 h-full flex items-center space-x-1.5 font-semibold text-xs border-b-2 transition-colors ${
              activeTab === 'terminal'
                ? 'border-cyan-400 text-cyan-300 bg-slate-900/60'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <TerminalIcon className="w-3.5 h-3.5" />
            <span>TERMINAL</span>
            {isRunning && (
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse ml-1" />
            )}
          </button>

          <button
            onClick={() => setActiveTab('output')}
            className={`px-3 h-full flex items-center space-x-1.5 font-semibold text-xs border-b-2 transition-colors ${
              activeTab === 'output'
                ? 'border-cyan-400 text-cyan-300 bg-slate-900/60'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Play className="w-3.5 h-3.5" />
            <span>OUTPUT</span>
          </button>

          <button
            onClick={() => setActiveTab('problems')}
            className={`px-3 h-full flex items-center space-x-1.5 font-semibold text-xs border-b-2 transition-colors ${
              activeTab === 'problems'
                ? 'border-cyan-400 text-cyan-300 bg-slate-900/60'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <AlertCircle className="w-3.5 h-3.5 text-amber-400" />
            <span>PROBLEMS</span>
            <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-slate-800 text-slate-400">
              {diagnostics.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('debug')}
            className={`px-3 h-full flex items-center space-x-1.5 font-semibold text-xs border-b-2 transition-colors ${
              activeTab === 'debug'
                ? 'border-cyan-400 text-cyan-300 bg-slate-900/60'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Bug className="w-3.5 h-3.5" />
            <span>DEBUG CONSOLE</span>
          </button>

          <button
            onClick={() => setActiveTab('preview')}
            className={`px-3 h-full flex items-center space-x-1.5 font-semibold text-xs border-b-2 transition-colors ${
              activeTab === 'preview'
                ? 'border-cyan-400 text-cyan-300 bg-slate-900/60'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Globe className="w-3.5 h-3.5 text-cyan-400" />
            <span>PREVIEW</span>
            {serverPort && (
              <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-emerald-950 text-emerald-300 border border-emerald-800">
                :{serverPort}
              </span>
            )}
          </button>
        </div>

        {/* Right Tools */}
        <div className="flex items-center space-x-1.5">
          {isRunning && (
            <div className="flex items-center space-x-1.5 px-2 py-0.5 rounded bg-emerald-950/60 border border-emerald-800/80 text-emerald-300 text-[11px] font-mono">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>RUNNING</span>
              {serverPort && (
                <span className="text-emerald-400 font-bold ml-0.5">:{serverPort}</span>
              )}
            </div>
          )}

          {isRunning ? (
            <>
              <button
                title="Restart Development Server"
                onClick={handleRestartProcess}
                className="px-2 py-1 text-xs font-semibold text-amber-300 bg-amber-950/50 hover:bg-amber-900/70 border border-amber-800 rounded flex items-center gap-1 transition-colors cursor-pointer"
              >
                <RefreshCw className="w-3 h-3" />
                <span>Restart</span>
              </button>

              <button
                title="Stop Running Process (Ctrl+C)"
                onClick={handleStopProcess}
                className="px-2 py-1 text-xs font-bold text-rose-400 bg-rose-950/50 hover:bg-rose-900/70 border border-rose-800 rounded flex items-center gap-1 transition-colors cursor-pointer"
              >
                <Square className="w-3 h-3 fill-rose-400" />
                <span>Stop</span>
              </button>
            </>
          ) : (
            onRunCurrentFile && (
              <button
                title="Run Active File (Ctrl+Enter)"
                onClick={onRunCurrentFile}
                className="p-1 text-emerald-400 hover:text-emerald-300 hover:bg-slate-800 rounded transition-colors"
              >
                <Play className="w-3.5 h-3.5 fill-emerald-400" />
              </button>
            )
          )}

          {activeTab === 'output' && onShareOutput && (
            <button
              title="Broadcast Output to Collaborators"
              onClick={() => onShareOutput(outputContent)}
              className="p-1 text-slate-400 hover:text-cyan-400 hover:bg-slate-800 rounded transition-colors"
            >
              <Share2 className="w-3.5 h-3.5" />
            </button>
          )}

          <button
            title="Clear Panel"
            onClick={() => {
              if (activeTab === 'terminal') setTerminalEntries([]);
              if (activeTab === 'debug') setDebugLogs([]);
            }}
            className="p-1 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>

          <button
            title={isMaximized ? 'Restore Panel' : 'Maximize Panel'}
            onClick={() => setIsMaximized(!isMaximized)}
            className="p-1 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded transition-colors"
          >
            {isMaximized ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
          </button>

          <button
            title="Close Panel"
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Quick Project Script Action Bar (if scripts detected) */}
      {scriptsToDisplay.length > 0 && activeTab === 'terminal' && (
        <div className="px-3 py-1.5 bg-slate-950/80 border-b border-slate-800/80 flex items-center space-x-1.5 overflow-x-auto text-[11px]">
          <span className="text-slate-500 font-semibold flex items-center gap-1 flex-shrink-0">
            <Zap className="w-3 h-3 text-cyan-400" /> Scripts:
          </span>
          {scriptsToDisplay.map((ps) => (
            <button
              key={ps.name}
              disabled={isRunning}
              onClick={() => executeCommand(ps.command)}
              className="px-2 py-0.5 rounded bg-slate-900 hover:bg-cyan-950 hover:text-cyan-300 border border-slate-800 hover:border-cyan-800 text-slate-300 font-mono transition-colors flex-shrink-0 cursor-pointer disabled:opacity-50"
            >
              {ps.command}
            </button>
          ))}
        </div>
      )}

      {/* Panel Content Body */}
      <div className="flex-1 overflow-y-auto p-3 text-slate-200 font-mono text-xs">
        {/* TAB 1: TERMINAL */}
        {activeTab === 'terminal' && (
          <div className="space-y-2 select-text" onClick={() => terminalInputRef.current?.focus()}>
            {terminalEntries.map((entry, idx) => (
              <div key={idx} className="space-y-0.5">
                <div className="flex items-center space-x-2 text-cyan-400">
                  <span className="text-emerald-400">{entry.prompt || promptLabel}</span>
                  <span className="text-slate-100 font-bold">{entry.command}</span>
                </div>
                {entry.stdout && (
                  <pre className="whitespace-pre-wrap text-slate-300 pl-4 font-mono leading-relaxed">
                    {entry.stdout}
                  </pre>
                )}
                {entry.stderr && (
                  <div className="pl-4 space-y-1.5">
                    <pre className="whitespace-pre-wrap text-rose-400 font-mono leading-relaxed">
                      {entry.stderr}
                    </pre>
                    {onTriggerAIFix && (
                      <div>
                        <button
                          onClick={() => onTriggerAIFix(entry.stderr!, `command "${entry.command}"`)}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-indigo-950/80 hover:bg-indigo-900 border border-indigo-700/80 text-indigo-200 text-[11px] font-semibold transition-all hover:scale-105 active:scale-95 shadow-sm"
                        >
                          <Sparkles className="w-3.5 h-3.5 text-amber-400 animate-pulse" />
                          <span>Fix with AI</span>
                        </button>
                      </div>
                    )}
                  </div>
                )}
                {entry.exitCode !== undefined && entry.command !== 'welcome' && entry.command !== 'init' && (
                  <div className={`pl-4 text-[11px] font-mono ${entry.exitCode === 0 ? 'text-slate-500' : 'text-rose-500 font-bold'}`}>
                    Process exited with code {entry.exitCode}
                  </div>
                )}
              </div>
            ))}

            {/* Active Running Indicator or Command Input Line */}
            {isRunning ? (
              <div className="flex items-center space-x-2 pt-1 text-cyan-400">
                <RefreshCw className="w-3.5 h-3.5 animate-spin text-cyan-400" />
                <span className="text-slate-400">Executing: {currentRunningCmd}...</span>
              </div>
            ) : (
              <div className="flex items-center space-x-2 pt-1">
                <span className="text-emerald-400 flex-shrink-0">{promptLabel}</span>
                <input
                  ref={terminalInputRef}
                  type="text"
                  value={inputVal}
                  onChange={(e) => setInputVal(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="type command (e.g. run, ls, pwd, cat, help)..."
                  className="flex-1 bg-transparent border-none text-slate-100 focus:outline-none font-mono text-xs"
                />
              </div>
            )}
            <div ref={terminalEndRef} />
          </div>
        )}

        {/* TAB 2: OUTPUT */}
        {activeTab === 'output' && (
          <div className="select-text space-y-2">
            {outputContent && (outputContent.includes('[Error]:') || outputContent.includes('Error') || outputContent.includes('error')) && onTriggerAIFix && (
              <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                <span className="text-rose-400 font-medium text-xs">Runtime error encountered in output</span>
                <button
                  onClick={() => onTriggerAIFix(outputContent, 'Execution Output')}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-indigo-950 hover:bg-indigo-900 border border-indigo-700 text-indigo-200 text-[11px] font-semibold transition-all hover:scale-105"
                >
                  <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                  <span>Fix with AI</span>
                </button>
              </div>
            )}
            {outputContent ? (
              <pre className="whitespace-pre-wrap font-mono text-xs text-slate-300 leading-relaxed">
                {outputContent}
              </pre>
            ) : (
              <div className="text-slate-500 py-4 italic">
                No execution output yet. Click 'Run Code' or type 'run' in the terminal.
              </div>
            )}
          </div>
        )}

        {/* TAB 3: PROBLEMS */}
        {activeTab === 'problems' && (
          <div className="space-y-1">
            {diagnostics.length === 0 ? (
              <div className="text-slate-500 py-4 italic flex items-center space-x-2">
                <span className="text-emerald-400">✓</span>
                <span>No problems detected in the workspace.</span>
              </div>
            ) : (
              diagnostics.map((d) => (
                <div
                  key={d.id}
                  className="flex items-center justify-between p-2 rounded hover:bg-slate-900 border border-slate-800 text-xs transition-colors"
                >
                  <div
                    onClick={() => onSelectDiagnostic(d)}
                    className="flex items-center space-x-2 truncate cursor-pointer flex-1 mr-2"
                  >
                    <span className="text-rose-400 font-bold">● Error</span>
                    <span className="text-slate-200 font-semibold truncate">{d.message}</span>
                    <span className="text-slate-500 font-mono text-[11px] flex-shrink-0">
                      [{d.fileName}:{d.line}]
                    </span>
                  </div>
                  {onTriggerAIFix && (
                    <button
                      onClick={() => onTriggerAIFix(d.message, `${d.fileName}:${d.line}`)}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-indigo-950 hover:bg-indigo-900 border border-indigo-700 text-indigo-200 text-[11px] font-semibold transition-all flex-shrink-0"
                    >
                      <Sparkles className="w-3 h-3 text-amber-400" />
                      <span>Fix</span>
                    </button>
                  )}
                </div>
              ))
            )}
          </div>
        )}

        {/* TAB 4: DEBUG CONSOLE */}
        {activeTab === 'debug' && (
          <div className="space-y-2">
            <div className="space-y-1">
              {debugLogs.map((log, i) => (
                <div
                  key={i}
                  className={`font-mono text-xs ${
                    log.startsWith('!')
                      ? 'text-rose-400'
                      : log.startsWith('=')
                      ? 'text-cyan-300'
                      : 'text-slate-400'
                  }`}
                >
                  {log}
                </div>
              ))}
            </div>

            <form onSubmit={handleDebugEval} className="flex items-center space-x-2 pt-2">
              <span className="text-cyan-400 font-bold">&gt;</span>
              <input
                type="text"
                value={debugInput}
                onChange={(e) => setDebugInput(e.target.value)}
                placeholder="Evaluate expression..."
                className="flex-1 bg-transparent border-none text-slate-100 focus:outline-none font-mono text-xs"
              />
            </form>
          </div>
        )}

        {/* TAB 5: LIVE APP PREVIEW */}
        {activeTab === 'preview' && (
          <div className="w-full h-full flex flex-col -m-3 overflow-hidden bg-slate-950">
            <div className="px-3 py-1.5 bg-slate-900/90 border-b border-slate-800 flex items-center justify-between text-xs text-slate-300 shrink-0">
              <div className="flex items-center space-x-2">
                <span className={`w-2 h-2 rounded-full ${serverPort ? 'bg-emerald-400 animate-pulse' : 'bg-slate-600'}`} />
                <span className="font-mono text-xs text-slate-200">
                  {serverPort ? `http://localhost:${serverPort}/` : 'Dev Server Offline'}
                </span>
                {serverPort && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-cyan-950 text-cyan-300 border border-cyan-800/60 font-mono">
                    Proxy Connected
                  </span>
                )}
              </div>
              <div className="flex items-center space-x-2">
                {serverPort && (
                  <>
                    <button
                      onClick={() => {
                        const iframe = document.getElementById('code-death-preview-frame') as HTMLIFrameElement;
                        if (iframe) iframe.src = `/api/preview/${serverPort}/?t=${Date.now()}`;
                      }}
                      className="text-slate-400 hover:text-slate-200 p-1 hover:bg-slate-800 rounded transition-colors"
                      title="Reload Preview"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                    </button>
                    <a
                      href={`/api/preview/${serverPort}/`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-cyan-400 hover:text-cyan-300 hover:underline text-xs"
                    >
                      <span>Open in new tab</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </>
                )}
              </div>
            </div>

            {serverPort ? (
              <iframe
                id="code-death-preview-frame"
                src={`/api/preview/${serverPort}/`}
                className="w-full flex-1 border-none bg-white min-h-[140px]"
                title="Live Application Preview"
              />
            ) : isRunning ? (
              <div className="w-full flex-1 flex flex-col items-center justify-center text-slate-400 p-6 space-y-3 min-h-[140px]">
                <div className="w-7 h-7 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin" />
                <p className="text-xs font-semibold text-slate-200">Starting project development server...</p>
                <p className="text-[11px] text-slate-400 font-mono">{currentRunningCmd || 'npm run dev'}</p>
                <p className="text-[11px] text-slate-500 max-w-sm text-center">
                  Waiting for server port readiness and HTTP verification...
                </p>
              </div>
            ) : (
              <div className="w-full flex-1 flex flex-col items-center justify-center text-slate-400 p-6 space-y-3 min-h-[140px]">
                <Globe className="w-8 h-8 text-slate-600" />
                <p className="text-xs font-semibold text-slate-300">No active development server detected</p>
                <p className="text-[11px] text-slate-500 max-w-sm text-center">
                  Start your development server (e.g. click <span className="text-cyan-400 font-semibold">Run</span> or type <code className="text-cyan-400 font-mono">run</code> in the terminal) to view the live project preview.
                </p>
                <button
                  onClick={() => {
                    executeCommand('run');
                  }}
                  className="px-3 py-1 bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-bold text-xs rounded transition-colors cursor-pointer"
                >
                  Start Dev Server (run)
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
