import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Code2,
  Copy,
  FolderMinus,
  FolderOpen,
  FolderPlus,
  Undo2,
} from 'lucide-react';
import { useI18n } from '../i18n';
import type { Area, FileEntry } from '../lib/types';

export interface DirContextMenuProps {
  x: number;
  y: number;
  dirName: string;
  dirPath: string;
  files: FileEntry[];
  area?: Area;
  repoPath?: string;
  onClose: () => void;
  onStage?: (files: FileEntry[]) => void;
  onUnstage?: (files: FileEntry[]) => void;
  onDiscard?: (files: FileEntry[]) => void;
  onOpenEditor?: (path: string) => void;
  onRevealFile?: (path: string) => void;
}

export function DirContextMenu({
  x,
  y,
  dirName,
  dirPath,
  files,
  area,
  repoPath,
  onClose,
  onStage,
  onUnstage,
  onDiscard,
  onOpenEditor,
  onRevealFile,
}: DirContextMenuProps) {
  const { t } = useI18n();
  const menuRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({
    x: Math.max(8, Math.min(x, (typeof window !== 'undefined' ? window.innerWidth : 1000) - 260)),
    y: Math.max(8, Math.min(y, (typeof window !== 'undefined' ? window.innerHeight : 800) - 300)),
  });

  useLayoutEffect(() => {
    if (!menuRef.current) return;
    const rect = menuRef.current.getBoundingClientRect();
    const pad = 8;
    let newX = x;
    let newY = y;

    if (newX + rect.width > window.innerWidth - pad) {
      newX = Math.max(pad, window.innerWidth - rect.width - pad);
    }
    if (newY + rect.height > window.innerHeight - pad) {
      if (y - rect.height >= pad) {
        newY = y - rect.height;
      } else {
        newY = Math.max(pad, window.innerHeight - rect.height - pad);
      }
    }
    newX = Math.max(pad, newX);
    newY = Math.max(pad, newY);

    setPos({ x: newX, y: newY });
  }, [x, y]);

  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };

    window.addEventListener('mousedown', handleOutside);
    window.addEventListener('contextmenu', handleOutside);
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('mousedown', handleOutside);
      window.removeEventListener('contextmenu', handleOutside);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  const handleCopyRelative = async () => {
    onClose();
    try {
      await navigator.clipboard.writeText(dirPath);
    } catch {}
  };

  const handleCopyFull = async () => {
    onClose();
    const full = repoPath ? `${repoPath}/${dirPath}` : dirPath;
    try {
      await navigator.clipboard.writeText(full);
    } catch {}
  };

  return createPortal(
    <div
      ref={menuRef}
      className="custom-context-menu dir-context-menu"
      style={{ left: `${pos.x}px`, top: `${pos.y}px` }}
      role="menu"
      tabIndex={-1}
      onClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
    >
      <div
        className="context-menu-header"
        style={{
          padding: '6px 10px',
          fontSize: '11px',
          color: 'var(--muted)',
          fontWeight: 600,
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          borderBottom: '1px solid var(--border)',
          marginBottom: '4px',
        }}
      >
        <FolderOpen size={13} />
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {dirName}
        </span>
        <span style={{ opacity: 0.7, marginLeft: 'auto', flexShrink: 0 }}>
          ({files.length})
        </span>
      </div>

      {area === 'unstaged' && onStage && (
        <button
          type="button"
          className="menu-item"
          onClick={() => {
            onClose();
            onStage(files);
          }}
        >
          <FolderPlus size={14} />
          <span>{t('fileMenu.stageDir', { count: files.length })}</span>
        </button>
      )}

      {area === 'staged' && onUnstage && (
        <button
          type="button"
          className="menu-item"
          onClick={() => {
            onClose();
            onUnstage(files);
          }}
        >
          <FolderMinus size={14} />
          <span>{t('fileMenu.unstageDir', { count: files.length })}</span>
        </button>
      )}

      {area === 'unstaged' && onDiscard && (
        <button
          type="button"
          className="menu-item menu-item-danger"
          onClick={() => {
            onClose();
            if (
              window.confirm(
                t('fileMenu.discardDirConfirm', {
                  dir: dirName,
                  count: files.length,
                })
              )
            ) {
              onDiscard(files);
            }
          }}
        >
          <Undo2 size={14} />
          <span>{t('fileMenu.discardDir')}</span>
        </button>
      )}

      {(area === 'unstaged' || area === 'staged') && (
        <div className="menu-separator" />
      )}

      <button type="button" className="menu-item" onClick={handleCopyRelative}>
        <Copy size={14} />
        <span>{t('fileMenu.copyRelativePath')}</span>
      </button>

      <button type="button" className="menu-item" onClick={handleCopyFull}>
        <Copy size={14} />
        <span>{t('fileMenu.copyFullPath')}</span>
      </button>

      {(onOpenEditor || onRevealFile) && <div className="menu-separator" />}

      {onOpenEditor && (
        <button
          type="button"
          className="menu-item"
          onClick={() => {
            onClose();
            onOpenEditor(dirPath);
          }}
        >
          <Code2 size={14} />
          <span>{t('fileMenu.openEditor')}</span>
        </button>
      )}

      {onRevealFile && (
        <button
          type="button"
          className="menu-item"
          onClick={() => {
            onClose();
            onRevealFile(dirPath);
          }}
        >
          <FolderOpen size={14} />
          <span>{t('fileMenu.revealFolder')}</span>
        </button>
      )}
    </div>,
    document.body
  );
}
