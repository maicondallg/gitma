import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  ArrowDown,
  ArrowUp,
  Check,
  ChevronLeft,
  ChevronRight,
  Code2,
  Copy,
  FolderGit2,
  FolderOpen,
  GitBranch,
  Globe,
  History,
  Home,
  Palette,
  Plus,
  RotateCcw,
  Settings,
  Terminal,
  Edit2,
  X,
  XCircle,
} from 'lucide-react';
import { useAppStore, loadSavedGroupNames } from '../store/app';
import { useI18n } from '../i18n';
import type { TabItem } from '../lib/types';
import logoSvg from '../../logo.svg';

export const TAB_PRESET_COLORS = [
  { id: 'blue', color: '#3b82f6', label: 'Azul' },
  { id: 'emerald', color: '#10b981', label: 'Verde' },
  { id: 'purple', color: '#a855f7', label: 'Roxo' },
  { id: 'orange', color: '#f97316', label: 'Laranja' },
  { id: 'red', color: '#ef4444', label: 'Vermelho' },
  { id: 'amber', color: '#eab308', label: 'Amarelo' },
  { id: 'cyan', color: '#06b6d4', label: 'Ciano' },
  { id: 'pink', color: '#ec4899', label: 'Rosa' },
];

export function getGroupLabel(color: string | null | undefined, groupNames?: Record<string, string>, t?: (k: string, p?: any) => string): string {
  if (!color) return t ? t('tabs.noGroup') : 'Sem grupo';
  const custom = groupNames ? groupNames[color.toLowerCase()] : undefined;
  if (custom && custom.trim().length > 0) return custom.trim();
  const found = TAB_PRESET_COLORS.find((c) => c.color.toLowerCase() === color.toLowerCase());
  if (found) {
    return t ? t(`colors.${found.id}`) : found.label;
  }
  return t ? t('tabs.group') : 'Grupo';
}

export function getColorLabel(color: string | null | undefined, t?: (k: string, p?: any) => string): string {
  return getGroupLabel(color, loadSavedGroupNames(), t);
}

const COLLAPSED_COLORS_KEY = 'Gitma:collapsed-tab-colors';

function loadSavedCollapsedColors(): Set<string> {
  try {
    const raw = localStorage.getItem(COLLAPSED_COLORS_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? new Set(arr.map((c: string) => String(c).toLowerCase())) : new Set();
  } catch {
    return new Set();
  }
}

function saveCollapsedColors(colors: Set<string>): void {
  try {
    localStorage.setItem(COLLAPSED_COLORS_KEY, JSON.stringify(Array.from(colors)));
  } catch {
    // ignore
  }
}

export function TabBar() {
  const tabs = useAppStore((s) => s.tabs);
  const activeTabId = useAppStore((s) => s.activeTabId);
  const snapshot = useAppStore((s) => s.snapshot);
  const openHome = useAppStore((s) => s.openHome);
  const switchTab = useAppStore((s) => s.switchTab);
  const closeTab = useAppStore((s) => s.closeTab);
  const closeOtherTabs = useAppStore((s) => s.closeOtherTabs);
  const closeTabsToRight = useAppStore((s) => s.closeTabsToRight);
  const reorderTabs = useAppStore((s) => s.reorderTabs);
  const reorderTabsList = useAppStore((s) => s.reorderTabsList);
  const setTabName = useAppStore((s) => s.setTabName);
  const setTabColor = useAppStore((s) => s.setTabColor);
  const groupNames = useAppStore((s) => s.groupNames);
  const setGroupName = useAppStore((s) => s.setGroupName);
  const openRepository = useAppStore((s) => s.openRepository);
  const openSettings = useAppStore((s) => s.openSettings);
  const openReflog = useAppStore((s) => s.openReflog);
  const openRemotesModal = useAppStore((s) => s.openRemotesModal);
  const opening = useAppStore((s) => s.opening);
  const operation = useAppStore((s) => s.operation);
  const runOperation = useAppStore((s) => s.runOperation);
  const openTerminal = useAppStore((s) => s.openTerminal);
  const { t } = useI18n();

  const [editingGroupColor, setEditingGroupColor] = useState<string | null>(null);
  const [editingGroupName, setEditingGroupName] = useState('');
  const groupEditStartTimeRef = useRef(0);
  const lastGroupClickRef = useRef<{ color: string; time: number; x: number; y: number } | null>(null);

  const [editingTabId, setEditingTabId] = useState<string | null>(null);
  const [editingTabName, setEditingTabName] = useState('');
  const editStartTimeRef = useRef(0);
  const lastTabClickRef = useRef<{ id: string; time: number; x: number; y: number } | null>(null);

  const tabListRef = useRef<HTMLDivElement>(null);
  const [slidingIndex, setSlidingIndex] = useState<number | null>(null);
  const dragRef = useRef<{
    active: boolean;
    tabId: string;
    startIndex: number;
    currentIndex: number;
    startX: number;
    hasMoved: boolean;
  } | null>(null);

  const [draggingGroupIndex, setDraggingGroupIndex] = useState<number | null>(null);
  const groupDragRef = useRef<{
    active: boolean;
    groupIndex: number;
    startX: number;
    hasMoved: boolean;
  } | null>(null);
  const justGroupDraggedRef = useRef(false);

  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    tab: TabItem;
    index: number;
  } | null>(null);

  const [collapsedColors, setCollapsedColors] = useState<Set<string>>(() => loadSavedCollapsedColors());

  const toggleColorCollapse = (color: string) => {
    const key = color.toLowerCase();
    setCollapsedColors((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      saveCollapsedColors(next);
      return next;
    });
  };

  const collapseAllColors = () => {
    const all = new Set<string>();
    tabs.forEach((t) => {
      if (t.color) all.add(t.color.toLowerCase());
    });
    setCollapsedColors(all);
    saveCollapsedColors(all);
  };

  const expandAllColors = () => {
    const empty = new Set<string>();
    setCollapsedColors(empty);
    saveCollapsedColors(empty);
  };

  // Se a aba ativa mudar para uma aba de um grupo recolhido, expande automaticamente
  const prevActiveTabIdRef = useRef(activeTabId);
  useEffect(() => {
    if (activeTabId && activeTabId !== prevActiveTabIdRef.current && activeTabId !== 'home') {
      prevActiveTabIdRef.current = activeTabId;
      const activeTab = tabs.find((t) => t.id === activeTabId);
      if (activeTab?.color && collapsedColors.has(activeTab.color.toLowerCase())) {
        setCollapsedColors((prev) => {
          const next = new Set(prev);
          next.delete(activeTab.color!.toLowerCase());
          saveCollapsedColors(next);
          return next;
        });
      }
    } else {
      prevActiveTabIdRef.current = activeTabId;
    }
  }, [activeTabId, tabs, collapsedColors]);


  const justDraggedRef = useRef(false);

  const handlePointerDown = (e: React.PointerEvent, index: number, tab: TabItem) => {
    // Botão do meio do mouse (e.button === 1): fecha imediatamente a aba
    if (e.button === 1) {
      e.preventDefault();
      e.stopPropagation();
      void closeTab(tab.id);
      return;
    }

    // Apenas botão esquerdo para seleção e deslize
    if (e.button !== 0) return;

    // Se o clique foi no botão de fechar, não inicia arraste
    if ((e.target as HTMLElement).closest('.tab-close')) return;

    // Se for double click (e.detail === 2 ou 2 cliques rápidos dentro de 450ms), ativa modo de edição
    const now = Date.now();
    const last = lastTabClickRef.current;
    const xDist = (Number.isFinite(e.clientX) && Number.isFinite(last?.x)) ? Math.abs(e.clientX - last!.x) : 0;
    const yDist = (Number.isFinite(e.clientY) && Number.isFinite(last?.y)) ? Math.abs(e.clientY - last!.y) : 0;
    const isDoubleClick =
      e.detail === 2 ||
      (last !== null &&
        last.id === tab.id &&
        now - last.time < 450 &&
        xDist < 25 &&
        yDist < 25);

    lastTabClickRef.current = { id: tab.id, time: now, x: Number.isFinite(e.clientX) ? e.clientX : 0, y: Number.isFinite(e.clientY) ? e.clientY : 0 };

    if (isDoubleClick) {
      lastTabClickRef.current = null;
      e.preventDefault();
      e.stopPropagation();
      editStartTimeRef.current = now;
      setEditingTabId(tab.id);
      setEditingTabName(tab.name);
      return;
    }

    dragRef.current = {
      active: true,
      tabId: tab.id,
      startIndex: index,
      currentIndex: index,
      startX: e.clientX,
      hasMoved: false,
    };

    const onPointerMove = (moveEvent: PointerEvent) => {
      if (!dragRef.current || !dragRef.current.active) return;
      const deltaX = moveEvent.clientX - dragRef.current.startX;

      if (!dragRef.current.hasMoved && Math.abs(deltaX) > 6) {
        dragRef.current.hasMoved = true;
        setSlidingIndex(dragRef.current.currentIndex);
      }

      if (dragRef.current.hasMoved && tabListRef.current) {
        const tabElements = Array.from(tabListRef.current.querySelectorAll<HTMLElement>('.tab-project'));
        for (let i = 0; i < tabElements.length; i++) {
          const rect = tabElements[i].getBoundingClientRect();
          if (moveEvent.clientX >= rect.left && moveEvent.clientX <= rect.right) {
            const targetIdx = Number(tabElements[i].dataset.tabIndex);
            if (!Number.isNaN(targetIdx) && targetIdx !== dragRef.current.currentIndex) {
              reorderTabs(dragRef.current.currentIndex, targetIdx);
              dragRef.current.currentIndex = targetIdx;
              setSlidingIndex(targetIdx);
            }
            break;
          }
        }
      }
    };

    const onPointerUp = () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);

      if (!dragRef.current) return;
      const { hasMoved, tabId } = dragRef.current;
      dragRef.current = null;
      setSlidingIndex(null);

      if (hasMoved) {
        justDraggedRef.current = true;
      } else {
        void switchTab(tabId);
      }
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);
  };

  // Agrupa abas consecutivas com a mesma cor
  interface TabGroup {
    key: string;
    color: string | null;
    tabs: Array<{ tab: TabItem; index: number }>;
  }

  function reorderTabsByGroup(
    allTabs: TabItem[],
    sourceGroupIndex: number,
    targetGroupIndex: number,
    allGroups: TabGroup[]
  ): TabItem[] {
    if (sourceGroupIndex === targetGroupIndex) return allTabs;
    const srcGroup = allGroups[sourceGroupIndex];
    const dstGroup = allGroups[targetGroupIndex];
    if (!srcGroup || !dstGroup) return allTabs;

    const srcTabIds = new Set(srcGroup.tabs.map((t) => t.tab.id));
    const remaining = allTabs.filter((t) => !srcTabIds.has(t.id));
    const srcTabs = srcGroup.tabs.map((t) => t.tab);

    const dstTabIds = dstGroup.tabs.map((t) => t.tab.id);
    if (sourceGroupIndex < targetGroupIndex) {
      const lastDstId = dstTabIds[dstTabIds.length - 1];
      const idx = remaining.findIndex((t) => t.id === lastDstId);
      const insertAt = idx === -1 ? remaining.length : idx + 1;
      return [...remaining.slice(0, insertAt), ...srcTabs, ...remaining.slice(insertAt)];
    } else {
      const firstDstId = dstTabIds[0];
      const idx = remaining.findIndex((t) => t.id === firstDstId);
      const insertAt = idx === -1 ? 0 : idx;
      return [...remaining.slice(0, insertAt), ...srcTabs, ...remaining.slice(insertAt)];
    }
  }

  const handleGroupPointerDown = (
    e: React.PointerEvent,
    groupIndex: number,
    groupColor?: string | null,
    colorLabel?: string
  ) => {
    if (e.button !== 0) return;
    if ((e.target as HTMLElement).closest('.tab-group-name-input')) return;

    const now = Date.now();
    const last = lastGroupClickRef.current;
    const xDist = (Number.isFinite(e.clientX) && Number.isFinite(last?.x)) ? Math.abs(e.clientX - last!.x) : 0;
    const yDist = (Number.isFinite(e.clientY) && Number.isFinite(last?.y)) ? Math.abs(e.clientY - last!.y) : 0;
    const isDoubleClick =
      e.detail === 2 ||
      (last !== null &&
        groupColor &&
        last.color === groupColor &&
        now - last.time < 450 &&
        xDist < 25 &&
        yDist < 25);

    if (groupColor) {
      lastGroupClickRef.current = { color: groupColor, time: now, x: Number.isFinite(e.clientX) ? e.clientX : 0, y: Number.isFinite(e.clientY) ? e.clientY : 0 };
    }

    if (isDoubleClick) {
      lastGroupClickRef.current = null;
      e.preventDefault();
      e.stopPropagation();
      if (groupColor) {
        groupEditStartTimeRef.current = now;
        setEditingGroupColor(groupColor);
        setEditingGroupName(colorLabel ?? '');
      }
      return;
    }

    groupDragRef.current = {
      active: true,
      groupIndex,
      startX: e.clientX,
      hasMoved: false,
    };

    const onPointerMove = (moveEvent: PointerEvent) => {
      if (!groupDragRef.current || !groupDragRef.current.active) return;
      const deltaX = moveEvent.clientX - groupDragRef.current.startX;

      if (!groupDragRef.current.hasMoved && Math.abs(deltaX) > 6) {
        groupDragRef.current.hasMoved = true;
        setDraggingGroupIndex(groupDragRef.current.groupIndex);
      }

      if (groupDragRef.current.hasMoved && tabListRef.current) {
        const groupElements = Array.from(tabListRef.current.querySelectorAll<HTMLElement>('[data-group-index]'));
        for (let i = 0; i < groupElements.length; i++) {
          const rect = groupElements[i].getBoundingClientRect();
          if (moveEvent.clientX >= rect.left && moveEvent.clientX <= rect.right) {
            const targetGroupIdx = Number(groupElements[i].dataset.groupIndex);
            if (!Number.isNaN(targetGroupIdx) && targetGroupIdx !== groupDragRef.current.groupIndex) {
              const curTabs = useAppStore.getState().tabs;
              const curGroups: TabGroup[] = [];
              curTabs.forEach((tab, idx) => {
                const prev = curGroups[curGroups.length - 1];
                if (prev && prev.color && tab.color && prev.color.toLowerCase() === tab.color.toLowerCase()) {
                  prev.tabs.push({ tab, index: idx });
                } else {
                  curGroups.push({ key: `${tab.color ?? 'none'}-${idx}`, color: tab.color ?? null, tabs: [{ tab, index: idx }] });
                }
              });

              const newTabs = reorderTabsByGroup(curTabs, groupDragRef.current.groupIndex, targetGroupIdx, curGroups);
              reorderTabsList(newTabs);
              groupDragRef.current.groupIndex = targetGroupIdx;
              setDraggingGroupIndex(targetGroupIdx);
            }
            break;
          }
        }
      }
    };

    const onPointerUp = () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);

      if (!groupDragRef.current) return;
      const { hasMoved } = groupDragRef.current;
      groupDragRef.current = null;
      setDraggingGroupIndex(null);

      if (hasMoved) {
        justGroupDraggedRef.current = true;
      }
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);
  };

  const groups: TabGroup[] = [];
  tabs.forEach((tab, index) => {
    const prevGroup = groups[groups.length - 1];
    if (
      prevGroup &&
      prevGroup.color &&
      tab.color &&
      prevGroup.color.toLowerCase() === tab.color.toLowerCase()
    ) {
      prevGroup.tabs.push({ tab, index });
    } else {
      groups.push({
        key: `${tab.color ?? 'none'}-${index}`,
        color: tab.color ?? null,
        tabs: [{ tab, index }],
      });
    }
  });

  return (
    <nav className="tab-bar" aria-label="Abas de projetos">
      {/* 1. Logo Gitma à esquerda */}
      <div className="tab-bar-brand" title="Gitma">
        <img src={logoSvg} alt="Gitma" className="brand-icon" />
        <span className="brand-text">Gitma</span>
      </div>

      <div className="tab-separator" />

      {/* 2. Aba Início */}
      <button
        type="button"
        className={`tab-item tab-home ${activeTabId === 'home' ? 'active' : ''}`}
        onClick={() => openHome()}
        title={t('tabs.home')}
        aria-label={t('tabs.home')}
      >
        <Home size={14} className="tab-icon" />
        <span className="tab-title">{t('tabs.home')}</span>
      </button>

      <div className="tab-separator" />

      {/* 3. Lista de Abas e Grupos de Repositórios */}
      <div className="tab-list" ref={tabListRef}>
        {groups.map((group, groupIndex) => {
          const isCollapsed = group.color ? collapsedColors.has(group.color.toLowerCase()) : false;
          const colorLabel = getGroupLabel(group.color, groupNames, t);
          const hasMultiple = group.tabs.length > 1;
          const isEditing = editingGroupColor === group.color;

          // Se o grupo está recolhido:
          if (group.color && isCollapsed) {
            const activeTabInGroup = group.tabs.find((t) => t.tab.id === activeTabId);
            const isActive = !!activeTabInGroup;

            return (
              <button
                key={`collapsed-${group.key}`}
                data-group-index={groupIndex}
                type="button"
                className={`tab-group-chip collapsed ${isActive ? 'active' : ''} ${draggingGroupIndex === groupIndex ? 'is-group-dragging' : ''}`}
                style={{
                  backgroundColor: isActive ? `${group.color}2e` : `${group.color}1c`,
                  borderColor: isActive ? group.color : `${group.color}50`,
                }}
                onPointerDown={(e) => handleGroupPointerDown(e, groupIndex, group.color, colorLabel)}
                onClick={(e) => {
                  if (justGroupDraggedRef.current) {
                    justGroupDraggedRef.current = false;
                    return;
                  }
                  if (isEditing) return;
                  if (e.detail >= 2) return;
                  toggleColorCollapse(group.color!);
                  if (activeTabInGroup) {
                    void switchTab(activeTabInGroup.tab.id);
                  } else if (group.tabs[0]) {
                    void switchTab(group.tabs[0].tab.id);
                  }
                }}
                onDoubleClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  if (group.color) {
                    groupEditStartTimeRef.current = Date.now();
                    setEditingGroupColor(group.color);
                    setEditingGroupName(colorLabel);
                  }
                }}
                onContextMenu={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  const targetTab = activeTabInGroup?.tab ?? group.tabs[0]?.tab;
                  if (targetTab) {
                    setContextMenu({
                      x: e.clientX,
                      y: e.clientY,
                      tab: targetTab,
                      index: group.tabs[0].index,
                    });
                  }
                }}
                title={`${t('tabs.group')} ${colorLabel} (${group.tabs.length}):\n${group.tabs.map((t) => t.tab.name).join('\n')}`}
                aria-label={t('tabs.expandGroupAria', { name: colorLabel })}
              >
                <span
                  className="tab-group-chip-dot"
                  style={{ backgroundColor: group.color, boxShadow: `0 0 6px ${group.color}` }}
                />
                {isEditing ? (
                  <input
                    ref={(input) => {
                      if (input) {
                        requestAnimationFrame(() => {
                          if (input && document.activeElement !== input) {
                            input.focus();
                            input.select();
                          }
                        });
                      }
                    }}
                    type="text"
                    className="tab-group-name-input"
                    value={editingGroupName}
                    onClick={(e) => e.stopPropagation()}
                    onDoubleClick={(e) => e.stopPropagation()}
                    onPointerDown={(e) => e.stopPropagation()}
                    onMouseDown={(e) => e.stopPropagation()}
                    onMouseUp={(e) => e.stopPropagation()}
                    onChange={(e) => setEditingGroupName(e.target.value)}
                    onBlur={() => {
                      if (Date.now() - groupEditStartTimeRef.current < 200) {
                        return;
                      }
                      if (group.color) {
                        setGroupName(group.color, editingGroupName);
                      }
                      setEditingGroupColor(null);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.stopPropagation();
                        if (group.color) {
                          setGroupName(group.color, editingGroupName);
                        }
                        setEditingGroupColor(null);
                      } else if (e.key === 'Escape') {
                        e.stopPropagation();
                        setEditingGroupColor(null);
                      }
                    }}
                    title={t('tabs.renameHint')}
                    aria-label={t('tabs.groupNameAria')}
                  />
                ) : (
                  <span
                    className="tab-group-chip-name"
                    onDoubleClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      if (group.color) {
                        groupEditStartTimeRef.current = Date.now();
                        setEditingGroupColor(group.color);
                        setEditingGroupName(colorLabel);
                      }
                    }}
                    title={t('tabs.doubleClickToRename')}
                  >
                    {colorLabel} ({group.tabs.length})
                  </span>
                )}
                {activeTabInGroup && (
                  <span className="tab-group-chip-active-tab" title={t('tabs.activeTabInGroup', { name: activeTabInGroup.tab.name })}>
                    {activeTabInGroup.tab.name}
                  </span>
                )}
                <ChevronRight size={12} className="tab-group-chip-icon" />
              </button>
            );
          }

          // Se o grupo está expandido:
          return (
            <div key={`group-${group.key}`} data-group-index={groupIndex} className="tab-group-wrapper">
              {group.color && hasMultiple && (
                <button
                  type="button"
                  className={`tab-group-chip expanded ${draggingGroupIndex === groupIndex ? 'is-group-dragging' : ''}`}
                  style={{
                    backgroundColor: `${group.color}18`,
                    borderColor: `${group.color}40`,
                  }}
                  onPointerDown={(e) => handleGroupPointerDown(e, groupIndex, group.color, colorLabel)}
                  onClick={(e) => {
                    if (justGroupDraggedRef.current) {
                      justGroupDraggedRef.current = false;
                      return;
                    }
                    if (isEditing) return;
                    if (e.detail >= 2) return;
                    toggleColorCollapse(group.color!);
                  }}
                  onDoubleClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (group.color) {
                      groupEditStartTimeRef.current = Date.now();
                      setEditingGroupColor(group.color);
                      setEditingGroupName(colorLabel);
                    }
                  }}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (group.tabs[0]) {
                      setContextMenu({
                        x: e.clientX,
                        y: e.clientY,
                        tab: group.tabs[0].tab,
                        index: group.tabs[0].index,
                      });
                    }
                  }}
                  title={t('tabs.groupTooltip', { name: colorLabel, count: group.tabs.length })}
                  aria-label={t('tabs.collapseGroupAria', { name: colorLabel })}
                >
                  <span
                    className="tab-group-chip-dot"
                    style={{ backgroundColor: group.color }}
                  />
                  {isEditing ? (
                    <input
                      ref={(input) => {
                        if (input) {
                          requestAnimationFrame(() => {
                            if (input && document.activeElement !== input) {
                              input.focus();
                              input.select();
                            }
                          });
                        }
                      }}
                      type="text"
                      className="tab-group-name-input"
                      value={editingGroupName}
                      onClick={(e) => e.stopPropagation()}
                      onDoubleClick={(e) => e.stopPropagation()}
                      onPointerDown={(e) => e.stopPropagation()}
                      onMouseDown={(e) => e.stopPropagation()}
                      onMouseUp={(e) => e.stopPropagation()}
                      onChange={(e) => setEditingGroupName(e.target.value)}
                      onBlur={() => {
                        if (Date.now() - groupEditStartTimeRef.current < 200) {
                          return;
                        }
                        if (group.color) {
                          setGroupName(group.color, editingGroupName);
                        }
                        setEditingGroupColor(null);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.stopPropagation();
                          if (group.color) {
                            setGroupName(group.color, editingGroupName);
                          }
                          setEditingGroupColor(null);
                        } else if (e.key === 'Escape') {
                          e.stopPropagation();
                          setEditingGroupColor(null);
                        }
                      }}
                      title={t('tabs.renameHint')}
                      aria-label={t('tabs.groupNameAria')}
                    />
                  ) : (
                    <span
                      className="tab-group-chip-name"
                      onDoubleClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        if (group.color) {
                          groupEditStartTimeRef.current = Date.now();
                          setEditingGroupColor(group.color);
                          setEditingGroupName(colorLabel);
                        }
                      }}
                      title={t('tabs.doubleClickToRename')}
                    >
                      {colorLabel} ({group.tabs.length})
                    </span>
                  )}
                  <ChevronLeft size={12} className="tab-group-chip-icon" />
                </button>
              )}

              {group.tabs.map(({ tab, index }) => {
                const isActive = tab.id === activeTabId;
                const branch = isActive ? snapshot?.branch : tab.snapshot?.branch;
                const isSliding = slidingIndex === index;

                return (
                  <div
                    key={tab.id}
                    data-tab-index={index}
                    role="button"
                    tabIndex={0}
                    onClick={(e) => {
                      if (editingTabId === tab.id) return;
                      if (justDraggedRef.current) {
                        justDraggedRef.current = false;
                        return;
                      }
                      if (e.detail >= 2) return;
                      void switchTab(tab.id);
                    }}
                    onDoubleClick={(e) => {
                      if ((e.target as HTMLElement).closest('.tab-close')) return;
                      e.preventDefault();
                      e.stopPropagation();
                      editStartTimeRef.current = Date.now();
                      setEditingTabId(tab.id);
                      setEditingTabName(tab.name);
                    }}
                    onPointerDown={(e) => handlePointerDown(e, index, tab)}
                    onMouseDown={(e) => {
                      if (e.button === 1) {
                        e.preventDefault();
                        e.stopPropagation();
                        void closeTab(tab.id);
                      }
                    }}
                    onAuxClick={(e) => {
                      if (e.button === 1) {
                        e.preventDefault();
                        e.stopPropagation();
                        void closeTab(tab.id);
                      }
                    }}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setContextMenu({
                        x: e.clientX,
                        y: e.clientY,
                        tab,
                        index,
                      });
                    }}
                    className={`tab-item tab-project ${isActive ? 'active' : ''} ${isSliding ? 'is-sliding' : ''}`}
                    style={{
                      borderTopColor: tab.color ? tab.color : undefined,
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        void switchTab(tab.id);
                      }
                    }}
                    title={`${tab.path}${tab.color ? ` (${t('tabs.coloredGroup')})` : ''}\n${t('tabs.middleClickClose')}`}
                  >
                    {/* Ponto colorido de grupo */}
                    {tab.color ? (
                      <span
                        className="tab-color-dot"
                        style={{ backgroundColor: tab.color, boxShadow: `0 0 6px ${tab.color}99` }}
                        title={t('tabs.coloredGroup')}
                      />
                    ) : (
                      <FolderGit2 size={13} className="tab-icon" />
                    )}

                    {editingTabId === tab.id ? (
                      <input
                        ref={(input) => {
                          if (input) {
                            requestAnimationFrame(() => {
                              if (input && document.activeElement !== input) {
                                input.focus();
                                input.select();
                              }
                            });
                          }
                        }}
                        type="text"
                        className="tab-name-input"
                        value={editingTabName}
                        onClick={(e) => e.stopPropagation()}
                        onDoubleClick={(e) => e.stopPropagation()}
                        onPointerDown={(e) => e.stopPropagation()}
                        onMouseDown={(e) => e.stopPropagation()}
                        onMouseUp={(e) => e.stopPropagation()}
                        onChange={(e) => setEditingTabName(e.target.value)}
                        onBlur={() => {
                          if (Date.now() - editStartTimeRef.current < 200) {
                            return;
                          }
                          setTabName(tab.id, editingTabName);
                          setEditingTabId(null);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.stopPropagation();
                            setTabName(tab.id, editingTabName);
                            setEditingTabId(null);
                          } else if (e.key === 'Escape') {
                            e.stopPropagation();
                            setEditingTabId(null);
                          }
                        }}
                        title={t('tabs.renameHint')}
                        aria-label={t('tabs.tabNameAria')}
                      />
                    ) : (
                      <span
                        className="tab-title"
                        onDoubleClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          editStartTimeRef.current = Date.now();
                          setEditingTabId(tab.id);
                          setEditingTabName(tab.name);
                        }}
                        title={t('tabs.doubleClickToRename')}
                      >
                        {tab.name}
                      </span>
                    )}

                    {branch && (
                      <span className="tab-branch-pill" title={`Branch: ${branch}`}>
                        <GitBranch size={10} className="tab-branch-icon" />
                        <span className="tab-branch-name">{branch}</span>
                      </span>
                    )}

                    <button
                      type="button"
                      className="tab-close"
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={(e) => {
                        e.stopPropagation();
                        void closeTab(tab.id);
                      }}
                      title={t('tabs.close')}
                      aria-label={t('tabs.closeTabAria', { name: tab.name })}
                    >
                      <X size={12} />
                    </button>
                  </div>
                );
              })}
            </div>
          );
        })}

        {/* Botão para Nova Aba / Abrir Repositório */}
        <button
          type="button"
          className="tab-new"
          onClick={() => void openRepository()}
          disabled={opening || !!operation}
          title={t('tabs.newTab')}
          aria-label={t('tabs.newTab')}
        >
          <Plus size={14} />
        </button>
      </div>

      <div className="tab-bar-right-actions">
        {activeTabId !== 'home' && (
          <>
            {snapshot && (snapshot.ahead ?? 0) > 0 && (
              <button
                type="button"
                className="tab-bar-badge-btn ahead-badge"
                onClick={() => void runOperation('push')}
                title={t('sync.pushAhead', { count: snapshot.ahead ?? 0 })}
                aria-label={t('sync.pushAhead', { count: snapshot.ahead ?? 0 })}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '3px',
                  fontSize: '11px',
                  fontWeight: 600,
                  color: 'var(--green)',
                  background: 'rgba(16, 185, 129, 0.12)',
                  border: '1px solid rgba(16, 185, 129, 0.25)',
                  borderRadius: '4px',
                  padding: '2px 6px',
                  cursor: 'pointer'
                }}
              >
                <ArrowUp size={12} />
                <span>{snapshot.ahead}</span>
              </button>
            )}
            {snapshot && (snapshot.behind ?? 0) > 0 && (
              <button
                type="button"
                className="tab-bar-badge-btn behind-badge"
                onClick={() => void runOperation('pull')}
                title={t('sync.pullBehind', { count: snapshot.behind ?? 0 })}
                aria-label={t('sync.pullBehind', { count: snapshot.behind ?? 0 })}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '3px',
                  fontSize: '11px',
                  fontWeight: 600,
                  color: 'var(--accent)',
                  background: 'rgba(59, 130, 246, 0.12)',
                  border: '1px solid rgba(59, 130, 246, 0.25)',
                  borderRadius: '4px',
                  padding: '2px 6px',
                  cursor: 'pointer'
                }}
              >
                <ArrowDown size={12} />
                <span>{snapshot.behind}</span>
              </button>
            )}
            <button
              type="button"
              className="tab-bar-action-btn"
              onClick={openRemotesModal}
              title={t('remotes.title')}
              aria-label={t('remotes.title')}
            >
              <Globe size={15} />
            </button>
            <button
              type="button"
              className="tab-bar-action-btn"
              onClick={openReflog}
              title={t('reflog.title')}
              aria-label={t('reflog.title')}
            >
              <History size={15} />
            </button>
          </>
        )}
        <button
          type="button"
          className="tab-bar-action-btn"
          onClick={openSettings}
          title={t('settings.title')}
          aria-label={t('settings.title')}
        >
          <Settings size={15} />
        </button>
      </div>

      {/* Menu de Contexto da Aba */}
      {contextMenu && (
        <TabContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          tab={contextMenu.tab}
          index={contextMenu.index}
          tabs={tabs}
          collapsedColors={collapsedColors}
          groupNames={groupNames}
          onClose={() => setContextMenu(null)}
          setTabColor={setTabColor}
          toggleColorCollapse={toggleColorCollapse}
          setEditingGroupColor={setEditingGroupColor}
          setEditingGroupName={setEditingGroupName}
          setGroupName={setGroupName}
          closeTab={closeTab}
          closeOtherTabs={closeOtherTabs}
          closeTabsToRight={closeTabsToRight}
          expandAllColors={expandAllColors}
          collapseAllColors={collapseAllColors}
          setEditingTabId={setEditingTabId}
          setEditingTabName={setEditingTabName}
          onOpenTerminal={() => void openTerminal()}
          onOpenEditor={() => void runOperation('openEditor', [], '')}
          onRevealFile={() => void runOperation('revealFile', [], '')}
        />
      )}
    </nav>
  );
}

interface TabContextMenuProps {
  x: number;
  y: number;
  tab: TabItem;
  index: number;
  tabs: TabItem[];
  collapsedColors: Set<string>;
  groupNames: Record<string, string>;
  onClose: () => void;
  setTabColor: (id: string, color: string | null) => void;
  toggleColorCollapse: (color: string) => void;
  setEditingGroupColor: (color: string | null) => void;
  setEditingGroupName: (name: string) => void;
  setGroupName: (color: string, name: string | null) => void;
  closeTab: (id: string) => Promise<void>;
  closeOtherTabs: (id: string) => Promise<void>;
  closeTabsToRight: (id: string) => Promise<void>;
  expandAllColors: () => void;
  collapseAllColors: () => void;
  setEditingTabId: (id: string | null) => void;
  setEditingTabName: (name: string) => void;
  onOpenTerminal?: () => void;
  onOpenEditor?: () => void;
  onRevealFile?: () => void;
}

function TabContextMenu({
  x,
  y,
  tab,
  index,
  tabs,
  collapsedColors,
  groupNames,
  onClose,
  setTabColor,
  toggleColorCollapse,
  setEditingGroupColor,
  setEditingGroupName,
  setGroupName,
  closeTab,
  closeOtherTabs,
  closeTabsToRight,
  expandAllColors,
  collapseAllColors,
  setEditingTabId,
  setEditingTabName,
  onOpenTerminal,
  onOpenEditor,
  onRevealFile,
}: TabContextMenuProps) {
  const { t } = useI18n();
  const menuRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({
    x: Math.max(8, Math.min(x, (typeof window !== 'undefined' ? window.innerWidth : 1000) - 230)),
    y: Math.max(8, Math.min(y + 4, (typeof window !== 'undefined' ? window.innerHeight : 800) - 380)),
  });

  useLayoutEffect(() => {
    if (!menuRef.current) return;
    const rect = menuRef.current.getBoundingClientRect();
    const pad = 8;
    let newX = x;
    let newY = y + 4;

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
      className="tab-context-menu"
      style={{ left: `${pos.x}px`, top: `${pos.y}px`, zIndex: 99999 }}
      role="menu"
    >
      <div className="menu-header">
        <Palette size={12} />
        <span>{t('tabs.colorGroupHeader')}</span>
      </div>

      <div className="tab-color-picker">
        {TAB_PRESET_COLORS.map((c) => {
          const isSelected = tab.color === c.color;
          const colorName = t(`colors.${c.id}`) || c.label;
          return (
            <button
              key={c.id}
              type="button"
              className={`color-swatch ${isSelected ? 'selected' : ''}`}
              style={{ backgroundColor: c.color }}
              onClick={() => {
                setTabColor(tab.id, c.color);
                onClose();
              }}
              title={colorName}
              aria-label={t('tabs.setColorAria', { label: colorName })}
            >
              {isSelected && <Check size={11} color="#fff" />}
            </button>
          );
        })}
        <button
          type="button"
          className="color-swatch-clear"
          onClick={() => {
            setTabColor(tab.id, null);
            onClose();
          }}
          title={t('tabs.removeColor')}
          aria-label={t('tabs.removeColor')}
        >
          <X size={12} />
        </button>
      </div>

      <div className="menu-separator" />

      {tab.color && (
        <>
          <button
            type="button"
            className="menu-action-item"
            onClick={() => {
              toggleColorCollapse(tab.color!);
              onClose();
            }}
          >
            {collapsedColors.has(tab.color.toLowerCase()) ? (
              <>
                <ChevronRight size={13} />
                <span>{t('tabs.expandGroup', { name: getGroupLabel(tab.color, groupNames, t) })}</span>
              </>
            ) : (
              <>
                <ChevronLeft size={13} />
                <span>{t('tabs.collapseGroup', { name: getGroupLabel(tab.color, groupNames, t) })}</span>
              </>
            )}
          </button>

          <button
            type="button"
            className="menu-action-item"
            onClick={() => {
              const color = tab.color!;
              setEditingGroupColor(color);
              setEditingGroupName(getGroupLabel(color, groupNames, t));
              onClose();
            }}
          >
            <Edit2 size={13} />
            <span>{t('tabs.renameGroup', { name: getGroupLabel(tab.color, groupNames, t) })}</span>
          </button>

          {groupNames[tab.color.toLowerCase()] && (
            <button
              type="button"
              className="menu-action-item"
              onClick={() => {
                setGroupName(tab.color!, null);
                onClose();
              }}
            >
              <RotateCcw size={13} />
              <span>{t('tabs.restoreGroupName', { name: getColorLabel(tab.color, t) })}</span>
            </button>
          )}

          <button
            type="button"
            className="menu-action-item"
            onClick={() => {
              const color = tab.color!.toLowerCase();
              const tabsToClose = tabs.filter((t) => t.color?.toLowerCase() === color);
              tabsToClose.forEach((t) => void closeTab(t.id));
              onClose();
            }}
          >
            <XCircle size={13} />
            <span>{t('tabs.closeGroup')}</span>
          </button>

          <div className="menu-separator" />
        </>
      )}

      {collapsedColors.size > 0 ? (
        <button
          type="button"
          className="menu-action-item"
          onClick={() => {
            expandAllColors();
            onClose();
          }}
        >
          <ChevronRight size={13} />
          <span>{t('tabs.expandAllGroups')}</span>
        </button>
      ) : (
        <button
          type="button"
          className="menu-action-item"
          onClick={() => {
            collapseAllColors();
            onClose();
          }}
        >
          <ChevronLeft size={13} />
          <span>{t('tabs.collapseAllGroups')}</span>
        </button>
      )}

      <div className="menu-separator" />

      <button
        type="button"
        className="menu-action-item"
        onClick={() => {
          onClose();
          setEditingTabId(tab.id);
          setEditingTabName(tab.name);
        }}
      >
        <Edit2 size={13} />
        <span>{t('tabs.renameTab')}</span>
      </button>

      <button
        type="button"
        className="menu-action-item"
        onClick={() => {
          void closeTab(tab.id);
          onClose();
        }}
      >
        <X size={13} />
        <span>{t('tabs.close')}</span>
      </button>

      <button
        type="button"
        className="menu-action-item"
        disabled={tabs.length <= 1}
        onClick={() => {
          void closeOtherTabs(tab.id);
          onClose();
        }}
      >
        <XCircle size={13} />
        <span>{t('tabs.closeOther')}</span>
      </button>

      <button
        type="button"
        className="menu-action-item"
        disabled={index >= tabs.length - 1}
        onClick={() => {
          void closeTabsToRight(tab.id);
          onClose();
        }}
      >
        <span>{t('tabs.closeToRight')}</span>
      </button>

      <div className="menu-separator" />

      <button
        type="button"
        className="menu-action-item"
        onClick={() => {
          void navigator.clipboard.writeText(tab.path);
          onClose();
        }}
      >
        <Copy size={13} />
        <span>{t('tabs.copyPath')}</span>
      </button>

      {onOpenTerminal && (
        <button
          type="button"
          className="menu-action-item"
          onClick={() => {
            onClose();
            onOpenTerminal();
          }}
        >
          <Terminal size={13} />
          <span>{t('tabs.openTerminal')}</span>
        </button>
      )}

      {onOpenEditor && (
        <button
          type="button"
          className="menu-action-item"
          onClick={() => {
            onClose();
            onOpenEditor();
          }}
        >
          <Code2 size={13} />
          <span>{t('tabs.openEditor')}</span>
        </button>
      )}

      {onRevealFile && (
        <button
          type="button"
          className="menu-action-item"
          onClick={() => {
            onClose();
            onRevealFile();
          }}
        >
          <FolderOpen size={13} />
          <span>{t('tabs.revealFile')}</span>
        </button>
      )}
    </div>,
    document.body
  );
}
