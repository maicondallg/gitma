# Changelog

All notable changes to **Gitma** will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- **Remote Management Modal (`RemotesModal`)**:
  - View all configured remotes with dedicated fetch and push URLs.
  - Add new remotes, inline-edit remote URLs, and delete remotes with confirmation.
  - One-click "Fetch & Prune" (`git fetch --prune`) to sync with remotes and remove obsolete remote tracking references.
  - Accessible via global toolbar/tab bar globe icon.
- **Visual Merge Conflict Solver (`DiffPanel`)**:
  - Direct working-tree conflict inspection in Monaco Editor with syntax highlighting.
  - One-click resolution banner: "Aceitar Atual (HEAD)" (`--ours`), "Aceitar Entrada" (`--theirs`), "Aceitar Ambos", and "Marcar como Resolvido" (`git add`).
- **Arbitrary Two-Commit Comparison (`git diff-tree`)**:
  - Select and compare any two arbitrary commits across branches or history via Ctrl+Click or right-click context menu "Comparar com...".
  - Dedicated comparison state banner in `GraphPanel` and `FilesPanel` showing overall diff metrics, file list, and file diff previews.
- **Graph History Scope Selector (`GraphPanel`)**:
  - Header toggle between "Todas as branches" (`git log --all`) and "Branch atual" (`git log HEAD`) for focused branch inspection.
- **Ahead / Behind Upstream Badges (`TabBar`)**:
  - Real-time indicator badges showing commits ahead (`↑`) and behind (`↓`) the remote upstream tracking branch.
  - One-click push (when ahead) and pull (when behind) directly from the badges.
- **Backend Commit Files Cache (`SessionState`)**:
  - In-memory thread-safe LRU/HashMap cache for up to 500 immutable commit file lists and numstats.
  - Eliminates repeated CLI process spawning during rapid graph selection for ultra-smooth 60fps graph browsing.
- **Commit Details & Rich Metadata** (`FilesPanel`):
  - Subject, multiline body description, committer distinction (when different from author), and clickable parent commit hash badges navigating directly to parent commits in the graph.
- **Git Blame Visualizer** (`DiffPanel`):
  - Toggleable synchronized blame gutter alongside Monaco Diff Editor showing line numbers, commit hash, author, relative date, and full commit hover tooltips. Clicking a blame row jumps directly to that commit in the history graph.
- **File History Modal** (`FileHistoryModal`):
  - Comprehensive commit timeline for any file via `git log --follow`, searchable by message, hash, or author, accessible through right-click context menu "Ver histórico do arquivo".
- **Reflog Inspector Modal** (`ReflogModal`):
  - Visual tool for `git reflog`, displaying selector (`HEAD@{n}`), actions, author, and timestamp. Provides quick actions to copy hash, branch from reflog point, or reset HEAD (soft/mixed/hard).
- **Hunk Staging & Navigation** (`git add -p` equivalent):
  - Added visual hunk navigation bar in DiffPanel with counter, previous/next hunk controls, and cursor sync.
  - Added Stage Hunk, Unstage Hunk, and Discard Hunk actions powered by atomic `git apply` in `gitma-core`.
- **Keyboard Staging Shortcut**:
  - Added Spacebar shortcut in `FilesPanel` to instantaneously toggle staging and unstaging of the selected file.
- **File Context Menu (`FileContextMenu`)**:
  - Right-click on files in tree or flat view to stage, unstage, discard, ignore in `.gitignore` (file, extension, folder), copy relative/absolute path, open in external editor, reveal in system file manager, or inspect file history.
- **External Tool & Repository Integrations**:
  - Tab context menu and file menu shortcuts to Open Terminal, Open VS Code / External Editor, and Reveal in File Manager.

---

## [0.1.2] - 2026-09-20

### Fixed
- Fixed window infinite recreation loop on Windows startup.
- Fixed local tag deletion bug when removing tags.
- Improved tag deletion confirmation and remote tag handling.

---

## [0.1.1] - 2026-09-19

### Added
- Multi-language support (English, Portuguese `pt-BR`, Spanish `es`).
- Custom color themes support (Dark, Light, and syntax presets).
- Clone and Init repository modals and workflows.
- Tab color grouping and customizable tab names.

### Fixed
- Tag badge rendering and overflow layout in the commit graph.
- Context menu positioning and boundary collision detection.

---

## [0.1.0] - 2026-09-17

### Added
- Initial public release of Gitma desktop client.
- Native Tauri v2 shell and high-performance Rust Git backend engine (`gitma-core`).
- Virtualized commit graph with topological bezier lane allocation.
- Working directory file staging, unstaging, discard, and commit form with amend support.
- Monaco Editor side-by-side and inline diff viewer with unchanged region folding.
- Branch management (create, checkout, merge, squash-merge, rebase, delete).
- In-progress rebase, merge, and cherry-pick banner with continue/abort controls.
- Stash support (push, pop, apply, drop) and tag management.
- Multi-repository workspace with tabs.
