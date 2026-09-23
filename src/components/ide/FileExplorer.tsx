import React, { 
  useState, 
  useRef, 
  useMemo, 
  FC, 
  ReactNode, 
  FormEvent, 
  MouseEvent, 
  DragEvent, 
  ChangeEvent 
} from 'react';
import { 
  FilePlus, 
  FolderPlus, 
  ChevronRight, 
  ChevronDown, 
  Trash2, 
  Edit2, 
  Upload, 
  Download,
  FolderArchive,
  Search,
  FileDown,
  FolderUp,
  FileCode,
  FileUp,
  FolderOpen,
  Folder,
  RefreshCw,
  Loader2
} from 'lucide-react';
import { ProjectFile, SupportedLanguage } from '../../types';
import { getFileIcon } from './icons';

interface FileExplorerProps {
  files: ProjectFile[];
  activeFileId: string;
  onSelectFile: (file: ProjectFile) => void;
  onCreateFile: (name: string, isFolder: boolean, parentPath: string) => void;
  onDeleteFile: (fileId: string, path: string) => void;
  onRenameFile: (fileId: string, newName: string, newPath: string) => void;
  onDownloadProject: () => void;
  onDownloadFile?: (file: ProjectFile) => void;
  onUploadFile?: (e: ChangeEvent<HTMLInputElement>) => void;
  onUploadFiles?: (files: FileList | File[]) => void;
  onLoadDemoProject?: () => void;
  roomname: string;
  roomId?: string;
  onRefreshFiles?: () => void;
}

interface TreeNode {
  id: string;
  name: string;
  path: string;
  isFolder: boolean;
  file?: ProjectFile;
  children: Map<string, TreeNode>;
}

export const FileExplorer: FC<FileExplorerProps> = ({
  files,
  activeFileId,
  onSelectFile,
  onCreateFile,
  onDeleteFile,
  onRenameFile,
  onDownloadProject,
  onDownloadFile,
  onUploadFile,
  onUploadFiles,
  onLoadDemoProject,
  roomname,
  roomId,
  onRefreshFiles,
}) => {
  const [openFolders, setOpenFolders] = useState<Record<string, boolean>>({
    '': true,
    'src': true,
    'node_modules': false,
  });

  const [lazyChildren, setLazyChildren] = useState<Record<string, Array<{ name: string; path: string; isFolder: boolean }>>>({});
  const [loadingFolders, setLoadingFolders] = useState<Record<string, boolean>>({});

  const [creatingType, setCreatingType] = useState<'file' | 'folder' | null>(null);
  const [targetFolder, setTargetFolder] = useState<string>('');
  const [newItemName, setNewItemName] = useState('');
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [filterQuery, setFilterQuery] = useState('');
  const [isDraggingOver, setIsDraggingOver] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const zipInputRef = useRef<HTMLInputElement>(null);

  const toggleFolder = async (folderPath: string) => {
    const isCurrentlyOpen = openFolders[folderPath] !== false && openFolders[folderPath] !== undefined;
    const willOpen = !isCurrentlyOpen;
    setOpenFolders((prev) => ({
      ...prev,
      [folderPath]: willOpen,
    }));

    if (willOpen && (folderPath === 'node_modules' || folderPath.startsWith('node_modules/')) && !lazyChildren[folderPath]) {
      setLoadingFolders((prev) => ({ ...prev, [folderPath]: true }));
      try {
        const res = await fetch(`/api/workspace/fs-children?roomId=${encodeURIComponent(roomId || 'default')}&dirPath=${encodeURIComponent(folderPath)}`);
        const data = await res.json();
        if (data && Array.isArray(data.entries)) {
          setLazyChildren((prev) => ({ ...prev, [folderPath]: data.entries }));
        }
      } catch (err) {
        console.error('Failed to load folder children:', err);
      } finally {
        setLoadingFolders((prev) => ({ ...prev, [folderPath]: false }));
      }
    }
  };

  const handleSelectLazyFile = async (item: { name: string; path: string; isFolder: boolean }) => {
    try {
      const res = await fetch(`/api/workspace/file-content?roomId=${encodeURIComponent(roomId || 'default')}&filePath=${encodeURIComponent(item.path)}`);
      const data = await res.json();
      const ext = item.name.split('.').pop()?.toLowerCase() || '';
      let lang: SupportedLanguage = 'plaintext';
      if (ext === 'json') lang = 'json';
      else if (ext === 'js' || ext === 'mjs' || ext === 'cjs') lang = 'javascript';
      else if (ext === 'ts' || ext === 'tsx') lang = 'typescript';
      else if (ext === 'jsx') lang = 'javascript';
      else if (ext === 'html') lang = 'html';
      else if (ext === 'css') lang = 'css';
      else if (ext === 'md') lang = 'markdown';

      const fileObj: ProjectFile = {
        id: `lazy_${item.path.replace(/[^a-zA-Z0-9_-]/g, '_')}`,
        roomId: roomId || 'default',
        name: item.name,
        path: item.path,
        content: data.content || '',
        language: lang,
        isFolder: false,
        parentPath: item.path.split('/').slice(0, -1).join('/'),
        version: 1,
        updatedAt: new Date().toISOString(),
      };
      onSelectFile(fileObj);
    } catch (err) {
      console.error('Failed to load file content:', err);
    }
  };

  const handleStartCreate = (type: 'file' | 'folder', parent = '') => {
    setCreatingType(type);
    setTargetFolder(parent);
    setNewItemName('');
    if (parent) {
      setOpenFolders((prev) => ({ ...prev, [parent]: true }));
    }
  };

  const handleFinishCreate = (e: FormEvent) => {
    e.preventDefault();
    if (!newItemName.trim()) {
      setCreatingType(null);
      return;
    }
    const cleanName = newItemName.trim();
    onCreateFile(cleanName, creatingType === 'folder', targetFolder);
    setCreatingType(null);
    setNewItemName('');
  };

  const handleStartRename = (file: ProjectFile, e: MouseEvent) => {
    e.stopPropagation();
    setRenamingId(file.id);
    setRenameValue(file.name);
  };

  const handleFinishRename = (file: ProjectFile, e: FormEvent) => {
    e.preventDefault();
    if (!renameValue.trim() || renameValue.trim() === file.name) {
      setRenamingId(null);
      return;
    }
    const newName = renameValue.trim();
    const parts = file.path.split('/');
    parts[parts.length - 1] = newName;
    const newPath = parts.join('/');
    onRenameFile(file.id, newName, newPath);
    setRenamingId(null);
  };

  const handleDelete = (file: ProjectFile, e: MouseEvent) => {
    e.stopPropagation();
    if (window.confirm(`Are you sure you want to delete "${file.path}"?`)) {
      onDeleteFile(file.id, file.path);
    }
  };

  const handleDragOver = (e: DragEvent) => {
    e.preventDefault();
    setIsDraggingOver(true);
  };

  const handleDragLeave = (e: DragEvent) => {
    e.preventDefault();
    setIsDraggingOver(false);
  };

  const handleDrop = (e: DragEvent) => {
    e.preventDefault();
    setIsDraggingOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      if (onUploadFiles) {
        onUploadFiles(e.dataTransfer.files);
      } else if (onUploadFile) {
        const dummyEvent = {
          target: { files: e.dataTransfer.files },
        } as unknown as ChangeEvent<HTMLInputElement>;
        onUploadFile(dummyEvent);
      }
    }
  };

  // Build true hierarchical tree from files
  const fileTree = useMemo(() => {
    const root: TreeNode = {
      id: '__root__',
      name: 'root',
      path: '',
      isFolder: true,
      children: new Map(),
    };

    const q = filterQuery.trim().toLowerCase();

    // 1. First add explicit folders
    files.forEach((file) => {
      const parts = file.path.split('/').filter(Boolean);
      if (file.isFolder) {
        let current = root;
        let accPath = '';
        for (let i = 0; i < parts.length; i++) {
          const part = parts[i];
          accPath = accPath ? `${accPath}/${part}` : part;
          if (!current.children.has(part)) {
            current.children.set(part, {
              id: `folder_${accPath}`,
              name: part,
              path: accPath,
              isFolder: true,
              children: new Map(),
            });
          }
          current = current.children.get(part)!;
        }
      }
    });

    // 2. Add files and synthesize intermediate folders if missing
    files.forEach((file) => {
      if (file.isFolder) return;
      if (q && !file.name.toLowerCase().includes(q) && !file.path.toLowerCase().includes(q)) {
        return;
      }

      const parts = file.path.split('/').filter(Boolean);
      let current = root;
      let accPath = '';

      for (let i = 0; i < parts.length - 1; i++) {
        const part = parts[i];
        accPath = accPath ? `${accPath}/${part}` : part;
        if (!current.children.has(part)) {
          current.children.set(part, {
            id: `folder_${accPath}`,
            name: part,
            path: accPath,
            isFolder: true,
            children: new Map(),
          });
        }
        current = current.children.get(part)!;
      }

      const fileName = parts[parts.length - 1] || file.name;
      current.children.set(fileName, {
        id: file.id,
        name: fileName,
        path: file.path,
        isFolder: false,
        file,
        children: new Map(),
      });
    });

    return root;
  }, [files, filterQuery]);

  // Render a tree node recursively
  const renderNode = (node: TreeNode, depth = 0): ReactNode => {
    // Sort children: folders first, then files alphabetically
    const childrenArray = Array.from(node.children.values()).sort((a, b) => {
      if (a.isFolder && !b.isFolder) return -1;
      if (!a.isFolder && b.isFolder) return 1;
      return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
    });

    return (
      <div key={node.path || '__root__'}>
        {node.path && node.isFolder && (
          <div>
            <div
              onClick={() => toggleFolder(node.path)}
              style={{ paddingLeft: `${depth * 12 + 6}px` }}
              className="flex items-center justify-between py-1 pr-2 rounded cursor-pointer hover:bg-slate-800/60 text-slate-300 font-medium group text-xs transition-colors"
            >
              <div className="flex items-center space-x-1.5 truncate">
                {openFolders[node.path] !== false ? (
                  <ChevronDown className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                ) : (
                  <ChevronRight className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                )}
                {openFolders[node.path] !== false ? (
                  <FolderOpen className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
                ) : (
                  <Folder className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
                )}
                <span className="truncate">{node.name}</span>
              </div>

              <div className="opacity-0 group-hover:opacity-100 flex items-center space-x-1 flex-shrink-0">
                <button
                  title={`New File inside ${node.name}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleStartCreate('file', node.path);
                  }}
                  className="p-0.5 text-slate-400 hover:text-slate-200"
                >
                  <FilePlus className="w-3 h-3" />
                </button>
                <button
                  title={`New Folder inside ${node.name}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleStartCreate('folder', node.path);
                  }}
                  className="p-0.5 text-slate-400 hover:text-slate-200"
                >
                  <FolderPlus className="w-3 h-3" />
                </button>
              </div>
            </div>

            {/* Inline creation form inside this folder */}
            {creatingType && targetFolder === node.path && (
              <form
                onSubmit={handleFinishCreate}
                style={{ marginLeft: `${(depth + 1) * 12 + 6}px` }}
                className="flex items-center mr-2 px-2 py-1 bg-slate-950 rounded border border-cyan-500/60 my-0.5"
              >
                {creatingType === 'folder' ? (
                  <FolderPlus className="w-3.5 h-3.5 text-amber-400 mr-1.5 flex-shrink-0" />
                ) : (
                  <FilePlus className="w-3.5 h-3.5 text-cyan-400 mr-1.5 flex-shrink-0" />
                )}
                <input
                  autoFocus
                  type="text"
                  placeholder={creatingType === 'folder' ? 'Folder name...' : 'Filename...'}
                  value={newItemName}
                  onChange={(e) => setNewItemName(e.target.value)}
                  onBlur={() => setCreatingType(null)}
                  className="flex-1 bg-transparent text-xs text-slate-100 focus:outline-none"
                />
              </form>
            )}
          </div>
        )}

        {/* Render Folder Children if folder is open or root */}
        {(!node.path || openFolders[node.path] !== false) && (
          <div className={node.path ? 'border-l border-slate-800/60 ml-2' : ''}>
            {/* Lazy children rendering for node_modules and its subfolders */}
            {(node.path === 'node_modules' || node.path.startsWith('node_modules/')) && (
              <>
                {loadingFolders[node.path] && (
                  <div
                    style={{ paddingLeft: `${(depth + 1) * 12 + 6}px` }}
                    className="flex items-center space-x-1.5 py-1 text-[11px] text-slate-500 italic"
                  >
                    <Loader2 className="w-3 h-3 animate-spin text-cyan-400" />
                    <span>Loading packages...</span>
                  </div>
                )}
                {lazyChildren[node.path] && lazyChildren[node.path].length === 0 && !loadingFolders[node.path] && (
                  <div
                    style={{ paddingLeft: `${(depth + 1) * 12 + 6}px` }}
                    className="py-1 text-[11px] text-slate-500 italic"
                  >
                    (empty directory)
                  </div>
                )}
                {lazyChildren[node.path] &&
                  lazyChildren[node.path].map((item) => {
                    if (item.isFolder) {
                      const isChildOpen = openFolders[item.path] !== false && openFolders[item.path] !== undefined;
                      return (
                        <div key={item.path}>
                          <div
                            onClick={() => toggleFolder(item.path)}
                            style={{ paddingLeft: `${(depth + 1) * 12 + 6}px` }}
                            className="flex items-center justify-between py-1 pr-2 rounded cursor-pointer hover:bg-slate-800/60 text-slate-300 font-medium text-xs transition-colors"
                          >
                            <div className="flex items-center space-x-1.5 truncate">
                              {isChildOpen ? (
                                <ChevronDown className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                              ) : (
                                <ChevronRight className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                              )}
                              {isChildOpen ? (
                                <FolderOpen className="w-3.5 h-3.5 text-amber-400/80 flex-shrink-0" />
                              ) : (
                                <Folder className="w-3.5 h-3.5 text-amber-400/80 flex-shrink-0" />
                              )}
                              <span className="truncate">{item.name}</span>
                            </div>
                          </div>
                          {/* Recursively show sub-children if open */}
                          {isChildOpen && (
                            <div className="border-l border-slate-800/60 ml-2">
                              {loadingFolders[item.path] && (
                                <div
                                  style={{ paddingLeft: `${(depth + 2) * 12 + 6}px` }}
                                  className="flex items-center space-x-1.5 py-1 text-[11px] text-slate-500 italic"
                                >
                                  <Loader2 className="w-3 h-3 animate-spin text-cyan-400" />
                                  <span>Loading...</span>
                                </div>
                              )}
                              {lazyChildren[item.path] &&
                                lazyChildren[item.path].map((subItem) => (
                                  <div
                                    key={subItem.path}
                                    onClick={() => {
                                      if (subItem.isFolder) {
                                        toggleFolder(subItem.path);
                                      } else {
                                        handleSelectLazyFile(subItem);
                                      }
                                    }}
                                    style={{ paddingLeft: `${(depth + 2) * 12 + 6}px` }}
                                    className="flex items-center justify-between py-1 pr-2 rounded cursor-pointer hover:bg-slate-800/60 text-slate-300 text-xs transition-colors"
                                  >
                                    <div className="flex items-center space-x-1.5 truncate">
                                      {subItem.isFolder ? (
                                        <Folder className="w-3.5 h-3.5 text-amber-400/70 flex-shrink-0" />
                                      ) : (
                                        getFileIcon(subItem.name, false)
                                      )}
                                      <span className="truncate">{subItem.name}</span>
                                    </div>
                                  </div>
                                ))}
                            </div>
                          )}
                        </div>
                      );
                    } else {
                      return (
                        <div
                          key={item.path}
                          onClick={() => handleSelectLazyFile(item)}
                          style={{ paddingLeft: `${(depth + 1) * 12 + 6}px` }}
                          className="flex items-center justify-between py-1 pr-2 rounded cursor-pointer hover:bg-slate-800/60 text-slate-300 text-xs transition-colors"
                        >
                          <div className="flex items-center space-x-1.5 truncate">
                            {getFileIcon(item.name, false)}
                            <span className="truncate">{item.name}</span>
                          </div>
                        </div>
                      );
                    }
                  })}
              </>
            )}

            {/* Standard non-lazy children */}
            {!(node.path === 'node_modules' || node.path.startsWith('node_modules/')) &&
              childrenArray.map((child) => {
                if (child.isFolder) {
                  return renderNode(child, depth + 1);
                }

                const file = child.file!;
                return (
                  <FileTreeItem
                    key={child.path}
                    file={file}
                    depth={depth + 1}
                    isActive={activeFileId === file.id}
                    isRenaming={renamingId === file.id}
                    renameValue={renameValue}
                    onRenameChange={setRenameValue}
                    onRenameSubmit={(e) => handleFinishRename(file, e)}
                    onRenameCancel={() => setRenamingId(null)}
                    onSelect={() => onSelectFile(file)}
                    onStartRename={(e) => handleStartRename(file, e)}
                    onDelete={(e) => handleDelete(file, e)}
                    onDownloadFile={onDownloadFile}
                  />
                );
              })}
          </div>
        )}
      </div>
    );
  };

  const nonFolderFilesCount = files.filter((f) => !f.isFolder).length;

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={`flex flex-col h-full bg-slate-900/95 text-slate-300 select-none text-xs relative ${
        isDraggingOver ? 'ring-2 ring-inset ring-cyan-500 bg-cyan-950/20' : ''
      }`}
    >
      {/* Hidden File / Folder / ZIP Inputs */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files && onUploadFiles) {
            onUploadFiles(e.target.files);
          } else if (onUploadFile) {
            onUploadFile(e);
          }
          e.target.value = '';
        }}
      />
      <input
        ref={folderInputRef}
        type="file"
        // @ts-ignore
        webkitdirectory="true"
        directory="true"
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files && onUploadFiles) {
            onUploadFiles(e.target.files);
          }
          e.target.value = '';
        }}
      />
      <input
        ref={zipInputRef}
        type="file"
        accept=".zip"
        className="hidden"
        onChange={(e) => {
          if (e.target.files && onUploadFiles) {
            onUploadFiles(e.target.files);
          }
          e.target.value = '';
        }}
      />

      {/* Drag overlay notice */}
      {isDraggingOver && (
        <div className="absolute inset-0 bg-slate-950/90 backdrop-blur-xs z-50 flex flex-col items-center justify-center p-4 text-center border-2 border-dashed border-cyan-400">
          <Upload className="w-10 h-10 text-cyan-400 animate-bounce mb-2" />
          <div className="font-bold text-slate-200 text-sm">Drop Files or ZIP Here</div>
          <div className="text-slate-400 text-[11px] mt-1">
            Replaces workspace with imported project
          </div>
        </div>
      )}

      {/* Header bar */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-slate-800 text-[11px] font-bold uppercase tracking-wider text-slate-400">
        <span className="flex items-center gap-1.5 text-cyan-400">
          <FileCode className="w-3.5 h-3.5" /> EXPLORER
        </span>

        {/* Quick action buttons */}
        <div className="flex items-center space-x-1">
          <button
            title="Refresh Explorer (Sync with Disk)"
            onClick={() => {
              if (onRefreshFiles) onRefreshFiles();
              setLazyChildren({});
            }}
            className="p-1 hover:bg-slate-800 text-slate-400 hover:text-slate-200 rounded transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
          <button
            title="New File in Root"
            onClick={() => handleStartCreate('file', '')}
            className="p-1 hover:bg-slate-800 text-slate-400 hover:text-slate-200 rounded transition-colors"
          >
            <FilePlus className="w-3.5 h-3.5" />
          </button>
          <button
            title="New Folder in Root"
            onClick={() => handleStartCreate('folder', '')}
            className="p-1 hover:bg-slate-800 text-slate-400 hover:text-slate-200 rounded transition-colors"
          >
            <FolderPlus className="w-3.5 h-3.5" />
          </button>
          <button
            title="Upload Files"
            onClick={() => fileInputRef.current?.click()}
            className="p-1 hover:bg-slate-800 text-slate-400 hover:text-slate-200 rounded transition-colors"
          >
            <FileUp className="w-3.5 h-3.5" />
          </button>
          <button
            title="Import Project Folder"
            onClick={() => folderInputRef.current?.click()}
            className="p-1 hover:bg-slate-800 text-slate-400 hover:text-slate-200 rounded transition-colors"
          >
            <FolderUp className="w-3.5 h-3.5" />
          </button>
          <button
            title="Import Project ZIP (.zip)"
            onClick={() => zipInputRef.current?.click()}
            className="p-1 hover:bg-slate-800 text-slate-400 hover:text-slate-200 rounded transition-colors"
          >
            <FolderArchive className="w-3.5 h-3.5" />
          </button>
          <button
            title="Export Entire Workspace (.zip)"
            onClick={onDownloadProject}
            className="p-1 hover:bg-slate-800 text-cyan-400 hover:text-cyan-300 rounded transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Filter / Search input */}
      <div className="p-2 border-b border-slate-800/80 bg-slate-950/40">
        <div className="relative flex items-center">
          <Search className="w-3.5 h-3.5 absolute left-2 text-slate-500" />
          <input
            type="text"
            placeholder="Filter files..."
            value={filterQuery}
            onChange={(e) => setFilterQuery(e.target.value)}
            className="w-full bg-slate-900 border border-slate-800 rounded pl-7 pr-2 py-1 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500/70"
          />
          {filterQuery && (
            <button
              onClick={() => setFilterQuery('')}
              className="absolute right-2 text-slate-500 hover:text-slate-300 text-[10px]"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Project Root Folder Label */}
      <div className="px-3 py-1.5 flex items-center justify-between text-[11px] font-semibold text-slate-400 bg-slate-800/30 border-b border-slate-800/50">
        <span className="truncate max-w-[170px] uppercase font-mono tracking-wider text-slate-300">
          📁 {roomname || 'CODE DEATH'}
        </span>
        <span className="text-[10px] text-slate-400 font-mono">
          {nonFolderFilesCount} {nonFolderFilesCount === 1 ? 'file' : 'files'}
        </span>
      </div>

      {/* File Tree List */}
      <div className="flex-1 overflow-y-auto p-1.5 space-y-0.5">
        {/* Inline Create Input (Root) */}
        {creatingType && !targetFolder && (
          <form
            onSubmit={handleFinishCreate}
            className="flex items-center px-2 py-1 bg-slate-950 rounded border border-cyan-500/60 my-1"
          >
            {creatingType === 'folder' ? (
              <FolderPlus className="w-3.5 h-3.5 text-amber-400 mr-1.5 flex-shrink-0" />
            ) : (
              <FilePlus className="w-3.5 h-3.5 text-cyan-400 mr-1.5 flex-shrink-0" />
            )}
            <input
              autoFocus
              type="text"
              placeholder={creatingType === 'folder' ? 'Folder name...' : 'Filename (e.g. main.js)...'}
              value={newItemName}
              onChange={(e) => setNewItemName(e.target.value)}
              onBlur={() => setCreatingType(null)}
              className="flex-1 bg-transparent text-xs text-slate-100 focus:outline-none"
            />
          </form>
        )}

        {nonFolderFilesCount === 0 && !creatingType ? (
          <div className="p-6 text-center text-slate-500 text-xs space-y-3">
            <div className="font-medium text-slate-400">Workspace is empty</div>
            <div className="text-[11px] text-slate-500 leading-relaxed">
              Import your project ZIP or folder, or load the demo project.
            </div>
            <div className="flex flex-col gap-2 pt-2">
              <button
                onClick={() => zipInputRef.current?.click()}
                className="w-full py-1.5 px-3 bg-cyan-600 hover:bg-cyan-500 text-white rounded text-xs font-medium flex items-center justify-center gap-1.5 transition-colors"
              >
                <FolderArchive className="w-3.5 h-3.5" />
                Import Project (.zip)
              </button>
              {onLoadDemoProject && (
                <button
                  onClick={onLoadDemoProject}
                  className="w-full py-1.5 px-3 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-xs transition-colors"
                >
                  Load Demo Project
                </button>
              )}
            </div>
          </div>
        ) : (
          renderNode(fileTree)
        )}
      </div>

      {/* Bottom Summary Bar */}
      <div className="p-2 border-t border-slate-800 bg-slate-950/60 flex items-center justify-between text-[11px] text-slate-400">
        <span className="flex items-center gap-1">
          <Download className="w-3 h-3 text-cyan-400" />
          <button
            onClick={onDownloadProject}
            className="hover:text-cyan-300 underline font-medium text-slate-300 cursor-pointer"
          >
            Export as .ZIP
          </button>
        </span>
        {onLoadDemoProject && (
          <button
            onClick={onLoadDemoProject}
            title="Switch back to demo sample workspace"
            className="text-[10px] text-slate-500 hover:text-slate-300 transition-colors"
          >
            Load Demo
          </button>
        )}
      </div>
    </div>
  );
};

interface FileTreeItemProps {
  file: ProjectFile;
  depth: number;
  isActive: boolean;
  isRenaming: boolean;
  renameValue: string;
  onRenameChange: (val: string) => void;
  onRenameSubmit: (e: FormEvent) => void;
  onRenameCancel: () => void;
  onSelect: () => void;
  onStartRename: (e: MouseEvent) => void;
  onDelete: (e: MouseEvent) => void;
  onDownloadFile?: (file: ProjectFile) => void;
}

const FileTreeItem: FC<FileTreeItemProps> = ({
  file,
  depth,
  isActive,
  isRenaming,
  renameValue,
  onRenameChange,
  onRenameSubmit,
  onRenameCancel,
  onSelect,
  onStartRename,
  onDelete,
  onDownloadFile,
}) => {
  if (isRenaming) {
    return (
      <form
        onSubmit={onRenameSubmit}
        style={{ paddingLeft: `${depth * 12 + 6}px` }}
        className="flex items-center py-1 pr-2 bg-slate-950 rounded border border-cyan-500/60 my-0.5"
      >
        {getFileIcon(file.name, file.isFolder)}
        <input
          autoFocus
          type="text"
          value={renameValue}
          onChange={(e) => onRenameChange(e.target.value)}
          onBlur={onRenameCancel}
          className="ml-2 flex-1 bg-transparent text-xs text-slate-100 focus:outline-none"
        />
      </form>
    );
  }

  return (
    <div
      onClick={onSelect}
      style={{ paddingLeft: `${depth * 12 + 6}px` }}
      className={`flex items-center justify-between py-1 pr-2 rounded cursor-pointer group text-xs transition-colors select-none ${
        isActive
          ? 'bg-cyan-950/40 text-cyan-300 border-l-2 border-cyan-400 font-semibold'
          : 'text-slate-300 hover:bg-slate-800/60 hover:text-slate-100'
      }`}
    >
      <div className="flex items-center space-x-1.5 truncate">
        {getFileIcon(file.name, file.isFolder)}
        <span className="truncate">{file.name}</span>
      </div>

      <div className="opacity-0 group-hover:opacity-100 flex items-center space-x-1 flex-shrink-0">
        {onDownloadFile && (
          <button
            title="Download File"
            onClick={(e) => {
              e.stopPropagation();
              onDownloadFile(file);
            }}
            className="p-0.5 text-slate-400 hover:text-cyan-400"
          >
            <FileDown className="w-3 h-3" />
          </button>
        )}
        <button
          title="Rename File"
          onClick={onStartRename}
          className="p-0.5 text-slate-400 hover:text-slate-200"
        >
          <Edit2 className="w-3 h-3" />
        </button>
        <button
          title="Delete File"
          onClick={onDelete}
          className="p-0.5 text-slate-400 hover:text-rose-400"
        >
          <Trash2 className="w-3 h-3" />
        </button>
      </div>
    </div>
  );
};
