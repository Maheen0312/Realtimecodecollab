import React, { useState, useRef, useEffect, Fragment, FC } from 'react';
import { 
  Play, 
  Share2, 
  Cloud, 
  CloudCheck, 
  ChevronRight, 
  LogOut, 
  FileCode, 
  Sparkles,
  Command,
  ExternalLink
} from 'lucide-react';
import { CodeDeathLogo } from '../CodeDeathLogo';
import { ProjectFile } from '../../types';
import toast from 'react-hot-toast';
import { ShareRoomModal } from './ShareRoomModal';

interface TopMenuBarProps {
  roomId: string;
  roomname: string;
  activeFile: ProjectFile | null;
  onRunCode: () => void;
  onSaveFile: () => void;
  onSaveAll?: () => void;
  onNewFile: () => void;
  onNewFolder: () => void;
  onDownloadProject: () => void;
  onToggleTerminal: () => void;
  onOpenCommandPalette: () => void;
  onOpenView: (view: any) => void;
  onLeaveRoom: () => void;
  isSaving: boolean;
  isRunDisabled?: boolean;
  onUndo?: () => void;
  onRedo?: () => void;
  onCut?: () => void;
  onCopy?: () => void;
  onPaste?: () => void;
  onFind?: () => void;
  onReplace?: () => void;
  onSelectAll?: () => void;
  onGoToLine?: () => void;
}

export const TopMenuBar: FC<TopMenuBarProps> = ({
  roomId,
  roomname,
  activeFile,
  onRunCode,
  onSaveFile,
  onSaveAll,
  onNewFile,
  onNewFolder,
  onDownloadProject,
  onToggleTerminal,
  onOpenCommandPalette,
  onOpenView,
  onLeaveRoom,
  isSaving,
  isRunDisabled = false,
  onUndo,
  onRedo,
  onCut,
  onCopy,
  onPaste,
  onFind,
  onReplace,
  onSelectAll,
  onGoToLine,
}) => {

  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [showShareModal, setShowShareModal] = useState(false);
  const menuBarRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuBarRef.current && !menuBarRef.current.contains(e.target as Node)) {
        setOpenMenu(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleCopyLink = () => {
    navigator.clipboard.writeText(window.location.href);
    toast.success('Room invite link copied to clipboard!', { icon: '📋' });
  };

  const menus: Record<string, { label: string; shortcut?: string; action: () => void; divider?: boolean }[]> = {
    File: [
      { label: 'New File...', shortcut: 'Ctrl+N', action: onNewFile },
      { label: 'New Folder...', action: onNewFolder },
      { label: 'Save File', shortcut: 'Ctrl+S', action: onSaveFile },
      { label: 'Save All Files', shortcut: 'Ctrl+Shift+S', action: onSaveAll || onSaveFile, divider: true },
      { label: 'Download Project ZIP', action: onDownloadProject },
      { label: 'Open in New Tab (Full Screen Share)', action: () => window.open(window.location.href, '_blank'), divider: true },
      { label: 'Exit to Dashboard', action: onLeaveRoom },
    ],
    Edit: [
      { label: 'Undo', shortcut: 'Ctrl+Z', action: onUndo || (() => {}) },
      { label: 'Redo', shortcut: 'Ctrl+Shift+Z', action: onRedo || (() => {}), divider: true },
      { label: 'Cut', shortcut: 'Ctrl+X', action: onCut || (() => {}) },
      { label: 'Copy', shortcut: 'Ctrl+C', action: onCopy || (() => {}) },
      { label: 'Paste', shortcut: 'Ctrl+V', action: onPaste || (() => {}), divider: true },
      { label: 'Find', shortcut: 'Ctrl+F', action: onFind || (() => {}) },
      { label: 'Replace', shortcut: 'Ctrl+H', action: onReplace || (() => {}), divider: true },
      { label: 'Select All', shortcut: 'Ctrl+A', action: onSelectAll || (() => {}) },
      { label: 'Go to Line...', shortcut: 'Ctrl+G', action: onGoToLine || (() => {}), divider: true },
      { label: 'Command Palette', shortcut: 'Ctrl+Shift+P', action: onOpenCommandPalette },
    ],
    View: [
      { label: 'File Explorer', shortcut: 'Ctrl+Shift+E', action: () => onOpenView('explorer') },
      { label: 'Search in Workspace', shortcut: 'Ctrl+Shift+F', action: () => onOpenView('search') },
      { label: 'Toggle Terminal', shortcut: 'Ctrl+`', action: onToggleTerminal },
      { label: 'Team Chat & JARVIS AI', action: () => onOpenView('chat') },
      { label: 'Video & Audio Call', action: () => onOpenView('video') },
    ],
    Run: [
      { label: 'Run Active File', shortcut: 'F5 / Ctrl+Enter', action: onRunCode },
      { label: 'Open Terminal', action: onToggleTerminal },
    ],
    Help: [
      { label: 'Command Palette', shortcut: 'F1', action: onOpenCommandPalette },
      { label: 'Copy Share Link', action: handleCopyLink },
      { label: 'About CODE DEATH IDE', action: () => toast('CODE DEATH Realtime Collaborative IDE v3.0') },
    ],
  };

  return (
    <header 
      ref={menuBarRef}
      className="h-9 bg-slate-950 border-b border-slate-800 flex items-center justify-between px-3 text-xs select-none z-30 font-sans"
    >
      {/* Left: Brand + Menus */}
      <div className="flex items-center space-x-1">
        <div className="flex items-center mr-2">
          <CodeDeathLogo size="sm" showText={true} />
        </div>

        {/* Dropdown Menus */}
        <div className="flex items-center space-x-0.5 relative">
          {Object.keys(menus).map((menuName) => {
            const isOpen = openMenu === menuName;
            return (
              <div key={menuName} className="relative">
                <button
                  onClick={() => setOpenMenu(isOpen ? null : menuName)}
                  onMouseEnter={() => {
                    if (openMenu) setOpenMenu(menuName);
                  }}
                  className={`px-2 py-1 rounded text-slate-400 hover:text-slate-100 transition-colors ${
                    isOpen ? 'bg-slate-800 text-white' : 'hover:bg-slate-900'
                  }`}
                >
                  {menuName}
                </button>

                {isOpen && (
                  <div className="absolute top-full left-0 mt-1 w-52 bg-slate-900 border border-slate-700/80 rounded-lg shadow-2xl py-1 z-50 text-slate-200">
                    {menus[menuName].map((item, i) => (
                      <Fragment key={i}>
                        <button
                          onClick={() => {
                            setOpenMenu(null);
                            item.action();
                          }}
                          className="w-full px-3 py-1.5 hover:bg-sky-600 hover:text-white flex items-center justify-between text-left text-xs transition-colors"
                        >
                          <span>{item.label}</span>
                          {item.shortcut && (
                            <span className="text-[10px] text-slate-400 font-mono">
                              {item.shortcut}
                            </span>
                          )}
                        </button>
                        {item.divider && <div className="border-t border-slate-800 my-1" />}
                      </Fragment>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Center Breadcrumb */}
      <div className="hidden md:flex items-center space-x-1 text-slate-400 font-mono text-[11px] truncate max-w-sm">
        <span className="text-slate-300 font-semibold">{roomname}</span>
        {activeFile && (
          <>
            <ChevronRight className="w-3 h-3 text-slate-600" />
            <span className="text-sky-400 truncate">{activeFile.path}</span>
          </>
        )}
      </div>

      {/* Right Controls */}
      <div className="flex items-center space-x-2">
        {/* Cloud Save Status */}
        <div 
          title={isSaving ? 'Saving to Cloud Firestore...' : 'Synced to Cloud Firestore'} 
          className="flex items-center space-x-1 text-[11px] text-slate-400 mr-1"
        >
          {isSaving ? (
            <>
              <Cloud className="w-3.5 h-3.5 text-amber-400 animate-pulse" />
              <span className="hidden sm:inline text-amber-400">Saving...</span>
            </>
          ) : (
            <>
              <Cloud className="w-3.5 h-3.5 text-emerald-400" />
              <span className="hidden sm:inline text-emerald-400">Saved</span>
            </>
          )}
        </div>

        {/* Open in Full Window / Tab (for unrestricted native permissions) */}
        <a
          href={window.location.href}
          target="_blank"
          rel="noopener noreferrer"
          title="Open Workspace in New Window (Unlocks Native Screen Sharing & OS Permissions)"
          className="hidden sm:flex items-center gap-1 px-2 py-1 rounded-md bg-slate-800/80 hover:bg-slate-800 text-slate-300 hover:text-cyan-300 border border-slate-700 text-xs font-medium transition-colors cursor-pointer"
        >
          <ExternalLink className="w-3.5 h-3.5 text-cyan-400" />
          <span className="hidden md:inline">New Tab</span>
        </a>

        {/* Share Invite Link */}
        <button
          onClick={() => setShowShareModal(true)}
          title="Share Room / Invite Collaborator"
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-800/80 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-700 text-xs font-medium transition-colors cursor-pointer"
        >
          <Share2 className="w-3.5 h-3.5 text-sky-400" />
          <span className="hidden sm:inline">Invite</span>
        </button>

        <ShareRoomModal
          roomId={roomId}
          roomName={roomname}
          isOpen={showShareModal}
          onClose={() => setShowShareModal(false)}
        />

        {/* Run Code Button */}
        <button
          onClick={onRunCode}
          disabled={isRunDisabled}
          title="Execute Code (Ctrl+Enter / F5)"
          className="flex items-center gap-1.5 px-3 py-1 rounded-md bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs shadow-xs transition-all active:scale-[0.98] disabled:opacity-50"
        >
          <Play className="w-3.5 h-3.5 fill-white" />
          <span>Run</span>
        </button>

        {/* Leave Room Button */}
        <button
          onClick={onLeaveRoom}
          title="Exit Workspace"
          className="p-1 text-slate-400 hover:text-rose-400 hover:bg-slate-900 rounded transition-colors"
        >
          <LogOut className="w-4 h-4" />
        </button>
      </div>
    </header>
  );
};
