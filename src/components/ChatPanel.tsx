import React, { useState, useRef, useEffect, FC, FormEvent } from 'react';
import { ChatMessage, SupportedLanguage, ProjectFile } from '../types';
import { 
  MessageSquare, 
  Sparkles, 
  Send, 
  Bot, 
  Code2, 
  Copy, 
  Check, 
  CornerDownLeft,
  ArrowDownToLine,
  AlertTriangle,
  FileCode,
  Terminal,
  Zap
} from 'lucide-react';
import toast from 'react-hot-toast';

interface ChatPanelProps {
  messages: ChatMessage[];
  onSendMessage: (text: string) => void;
  currentUsername: string;
  currentCode: string;
  language: SupportedLanguage;
  onApplyCode?: (code: string) => void;
  files?: ProjectFile[];
  activeFileName?: string;
  activeFilePath?: string;
  terminalOutput?: string;
  diagnostics?: any[];
}

export const ChatPanel: FC<ChatPanelProps> = ({
  messages,
  onSendMessage,
  currentUsername,
  currentCode,
  language,
  onApplyCode,
  files,
  activeFileName,
  activeFilePath,
  terminalOutput,
  diagnostics,
}) => {
  const [activeTab, setActiveTab] = useState<'room' | 'ai'>('room');
  const [inputText, setInputText] = useState('');
  
  // AI assistant state
  const [aiMessages, setAiMessages] = useState<Array<{ sender: 'user' | 'ai'; text: string; codeBlocks?: string[] }>>([
    {
      sender: 'ai',
      text: "Hello! I am JARVIS, your collaborative coding assistant in CODE DEATH. I have full context of your open workspace, active files, and terminal diagnostics.",
    },
  ]);
  const [aiInput, setAiInput] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [copiedIndex, setCopiedIndex] = useState<string | null>(null);

  const roomMessagesEndRef = useRef<HTMLDivElement>(null);
  const aiMessagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll
  useEffect(() => {
    if (activeTab === 'room') {
      roomMessagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    } else {
      aiMessagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, aiMessages, activeTab]);

  const handleSendRoomMessage = (e?: FormEvent) => {
    if (e) e.preventDefault();
    if (!inputText.trim()) return;
    onSendMessage(inputText.trim());
    setInputText('');
  };

  // Helper to extract ```code``` blocks from markdown text
  const extractCodeBlocks = (text: string): string[] => {
    const regex = /```(?:[a-zA-Z0-9_-]+)?\n([\s\S]*?)```/g;
    const blocks: string[] = [];
    let match;
    while ((match = regex.exec(text)) !== null) {
      if (match[1]?.trim()) {
        blocks.push(match[1].trim());
      }
    }
    return blocks;
  };

  const handleAskAi = async (customPrompt?: string) => {
    const promptToSend = customPrompt || aiInput.trim();
    if (!promptToSend || aiLoading) return;

    const userEntry = { sender: 'user' as const, text: promptToSend };
    setAiMessages((prev) => [...prev, userEntry]);
    if (!customPrompt) setAiInput('');
    setAiLoading(true);

    try {
      const response = await fetch('/api/chatbot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: promptToSend,
          code: currentCode,
          language,
          activeFileName,
          activeFilePath,
          files: files?.map(f => ({ path: f.path, name: f.name, language: f.language, isFolder: f.isFolder })),
          terminalOutput: terminalOutput?.slice(-1500),
          diagnostics,
        }),
      });

      if (!response.ok) {
        throw new Error(`Server returned ${response.status}`);
      }

      const data = await response.json();
      const replyText = data.reply || 'Analysis complete.';
      const codeBlocks = extractCodeBlocks(replyText);

      setAiMessages((prev) => [
        ...prev,
        { sender: 'ai', text: replyText, codeBlocks },
      ]);
    } catch (err: any) {
      console.error('AI error:', err);
      setAiMessages((prev) => [
        ...prev,
        {
          sender: 'ai',
          text: 'Sorry, I encountered an issue communicating with the AI service. Please verify server connectivity or try again.',
        },
      ]);
    } finally {
      setAiLoading(false);
    }
  };

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedIndex(id);
    toast.success('Copied to clipboard!');
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  const handleApplyCodeSnippet = (snippet: string) => {
    if (onApplyCode) {
      onApplyCode(snippet);
      toast.success('Inserted code into active editor!');
    }
  };

  return (
    <div className="flex flex-col h-full bg-slate-900 border-l border-slate-800 text-slate-200 text-xs">
      {/* Tabs */}
      <div className="flex border-b border-slate-800 bg-slate-950/60 p-1">
        <button
          onClick={() => setActiveTab('room')}
          className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 text-xs font-semibold rounded-md transition-all ${
            activeTab === 'room'
              ? 'bg-slate-800 text-cyan-400 shadow-sm'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/50'
          }`}
        >
          <MessageSquare className="w-3.5 h-3.5" />
          Room Chat ({messages.length})
        </button>
        <button
          onClick={() => setActiveTab('ai')}
          className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 text-xs font-semibold rounded-md transition-all ${
            activeTab === 'ai'
              ? 'bg-slate-800 text-indigo-400 shadow-sm'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/50'
          }`}
        >
          <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
          JARVIS AI
        </button>
      </div>

      {/* Room Chat Tab */}
      {activeTab === 'room' && (
        <div className="flex-1 flex flex-col min-h-0">
          <div className="flex-1 overflow-y-auto p-3 space-y-3">
            {messages.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center text-slate-500 py-8">
                <MessageSquare className="w-8 h-8 mb-2 opacity-30 text-cyan-400" />
                <p className="font-medium text-slate-400">No messages yet</p>
                <p className="text-[11px] text-slate-500 max-w-[200px] mt-1">
                  Say hello to other developers in this CODE DEATH room!
                </p>
              </div>
            ) : (
              messages.map((msg) => {
                const isMe = msg.sender === currentUsername;
                const avatarBg = msg.userColor || '#38bdf8';

                return (
                  <div
                    key={msg.id}
                    className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}
                  >
                    <div className="flex items-center gap-1.5 mb-1 px-1">
                      {!isMe && (
                        <span
                          className="w-4 h-4 rounded-full text-[9px] font-bold flex items-center justify-center text-slate-950"
                          style={{ backgroundColor: avatarBg }}
                        >
                          {msg.sender.charAt(0).toUpperCase()}
                        </span>
                      )}
                      <span className="text-[11px] font-medium text-slate-400">
                        {isMe ? 'You' : msg.sender}
                      </span>
                      <span className="text-[10px] text-slate-600">
                        {msg.timestamp}
                      </span>
                    </div>

                    <div
                      className={`max-w-[88%] px-3 py-2 rounded-xl text-xs break-words ${
                        isMe
                          ? 'bg-cyan-600 text-white rounded-tr-none shadow-sm'
                          : 'bg-slate-800 text-slate-100 border border-slate-700/60 rounded-tl-none'
                      }`}
                    >
                      {msg.text}
                    </div>
                  </div>
                );
              })
            )}
            <div ref={roomMessagesEndRef} />
          </div>

          {/* Chat Input */}
          <form
            onSubmit={handleSendRoomMessage}
            className="p-2 border-t border-slate-800 bg-slate-950/40 flex items-center gap-2"
          >
            <input
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder="Type message to room..."
              className="flex-1 bg-slate-800 border border-slate-700/80 rounded-lg px-3 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-500 transition-all"
            />
            <button
              type="submit"
              disabled={!inputText.trim()}
              className="p-2 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-40 text-white rounded-lg transition-colors flex-shrink-0"
              title="Send Message"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
        </div>
      )}

      {/* AI Assistant Tab */}
      {activeTab === 'ai' && (
        <div className="flex-1 flex flex-col min-h-0">
          {/* Quick AI Action chips */}
          <div className="p-2 border-b border-slate-800 bg-slate-950/40 flex flex-wrap gap-1.5">
            <button
              onClick={() => handleAskAi(`Explain what this ${language} code does in detail.`)}
              className="text-[11px] bg-slate-800 hover:bg-indigo-600/30 border border-slate-700 hover:border-indigo-500/50 text-indigo-300 px-2 py-1 rounded transition-colors flex items-center gap-1"
            >
              <FileCode className="w-3 h-3" /> Explain Code
            </button>
            <button
              onClick={() => handleAskAi(`Review this ${language} code for bugs, syntax errors, or improvements.`)}
              className="text-[11px] bg-slate-800 hover:bg-indigo-600/30 border border-slate-700 hover:border-indigo-500/50 text-indigo-300 px-2 py-1 rounded transition-colors flex items-center gap-1"
            >
              <AlertTriangle className="w-3 h-3 text-amber-400" /> Spot Bugs
            </button>
            <button
              onClick={() => handleAskAi(`Refactor and optimize this ${language} code with best practices.`)}
              className="text-[11px] bg-slate-800 hover:bg-indigo-600/30 border border-slate-700 hover:border-indigo-500/50 text-indigo-300 px-2 py-1 rounded transition-colors flex items-center gap-1"
            >
              <Zap className="w-3 h-3 text-cyan-400" /> Optimize
            </button>
            {terminalOutput && terminalOutput.trim().length > 0 && (
              <button
                onClick={() => handleAskAi(`Diagnose this terminal error and explain how to fix it:\n\n${terminalOutput.slice(-500)}`)}
                className="text-[11px] bg-rose-950/40 hover:bg-rose-900/50 border border-rose-800/60 text-rose-300 px-2 py-1 rounded transition-colors flex items-center gap-1"
              >
                <Terminal className="w-3 h-3" /> Fix Terminal Error
              </button>
            )}
          </div>

          {/* AI Messages */}
          <div className="flex-1 overflow-y-auto p-3 space-y-3">
            {aiMessages.map((msg, idx) => {
              const isAi = msg.sender === 'ai';
              return (
                <div
                  key={idx}
                  className={`flex flex-col ${isAi ? 'items-start' : 'items-end'}`}
                >
                  <div className="flex items-center gap-1.5 mb-1 px-1">
                    {isAi ? (
                      <span className="flex items-center gap-1 text-[11px] font-semibold text-indigo-400">
                        <Bot className="w-3.5 h-3.5" /> JARVIS
                      </span>
                    ) : (
                      <span className="text-[11px] font-medium text-slate-400">
                        You
                      </span>
                    )}
                  </div>

                  <div
                    className={`max-w-[95%] px-3 py-2.5 rounded-xl text-xs whitespace-pre-wrap leading-relaxed ${
                      isAi
                        ? 'bg-slate-800/95 border border-indigo-900/40 text-slate-200'
                        : 'bg-indigo-600 text-white'
                    }`}
                  >
                    {msg.text}

                    {isAi && (
                      <div className="mt-2.5 pt-2 border-t border-slate-700/60 flex flex-wrap items-center justify-end gap-2 text-[10px]">
                        {msg.codeBlocks && msg.codeBlocks.length > 0 && onApplyCode && (
                          <button
                            onClick={() => handleApplyCodeSnippet(msg.codeBlocks![0])}
                            className="flex items-center gap-1 px-2 py-0.5 rounded bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 border border-cyan-500/30 font-medium transition-colors"
                          >
                            <ArrowDownToLine className="w-3 h-3" /> Insert into File
                          </button>
                        )}
                        <button
                          onClick={() => handleCopy(msg.text, `msg_${idx}`)}
                          className="flex items-center gap-1 px-2 py-0.5 rounded text-slate-400 hover:text-slate-200 hover:bg-slate-700/50 transition-colors"
                        >
                          {copiedIndex === `msg_${idx}` ? (
                            <>
                              <Check className="w-3 h-3 text-emerald-400" /> Copied
                            </>
                          ) : (
                            <>
                              <Copy className="w-3 h-3" /> Copy
                            </>
                          )}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
            {aiLoading && (
              <div className="flex items-center gap-2 text-indigo-400 text-xs p-2.5 bg-indigo-500/10 rounded-lg border border-indigo-500/20 animate-pulse">
                <Sparkles className="w-4 h-4 animate-spin flex-shrink-0" />
                <span>JARVIS is analyzing workspace & drafting code...</span>
              </div>
            )}
            <div ref={aiMessagesEndRef} />
          </div>

          {/* AI Input */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleAskAi();
            }}
            className="p-2 border-t border-slate-800 bg-slate-950/40 flex items-center gap-2"
          >
            <input
              type="text"
              value={aiInput}
              onChange={(e) => setAiInput(e.target.value)}
              placeholder="Ask JARVIS to write or refactor code..."
              className="flex-1 bg-slate-800 border border-slate-700/80 rounded-lg px-3 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition-all"
            />
            <button
              type="submit"
              disabled={!aiInput.trim() || aiLoading}
              className="p-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white rounded-lg transition-colors flex-shrink-0"
              title="Ask AI"
            >
              <CornerDownLeft className="w-4 h-4" />
            </button>
          </form>
        </div>
      )}
    </div>
  );
};
