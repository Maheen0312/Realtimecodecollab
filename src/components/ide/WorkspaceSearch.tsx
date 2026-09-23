import React, { useState, useMemo, FC } from 'react';
import { Search, ChevronDown, ChevronRight, FileCode } from 'lucide-react';
import { ProjectFile } from '../../types';
import { getFileIcon } from './icons';

interface WorkspaceSearchProps {
  files: ProjectFile[];
  onSelectFileAtLine: (file: ProjectFile, line: number) => void;
}

interface SearchMatch {
  file: ProjectFile;
  line: number;
  text: string;
}

export const WorkspaceSearch: FC<WorkspaceSearchProps> = ({
  files,
  onSelectFileAtLine,
}) => {
  const [query, setQuery] = useState('');
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [collapsedFiles, setCollapsedFiles] = useState<Record<string, boolean>>({});

  const matchesByFile = useMemo(() => {
    if (!query.trim()) return [];

    const results: { file: ProjectFile; matches: SearchMatch[] }[] = [];
    const q = caseSensitive ? query : query.toLowerCase();

    files.filter(f => !f.isFolder).forEach(file => {
      const fileMatches: SearchMatch[] = [];
      const lines = file.content.split('\n');

      lines.forEach((lineText, idx) => {
        const target = caseSensitive ? lineText : lineText.toLowerCase();
        if (target.includes(q)) {
          fileMatches.push({
            file,
            line: idx + 1,
            text: lineText.trim(),
          });
        }
      });

      if (fileMatches.length > 0) {
        results.push({ file, matches: fileMatches });
      }
    });

    return results;
  }, [files, query, caseSensitive]);

  const totalMatches = matchesByFile.reduce((acc, curr) => acc + curr.matches.length, 0);

  const toggleCollapse = (fileId: string) => {
    setCollapsedFiles(prev => ({ ...prev, [fileId]: !prev[fileId] }));
  };

  return (
    <div className="flex flex-col h-full bg-slate-900/95 text-slate-300 select-none border-r border-slate-800 text-xs">
      <div className="p-3 border-b border-slate-800 space-y-2">
        <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block">
          SEARCH IN WORKSPACE
        </span>

        <div className="relative flex items-center">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search all files..."
            className="w-full pl-3 pr-8 py-1.5 bg-slate-950/80 border border-slate-800 rounded text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-sky-500"
          />
          <button
            title="Match Case"
            onClick={() => setCaseSensitive(!caseSensitive)}
            className={`absolute right-2 px-1 py-0.5 rounded font-mono text-[10px] ${
              caseSensitive ? 'bg-sky-500/20 text-sky-400 border border-sky-500/40' : 'text-slate-500 hover:text-slate-300'
            }`}
          >
            Aa
          </button>
        </div>

        {query && (
          <div className="text-[11px] text-slate-400">
            {totalMatches} {totalMatches === 1 ? 'result' : 'results'} in {matchesByFile.length} {matchesByFile.length === 1 ? 'file' : 'files'}
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-2">
        {query && matchesByFile.length === 0 && (
          <div className="text-center py-6 text-slate-500">No results found.</div>
        )}

        {matchesByFile.map(({ file, matches }) => {
          const isCollapsed = collapsedFiles[file.id];
          return (
            <div key={file.id} className="rounded bg-slate-950/40 border border-slate-800/80 overflow-hidden">
              <div
                onClick={() => toggleCollapse(file.id)}
                className="flex items-center justify-between px-2.5 py-1.5 hover:bg-slate-800/60 cursor-pointer font-medium text-slate-200"
              >
                <div className="flex items-center space-x-1.5 truncate">
                  {isCollapsed ? <ChevronRight className="w-3.5 h-3.5 text-slate-500" /> : <ChevronDown className="w-3.5 h-3.5 text-slate-500" />}
                  {getFileIcon(file.name)}
                  <span className="truncate">{file.path}</span>
                </div>
                <span className="text-[10px] bg-slate-800 px-1.5 py-0.5 rounded text-slate-400">
                  {matches.length}
                </span>
              </div>

              {!isCollapsed && (
                <div className="divide-y divide-slate-800/40 border-t border-slate-800/40">
                  {matches.map((m, idx) => (
                    <div
                      key={idx}
                      onClick={() => onSelectFileAtLine(file, m.line)}
                      className="px-4 py-1 hover:bg-sky-500/10 hover:text-sky-300 cursor-pointer flex items-center space-x-2 text-[11px] font-mono text-slate-400"
                    >
                      <span className="text-slate-600 w-6 text-right flex-shrink-0">{m.line}:</span>
                      <span className="truncate text-slate-300">{m.text}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
