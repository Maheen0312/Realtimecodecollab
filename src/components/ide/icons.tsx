import React from 'react';
import { 
  FileCode2, 
  FileText, 
  FileJson, 
  FileType, 
  FileCode, 
  Folder, 
  FolderOpen,
  Hash,
  TerminalSquare
} from 'lucide-react';
import { SupportedLanguage } from '../../types';

export function getFileLanguage(fileName: string): SupportedLanguage {
  const ext = fileName.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'js':
    case 'jsx':
    case 'mjs':
      return 'javascript';
    case 'ts':
    case 'tsx':
      return 'typescript';
    case 'py':
      return 'python';
    case 'html':
    case 'htm':
      return 'html';
    case 'css':
    case 'scss':
      return 'css';
    case 'java':
      return 'java';
    case 'cpp':
    case 'c':
    case 'h':
    case 'hpp':
      return 'cpp';
    case 'json':
      return 'json';
    case 'md':
    case 'markdown':
      return 'markdown';
    default:
      return 'javascript';
  }
}

export function getFileIcon(fileName: string, isFolder = false, isOpen = false) {
  if (isFolder) {
    return isOpen ? (
      <FolderOpen className="w-4 h-4 text-amber-400 flex-shrink-0" />
    ) : (
      <Folder className="w-4 h-4 text-amber-400 flex-shrink-0" />
    );
  }

  const ext = fileName.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'jsx':
    case 'tsx':
      return <FileCode2 className="w-4 h-4 text-sky-400 flex-shrink-0" />;
    case 'js':
    case 'mjs':
      return <FileCode className="w-4 h-4 text-yellow-400 flex-shrink-0" />;
    case 'ts':
      return <FileCode className="w-4 h-4 text-blue-400 flex-shrink-0" />;
    case 'py':
      return <TerminalSquare className="w-4 h-4 text-emerald-400 flex-shrink-0" />;
    case 'html':
      return <FileType className="w-4 h-4 text-orange-500 flex-shrink-0" />;
    case 'css':
      return <Hash className="w-4 h-4 text-blue-400 flex-shrink-0" />;
    case 'json':
      return <FileJson className="w-4 h-4 text-amber-300 flex-shrink-0" />;
    case 'md':
      return <FileText className="w-4 h-4 text-slate-400 flex-shrink-0" />;
    default:
      return <FileText className="w-4 h-4 text-slate-400 flex-shrink-0" />;
  }
}
