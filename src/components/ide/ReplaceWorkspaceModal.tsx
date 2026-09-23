import React, { FC } from 'react';
import { AlertTriangle, FolderSync, GitMerge, X } from 'lucide-react';

interface ReplaceWorkspaceModalProps {
  isOpen: boolean;
  onClose?: () => void;
  onCancel?: () => void;
  onConfirm?: () => void;
  onConfirmReplace?: () => void;
  onConfirmMerge?: () => void;
  projectName?: string;
  incomingProjectName?: string;
  currentFileCount?: number;
  incomingFileCount?: number;
}

export const ReplaceWorkspaceModal: FC<ReplaceWorkspaceModalProps> = ({
  isOpen,
  onClose,
  onCancel,
  onConfirm,
  onConfirmReplace,
  onConfirmMerge,
  projectName,
  incomingProjectName,
  currentFileCount,
  incomingFileCount,
}) => {
  if (!isOpen) return null;

  const handleClose = () => {
    if (typeof onCancel === 'function') {
      onCancel();
    } else if (typeof onClose === 'function') {
      onClose();
    }
  };

  const handleReplace = () => {
    if (typeof onConfirmReplace === 'function') {
      onConfirmReplace();
    } else if (typeof onConfirm === 'function') {
      onConfirm();
    }
    if (typeof onClose === 'function') {
      onClose();
    }
  };

  const handleMerge = () => {
    if (typeof onConfirmMerge === 'function') {
      onConfirmMerge();
    }
    if (typeof onClose === 'function') {
      onClose();
    }
  };

  const displayProjectName = incomingProjectName || projectName;

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) handleClose();
      }}
    >
      <div 
        className="w-full max-w-lg bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150"
        role="dialog"
        aria-modal="true"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800 bg-slate-950/50">
          <div className="flex items-center space-x-2 text-rose-400">
            <AlertTriangle className="w-5 h-5 text-amber-400 flex-shrink-0" />
            <h3 className="font-bold text-sm text-slate-100">Import Workspace Options</h3>
          </div>
          <button
            onClick={handleClose}
            className="text-slate-400 hover:text-slate-200 p-1 rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
            aria-label="Close modal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-3.5 text-xs text-slate-300">
          <p className="leading-relaxed">
            You are importing{' '}
            {displayProjectName ? (
              <span className="font-semibold text-cyan-400">"{displayProjectName}"</span>
            ) : (
              'a new project'
            )}
            {incomingFileCount !== undefined ? ` with ${incomingFileCount} file(s)` : ''}.
          </p>

          <div className="grid grid-cols-2 gap-2 text-center p-2.5 rounded-xl bg-slate-950/60 border border-slate-800">
            <div className="p-2">
              <span className="block text-[11px] text-slate-400">Current Workspace</span>
              <span className="text-sm font-semibold text-slate-200">
                {currentFileCount !== undefined ? `${currentFileCount} file(s)` : 'Active files'}
              </span>
            </div>
            <div className="p-2 border-l border-slate-800">
              <span className="block text-[11px] text-cyan-400">Incoming Project</span>
              <span className="text-sm font-semibold text-cyan-300">
                {incomingFileCount !== undefined ? `${incomingFileCount} file(s)` : 'New files'}
              </span>
            </div>
          </div>

          <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs leading-relaxed">
            Choose <strong>Replace</strong> to clear existing files and set up a clean, atomic project workspace, or <strong>Merge</strong> to combine these files alongside your current workspace files.
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 px-5 py-3.5 bg-slate-950/60 border-t border-slate-800">
          <button
            type="button"
            onClick={handleClose}
            className="px-3.5 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-slate-200 bg-slate-800/80 hover:bg-slate-800 transition-colors cursor-pointer"
          >
            Cancel
          </button>
          
          {(onConfirmMerge || typeof onConfirmMerge === 'function') && (
            <button
              type="button"
              onClick={handleMerge}
              className="px-3.5 py-2 rounded-xl text-xs font-medium text-slate-200 bg-slate-800 hover:bg-slate-700 hover:text-white border border-slate-700 flex items-center gap-1.5 transition-all cursor-pointer"
            >
              <GitMerge className="w-3.5 h-3.5 text-cyan-400" />
              <span>Merge Files</span>
            </button>
          )}

          <button
            type="button"
            onClick={handleReplace}
            className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-rose-600 to-rose-500 hover:from-rose-500 hover:to-rose-400 shadow-lg shadow-rose-500/25 flex items-center gap-1.5 transition-all active:scale-[0.98] cursor-pointer"
          >
            <FolderSync className="w-3.5 h-3.5" />
            <span>Replace Workspace</span>
          </button>
        </div>
      </div>
    </div>
  );
};
