import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Archive, GitBranch, Globe, MoreVertical, Tag } from 'lucide-react';
import { useI18n } from '../i18n';

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
  activeRefName?: string | null;
  onClose: () => void;
  onCloseContextMenu?: () => void;
  onCheckoutBranch: (branch: string) => void;
  onOpenContextMenu: (e: React.MouseEvent, ref: ParsedRef) => void;
}

export function RefPopover({
  x,
  y,
  refs,
  laneColor = '#3b82f6',
  activeRefName,
  onClose,
  onCloseContextMenu,
  onCheckoutBranch,
  onOpenContextMenu,
}: RefPopoverProps) {
  const { t } = useI18n();
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
      const target = e.target as HTMLElement | null;
      if (target?.closest('.custom-context-menu')) {
        return;
      }
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (document.querySelector('.custom-context-menu')) {
          return;
        }
        onClose();
      }
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

  const renderItem = (
    ref: ParsedRef,
    keySuffix: string,
    icon: React.ReactNode,
    extraClass = ''
  ) => {
    const isMenuOpen = activeRefName === ref.name;
    return (
      <div
        key={`${ref.name}-${keySuffix}`}
        className={`ref-popover-item ${ref.isHead ? 'is-active' : ''} ${
          isMenuOpen ? 'has-context-menu' : ''
        } ${extraClass}`}
        style={
          ref.isHead
            ? {
                background: laneColor,
                color: '#ffffff',
              }
            : undefined
        }
        onClick={() => {
          if (!ref.isTag && !ref.isStash && !ref.isHead) {
            onCheckoutBranch(ref.name);
            onClose();
          }
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onOpenContextMenu(e, ref);
        }}
        title={
          ref.isHead
            ? t('refPopover.currentBranch')
            : ref.isTag
            ? t('refPopover.tagTitle', { name: ref.name })
            : ref.isStash
            ? t('refPopover.stashTitle', { name: ref.name })
            : t('refPopover.switchTo', { name: ref.name })
        }
      >
        {icon}
        <span className="ref-item-name">{ref.name}</span>
        {ref.isHead && (
          <span className="ref-item-dot" style={{ color: laneColor }}>
            •
          </span>
        )}
        <button
          type="button"
          className={`ref-item-more ${isMenuOpen ? 'is-active' : ''}`}
          title={ref.isStash ? t('refPopover.moreStashActions') : t('refPopover.moreActions')}
          onMouseDown={(e) => {
            if (isMenuOpen) {
              e.preventDefault();
              e.stopPropagation();
            }
          }}
          onClick={(e) => {
            e.stopPropagation();
            if (isMenuOpen) {
              onCloseContextMenu?.();
            } else {
              onOpenContextMenu(e, ref);
            }
          }}
        >
          <MoreVertical size={12} />
        </button>
      </div>
    );
  };

  return createPortal(
    <div
      ref={popoverRef}
      className="custom-ref-popover"
      style={{ left: `${pos.x}px`, top: `${pos.y}px`, zIndex: 99998 }}
      role="dialog"
      aria-label={t('refPopover.dialogLabel')}
    >
      <div className="ref-popover-header">
        <span>{t('refPopover.title', { count: refs.length })}</span>
      </div>

      <div className="ref-popover-list">
        {localBranches.length > 0 && (
          <div className="ref-popover-group">
            <span className="ref-popover-group-title">{t('refPopover.localBranches')}</span>
            {localBranches.map((ref) =>
              renderItem(ref, 'local', <GitBranch size={13} color={laneColor} />)
            )}
          </div>
        )}

        {remoteBranches.length > 0 && (
          <div className="ref-popover-group">
            <span className="ref-popover-group-title">{t('refPopover.remoteBranches')}</span>
            {remoteBranches.map((ref) =>
              renderItem(ref, 'remote', <Globe size={13} className="ref-icon-remote" />)
            )}
          </div>
        )}

        {tags.length > 0 && (
          <div className="ref-popover-group">
            <span className="ref-popover-group-title">{t('refPopover.tags')}</span>
            {tags.map((ref) =>
              renderItem(ref, 'tag', <Tag size={13} className="ref-icon-tag" />, 'is-tag')
            )}
          </div>
        )}

        {stashes.length > 0 && (
          <div className="ref-popover-group">
            <span className="ref-popover-group-title">{t('refPopover.stashes')}</span>
            {stashes.map((ref) =>
              renderItem(
                ref,
                'stash',
                <Archive size={13} className="ref-icon-stash" />,
                'is-stash'
              )
            )}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
