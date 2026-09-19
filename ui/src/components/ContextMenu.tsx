import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Archive,
  Copy,
  CopyPlus,
  GitBranch,
  GitFork,
  Merge,
  GitPullRequest,
  Layers,
  RotateCcw,
  Tag,
  Trash2,
  Undo2,
} from 'lucide-react';
import { useI18n } from '../i18n';

export interface ContextMenuProps {
  x: number;
  y: number;
  branchName?: string | null;
  tagName?: string | null;
  isCurrentBranch?: boolean;
  isRemoteBranch?: boolean;
  isStash?: boolean;
  currentBranchName?: string | null;
  commitOid: string;
  onClose: () => void;
  onCheckoutBranch?: (branch: string) => void;
  onMergeBranch?: (branch: string) => void;
  onMergeSquash?: (branch: string) => void;
  onCreateBranch?: (startPoint: string) => void;
  onDeleteBranch?: (branch: string) => void;
  onDeleteRemoteBranch?: (branch: string) => void;
  onCherryPick?: (oid: string) => void;
  onResetHead?: (commitOid: string) => void;
  onRevertCommit?: (commitOid: string) => void;
  onCreateTag?: (commitOid: string) => void;
  onDeleteTag?: (tagName: string) => void;
  onRebase?: (target: string) => void;
  onSquashTo?: (commitOid: string) => void;
  onStashPop?: (stashRef?: string) => void;
  onStashApply?: (stashRef?: string) => void;
  onStashDrop?: (stashRef?: string) => void;
  onCopyHash?: (oid: string) => void;
}

export function ContextMenu({
  x,
  y,
  branchName,
  tagName,
  isCurrentBranch,
  isRemoteBranch,
  isStash,
  currentBranchName,
  commitOid,
  onClose,
  onCheckoutBranch,
  onMergeBranch,
  onMergeSquash,
  onCreateBranch,
  onDeleteBranch,
  onDeleteRemoteBranch,
  onCherryPick,
  onResetHead,
  onRevertCommit,
  onCreateTag,
  onDeleteTag,
  onRebase,
  onSquashTo,
  onStashPop,
  onStashApply,
  onStashDrop,
  onCopyHash,
}: ContextMenuProps) {
  const { t } = useI18n();
  const menuRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({
    x: Math.max(8, Math.min(x, (typeof window !== 'undefined' ? window.innerWidth : 1000) - 270)),
    y: Math.max(8, Math.min(y, (typeof window !== 'undefined' ? window.innerHeight : 800) - 320)),
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

  return createPortal(
    <div
      ref={menuRef}
      className="custom-context-menu"
      style={{ left: `${pos.x}px`, top: `${pos.y}px`, zIndex: 99999 }}
      role="menu"
    >
      {tagName && (
        <>
          <button
            type="button"
            className="menu-item menu-item-danger"
            onClick={() => {
              onClose();
              onDeleteTag?.(tagName);
            }}
            title={t('contextMenu.deleteTag', { name: tagName })}
          >
            <Trash2 size={14} />
            <span>{t('contextMenu.deleteTag', { name: tagName })}</span>
          </button>
          <div className="menu-separator" />
        </>
      )}

      {isStash && (
        <>
          <button
            type="button"
            className="menu-item"
            onClick={() => {
              onClose();
              onStashPop?.(branchName ?? undefined);
            }}
            title={t('contextMenu.stashPopDesc')}
          >
            <Archive size={14} />
            <span>{t('contextMenu.stashPop')}</span>
          </button>
          <button
            type="button"
            className="menu-item"
            onClick={() => {
              onClose();
              onStashApply?.(branchName ?? undefined);
            }}
            title={t('contextMenu.stashApplyDesc')}
          >
            <Archive size={14} />
            <span>{t('contextMenu.stashApply')}</span>
          </button>
          <button
            type="button"
            className="menu-item menu-item-danger"
            onClick={() => {
              onClose();
              onStashDrop?.(branchName ?? undefined);
            }}
            title={t('contextMenu.stashDropDesc')}
          >
            <Trash2 size={14} />
            <span>{t('contextMenu.stashDrop')}</span>
          </button>
          <div className="menu-separator" />
        </>
      )}

      {!isStash && branchName && (
        <>
          <button
            type="button"
            className="menu-item"
            disabled={isCurrentBranch}
            onClick={() => {
              onClose();
              onCheckoutBranch?.(branchName);
            }}
          >
            <GitBranch size={14} />
            <span>{t('contextMenu.checkout', { name: branchName })}</span>
          </button>
          <button
            type="button"
            className="menu-item"
            disabled={isCurrentBranch || !currentBranchName}
            onClick={() => {
              onClose();
              onMergeBranch?.(branchName);
            }}
          >
            <Merge size={14} />
            <span>{t('contextMenu.merge', { branch: currentBranchName ?? 'HEAD' })}</span>
          </button>
          <button
            type="button"
            className="menu-item"
            disabled={isCurrentBranch || !currentBranchName}
            onClick={() => {
              onClose();
              onMergeSquash?.(branchName);
            }}
            title={t('contextMenu.mergeSquashDesc')}
          >
            <Layers size={14} />
            <span>{t('contextMenu.mergeSquash')}</span>
          </button>
          <button
            type="button"
            className="menu-item"
            disabled={isCurrentBranch || !currentBranchName}
            onClick={() => {
              onClose();
              onRebase?.(branchName);
            }}
            title={t('contextMenu.rebase', { branch: branchName })}
          >
            <GitPullRequest size={14} />
            <span>{t('contextMenu.rebase', { branch: branchName })}</span>
          </button>
          <button
            type="button"
            className="menu-item"
            onClick={() => {
              onClose();
              onCreateBranch?.(branchName);
            }}
          >
            <GitFork size={14} />
            <span>{t('contextMenu.createBranchHere')}</span>
          </button>
          {!isRemoteBranch && (
            <button
              type="button"
              className="menu-item menu-item-danger"
              disabled={isCurrentBranch}
              onClick={() => {
                onClose();
                onDeleteBranch?.(branchName);
              }}
            >
              <Trash2 size={14} />
              <span>{t('contextMenu.deleteBranch', { name: branchName })}</span>
            </button>
          )}
          {isRemoteBranch && (
            <button
              type="button"
              className="menu-item menu-item-danger"
              onClick={() => {
                onClose();
                onDeleteRemoteBranch?.(branchName);
              }}
              title={t('contextMenu.deleteRemotePush')}
            >
              <Trash2 size={14} />
              <span>{t('contextMenu.deleteRemotePush')}</span>
            </button>
          )}
          <div className="menu-separator" />
        </>
      )}

      {!isStash && !branchName && (
        <>
          <button
            type="button"
            className="menu-item"
            onClick={() => {
              onClose();
              onCreateBranch?.(commitOid);
            }}
          >
            <GitFork size={14} />
            <span>{t('contextMenu.createBranchAtCommit')}</span>
          </button>
          {currentBranchName && (
            <button
              type="button"
              className="menu-item"
              onClick={() => {
                onClose();
                onRebase?.(commitOid);
              }}
              title={t('contextMenu.rebaseCurrentOverCommit')}
            >
              <GitPullRequest size={14} />
              <span>{t('contextMenu.rebaseCurrentOverCommit')}</span>
            </button>
          )}
          <button
            type="button"
            className="menu-item"
            onClick={() => {
              onClose();
              onSquashTo?.(commitOid);
            }}
            title={t('contextMenu.squashCommitsToHere')}
          >
            <Layers size={14} />
            <span>{t('contextMenu.squashCommitsToHere')}</span>
          </button>
        </>
      )}

      {!isStash && (
        <button
          type="button"
          className="menu-item"
          onClick={() => {
            onClose();
            onCreateTag?.(commitOid);
          }}
          title={t('contextMenu.createTagAtCommit')}
        >
          <Tag size={14} />
          <span>{t('contextMenu.createTagAtCommit')}</span>
        </button>
      )}

      <button
        type="button"
        className="menu-item"
        onClick={() => {
          onClose();
          onCherryPick?.(commitOid);
        }}
        title={t('contextMenu.cherryPick')}
      >
        <CopyPlus size={14} />
        <span>{t('contextMenu.cherryPick')}</span>
      </button>

      {!isStash && (
        <>
          <button
            type="button"
            className="menu-item"
            onClick={() => {
              onClose();
              onRevertCommit?.(commitOid);
            }}
            title={t('contextMenu.revert')}
          >
            <Undo2 size={14} />
            <span>{t('contextMenu.revertCommit')}</span>
          </button>
          <button
            type="button"
            className="menu-item"
            onClick={() => {
              onClose();
              onResetHead?.(commitOid);
            }}
            title={t('contextMenu.resetBranchToHere', {
              branch: currentBranchName ? `(${currentBranchName})` : 'HEAD',
            })}
          >
            <RotateCcw size={14} />
            <span>
              {t('contextMenu.resetBranchToHere', {
                branch: currentBranchName ? `(${currentBranchName})` : 'HEAD',
              })}
            </span>
          </button>
        </>
      )}

      <button
        type="button"
        className="menu-item"
        onClick={() => {
          onClose();
          onCopyHash?.(commitOid);
        }}
      >
        <Copy size={14} />
        <span>{t('contextMenu.copyHashWithOid', { hash: commitOid.slice(0, 7) })}</span>
      </button>
    </div>,
    document.body
  );
}
