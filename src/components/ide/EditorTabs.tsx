import React, { FC, MouseEvent } from 'react';
import { X, Circle } from 'lucide-react';
import { EditorTab } from '../../types';
import { getFileIcon } from './icons';

interface EditorTabsProps {
  tabs: EditorTab[];
  activeFileId: string;
  onSelectTab: (fileId: string) => void;
  onCloseTab: (fileId: string, e: MouseEvent) => void;
}

export const EditorTabs: FC<EditorTabsProps> = ({
  tabs,
  activeFileId,
  onSelectTab,
  onCloseTab,
}) => {
  if (tabs.length === 0) return null;

  return (
    <div 
      className="flex items-center bg-slate-950 border-b border-slate-800/90 overflow-x-auto select-none no-scrollbar h-9"
      role="tablist"
    >
      {tabs.map((tab) => {
        const isActive = tab.fileId === activeFileId;
        return (
          <div
            key={tab.fileId}
            role="tab"
            aria-selected={isActive}
            onClick={() => onSelectTab(tab.fileId)}
            className={`flex items-center h-full px-3 space-x-2 border-r border-slate-800/80 cursor-pointer text-xs transition-colors group relative ${
              isActive
                ? 'bg-slate-900 text-slate-100 font-medium border-t-2 border-t-sky-400'
                : 'bg-slate-950/60 text-slate-400 hover:bg-slate-900/60 hover:text-slate-200'
            }`}
          >
            {getFileIcon(tab.name)}
            <span className="truncate max-w-[130px]">{tab.name}</span>

            {/* Dirty Indicator / Close Button */}
            <div className="flex items-center justify-center w-4 h-4 ml-1">
              {tab.isDirty ? (
                <button
                  title="Unsaved changes - Click to close"
                  onClick={(e) => onCloseTab(tab.fileId, e)}
                  className="group-hover:hidden flex items-center justify-center text-sky-400"
                >
                  <Circle className="w-2 h-2 fill-sky-400 text-sky-400" />
                </button>
              ) : null}

              <button
                title="Close Tab"
                onClick={(e) => onCloseTab(tab.fileId, e)}
                className={`rounded p-0.5 hover:bg-slate-800 hover:text-slate-200 text-slate-400 transition-opacity ${
                  tab.isDirty ? 'hidden group-hover:flex' : 'opacity-0 group-hover:opacity-100'
                }`}
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
};
