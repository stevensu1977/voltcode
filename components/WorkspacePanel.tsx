import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Play, Terminal as TerminalIcon, RotateCw, Globe, Monitor, Smartphone, FolderOpen, File, Folder, ChevronRight, ChevronDown, RefreshCw, X, Plus, Trash2, Edit3, FilePlus, FolderPlus, Image, ZoomIn, ZoomOut, GitBranch, GitCommit as GitCommitIcon, Send, Sparkles } from 'lucide-react';
import { Tab, FileItem, TerminalInstance } from '../types';
import { invoke } from '@tauri-apps/api/core';

// Check if file is an image
const isImageFile = (fileName: string): boolean => {
  const ext = fileName.split('.').pop()?.toLowerCase();
  return ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'ico', 'bmp'].includes(ext || '');
};

// Image Preview Component
interface ImagePreviewProps {
  filePath: string;
}

const ImagePreview: React.FC<ImagePreviewProps> = ({ filePath }) => {
  const [zoom, setZoom] = useState(100);
  const [imageSrc, setImageSrc] = useState<string>('');
  const [imageInfo, setImageInfo] = useState<{ width: number; height: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const loadImage = async () => {
      setLoading(true);
      setError(null);
      setZoom(100);

      try {
        const ext = filePath.split('.').pop()?.toLowerCase() || '';

        // 统一使用 read_file_bytes 读取所有图片
        const bytes = await invoke<number[]>('read_file_bytes', { filePath });
        const uint8Array = new Uint8Array(bytes);

        // 根据扩展名确定 MIME 类型
        let mimeType: string;
        switch (ext) {
          case 'svg':
            mimeType = 'image/svg+xml';
            break;
          case 'jpg':
          case 'jpeg':
            mimeType = 'image/jpeg';
            break;
          case 'png':
            mimeType = 'image/png';
            break;
          case 'gif':
            mimeType = 'image/gif';
            break;
          case 'webp':
            mimeType = 'image/webp';
            break;
          case 'ico':
            mimeType = 'image/x-icon';
            break;
          case 'bmp':
            mimeType = 'image/bmp';
            break;
          default:
            mimeType = 'image/png';
        }

        const blob = new Blob([uint8Array], { type: mimeType });
        const url = URL.createObjectURL(blob);
        setImageSrc(url);
      } catch (err) {
        console.error('Failed to load image:', err);
        setError(`Failed to load image: ${err}`);
      } finally {
        setLoading(false);
      }
    };

    loadImage();

    // Cleanup blob URL on unmount or path change
    return () => {
      if (imageSrc && imageSrc.startsWith('blob:')) {
        URL.revokeObjectURL(imageSrc);
      }
    };
  }, [filePath]);

  const handleImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    setImageInfo({ width: img.naturalWidth, height: img.naturalHeight });
  };

  const handleImageError = () => {
    setError('Failed to load image');
  };

  const handleZoomIn = () => setZoom(prev => Math.min(prev + 25, 400));
  const handleZoomOut = () => setZoom(prev => Math.max(prev - 25, 25));
  const handleZoomReset = () => setZoom(100);

  // Handle mouse wheel zoom
  const handleWheel = (e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      if (e.deltaY < 0) {
        handleZoomIn();
      } else {
        handleZoomOut();
      }
    }
  };

  if (error) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-500">
        <div className="text-center">
          <Image size={48} className="mx-auto mb-4 opacity-50" />
          <p className="text-sm">{error}</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-500">
        <div className="text-center">
          <RefreshCw size={24} className="mx-auto mb-4 animate-spin" />
          <p className="text-sm">Loading image...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Zoom Controls */}
      <div className="flex items-center justify-between px-4 py-2 bg-ide-panel border-b border-ide-border">
        <div className="flex items-center gap-2">
          <button
            onClick={handleZoomOut}
            className="p-1 hover:bg-white/10 rounded text-gray-400 hover:text-gray-200"
            title="Zoom Out"
          >
            <ZoomOut size={14} />
          </button>
          <button
            onClick={handleZoomReset}
            className="px-2 py-0.5 text-xs text-gray-400 hover:text-gray-200 hover:bg-white/10 rounded min-w-[50px]"
            title="Reset Zoom"
          >
            {zoom}%
          </button>
          <button
            onClick={handleZoomIn}
            className="p-1 hover:bg-white/10 rounded text-gray-400 hover:text-gray-200"
            title="Zoom In"
          >
            <ZoomIn size={14} />
          </button>
        </div>
        {imageInfo && (
          <div className="text-xs text-gray-500">
            {imageInfo.width} × {imageInfo.height} px
          </div>
        )}
      </div>

      {/* Image Container */}
      <div
        ref={containerRef}
        className="flex-1 overflow-auto p-4 flex items-center justify-center"
        onWheel={handleWheel}
        style={{
          background: 'repeating-conic-gradient(#1a1a2e 0% 25%, #16162a 0% 50%) 50% / 20px 20px'
        }}
      >
        {imageSrc && (
          <img
            src={imageSrc}
            alt={filePath.split('/').pop()}
            onLoad={handleImageLoad}
            onError={handleImageError}
            className="max-w-none transition-transform duration-150"
            style={{
              transform: `scale(${zoom / 100})`,
              transformOrigin: 'center center',
            }}
            draggable={false}
          />
        )}
      </div>
    </div>
  );
};
import { listen, UnlistenFn } from '@tauri-apps/api/event';
import XTerminal, { XTerminalHandle } from './XTerminal';

// Helper function to format file sizes
const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${Math.round(bytes / Math.pow(k, i) * 10) / 10} ${sizes[i]}`;
};

// Get file icon color based on extension
const getFileIconColor = (fileName: string) => {
  const ext = fileName.split('.').pop()?.toLowerCase();
  const iconColors: Record<string, string> = {
    ts: 'text-blue-400',
    tsx: 'text-blue-400',
    js: 'text-yellow-400',
    jsx: 'text-yellow-400',
    json: 'text-yellow-600',
    md: 'text-gray-400',
    css: 'text-pink-400',
    scss: 'text-pink-400',
    html: 'text-orange-400',
    rs: 'text-orange-500',
    toml: 'text-gray-500',
    lock: 'text-gray-600',
    gitignore: 'text-gray-600',
    py: 'text-green-400',
    go: 'text-cyan-400',
    svg: 'text-orange-300',
    png: 'text-purple-400',
    jpg: 'text-purple-400',
    ico: 'text-purple-400',
  };
  return iconColors[ext || ''] || 'text-gray-400';
};

// Context menu component
interface ContextMenuProps {
  x: number;
  y: number;
  file: FileItem | null;
  onClose: () => void;
  onNewFile: () => void;
  onNewFolder: () => void;
  onRename: () => void;
  onDelete: () => void;
}

const ContextMenu: React.FC<ContextMenuProps> = ({
  x, y, file, onClose, onNewFile, onNewFolder, onRename, onDelete
}) => {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  return (
    <div
      ref={menuRef}
      className="fixed bg-gray-800 border border-gray-700 rounded-md shadow-xl py-1 z-50 min-w-[160px]"
      style={{ left: x, top: y }}
    >
      <button
        onClick={onNewFile}
        className="w-full px-3 py-1.5 text-left text-xs text-gray-300 hover:bg-gray-700 flex items-center gap-2"
      >
        <FilePlus size={14} /> New File
      </button>
      <button
        onClick={onNewFolder}
        className="w-full px-3 py-1.5 text-left text-xs text-gray-300 hover:bg-gray-700 flex items-center gap-2"
      >
        <FolderPlus size={14} /> New Folder
      </button>
      {file && (
        <>
          <div className="border-t border-gray-700 my-1" />
          <button
            onClick={onRename}
            className="w-full px-3 py-1.5 text-left text-xs text-gray-300 hover:bg-gray-700 flex items-center gap-2"
          >
            <Edit3 size={14} /> Rename
          </button>
          <button
            onClick={onDelete}
            className="w-full px-3 py-1.5 text-left text-xs text-red-400 hover:bg-gray-700 flex items-center gap-2"
          >
            <Trash2 size={14} /> Delete
          </button>
        </>
      )}
    </div>
  );
};

// New item input component (for creating new files/folders inline)
interface NewItemInputProps {
  type: 'file' | 'folder';
  name: string;
  level?: number;
  onNameChange: (name: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
}

const NewItemInput: React.FC<NewItemInputProps> = ({
  type,
  name,
  level = 0,
  onNameChange,
  onSubmit,
  onCancel
}) => {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      onSubmit();
    } else if (e.key === 'Escape') {
      onCancel();
    }
  };

  return (
    <div
      className="flex items-center gap-1 px-2 py-1 rounded-md bg-blue-500/10"
      style={{ paddingLeft: `${level * 12 + 8}px` }}
    >
      <span className="w-3" />
      {type === 'folder' ? (
        <Folder size={14} className="text-yellow-500 flex-shrink-0" />
      ) : (
        <File size={14} className="text-gray-400 flex-shrink-0" />
      )}
      <input
        ref={inputRef}
        type="text"
        value={name}
        onChange={(e) => onNameChange(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={onCancel}
        className="flex-1 bg-gray-800 border border-blue-500 rounded px-1 text-xs text-white outline-none"
      />
    </div>
  );
};

// File tree item component
interface FileTreeItemProps {
  file: FileItem;
  level: number;
  selectedFile: string | null;
  expandedDirs: Set<string>;
  editingPath: string | null;
  editingName: string;
  isCreatingNew?: { type: 'file' | 'folder'; parentPath: string } | null;
  onToggleDir: (path: string) => void;
  onSelectFile: (path: string) => void;
  onLoadChildren: (path: string) => Promise<FileItem[]>;
  onContextMenu: (e: React.MouseEvent, file: FileItem) => void;
  onEditingNameChange: (name: string) => void;
  onEditingSubmit: () => void;
  onEditingCancel: () => void;
}

const FileTreeItem: React.FC<FileTreeItemProps> = ({
  file,
  level,
  selectedFile,
  expandedDirs,
  editingPath,
  editingName,
  isCreatingNew,
  onToggleDir,
  onSelectFile,
  onLoadChildren,
  onContextMenu,
  onEditingNameChange,
  onEditingSubmit,
  onEditingCancel
}) => {
  const [children, setChildren] = useState<FileItem[]>(file.children || []);
  const [isLoading, setIsLoading] = useState(false);
  const isExpanded = expandedDirs.has(file.path);
  const isEditing = editingPath === file.path;
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const handleClick = async () => {
    if (isEditing) return;
    if (file.isDirectory) {
      if (!isExpanded && children.length === 0) {
        setIsLoading(true);
        try {
          const loadedChildren = await onLoadChildren(file.path);
          setChildren(loadedChildren);
        } catch (error) {
          console.error('Failed to load directory:', error);
        }
        setIsLoading(false);
      }
      onToggleDir(file.path);
    } else {
      onSelectFile(file.path);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      onEditingSubmit();
    } else if (e.key === 'Escape') {
      onEditingCancel();
    }
  };

  return (
    <div>
      <div
        data-file-item
        onClick={handleClick}
        onContextMenu={(e) => onContextMenu(e, file)}
        className={`flex items-center gap-1 px-2 py-1 rounded-md cursor-pointer transition-colors ${
          selectedFile === file.path
            ? 'bg-blue-500/20 text-blue-400'
            : 'hover:bg-white/5 text-gray-300'
        }`}
        style={{ paddingLeft: `${level * 12 + 8}px` }}
      >
        {file.isDirectory ? (
          <>
            {isLoading ? (
              <RefreshCw size={12} className="animate-spin text-gray-500 flex-shrink-0" />
            ) : isExpanded ? (
              <ChevronDown size={12} className="text-gray-500 flex-shrink-0" />
            ) : (
              <ChevronRight size={12} className="text-gray-500 flex-shrink-0" />
            )}
            <Folder size={14} className={isExpanded ? "text-yellow-400 flex-shrink-0" : "text-yellow-500 flex-shrink-0"} />
          </>
        ) : (
          <>
            <span className="w-3" />
            <File size={14} className={`flex-shrink-0 ${getFileIconColor(file.name)}`} />
          </>
        )}
        {isEditing ? (
          <input
            ref={inputRef}
            type="text"
            value={editingName}
            onChange={(e) => onEditingNameChange(e.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={onEditingCancel}
            className="flex-1 bg-gray-800 border border-blue-500 rounded px-1 text-xs text-white outline-none"
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <span className="text-xs truncate">{file.name}</span>
        )}
        {!isEditing && !file.isDirectory && file.size !== undefined && (
          <span className="text-[10px] text-gray-600 ml-auto flex-shrink-0">
            {formatFileSize(file.size)}
          </span>
        )}
      </div>
      {file.isDirectory && isExpanded && (
        <div>
          {/* New item input for this directory */}
          {isCreatingNew && isCreatingNew.parentPath === file.path && (
            <NewItemInput
              type={isCreatingNew.type}
              name={editingName}
              level={level + 1}
              onNameChange={onEditingNameChange}
              onSubmit={onEditingSubmit}
              onCancel={onEditingCancel}
            />
          )}
          {children.map((child) => (
            <FileTreeItem
              key={child.path}
              file={child}
              level={level + 1}
              selectedFile={selectedFile}
              expandedDirs={expandedDirs}
              editingPath={editingPath}
              editingName={editingName}
              isCreatingNew={isCreatingNew}
              onToggleDir={onToggleDir}
              onSelectFile={onSelectFile}
              onLoadChildren={onLoadChildren}
              onContextMenu={onContextMenu}
              onEditingNameChange={onEditingNameChange}
              onEditingSubmit={onEditingSubmit}
              onEditingCancel={onEditingCancel}
            />
          ))}
        </div>
      )}
    </div>
  );
};

// Git types
interface GitStatusFile {
  status: string;
  path: string;
  staged: boolean;
}

interface GitStatus {
  branch: string;
  ahead: number;
  behind: number;
  files: GitStatusFile[];
  is_repo: boolean;
}

interface GitCommit {
  graph: string;
  short_hash: string;
  refs: string;
  message: string;
}

// Git status config
const GIT_STATUS_CONFIG: Record<string, { color: string; label: string }> = {
  'N': { color: 'text-cyan-400', label: 'New' },
  'M': { color: 'text-yellow-400', label: 'Modified' },
  'A': { color: 'text-green-400', label: 'Added' },
  'D': { color: 'text-red-400', label: 'Deleted' },
  'R': { color: 'text-blue-400', label: 'Renamed' },
  'C': { color: 'text-purple-400', label: 'Copied' },
  'U': { color: 'text-orange-400', label: 'Conflict' },
  'I': { color: 'text-gray-500', label: 'Ignored' },
};

const getStatusColor = (status: string): string =>
  GIT_STATUS_CONFIG[status]?.color || 'text-gray-400';

const getStatusLabel = (status: string): string =>
  GIT_STATUS_CONFIG[status]?.label || status;

interface WorkspacePanelProps {
  activeTab: Tab;
  setActiveTab: (tab: Tab) => void;
  code: string | null;
  projectDir?: string | null;
  terminals: TerminalInstance[];
  activeTerminalId: string | null;
  onSwitchTerminal: (terminalId: string) => void;
  onCloseTerminal: (terminalId: string) => void;
  onCreateTerminal: () => void;
  onSendInput: (terminalId: string, data: string) => void;
  onGenerateCommitMessage?: (diff: string) => Promise<string>;
}

const WorkspacePanel: React.FC<WorkspacePanelProps> = ({
  activeTab,
  setActiveTab,
  code,
  projectDir,
  terminals,
  activeTerminalId,
  onSwitchTerminal,
  onCloseTerminal,
  onCreateTerminal,
  onSendInput,
  onGenerateCommitMessage
}) => {
  const [iframeKey, setIframeKey] = useState(0);
  const [viewport, setViewport] = useState<'desktop' | 'mobile'>('desktop');
  const [files, setFiles] = useState<FileItem[]>([]);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState<string>('');
  const [isLoadingFiles, setIsLoadingFiles] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string>('');
  const [previewMode, setPreviewMode] = useState<'code' | 'url'>('code'); // 'code' for srcDoc, 'url' for src
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set());

  // Context menu and editing state
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; file: FileItem | null } | null>(null);
  const [editingPath, setEditingPath] = useState<string | null>(null);
  const [editingName, setEditingName] = useState<string>('');
  const [isCreatingNew, setIsCreatingNew] = useState<{ type: 'file' | 'folder'; parentPath: string } | null>(null);

  // Git state
  const [gitStatus, setGitStatus] = useState<GitStatus | null>(null);
  const [gitCommits, setGitCommits] = useState<GitCommit[]>([]);
  const [isLoadingGit, setIsLoadingGit] = useState(false);
  const [gitView, setGitView] = useState<'status' | 'history'>('status');
  const [commitMessage, setCommitMessage] = useState('');
  const [isCommitting, setIsCommitting] = useState(false);
  const [commitError, setCommitError] = useState<string | null>(null);
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());
  const [isGeneratingMessage, setIsGeneratingMessage] = useState(false);

  // Store refs to XTerminal handles for writing output
  const terminalRefs = useRef<Map<string, XTerminalHandle>>(new Map());

  // Listen for terminal output and write to xterm
  useEffect(() => {
    let unlisten: UnlistenFn | null = null;
    let cancelled = false;

    const setupListener = async () => {
      const listener = await listen<{ terminalId: string; output: string }>('terminal-output', (event) => {
        const { terminalId, output } = event.payload;
        const terminalHandle = terminalRefs.current.get(terminalId);
        if (terminalHandle) {
          terminalHandle.write(output);
        }
      });

      // If cleanup was called while we were awaiting, unlisten immediately
      if (cancelled) {
        listener();
      } else {
        unlisten = listener;
      }
    };

    setupListener();

    return () => {
      cancelled = true;
      if (unlisten) {
        unlisten();
      }
    };
  }, []);

  // Focus and fit terminal when switching tabs or terminals
  useEffect(() => {
    if (activeTab === Tab.TERMINAL && activeTerminalId) {
      const terminalHandle = terminalRefs.current.get(activeTerminalId);
      if (terminalHandle) {
        // Small delay to ensure DOM is ready
        setTimeout(() => {
          terminalHandle.fit();
          terminalHandle.focus();
        }, 50);
      }
    }
  }, [activeTab, activeTerminalId]);

  // Callback for XTerminal - set ref
  const setTerminalRef = useCallback((terminalId: string) => (handle: XTerminalHandle | null) => {
    if (handle) {
      terminalRefs.current.set(terminalId, handle);
    } else {
      terminalRefs.current.delete(terminalId);
    }
  }, []);

  const handleRefresh = () => {
    setIframeKey(prev => prev + 1);
  };

  const loadFiles = async () => {
    if (!projectDir) return;

    setIsLoadingFiles(true);
    try {
      const fileList = await invoke<FileItem[]>('read_directory', { directory: projectDir });
      // Sort: directories first, then files, both alphabetically
      const sorted = fileList.sort((a, b) => {
        if (a.isDirectory && !b.isDirectory) return -1;
        if (!a.isDirectory && b.isDirectory) return 1;
        return a.name.localeCompare(b.name);
      });
      setFiles(sorted);
    } catch (error) {
      console.error('Failed to load files:', error);
    } finally {
      setIsLoadingFiles(false);
    }
  };

  const loadDirChildren = async (dirPath: string): Promise<FileItem[]> => {
    try {
      const children = await invoke<FileItem[]>('read_directory', { directory: dirPath });
      // Sort: directories first, then files
      return children.sort((a, b) => {
        if (a.isDirectory && !b.isDirectory) return -1;
        if (!a.isDirectory && b.isDirectory) return 1;
        return a.name.localeCompare(b.name);
      });
    } catch (error) {
      console.error('Failed to load directory:', error);
      return [];
    }
  };

  const toggleDir = (path: string) => {
    setExpandedDirs(prev => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  };

  const loadFileContent = async (filePath: string) => {
    // For image files, just set the selected file - ImagePreview will handle loading
    if (isImageFile(filePath)) {
      setSelectedFile(filePath);
      setFileContent(''); // Clear any previous text content
      return;
    }

    try {
      const content = await invoke<string>('read_file_content', { filePath });
      setFileContent(content);
      setSelectedFile(filePath);
    } catch (error) {
      console.error('Failed to load file content:', error);
      setFileContent(`Error loading file: ${error}`);
      setSelectedFile(filePath);
    }
  };

  // Context menu handlers
  const handleContextMenu = (e: React.MouseEvent, file: FileItem) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY, file });
  };

  const handleExplorerContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    // Only show context menu if clicking on empty space in explorer
    if ((e.target as HTMLElement).closest('[data-file-item]')) return;
    setContextMenu({ x: e.clientX, y: e.clientY, file: null });
  };

  const closeContextMenu = () => {
    setContextMenu(null);
  };

  // File operation handlers
  const handleNewFile = async () => {
    if (!contextMenu) return;

    // Determine parent directory
    let parentPath: string;
    if (contextMenu.file) {
      parentPath = contextMenu.file.isDirectory ? contextMenu.file.path :
        contextMenu.file.path.substring(0, contextMenu.file.path.lastIndexOf('/'));
    } else {
      parentPath = projectDir || '';
    }

    // Expand the parent directory if it's not already expanded
    if (contextMenu.file?.isDirectory && !expandedDirs.has(contextMenu.file.path)) {
      setExpandedDirs(prev => new Set([...prev, contextMenu.file!.path]));
    }

    setIsCreatingNew({ type: 'file', parentPath });
    setEditingName('untitled');
    closeContextMenu();
  };

  const handleNewFolder = async () => {
    if (!contextMenu) return;

    // Determine parent directory
    let parentPath: string;
    if (contextMenu.file) {
      parentPath = contextMenu.file.isDirectory ? contextMenu.file.path :
        contextMenu.file.path.substring(0, contextMenu.file.path.lastIndexOf('/'));
    } else {
      parentPath = projectDir || '';
    }

    // Expand the parent directory if it's not already expanded
    if (contextMenu.file?.isDirectory && !expandedDirs.has(contextMenu.file.path)) {
      setExpandedDirs(prev => new Set([...prev, contextMenu.file!.path]));
    }

    setIsCreatingNew({ type: 'folder', parentPath });
    setEditingName('new-folder');
    closeContextMenu();
  };

  const handleRename = () => {
    if (!contextMenu?.file) return;
    setEditingPath(contextMenu.file.path);
    setEditingName(contextMenu.file.name);
    closeContextMenu();
  };

  const handleDelete = async () => {
    if (!contextMenu?.file) return;

    const confirmed = window.confirm(`Are you sure you want to delete "${contextMenu.file.name}"?`);
    if (!confirmed) {
      closeContextMenu();
      return;
    }

    try {
      await invoke('delete_path', { targetPath: contextMenu.file.path });
      // Refresh the file list
      await loadFiles();
      // Clear selection if deleted file was selected
      if (selectedFile === contextMenu.file.path) {
        setSelectedFile(null);
        setFileContent('');
      }
    } catch (error) {
      console.error('Failed to delete:', error);
      alert(`Failed to delete: ${error}`);
    }
    closeContextMenu();
  };

  const handleEditingSubmit = async () => {
    if (!editingName.trim()) {
      handleEditingCancel();
      return;
    }

    try {
      if (isCreatingNew) {
        // Creating new file/folder
        const newPath = `${isCreatingNew.parentPath}/${editingName}`;

        if (isCreatingNew.type === 'file') {
          await invoke('create_file', { filePath: newPath, content: '' });
        } else {
          await invoke('create_directory', { dirPath: newPath });
        }
      } else if (editingPath) {
        // Renaming existing file/folder
        const parentPath = editingPath.substring(0, editingPath.lastIndexOf('/'));
        const newPath = `${parentPath}/${editingName}`;

        if (newPath !== editingPath) {
          await invoke('rename_path', { oldPath: editingPath, newPath });
        }
      }

      // Refresh the file list
      await loadFiles();
    } catch (error) {
      console.error('Failed to create/rename:', error);
      alert(`Operation failed: ${error}`);
    }

    handleEditingCancel();
  };

  const handleEditingCancel = () => {
    setEditingPath(null);
    setEditingName('');
    setIsCreatingNew(null);
  };

  // Load files when switching to FILES tab or when projectDir changes
  useEffect(() => {
    if (activeTab === Tab.FILES && projectDir) {
      loadFiles();
    }
  }, [activeTab, projectDir]);

  // Git functions
  const loadGitStatus = async () => {
    if (!projectDir) return;

    try {
      const status = await invoke<GitStatus>('git_status', { projectDir });
      setGitStatus(status);
    } catch (error) {
      console.error('Failed to load git status:', error);
      setGitStatus(null);
    }
  };

  const loadGitLog = async () => {
    if (!projectDir) return;

    try {
      const commits = await invoke<GitCommit[]>('git_log', { projectDir, limit: 100 });
      setGitCommits(commits);
    } catch (error) {
      console.error('Failed to load git log:', error);
      setGitCommits([]);
    }
  };

  const loadGitData = async () => {
    if (!projectDir) return;

    setIsLoadingGit(true);
    try {
      await Promise.all([loadGitStatus(), loadGitLog()]);
    } finally {
      setIsLoadingGit(false);
    }
  };

  // Load git data when switching to GIT tab
  useEffect(() => {
    if (activeTab === Tab.GIT && projectDir) {
      loadGitData();
    }
  }, [activeTab, projectDir]);

  // Git commit function
  const handleCommit = async () => {
    if (!projectDir || !commitMessage.trim()) return;

    setIsCommitting(true);
    setCommitError(null);

    try {
      // Pass selected files if any, otherwise commit all
      const files = selectedFiles.size > 0 ? Array.from(selectedFiles) : null;
      await invoke('git_commit', { projectDir, message: commitMessage.trim(), files });
      setCommitMessage('');
      setSelectedFiles(new Set());
      // Refresh git data after commit
      await loadGitData();
    } catch (error) {
      setCommitError(String(error));
    } finally {
      setIsCommitting(false);
    }
  };

  // Toggle file selection
  const toggleFileSelection = (path: string) => {
    setSelectedFiles(prev => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  };

  // Select/deselect all files
  const toggleAllFiles = () => {
    if (!gitStatus) return;
    if (selectedFiles.size === gitStatus.files.length) {
      setSelectedFiles(new Set());
    } else {
      setSelectedFiles(new Set(gitStatus.files.map(f => f.path)));
    }
  };

  // Generate commit message with AI
  const handleGenerateMessage = async () => {
    if (!projectDir || !onGenerateCommitMessage) return;

    setIsGeneratingMessage(true);
    setCommitError(null);

    try {
      // Get diff for selected files or all
      const files = selectedFiles.size > 0 ? Array.from(selectedFiles) : null;
      const diff = await invoke<string>('git_diff', { projectDir, files });

      if (!diff.trim()) {
        setCommitError('No changes to describe');
        return;
      }

      // Call AI to generate message
      const message = await onGenerateCommitMessage(diff);
      setCommitMessage(message.trim());
    } catch (error) {
      setCommitError(String(error));
    } finally {
      setIsGeneratingMessage(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col bg-ide-bg h-full overflow-hidden relative">
      {/* Tabs Header */}
      <div className="h-12 border-b border-ide-border flex items-center justify-between px-4 bg-ide-bg">
        <div className="flex items-center gap-1 bg-ide-panel p-1 rounded-lg border border-ide-border">
          <TabButton 
            active={activeTab === Tab.PREVIEW} 
            onClick={() => setActiveTab(Tab.PREVIEW)}
            icon={<Play size={14} />}
            label="Preview"
          />
          <TabButton
            active={activeTab === Tab.FILES}
            onClick={() => setActiveTab(Tab.FILES)}
            icon={<FolderOpen size={14} />}
            label="Files"
          />
          <TabButton
            active={activeTab === Tab.GIT}
            onClick={() => setActiveTab(Tab.GIT)}
            icon={<GitBranch size={14} />}
            label="Git"
          />
          <TabButton
            active={activeTab === Tab.TERMINAL}
            onClick={() => setActiveTab(Tab.TERMINAL)}
            icon={<TerminalIcon size={14} />}
            label="Terminal"
          />
        </div>

        {activeTab === Tab.PREVIEW && (
          <div className="flex items-center gap-2">
             <div className="flex items-center bg-black/40 rounded-md border border-ide-border px-2 py-1 text-xs text-gray-400 w-80 gap-2">
               <Globe size={12} className="flex-shrink-0" />
               <input
                 type="text"
                 value={previewUrl}
                 onChange={(e) => setPreviewUrl(e.target.value)}
                 onKeyDown={(e) => {
                   if (e.key === 'Enter' && previewUrl.trim()) {
                     setPreviewMode('url');
                     setIframeKey(prev => prev + 1);
                   }
                 }}
                 placeholder="Enter URL to preview (e.g., http://localhost:3000)"
                 className="flex-1 bg-transparent text-gray-300 outline-none text-xs placeholder:text-gray-500"
               />
             </div>
             <button
               onClick={() => {
                 if (previewUrl.trim()) {
                   setPreviewMode('url');
                 }
                 setIframeKey(prev => prev + 1);
               }}
               className="p-1.5 hover:bg-white/10 rounded-md text-gray-400"
               title="Refresh"
             >
                <RotateCw size={14} />
             </button>
             {code && (
               <button
                 onClick={() => {
                   setPreviewMode('code');
                   setPreviewUrl('');
                   setIframeKey(prev => prev + 1);
                 }}
                 className={`px-2 py-1 text-xs rounded-md transition-colors ${
                   previewMode === 'code'
                     ? 'bg-blue-500/20 text-blue-400'
                     : 'text-gray-400 hover:bg-white/10'
                 }`}
                 title="Show generated code"
               >
                 Code
               </button>
             )}
             <div className="w-px h-4 bg-ide-border mx-1"></div>
             <button
              onClick={() => setViewport('desktop')}
              className={`p-1.5 rounded-md ${viewport === 'desktop' ? 'text-blue-400 bg-blue-500/10' : 'text-gray-400 hover:bg-white/10'}`}>
                <Monitor size={14} />
             </button>
             <button
              onClick={() => setViewport('mobile')}
              className={`p-1.5 rounded-md ${viewport === 'mobile' ? 'text-blue-400 bg-blue-500/10' : 'text-gray-400 hover:bg-white/10'}`}>
                <Smartphone size={14} />
             </button>
          </div>
        )}

        {activeTab === Tab.FILES && (
          <div className="flex items-center gap-2">
            <button
              onClick={loadFiles}
              disabled={isLoadingFiles}
              className="p-1.5 hover:bg-white/10 rounded-md text-gray-400 disabled:opacity-50">
              <RefreshCw size={14} className={isLoadingFiles ? 'animate-spin' : ''} />
            </button>
          </div>
        )}

        {activeTab === Tab.GIT && (
          <div className="flex items-center gap-2">
            <div className="flex items-center bg-black/40 rounded-md border border-ide-border p-0.5">
              <button
                onClick={() => setGitView('status')}
                className={`px-2 py-1 text-xs rounded transition-colors ${
                  gitView === 'status' ? 'bg-ide-border text-white' : 'text-gray-400 hover:text-gray-200'
                }`}
              >
                Status
              </button>
              <button
                onClick={() => setGitView('history')}
                className={`px-2 py-1 text-xs rounded transition-colors ${
                  gitView === 'history' ? 'bg-ide-border text-white' : 'text-gray-400 hover:text-gray-200'
                }`}
              >
                History
              </button>
            </div>
            <button
              onClick={loadGitData}
              disabled={isLoadingGit}
              className="p-1.5 hover:bg-white/10 rounded-md text-gray-400 disabled:opacity-50"
            >
              <RefreshCw size={14} className={isLoadingGit ? 'animate-spin' : ''} />
            </button>
          </div>
        )}
      </div>

      {/* Content Area */}
      <div className="flex-1 relative bg-[#0d0f14] flex items-center justify-center p-4">
        
        {/* PREVIEW TAB */}
        <div className={`w-full h-full flex flex-col items-center justify-center transition-opacity duration-300 ${activeTab === Tab.PREVIEW ? 'opacity-100 z-10' : 'opacity-0 absolute inset-0 -z-10'}`}>
           {previewMode === 'url' && previewUrl.trim() ? (
             <div className={`transition-all duration-300 ease-in-out border border-ide-border shadow-2xl bg-white rounded-lg overflow-hidden ${viewport === 'mobile' ? 'w-[375px] h-[667px]' : 'w-full h-full'}`}>
               <iframe
                 key={iframeKey}
                 src={previewUrl.startsWith('http') ? previewUrl : `http://${previewUrl}`}
                 title="Preview"
                 className="w-full h-full bg-white"
                 sandbox="allow-scripts allow-modals allow-forms allow-popups allow-same-origin allow-top-navigation"
               />
             </div>
           ) : code && previewMode === 'code' ? (
             <div className={`transition-all duration-300 ease-in-out border border-ide-border shadow-2xl bg-white rounded-lg overflow-hidden ${viewport === 'mobile' ? 'w-[375px] h-[667px]' : 'w-full h-full'}`}>
               <iframe
                 key={iframeKey}
                 srcDoc={code}
                 title="Preview"
                 className="w-full h-full bg-white"
                 sandbox="allow-scripts allow-modals allow-forms allow-popups allow-same-origin allow-top-navigation"
               />
             </div>
           ) : (
             <div className="flex flex-col items-center text-gray-600 gap-4">
               <div className="w-16 h-16 rounded-full bg-ide-panel border border-ide-border flex items-center justify-center">
                 <Globe size={24} className="opacity-50"/>
               </div>
               <p className="text-center">
                 Enter a URL above to preview<br/>
                 <span className="text-sm text-gray-500">e.g., localhost:3000, localhost:5173</span>
               </p>
             </div>
           )}
        </div>

        {/* FILES TAB */}
        <div className={`w-full h-full absolute inset-0 bg-ide-bg ${activeTab === Tab.FILES ? 'opacity-100 z-10' : 'opacity-0 -z-10'}`}>
          <div className="flex h-full">
            {/* File Explorer */}
            <div
              className="w-72 border-r border-ide-border overflow-y-auto bg-ide-panel"
              onContextMenu={handleExplorerContextMenu}
            >
              <div className="p-2">
                <div className="flex items-center justify-between mb-2 px-2">
                  <div className="text-xs text-gray-500 uppercase font-semibold">Explorer</div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => {
                        setIsCreatingNew({ type: 'file', parentPath: projectDir || '' });
                        setEditingName('untitled');
                      }}
                      className="p-1 hover:bg-white/10 rounded text-gray-500 hover:text-gray-300"
                      title="New File"
                    >
                      <FilePlus size={12} />
                    </button>
                    <button
                      onClick={() => {
                        setIsCreatingNew({ type: 'folder', parentPath: projectDir || '' });
                        setEditingName('new-folder');
                      }}
                      className="p-1 hover:bg-white/10 rounded text-gray-500 hover:text-gray-300"
                      title="New Folder"
                    >
                      <FolderPlus size={12} />
                    </button>
                    <button
                      onClick={() => {
                        loadFiles();
                        setExpandedDirs(new Set());
                      }}
                      disabled={isLoadingFiles}
                      className="p-1 hover:bg-white/10 rounded text-gray-500 hover:text-gray-300 disabled:opacity-50"
                      title="Refresh"
                    >
                      <RefreshCw size={12} className={isLoadingFiles ? 'animate-spin' : ''} />
                    </button>
                  </div>
                </div>
                {isLoadingFiles && files.length === 0 ? (
                  <div className="flex items-center justify-center py-8 text-gray-500">
                    <RefreshCw size={16} className="animate-spin" />
                  </div>
                ) : files.length === 0 && !isCreatingNew ? (
                  <div className="text-sm text-gray-500 py-4 px-2">No files found</div>
                ) : (
                  <div>
                    {/* New file/folder input at root level */}
                    {isCreatingNew && isCreatingNew.parentPath === projectDir && (
                      <NewItemInput
                        type={isCreatingNew.type}
                        name={editingName}
                        onNameChange={setEditingName}
                        onSubmit={handleEditingSubmit}
                        onCancel={handleEditingCancel}
                      />
                    )}
                    {files.map((file) => (
                      <FileTreeItem
                        key={file.path}
                        file={file}
                        level={0}
                        selectedFile={selectedFile}
                        expandedDirs={expandedDirs}
                        editingPath={editingPath}
                        editingName={editingName}
                        isCreatingNew={isCreatingNew}
                        onToggleDir={toggleDir}
                        onSelectFile={(path) => loadFileContent(path)}
                        onLoadChildren={loadDirChildren}
                        onContextMenu={handleContextMenu}
                        onEditingNameChange={setEditingName}
                        onEditingSubmit={handleEditingSubmit}
                        onEditingCancel={handleEditingCancel}
                      />
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* File Content */}
            <div className="flex-1 overflow-auto">
              {selectedFile ? (
                <div className="h-full flex flex-col">
                  <div className="sticky top-0 bg-ide-bg border-b border-ide-border px-4 py-2 flex-shrink-0">
                    <div className="flex items-center gap-2 text-xs text-gray-400">
                      {isImageFile(selectedFile) ? <Image size={12} /> : <File size={12} />}
                      <span className="truncate">{selectedFile.replace(projectDir || '', '').replace(/^\//, '')}</span>
                    </div>
                  </div>
                  {isImageFile(selectedFile) ? (
                    <ImagePreview filePath={selectedFile} />
                  ) : (
                    <pre className="p-4 text-sm font-mono text-gray-300 leading-relaxed flex-1 overflow-auto">
                      <code>{fileContent}</code>
                    </pre>
                  )}
                </div>
              ) : (
                <div className="flex items-center justify-center h-full text-gray-600">
                  <div className="text-center">
                    <FolderOpen size={48} className="mx-auto mb-4 opacity-50" />
                    <p>Select a file to view its contents</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* GIT TAB */}
        <div className={`w-full h-full absolute inset-0 bg-ide-bg overflow-auto ${activeTab === Tab.GIT ? 'opacity-100 z-10' : 'opacity-0 -z-10'}`}>
          {isLoadingGit ? (
            <div className="flex items-center justify-center h-full text-gray-500">
              <RefreshCw size={24} className="animate-spin" />
            </div>
          ) : !gitStatus?.is_repo ? (
            <div className="flex items-center justify-center h-full text-gray-500">
              <div className="text-center">
                <GitBranch size={48} className="mx-auto mb-4 opacity-50" />
                <p>Not a git repository</p>
                <p className="text-xs mt-2 text-gray-600">Initialize with: git init</p>
              </div>
            </div>
          ) : (
            <div className="p-4">
              {/* Branch Info */}
              <div className="flex items-center gap-3 mb-4 p-3 bg-ide-panel rounded-lg border border-ide-border">
                <GitBranch size={18} className="text-green-400" />
                <div>
                  <div className="text-sm font-medium text-white">{gitStatus.branch || 'HEAD detached'}</div>
                  <div className="text-xs text-gray-500">
                    {gitStatus.ahead > 0 && <span className="text-green-400">↑{gitStatus.ahead} </span>}
                    {gitStatus.behind > 0 && <span className="text-red-400">↓{gitStatus.behind} </span>}
                    {gitStatus.ahead === 0 && gitStatus.behind === 0 && 'Up to date'}
                  </div>
                </div>
              </div>

              {/* Quick Commit */}
              <div className="mb-4 p-3 bg-ide-panel rounded-lg border border-ide-border">
                <div className="flex gap-2">
                  <div className="flex-1 flex gap-1">
                    <input
                      type="text"
                      value={commitMessage}
                      onChange={(e) => {
                        setCommitMessage(e.target.value);
                        setCommitError(null);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !isCommitting) {
                          handleCommit();
                        }
                      }}
                      placeholder={selectedFiles.size > 0 ? `Commit ${selectedFiles.size} file(s)...` : "Commit all changes..."}
                      disabled={isCommitting || gitStatus.files.length === 0}
                      className="flex-1 bg-black/30 border border-ide-border rounded-l px-3 py-1.5 text-sm text-white placeholder:text-gray-500 outline-none focus:border-blue-500 disabled:opacity-50"
                    />
                    <button
                      onClick={handleGenerateMessage}
                      disabled={isGeneratingMessage || gitStatus.files.length === 0 || !onGenerateCommitMessage}
                      className="px-2 py-1.5 bg-black/30 border border-l-0 border-ide-border rounded-r text-purple-400 hover:text-purple-300 hover:bg-purple-500/10 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      title="Generate commit message with AI"
                    >
                      {isGeneratingMessage ? (
                        <RefreshCw size={14} className="animate-spin" />
                      ) : (
                        <Sparkles size={14} />
                      )}
                    </button>
                  </div>
                  <button
                    onClick={handleCommit}
                    disabled={isCommitting || !commitMessage.trim() || gitStatus.files.length === 0}
                    className="flex items-center gap-2 px-4 py-1.5 bg-green-600 hover:bg-green-500 disabled:bg-gray-600 disabled:cursor-not-allowed rounded text-sm text-white font-medium transition-colors"
                  >
                    {isCommitting ? (
                      <RefreshCw size={14} className="animate-spin" />
                    ) : (
                      <Send size={14} />
                    )}
                    {selectedFiles.size > 0 ? `Commit (${selectedFiles.size})` : 'Commit All'}
                  </button>
                </div>
                {commitError && (
                  <div className="mt-2 text-xs text-red-400">{commitError}</div>
                )}
              </div>

              {/* Status View */}
              {gitView === 'status' && (
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-xs text-gray-500 uppercase font-semibold flex items-center gap-2">
                      <File size={12} />
                      Changes ({gitStatus.files.length})
                    </h3>
                    {gitStatus.files.length > 0 && (
                      <button
                        onClick={toggleAllFiles}
                        className="text-[10px] text-gray-400 hover:text-white px-2 py-0.5 rounded hover:bg-white/10"
                      >
                        {selectedFiles.size === gitStatus.files.length ? 'Deselect All' : 'Select All'}
                      </button>
                    )}
                  </div>
                  {gitStatus.files.length === 0 ? (
                    <div className="text-sm text-gray-500 py-8 text-center">
                      <GitCommitIcon size={24} className="mx-auto mb-2 opacity-50" />
                      No changes to commit
                    </div>
                  ) : (
                    <div className="space-y-1">
                      {gitStatus.files.map((file, index) => (
                        <div
                          key={index}
                          onClick={() => toggleFileSelection(file.path)}
                          className={`flex items-center gap-2 p-2 rounded cursor-pointer transition-colors ${
                            selectedFiles.has(file.path) ? 'bg-blue-500/20' : 'hover:bg-white/5'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={selectedFiles.has(file.path)}
                            onChange={() => toggleFileSelection(file.path)}
                            onClick={(e) => e.stopPropagation()}
                            className="w-3.5 h-3.5 rounded border-gray-500 bg-transparent text-blue-500 focus:ring-0 focus:ring-offset-0 cursor-pointer"
                          />
                          <span className={`text-xs font-mono w-4 ${getStatusColor(file.status)}`}>
                            {file.status}
                          </span>
                          <span className="text-sm text-gray-300 truncate flex-1">{file.path}</span>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded ${getStatusColor(file.status)} bg-white/5`}>
                            {getStatusLabel(file.status)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* History View - Git Tree */}
              {gitView === 'history' && (
                <div>
                  {gitCommits.length === 0 ? (
                    <div className="text-sm text-gray-500 py-8 text-center">
                      <GitCommitIcon size={24} className="mx-auto mb-2 opacity-50" />
                      No commits yet
                    </div>
                  ) : (
                    <div className="font-mono text-xs leading-5 overflow-x-auto">
                      {gitCommits.map((commit, index) => (
                        <div key={index} className="flex hover:bg-white/5">
                          {/* Graph */}
                          <span className="text-yellow-500 whitespace-pre select-none" style={{ minWidth: '80px' }}>
                            {commit.graph.replace(/\*/g, '●')}
                          </span>
                          {/* Hash */}
                          {commit.short_hash && (
                            <>
                              <span className="text-blue-400 w-16 flex-shrink-0">{commit.short_hash}</span>
                              {/* Refs */}
                              {commit.refs && (
                                <span className="flex-shrink-0 mr-2">
                                  {commit.refs.split(', ').map((ref, i) => (
                                    <span
                                      key={i}
                                      className={`text-[10px] px-1 rounded mr-1 ${
                                        ref.includes('HEAD') ? 'bg-green-500/30 text-green-400' :
                                        ref.includes('origin/') ? 'bg-red-500/30 text-red-400' :
                                        ref.includes('tag:') ? 'bg-purple-500/30 text-purple-400' :
                                        'bg-yellow-500/30 text-yellow-400'
                                      }`}
                                    >
                                      {ref.replace('HEAD -> ', '').replace('tag: ', '')}
                                    </span>
                                  ))}
                                </span>
                              )}
                              {/* Message */}
                              <span className="text-gray-300 truncate">{commit.message}</span>
                            </>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* TERMINAL TAB */}
        <div className={`w-full h-full absolute inset-0 bg-[#0d0f14] flex flex-col ${activeTab === Tab.TERMINAL ? 'opacity-100 z-10' : 'opacity-0 -z-10'}`}>
          {/* Terminal Tabs Bar */}
          <div className="flex items-center bg-gray-900 border-b border-gray-800 overflow-x-auto flex-shrink-0">
            {terminals.map((terminal) => (
              <div
                key={terminal.id}
                className={`flex items-center gap-2 px-4 py-2 text-sm cursor-pointer border-r border-gray-800 hover:bg-gray-800 transition-colors ${
                  activeTerminalId === terminal.id ? 'bg-[#0d0f14] text-white' : 'bg-gray-900 text-gray-400'
                }`}
                onClick={() => onSwitchTerminal(terminal.id)}
              >
                <TerminalIcon size={14} />
                <span className="whitespace-nowrap">{terminal.name}</span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onCloseTerminal(terminal.id);
                  }}
                  className="ml-2 hover:bg-red-600 rounded p-0.5 transition-colors"
                >
                  <X size={12} />
                </button>
              </div>
            ))}
            {/* New Terminal Button */}
            <button
              onClick={onCreateTerminal}
              className="flex items-center gap-2 px-4 py-2 text-sm text-gray-400 hover:text-white hover:bg-gray-800 transition-colors border-r border-gray-800"
              title="New Terminal"
            >
              <Plus size={14} />
              <span className="whitespace-nowrap">New</span>
            </button>
          </div>

          {/* Terminal Content */}
          <div className="flex-1 relative overflow-hidden">
            {terminals.length === 0 ? (
              <div className="flex items-center justify-center h-full text-gray-500">
                <div className="text-center">
                  <TerminalIcon size={48} className="mx-auto mb-4 opacity-50" />
                  <div>Click "New" to create an interactive shell</div>
                  <div className="mt-2 text-gray-600 text-xs">
                    You can run commands in your default shell (bash/zsh)
                  </div>
                </div>
              </div>
            ) : (
              terminals.map((terminal) => (
                <div
                  key={terminal.id}
                  className={`absolute inset-0 ${activeTerminalId === terminal.id ? 'block' : 'hidden'}`}
                >
                  <XTerminal
                    ref={setTerminalRef(terminal.id)}
                    terminalId={terminal.id}
                    onData={(data) => onSendInput(terminal.id, data)}
                  />
                </div>
              ))
            )}
          </div>
        </div>

      </div>

      {/* Context Menu */}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          file={contextMenu.file}
          onClose={closeContextMenu}
          onNewFile={handleNewFile}
          onNewFolder={handleNewFolder}
          onRename={handleRename}
          onDelete={handleDelete}
        />
      )}
    </div>
  );
};

const TabButton = ({ active, onClick, icon, label }: { active: boolean, onClick: () => void, icon: React.ReactNode, label: string }) => (
  <button 
    onClick={onClick}
    className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
      active 
        ? 'bg-ide-border text-white shadow-sm' 
        : 'text-gray-500 hover:text-gray-300 hover:bg-white/5'
    }`}
  >
    {icon}
    {label}
  </button>
);

export default WorkspacePanel;