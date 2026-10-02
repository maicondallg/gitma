import { useState, useRef, useEffect, useCallback, type KeyboardEvent, type MouseEvent } from 'react';
import {
  Terminal,
  Play,
  Trash2,
  Copy,
  Check,
  Maximize2,
  Minimize2,
  X,
  AlertCircle,
  CheckCircle2,
  Loader2,
  ChevronRight,
  Sparkles,
} from 'lucide-react';
import { useAppStore } from '../store/app';
import { useI18n } from '../i18n';
import type { CommandLogEntry } from '../lib/types';

const HISTORY_STORAGE_KEY = 'Gitma:cli-history';
const HEIGHT_STORAGE_KEY = 'Gitma:terminal-drawer-height';
const DEFAULT_HEIGHT = 260;
const MIN_HEIGHT = 140;
const MAX_HEIGHT = 650;

function loadStoredHistory(): string[] {
  try {
    const raw = localStorage.getItem(HISTORY_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveStoredHistory(history: string[]): void {
  try {
    localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(history.slice(-50)));
  } catch {}
}

function loadStoredHeight(): number {
  try {
    const raw = localStorage.getItem(HEIGHT_STORAGE_KEY);
    const parsed = raw ? parseInt(raw, 10) : DEFAULT_HEIGHT;
    return isNaN(parsed) ? DEFAULT_HEIGHT : Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, parsed));
  } catch {
    return DEFAULT_HEIGHT;
  }
}

const QUICK_ACTIONS = [
  { label: 'status', cmd: 'status' },
  { label: 'log -5', cmd: 'log -5 --oneline' },
  { label: 'branch -a', cmd: 'branch -a' },
  { label: 'stash list', cmd: 'stash list' },
  { label: 'diff --stat', cmd: 'diff --stat' },
];

export function TerminalDrawer() {
  const isConsoleOpen = useAppStore((s) => s.isConsoleOpen);
  const setConsoleOpen = useAppStore((s) => s.setConsoleOpen);
  const commandLogs = useAppStore((s) => s.commandLogs);
  const clearCommandLogs = useAppStore((s) => s.clearCommandLogs);
  const runGitCommand = useAppStore((s) => s.runGitCommand);
  const operation = useAppStore((s) => s.operation);
  const session = useAppStore((s) => s.session);
  const { t } = useI18n();

  const [inputVal, setInputVal] = useState('');
  const [history, setHistory] = useState<string[]>(loadStoredHistory);
  const [historyIdx, setHistoryIdx] = useState<number>(-1);
  const [tempInput, setTempInput] = useState('');
  const [drawerHeight, setDrawerHeight] = useState<number>(loadStoredHeight);
  const [isMaximized, setIsMaximized] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [copyAllFeedback, setCopyAllFeedback] = useState(false);

  const logsEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const isResizingRef = useRef(false);
  const startYRef = useRef(0);
  const startHeightRef = useRef(0);

  // Auto-scroll to bottom when new logs arrive
  useEffect(() => {
    if (isConsoleOpen && logsEndRef.current) {
      logsEndRef.current.scrollIntoView?.({ behavior: 'smooth' });
    }
  }, [commandLogs.length, isConsoleOpen]);

  // Focus input when drawer opens
  useEffect(() => {
    if (isConsoleOpen) {
      setTimeout(() => {
        inputRef.current?.focus();
      }, 50);
    }
  }, [isConsoleOpen]);

  const handleExecute = useCallback(
    async (cmdToRun?: string) => {
      const command = (cmdToRun ?? inputVal).trim();
      if (!command || !session) return;

      // Update history
      const updatedHistory = [...history.filter((h) => h !== command), command];
      setHistory(updatedHistory);
      saveStoredHistory(updatedHistory);
      setHistoryIdx(-1);
      setInputVal('');
      setTempInput('');

      try {
        await runGitCommand(command);
      } catch {
        // error is logged into store commandLogs
      }
    },
    [inputVal, session, history, runGitCommand]
  );

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      void handleExecute();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (history.length === 0) return;
      if (historyIdx === -1) {
        setTempInput(inputVal);
        const newIdx = history.length - 1;
        setHistoryIdx(newIdx);
        setInputVal(history[newIdx]);
      } else if (historyIdx > 0) {
        const newIdx = historyIdx - 1;
        setHistoryIdx(newIdx);
        setInputVal(history[newIdx]);
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (historyIdx === -1) return;
      if (historyIdx < history.length - 1) {
        const newIdx = historyIdx + 1;
        setHistoryIdx(newIdx);
        setInputVal(history[newIdx]);
      } else {
        setHistoryIdx(-1);
        setInputVal(tempInput);
      }
    } else if (e.key === 'Escape') {
      if (inputVal) {
        setInputVal('');
        setHistoryIdx(-1);
      } else {
        setConsoleOpen(false);
      }
    }
  };

  const handleCopy = (id: string, text?: string) => {
    if (!text) return;
    void navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1800);
  };

  const handleCopyAll = () => {
    if (commandLogs.length === 0) return;
    const fullLog = commandLogs
      .map(
        (log) =>
          `[${new Date(log.timestamp).toLocaleTimeString()}] ${log.command}\n${log.output ?? ''}`
      )
      .join('\n\n---\n\n');
    void navigator.clipboard.writeText(fullLog);
    setCopyAllFeedback(true);
    setTimeout(() => setCopyAllFeedback(false), 1800);
  };

  // Resize handler
  const handleMouseDownResize = (e: MouseEvent) => {
    e.preventDefault();
    isResizingRef.current = true;
    startYRef.current = e.clientY;
    startHeightRef.current = drawerHeight;
    let currentHeight = drawerHeight;

    const onMouseMove = (moveEvent: globalThis.MouseEvent) => {
      if (!isResizingRef.current) return;
      const delta = startYRef.current - moveEvent.clientY;
      currentHeight = Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, startHeightRef.current + delta));
      setDrawerHeight(currentHeight);
    };

    const onMouseUp = () => {
      isResizingRef.current = false;
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      try {
        localStorage.setItem(HEIGHT_STORAGE_KEY, String(currentHeight));
      } catch {}
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  if (!isConsoleOpen) return null;

  const isBusy = !!operation;

  return (
    <div
      className={`terminal-drawer ${isMaximized ? 'is-maximized' : ''}`}
      style={{ height: isMaximized ? '75vh' : `${drawerHeight}px` }}
      role="region"
      aria-label={t('console.title')}
    >
      {/* Resizer Handle */}
      {!isMaximized && (
        <div
          className="terminal-drawer-resizer"
          onMouseDown={handleMouseDownResize}
          title="Arraste para redimensionar"
        />
      )}

      {/* Header */}
      <div className="terminal-drawer-header">
        <div className="terminal-drawer-title-group">
          <Terminal size={15} className="terminal-drawer-icon" />
          <span className="terminal-drawer-title">{t('console.title')}</span>
          {session && (
            <span className="terminal-drawer-repo-badge" title={session.root}>
              {session.name}
            </span>
          )}
        </div>

        {/* Quick Actions */}
        <div className="terminal-drawer-quick-actions">
          <span className="quick-actions-label">{t('console.quickActions')}</span>
          {QUICK_ACTIONS.map((action) => (
            <button
              key={action.cmd}
              type="button"
              className="terminal-quick-chip"
              disabled={isBusy || !session}
              onClick={() => void handleExecute(action.cmd)}
              title={`git ${action.cmd}`}
            >
              {action.label}
            </button>
          ))}
        </div>

        {/* Right Controls */}
        <div className="terminal-drawer-actions">
          {commandLogs.length > 0 && (
            <>
              <button
                type="button"
                className="terminal-ctrl-btn"
                onClick={handleCopyAll}
                title={t('console.copyAll')}
                aria-label={t('console.copyAll')}
              >
                {copyAllFeedback ? <Check size={13} className="text-success" /> : <Copy size={13} />}
                <span>{copyAllFeedback ? t('console.copied') : t('console.copyAll')}</span>
              </button>
              <button
                type="button"
                className="terminal-ctrl-btn"
                onClick={clearCommandLogs}
                title={t('console.clearTitle')}
                aria-label={t('console.clear')}
              >
                <Trash2 size={13} />
                <span>{t('console.clear')}</span>
              </button>
            </>
          )}

          <button
            type="button"
            className="terminal-ctrl-btn"
            onClick={() => setIsMaximized((v) => !v)}
            title={isMaximized ? t('console.restore') : t('console.maximize')}
            aria-label={isMaximized ? t('console.restore') : t('console.maximize')}
          >
            {isMaximized ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
          </button>

          <button
            type="button"
            className="terminal-ctrl-btn terminal-close-btn"
            onClick={() => setConsoleOpen(false)}
            title={t('console.close')}
            aria-label={t('console.close')}
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {/* Body: Logs List */}
      <div className="terminal-drawer-logs">
        {commandLogs.length === 0 ? (
          <div className="terminal-empty-state">
            <Sparkles size={24} className="terminal-empty-icon" />
            <p className="terminal-empty-text">{t('console.emptyLogs')}</p>
            <span className="terminal-empty-hint">{t('console.hint')}</span>
          </div>
        ) : (
          commandLogs.map((log: CommandLogEntry) => {
            const trimmedOutput = log.output ? log.output.trimEnd() : '';
            const hasOutput = trimmedOutput.length > 0;
            const isCliWithoutOutput = log.isCustomCli && !hasOutput && log.status === 'success';
            const shouldRenderOutput = hasOutput || isCliWithoutOutput;
            const isInlineGui = !shouldRenderOutput && !log.isCustomCli;

            return (
              <div
                key={log.id}
                className={`terminal-log-entry status-${log.status} ${isInlineGui ? 'is-inline-gui' : ''}`}
              >
                <div className="terminal-log-header">
                  <span className="terminal-log-time">
                    {new Date(log.timestamp).toLocaleTimeString()}
                  </span>
                  <span className="terminal-log-prompt">$</span>
                  <span className="terminal-log-command">{log.command}</span>
                  <div className="terminal-log-badge">
                    {log.status === 'running' && (
                      <span className="log-badge-running">
                        <Loader2 size={11} className="spin" />
                        {t('console.running')}
                      </span>
                    )}
                    {log.status === 'success' && (
                      <span className="log-badge-success">
                        <CheckCircle2 size={11} />
                        OK
                      </span>
                    )}
                    {log.status === 'error' && (
                      <span className="log-badge-error">
                        <AlertCircle size={11} />
                        Error
                      </span>
                    )}
                  </div>
                  {hasOutput && (
                    <button
                      type="button"
                      className="terminal-copy-entry-btn"
                      onClick={() => handleCopy(log.id, trimmedOutput)}
                      title={t('console.copy')}
                      aria-label={t('console.copy')}
                    >
                      {copiedId === log.id ? <Check size={11} /> : <Copy size={11} />}
                    </button>
                  )}
                </div>
                {hasOutput && <pre className="terminal-log-output">{trimmedOutput}</pre>}
                {isCliWithoutOutput && (
                  <div className="terminal-log-empty-output">
                    <span>{t('console.noOutput')}</span>
                  </div>
                )}
              </div>
            );
          })
        )}
        <div ref={logsEndRef} />
      </div>

      {/* Prompt Input Bar */}
      <div className="terminal-drawer-prompt">
        <span className="terminal-prompt-prefix">$ git</span>
        <input
          ref={inputRef}
          type="text"
          className="terminal-drawer-input"
          value={inputVal}
          onChange={(e) => setInputVal(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={session ? t('console.inputPlaceholder') : t('console.noRepo')}
          disabled={!session || isBusy}
          autoComplete="off"
          spellCheck={false}
        />
        <button
          type="button"
          className="terminal-send-btn"
          disabled={!session || !inputVal.trim() || isBusy}
          onClick={() => void handleExecute()}
          title={t('console.run')}
          aria-label={t('console.run')}
        >
          {isBusy ? <Loader2 size={13} className="spin" /> : <Play size={12} fill="currentColor" />}
          <span>{isBusy ? t('console.running') : t('console.run')}</span>
        </button>
      </div>
    </div>
  );
}
