import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Archive, GitBranch, Globe, MoreVertical, Tag } from 'lucide-react';

export interface ParsedRef {
  raw: string;
  name: string;
  isHead: boolean;
  isRemote: boolean;
  isTag: boolean;
  isStash?: boolean;
}

export interface RefPopoverProps {
  x: number;
  y: number;
  refs: ParsedRef[];
  laneColor?: string;
  currentBranch?: string | null;
  onClose: () => void;
  onCheckoutBranch: (branch: string) => void;
  onOpenContextMenu: (e: React.MouseEvent, ref: ParsedRef) => void;
}

export function RefPopover({
  x,
  y,
  refs,
  laneColor = '#3b82f6',
  onClose,
  onCheckoutBranch,
  onOpenContextMenu,
}: RefPopoverProps) {
  const popoverRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({
    x: Math.max(12, Math.min(x, (typeof window !== 'undefined' ? window.innerWidth : 1000) - 250)),
    y: Math.max(12, Math.min(y, (typeof window !== 'undefined' ? window.innerHeight : 800) - 320)),
  });

  useLayoutEffect(() => {
    if (!popoverRef.current) return;
    const rect = popoverRef.current.getBoundingClientRect();
    const pad = 12;
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
    const handleClickOutside = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };

    window.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  const localBranches = refs.filter((r) => !r.isTag && !r.isRemote && !r.isStash);
  const tags = refs.filter((r) => r.isTag);
  const remoteBranches = refs.filter((r) => r.isRemote);
  const stashes = refs.filter((r) => r.isStash);

  return createPortal(
    <div
      ref={popoverRef}
      className="custom-ref-popover"
      style={{ left: `${pos.x}px`, top: `${pos.y}px`, zIndex: 99998 }}
      role="dialog"
      aria-label="Referências do commit"
    >
      <div className="ref-popover-header">
        <span>Referências ({refs.length})</span>
      </div>

      <div className="ref-popover-list">
        {localBranches.length > 0 && (
          <div className="ref-popover-group">
            <span className="ref-popover-group-title">Branches Locais</span>
            {localBranches.map((ref) => (
              <div
                key={`${ref.name}-local`}
                className={`ref-popover-item ${ref.isHead ? 'is-active' : ''}`}
                style={
                  ref.isHead
                    ? {
                        background: `color-mix(in srgb, ${laneColor} 25%, transparent)`,
                        color: '#ffffff',
                      }
                    : undefined
                }
                onClick={() => {
                  if (!ref.isHead) {
                    onCheckoutBranch(ref.name);
                    onClose();
                  }
                }}
                onContextMenu={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onOpenContextMenu(e, ref);
                }}
                title={ref.isHead ? 'Branch atual' : `Clique para alternar para ${ref.name}`}
              >
                <GitBranch size={13} color={laneColor} />
                <span className="ref-item-name">{ref.name}</span>
                {ref.isHead && (
                  <span className="ref-item-dot" style={{ color: laneColor }}>
                    •
                  </span>
                )}
                <button
                  type="button"
                  className="ref-item-more"
                  title="Mais ações"
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpenContextMenu(e, ref);
                  }}
                >
                  <MoreVertical size={12} />
                </button>
              </div>
            ))}
          </div>
        )}

        {remoteBranches.length > 0 && (
          <div className="ref-popover-group">
            <span className="ref-popover-group-title">Branches Remotas</span>
            {remoteBranches.map((ref) => (
              <div
                key={`${ref.name}-remote`}
                className="ref-popover-item"
                onClick={() => {
                  onCheckoutBranch(ref.name);
                  onClose();
                }}
                onContextMenu={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onOpenContextMenu(e, ref);
                }}
                title={`Clique para alternar para ${ref.name}`}
              >
                <Globe size={13} className="ref-icon-remote" />
                <span className="ref-item-name">{ref.name}</span>
                <button
                  type="button"
                  className="ref-item-more"
                  title="Mais ações"
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpenContextMenu(e, ref);
                  }}
                >
                  <MoreVertical size={12} />
                </button>
              </div>
            ))}
          </div>
        )}

        {tags.length > 0 && (
          <div className="ref-popover-group">
            <span className="ref-popover-group-title">Tags</span>
            {tags.map((ref) => (
              <div
                key={`${ref.name}-tag`}
                className="ref-popover-item is-tag"
                onContextMenu={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onOpenContextMenu(e, ref);
                }}
              >
                <Tag size={13} className="ref-icon-tag" />
                <span className="ref-item-name">{ref.name}</span>
                <button
                  type="button"
                  className="ref-item-more"
                  title="Mais ações"
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpenContextMenu(e, ref);
                  }}
                >
                  <MoreVertical size={12} />
                </button>
              </div>
            ))}
          </div>
        )}

        {stashes.length > 0 && (
          <div className="ref-popover-group">
            <span className="ref-popover-group-title">Stashes</span>
            {stashes.map((ref) => (
              <div
                key={`${ref.name}-stash`}
                className="ref-popover-item is-stash"
                onContextMenu={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onOpenContextMenu(e, ref);
                }}
              >
                <Archive size={13} className="ref-icon-stash" />
                <span className="ref-item-name">{ref.name}</span>
                <button
                  type="button"
                  className="ref-item-more"
                  title="Mais ações de stash"
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpenContextMenu(e, ref);
                  }}
                >
                  <MoreVertical size={12} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
