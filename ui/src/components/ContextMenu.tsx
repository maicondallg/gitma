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
            title={`Excluir tag ${tagName}`}
          >
            <Trash2 size={14} />
            <span>Excluir tag ({tagName})</span>
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
            title="Aplica o stash e o remove da lista"
          >
            <Archive size={14} />
            <span>Aplicar e remover (Pop)</span>
          </button>
          <button
            type="button"
            className="menu-item"
            onClick={() => {
              onClose();
              onStashApply?.(branchName ?? undefined);
            }}
            title="Aplica o stash mantendo-o na lista"
          >
            <Archive size={14} />
            <span>Aplicar e manter (Apply)</span>
          </button>
          <button
            type="button"
            className="menu-item menu-item-danger"
            onClick={() => {
              onClose();
              onStashDrop?.(branchName ?? undefined);
            }}
            title="Descarta definitivamente este stash"
          >
            <Trash2 size={14} />
            <span>Descartar stash (Drop)</span>
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
            <span>Fazer checkout ({branchName})</span>
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
            <span>Fazer merge em {currentBranchName ?? 'HEAD'}</span>
          </button>
          <button
            type="button"
            className="menu-item"
            disabled={isCurrentBranch || !currentBranchName}
            onClick={() => {
              onClose();
              onMergeSquash?.(branchName);
            }}
            title="Mescla todas as alterações da branch em um único commit no stage"
          >
            <Layers size={14} />
            <span>Fazer merge com squash</span>
          </button>
          <button
            type="button"
            className="menu-item"
            disabled={isCurrentBranch || !currentBranchName}
            onClick={() => {
              onClose();
              onRebase?.(branchName);
            }}
            title={`Rebasear ${currentBranchName ?? 'branch atual'} sobre ${branchName}`}
          >
            <GitPullRequest size={14} />
            <span>Rebasear branch atual sobre {branchName}</span>
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
            <span>Criar nova branch a partir daqui...</span>
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
              <span>Excluir branch ({branchName})</span>
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
              title={`Excluir branch ${branchName} no repositório remoto`}
            >
              <Trash2 size={14} />
              <span>Excluir no remoto (push --delete)</span>
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
            <span>Criar branch neste commit...</span>
          </button>
          {currentBranchName && (
            <button
              type="button"
              className="menu-item"
              onClick={() => {
                onClose();
                onRebase?.(commitOid);
              }}
              title={`Rebasear ${currentBranchName} sobre o commit ${commitOid.slice(0, 7)}`}
            >
              <GitPullRequest size={14} />
              <span>Rebasear branch atual sobre este commit</span>
            </button>
          )}
          <button
            type="button"
            className="menu-item"
            onClick={() => {
              onClose();
              onSquashTo?.(commitOid);
            }}
            title="Consolida todos os commits posteriores em um único commit a partir deste ponto"
          >
            <Layers size={14} />
            <span>Squash dos commits até aqui...</span>
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
          title="Criar tag de versão neste commit"
        >
          <Tag size={14} />
          <span>Criar Tag neste commit...</span>
        </button>
      )}

      <button
        type="button"
        className="menu-item"
        onClick={() => {
          onClose();
          onCherryPick?.(commitOid);
        }}
        title="Aplica este commit na branch atual"
      >
        <CopyPlus size={14} />
        <span>Cherry-pick este commit</span>
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
            title="Cria um novo commit desfazendo as alterações deste commit com segurança"
          >
            <Undo2 size={14} />
            <span>Reverter este commit...</span>
          </button>
          <button
            type="button"
            className="menu-item"
            onClick={() => {
              onClose();
              onResetHead?.(commitOid);
            }}
            title={`Resetar ${currentBranchName ? `a branch ${currentBranchName}` : 'HEAD'} para este commit`}
          >
            <RotateCcw size={14} />
            <span>Resetar {currentBranchName ? `branch (${currentBranchName})` : 'HEAD'} para aqui...</span>
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
        <span>Copiar hash ({commitOid.slice(0, 7)})</span>
      </button>
    </div>,
    document.body
  );
}
