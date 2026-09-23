import React, { useState, useEffect, useRef, FC, FormEvent } from 'react';
import { FilePlus, FolderPlus, Folder, X, AlertCircle } from 'lucide-react';

interface NewItemModalProps {
  isOpen: boolean;
  type: 'file' | 'folder';
  initialLocation: string;
  existingPaths: string[];
  availableFolders: string[];
  onClose: () => void;
  onCreate: (name: string, isFolder: boolean, parentPath: string) => void;
}

export const NewItemModal: FC<NewItemModalProps> = ({
  isOpen,
  type,
  initialLocation,
  existingPaths,
  availableFolders,
  onClose,
  onCreate,
}) => {
  const [name, setName] = useState('');
  const [location, setLocation] = useState('');
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setName('');
      setLocation(initialLocation || '');
      setError(null);
      setTimeout(() => inputRef.current?.focus(), 60);
    }
  }, [isOpen, initialLocation, type]);

  if (!isOpen) return null;

  const validateAndSubmit = (e: FormEvent) => {
    e.preventDefault();
    const cleanName = name.trim();

    if (!cleanName) {
      setError(`Please enter a ${type} name.`);
      return;
    }

    // Check for path traversal attempts
    if (cleanName.includes('..') || location.includes('..')) {
      setError('Path traversal ("..") is strictly forbidden.');
      return;
    }

    // Check for invalid characters
    const invalidChars = /[<>:"/\\|?*]/;
    if (invalidChars.test(cleanName)) {
      setError('Name contains invalid characters (<>:"/\\|?*).');
      return;
    }

    // Normalized parent location
    const cleanLocation = location.replace(/^\/+|\/+$/g, '').trim();
    const fullPath = cleanLocation ? `${cleanLocation}/${cleanName}` : cleanName;

    // Check for duplicate path
    const isDuplicate = existingPaths.some((p) => p.toLowerCase() === fullPath.toLowerCase());
    if (isDuplicate) {
      setError(`An item with this name already exists at "${cleanLocation || 'root'}".`);
      return;
    }

    setError(null);
    onCreate(cleanName, type === 'folder', cleanLocation);
    onClose();
  };

  const isFolder = type === 'folder';

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden text-slate-100 flex flex-col font-sans animate-in fade-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-800 bg-slate-950/60">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-100">
            {isFolder ? (
              <FolderPlus className="w-4 h-4 text-amber-400" />
            ) : (
              <FilePlus className="w-4 h-4 text-cyan-400" />
            )}
            <span>{isFolder ? 'Create New Folder' : 'Create New File'}</span>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800/80 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={validateAndSubmit} className="p-5 space-y-4">
          {error && (
            <div className="flex items-center gap-2 p-2.5 rounded-lg bg-rose-950/50 border border-rose-800/80 text-rose-200 text-xs">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">
              {isFolder ? 'Folder Name' : 'File Name'}
            </label>
            <input
              ref={inputRef}
              type="text"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (error) setError(null);
              }}
              placeholder={isFolder ? 'e.g., components' : 'e.g., Header.tsx, utils.js, style.css'}
              className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-500 font-mono transition-colors"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5 flex items-center justify-between">
              <span>Location (Parent Directory)</span>
              <span className="text-[10px] text-slate-400 font-normal">Inside Active Workspace</span>
            </label>
            <div className="relative">
              <select
                value={location}
                onChange={(e) => {
                  setLocation(e.target.value);
                  if (error) setError(null);
                }}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-cyan-500 transition-colors font-mono appearance-none cursor-pointer"
              >
                <option value="">/ (Workspace Root)</option>
                {availableFolders.map((folder) => (
                  <option key={folder} value={folder}>
                    📁 {folder}
                  </option>
                ))}
              </select>
              <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-slate-400">
                <Folder className="w-3.5 h-3.5" />
              </div>
            </div>
          </div>

          {/* Destination Preview */}
          <div className="p-2.5 rounded-lg bg-slate-950/40 border border-slate-800 text-[11px] font-mono text-slate-400">
            <span className="text-slate-500 mr-1">Target Path:</span>
            <span className="text-cyan-400 font-semibold">
              {location ? `${location}/` : ''}
              {name.trim() || (isFolder ? 'new_folder' : 'new_file.ext')}
            </span>
          </div>

          {/* Footer Actions */}
          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-1.5 rounded-lg text-xs font-medium text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-1.5 rounded-lg text-xs font-semibold text-white bg-cyan-600 hover:bg-cyan-500 transition-colors shadow-md shadow-cyan-900/20 cursor-pointer"
            >
              {isFolder ? 'Create Folder' : 'Create File'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
