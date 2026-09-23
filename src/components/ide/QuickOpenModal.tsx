import React, { useState, useEffect, useRef, FC, KeyboardEvent as ReactKeyboardEvent } from 'react';
import { Search, FileCode, ArrowRight } from 'lucide-react';
import { ProjectFile } from '../../types';
import { getFileIcon } from './icons';

interface QuickOpenModalProps {
  isOpen: boolean;
  onClose: () => void;
  files: ProjectFile[];
  onSelectFile: (file: ProjectFile) => void;
}

export const QuickOpenModal: FC<QuickOpenModalProps> = ({
  isOpen,
  onClose,
  files,
  onSelectFile,
}) => {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const nonFolderFiles = files.filter((f) => !f.isFolder);
  const filteredFiles = nonFolderFiles.filter((f) =>
    `${f.name} ${f.path}`.toLowerCase().includes(query.toLowerCase())
  );

  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  const handleKeyDown = (e: ReactKeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev + 1) % (filteredFiles.length || 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev - 1 + filteredFiles.length) % (filteredFiles.length || 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const file = filteredFiles[selectedIndex];
      if (file) {
        onSelectFile(file);
        onClose();
      }
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-start justify-center pt-[14vh] z-50 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg bg-slate-900 border border-slate-700/80 rounded-xl shadow-2xl overflow-hidden text-slate-100 flex flex-col font-sans"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center px-4 py-3 border-b border-slate-800 bg-slate-950/60">
          <Search className="w-4 h-4 text-cyan-400 mr-2.5 flex-shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search files by name or path (Ctrl+P)..."
            className="flex-1 bg-transparent border-none text-sm text-slate-100 placeholder-slate-500 focus:outline-none font-mono"
          />
          <span className="text-[10px] text-slate-500 font-mono px-1.5 py-0.5 rounded border border-slate-800">
            ESC
          </span>
        </div>

        {/* File List */}
        <div className="max-h-72 overflow-y-auto p-1.5 divide-y divide-slate-800/40">
          {filteredFiles.length === 0 ? (
            <div className="py-6 text-center text-xs text-slate-500">
              No files matching "{query}"
            </div>
          ) : (
            filteredFiles.map((file, idx) => {
              const isSelected = idx === selectedIndex;
              return (
                <div
                  key={file.id}
                  onClick={() => {
                    onSelectFile(file);
                    onClose();
                  }}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  className={`flex items-center justify-between px-3 py-2 rounded-lg cursor-pointer text-xs transition-colors ${
                    isSelected
                      ? 'bg-cyan-600/90 text-white font-medium'
                      : 'hover:bg-slate-800/60 text-slate-300'
                  }`}
                >
                  <div className="flex items-center space-x-2.5 min-w-0 truncate">
                    <span className="flex-shrink-0">{getFileIcon(file.name)}</span>
                    <span className="font-semibold truncate">{file.name}</span>
                    <span className="text-[11px] text-slate-400 truncate opacity-80 font-mono">
                      {file.path}
                    </span>
                  </div>
                  <ArrowRight className={`w-3.5 h-3.5 ${isSelected ? 'opacity-100' : 'opacity-0'}`} />
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
