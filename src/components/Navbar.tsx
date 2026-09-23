import React, { useState, FC } from 'react';
import { 
  Code2, 
  Copy, 
  Check, 
  Share2, 
  LogOut, 
  Play, 
  Terminal, 
  Users, 
  MessageSquare,
  Sparkles,
  Download,
  FolderOpen
} from 'lucide-react';
import { SupportedLanguage } from '../types';

interface NavbarProps {
  roomId: string;
  roomname?: string;
  language: SupportedLanguage;
  onLanguageChange: (lang: SupportedLanguage) => void;
  participantCount: number;
  onLeaveRoom: () => void;
  onToggleConsole: () => void;
  onToggleChat: () => void;
  onToggleSidebar: () => void;
  onRunCode: () => void;
  onDownloadCode: () => void;
  onOpenFile: () => void;
  isChatOpen: boolean;
  isSidebarOpen: boolean;
  isConsoleOpen: boolean;
}

export const Navbar: FC<NavbarProps> = ({
  roomId,
  roomname,
  language,
  onLanguageChange,
  participantCount,
  onLeaveRoom,
  onToggleConsole,
  onToggleChat,
  onToggleSidebar,
  onRunCode,
  onDownloadCode,
  onOpenFile,
  isChatOpen,
  isSidebarOpen,
  isConsoleOpen,
}) => {
  const [copied, setCopied] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);

  const handleCopyId = () => {
    navigator.clipboard.writeText(roomId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const shareUrl = `${window.location.origin}/join?room=${encodeURIComponent(roomId)}`;

  return (
    <>
      <header className="h-14 bg-slate-950 border-b border-slate-800 text-slate-200 px-4 flex items-center justify-between z-20 flex-shrink-0">
        {/* Left: Brand & Room identifier */}
        <div className="flex items-center space-x-3">
          <div className="flex items-center space-x-2 text-sky-400 font-bold tracking-tight">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-sky-500 to-indigo-600 flex items-center justify-center text-white shadow-md shadow-sky-500/20">
              <Code2 className="w-5 h-5" />
            </div>
            <span className="hidden sm:inline text-slate-100 text-sm font-semibold">
              CodeCollab
            </span>
          </div>

          <div className="h-5 w-[1px] bg-slate-800 hidden sm:block" />

          {/* Room Name & ID */}
          <div className="flex items-center gap-2">
            {roomname && (
              <span className="text-xs font-semibold px-2 py-0.5 rounded bg-sky-500/10 text-sky-400 border border-sky-500/20 max-w-[120px] truncate">
                {roomname}
              </span>
            )}

            <button
              onClick={handleCopyId}
              className="flex items-center gap-1.5 text-xs bg-slate-900 hover:bg-slate-800 border border-slate-800 hover:border-slate-700 px-2.5 py-1 rounded-md transition-all text-slate-300"
              title="Click to copy Room ID"
            >
              <span className="font-mono text-slate-400">{roomId}</span>
              {copied ? (
                <Check className="w-3.5 h-3.5 text-emerald-400" />
              ) : (
                <Copy className="w-3.5 h-3.5 text-slate-500" />
              )}
            </button>
          </div>
        </div>

        {/* Center: Language selector & Actions */}
        <div className="flex items-center space-x-2">
          <select
            value={language}
            onChange={(e) => onLanguageChange(e.target.value as SupportedLanguage)}
            className="bg-slate-900 border border-slate-800 text-slate-200 text-xs rounded-lg px-2.5 py-1.5 font-medium focus:outline-none focus:border-sky-500 hover:border-slate-700 transition-colors cursor-pointer"
          >
            <option value="javascript">JavaScript (ES6)</option>
            <option value="typescript">TypeScript</option>
            <option value="python">Python 3</option>
            <option value="html">HTML5</option>
            <option value="css">CSS3</option>
            <option value="java">Java</option>
            <option value="cpp">C++</option>
          </select>

          {/* File Open / Save */}
          <div className="hidden md:flex items-center gap-1 border-l border-slate-800 pl-2">
            <button
              onClick={onOpenFile}
              className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded transition-colors"
              title="Open File"
            >
              <FolderOpen className="w-4 h-4" />
            </button>
            <button
              onClick={onDownloadCode}
              className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded transition-colors"
              title="Download File"
            >
              <Download className="w-4 h-4" />
            </button>
          </div>

          {/* Run button */}
          <button
            onClick={onRunCode}
            className="flex items-center gap-1 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold px-3 py-1.5 rounded-lg shadow-sm shadow-emerald-900/30 transition-all active:scale-95"
            title="Execute Code / Preview"
          >
            <Play className="w-3.5 h-3.5 fill-white" />
            <span className="hidden sm:inline">Run</span>
          </button>
        </div>

        {/* Right: Panels & Actions */}
        <div className="flex items-center space-x-2">
          {/* Toggle Collaborators */}
          <button
            onClick={onToggleSidebar}
            className={`p-1.5 rounded-lg text-xs font-medium flex items-center gap-1 transition-colors ${
              isSidebarOpen
                ? 'bg-slate-800 text-sky-400 border border-sky-500/30'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900 border border-transparent'
            }`}
            title="Toggle Collaborators Panel"
          >
            <Users className="w-4 h-4" />
            <span className="text-xs">{participantCount}</span>
          </button>

          {/* Toggle Terminal / Console */}
          <button
            onClick={onToggleConsole}
            className={`p-1.5 rounded-lg text-xs font-medium flex items-center gap-1 transition-colors ${
              isConsoleOpen
                ? 'bg-slate-800 text-emerald-400 border border-emerald-500/30'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900 border border-transparent'
            }`}
            title="Toggle Console & Preview"
          >
            <Terminal className="w-4 h-4" />
          </button>

          {/* Toggle Chat / AI */}
          <button
            onClick={onToggleChat}
            className={`p-1.5 rounded-lg text-xs font-medium flex items-center gap-1 transition-colors ${
              isChatOpen
                ? 'bg-slate-800 text-indigo-400 border border-indigo-500/30'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900 border border-transparent'
            }`}
            title="Toggle Room Chat & AI Assistant"
          >
            <MessageSquare className="w-4 h-4" />
          </button>

          {/* Share Room Button */}
          <button
            onClick={() => setShowShareModal(true)}
            className="flex items-center gap-1 text-xs bg-sky-600/20 hover:bg-sky-600/30 text-sky-400 border border-sky-500/30 px-2.5 py-1.5 rounded-lg transition-colors"
            title="Share Room with Peers"
          >
            <Share2 className="w-3.5 h-3.5" />
            <span className="hidden md:inline">Share</span>
          </button>

          {/* Leave Button */}
          <button
            onClick={onLeaveRoom}
            className="flex items-center gap-1 text-xs bg-rose-600/20 hover:bg-rose-600/30 text-rose-400 border border-rose-500/30 px-2.5 py-1.5 rounded-lg transition-colors"
            title="Leave Room"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span className="hidden md:inline">Leave</span>
          </button>
        </div>
      </header>

      {/* Share Modal */}
      {showShareModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-4 animate-in fade-in zoom-in duration-150">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sky-400">
                <Share2 className="w-5 h-5" />
                <h3 className="font-bold text-slate-100 text-lg">Invite Pair Programmer</h3>
              </div>
              <button
                onClick={() => setShowShareModal(false)}
                className="text-slate-400 hover:text-slate-200 text-sm font-semibold"
              >
                ✕
              </button>
            </div>

            <p className="text-slate-400 text-xs leading-relaxed">
              Anyone with this Room ID or link can join your pair programming session and collaborate on code and chat in real time.
            </p>

            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                Room ID
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={roomId}
                  className="flex-1 bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs font-mono text-sky-300"
                />
                <button
                  onClick={handleCopyId}
                  className="px-3 py-2 bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold rounded-lg flex items-center gap-1 transition-colors"
                >
                  {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  {copied ? 'Copied' : 'Copy'}
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                Direct Invite Link
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={shareUrl}
                  className="flex-1 bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs font-mono text-slate-300 truncate"
                />
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(shareUrl);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 2000);
                  }}
                  className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-lg flex items-center gap-1 transition-colors"
                >
                  <Copy className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            <div className="pt-2 flex justify-end">
              <button
                onClick={() => setShowShareModal(false)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-lg transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
