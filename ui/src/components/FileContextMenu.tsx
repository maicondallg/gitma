import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Code2,
  Copy,
  FileMinus2,
  FilePlus2,
  FolderOpen,
  History,
  Slash,
  Undo2,
} from 'lucide-react';
import { useI18n } from '../i18n';
import type { FileEntry } from '../lib/types';

export interface FileContextMenuProps {
  x: number;
  y: number;
  file: FileEntry;
  repoPath?: string;
  onClose: () => void;
  onStage?: (fileId: string) => void;
  onUnstage?: (fileId: string) => void;
  onDiscard?: (fileId: string) => void;
  onIgnore?: (pattern: string) => void;
  onOpenEditor?: (path: string) => void;
  onRevealFile?: (path: string) => void;
  onViewHistory?: (path: string) => void;
}

export function FileContextMenu({
  x,
  y,
  file,
  repoPath,
  onClose,
  onStage,
  onUnstage,
  onDiscard,
  onIgnore,
  onOpenEditor,
  onRevealFile,
  onViewHistory,
}: FileContextMenuProps) {
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

  const extMatch = file.name.match(/\.([^.]+)$/);
  const ext = extMatch ? extMatch[1] : null;

  const handleCopyRelative = async () => {
    onClose();
    try {
      await navigator.clipboard.writeText(file.pathDisplay);
    } catch {}
  };

  const handleCopyFull = async () => {
    onClose();
    const full = repoPath ? `${repoPath}/${file.pathDisplay}` : file.pathDisplay;
    try {
      await navigator.clipboard.writeText(full);
    } catch {}
  };

  return createPortal(
    <div
      ref={menuRef}
      className="context-menu file-context-menu"
      style={{ left: `${pos.x}px`, top: `${pos.y}px` }}
      role="menu"
      tabIndex={-1}
      onClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
    >
      {file.area === 'unstaged' && onStage && (
        <button
          type="button"
          className="menu-item"
          onClick={() => {
            onClose();
            onStage(file.id);
          }}
        >
          <FilePlus2 size={14} />
          <span>{t('fileMenu.stage')}</span>
        </button>
      )}

      {file.area === 'staged' && onUnstage && (
        <button
          type="button"
          className="menu-item"
          onClick={() => {
            onClose();
            onUnstage(file.id);
          }}
        >
          <FileMinus2 size={14} />
          <span>{t('fileMenu.unstage')}</span>
        </button>
      )}

      {file.area === 'unstaged' && onDiscard && (
        <button
          type="button"
          className="menu-item menu-item-danger"
          onClick={() => {
            onClose();
            if (window.confirm(t('fileMenu.discardConfirm'))) {
              onDiscard(file.id);
            }
          }}
        >
          <Undo2 size={14} />
          <span>{t('fileMenu.discard')}</span>
        </button>
      )}

      {file.status === 'untracked' && onIgnore && (
        <>
          <div className="menu-separator" />
          <button
            type="button"
            className="menu-item"
            onClick={() => {
              onClose();
              onIgnore(file.name);
            }}
          >
            <Slash size={14} />
            <span>{t('fileMenu.ignoreFile', { name: file.name })}</span>
          </button>
          {ext && (
            <button
              type="button"
              className="menu-item"
              onClick={() => {
                onClose();
                onIgnore(`*.${ext}`);
              }}
            >
              <Slash size={14} />
              <span>{t('fileMenu.ignoreExt', { ext })}</span>
            </button>
          )}
          {file.directory && file.directory.trim() !== '' && (
            <button
              type="button"
              className="menu-item"
              onClick={() => {
                onClose();
                onIgnore(`${file.directory}/`);
              }}
            >
              <Slash size={14} />
              <span>{t('fileMenu.ignoreDir', { dir: file.directory })}</span>
            </button>
          )}
        </>
      )}

      <div className="menu-separator" />

      <button type="button" className="menu-item" onClick={handleCopyRelative}>
        <Copy size={14} />
        <span>{t('fileMenu.copyRelativePath')}</span>
      </button>

      <button type="button" className="menu-item" onClick={handleCopyFull}>
        <Copy size={14} />
        <span>{t('fileMenu.copyFullPath')}</span>
      </button>

      <div className="menu-separator" />

      {onOpenEditor && (
        <button
          type="button"
          className="menu-item"
          onClick={() => {
            onClose();
            onOpenEditor(file.pathDisplay);
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
            onRevealFile(file.pathDisplay);
          }}
        >
          <FolderOpen size={14} />
          <span>{t('fileMenu.revealFile')}</span>
        </button>
      )}

      {onViewHistory && (
        <button
          type="button"
          className="menu-item"
          onClick={() => {
            onClose();
            onViewHistory(file.pathDisplay);
          }}
        >
          <History size={14} />
          <span>{t('fileMenu.fileHistory')}</span>
        </button>
      )}
    </div>,
    document.body
  );
}
