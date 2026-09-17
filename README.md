# Gitma

<p align="center">
  <strong>A blazing-fast, lightweight native Git desktop client powered by Rust and Tauri v2.</strong>
</p>

<p align="center">
  <a href="https://github.com/maicondallg/Gitma/actions/workflows/ci.yml"><img src="https://github.com/maicondallg/Gitma/actions/workflows/ci.yml/badge.svg" alt="CI Status" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="License: MIT" /></a>
  <a href="https://www.rust-lang.org/"><img src="https://img.shields.io/badge/rust-1.78%2B-orange.svg" alt="Rust 1.78+" /></a>
  <a href="https://tauri.app/"><img src="https://img.shields.io/badge/tauri-v2-24C8D8.svg" alt="Tauri v2" /></a>
  <a href="https://react.dev/"><img src="https://img.shields.io/badge/react-19-61DAFB.svg" alt="React 19" /></a>
  <a href="README.pt-BR.md"><img src="https://img.shields.io/badge/docs-Portugu%C3%AAs-green.svg" alt="Versão em Português" /></a>
</p>

---

**Gitma** is built for developers who want a snappy, modern, distraction-free Git graphical interface without the resource bloat of conventional Electron apps. 

Engineered with a **Rust** backend engine and a **Tauri v2** native shell, Gitma starts instantly, uses minimal RAM, and executes all Git operations locally via direct IPC. **No remote analytics, no telemetry, no cloud accounts required.**

---

## 🌟 Key Features

### 🌳 Interactive Topological Commit Graph
- **Real-Time DAG Visualization**: Smooth bezier lanes allocated with an optimized topological algorithm.
- **Rich Ref Indicators**: Clear visual pills for local branches, tracking remotes, HEAD indicators, tags, and stashes.
- **Fast Interactive Checkout**: Double-click or right-click any branch or tag ref badge to checkout immediately.
- **Commit Details & Hash Copying**: Single-click commit SHA copying, parent hashes, author timestamps, and detailed commit card.

### 📑 Multi-Repository Workspace & Color Groups
- **Multi-Tab Interface**: Open and switch between multiple repositories effortlessly.
- **Color-Coded Groups**: Organize related repositories into custom color groups with user-defined names.
- **Drag-and-Drop Reordering**: Rearrange tabs and tab groups seamlessly with mouse drag.
- **Collapsible Groups**: Collapse inactive project groups to keep your workspace tidy.

### 🔍 Monaco-Powered Diff Viewer
- **Side-by-Side & Inline Views**: Switch between split-view and unified diff views at the click of a button.
- **"Only Changes" Folding**: Hide large unmodified blocks to focus exclusively on changed lines.
- **Rich Syntax Highlighting**: Full syntax highlighting across 80+ programming languages powered by the Monaco Editor.
- **File Hierarchy Navigation**: Explore changes in either flat list mode or collapsible folder tree mode.

### ⚡ Complete Everyday Git Operations
- **Branch Management**: Create local branches, checkout tracking remotes, switch branches, and delete local/remote branches with safety confirmations.
- **Merge & Squash**: Fast-forward and 3-way branch merges, plus squash-merge support.
- **Interactive Rebase Detection**: In-progress rebase, merge, cherry-pick, and revert banner with one-click **Continue** and **Abort** actions.
- **Stash Management**: Save uncommitted changes to stash, inspect stashes on commit nodes, and apply, pop, or drop stashes (including multiple stashes on the same commit).
- **Reset Modes**: Reset HEAD to any historical commit with **Soft**, **Mixed**, or **Hard** modes protected by a confirmation modal.
- **Git Revert**: Revert any historic commit safely without rewriting historical records.
- **Cherry-Pick**: Apply specific commits from other branches with a single click.
- **Discard Local Modifications**: Discard uncommitted changes for individual files or bulk discard all unstaged changes.
- **Tagging**: Create lightweight and annotated tags (with custom messages), as well as deleting local and remote tags.
- **Safe Push (`--force-with-lease`)**: Right-click the Push action to perform safe lease-checked force pushes.
- **Instant History Search (`Ctrl+F`)**: Filter through thousands of commits by message, author, or hash in real time.

### 🔒 100% Offline & Private
- **Zero Telemetry**: No tracking, no phone-home pings, no third-party scripts.
- **Direct Local IPC**: Communications stay inside your machine via Tauri's typed binary IPC bridge.
- **Native Authentication**: Leverages your existing SSH keys, SSH agents, and Git credential helpers.

---

## ⌨️ Keyboard Shortcuts

| Shortcut | Action | Scope |
| :--- | :--- | :--- |
| <kbd>Ctrl</kbd> + <kbd>Enter</kbd> | Commit staged changes | Commit form |
| <kbd>Ctrl</kbd> + <kbd>F</kbd> | Focus commit search filter | Commit history |
| <kbd>Esc</kbd> | Clear search / Close modals & context menus | Global |
| <kbd>↑</kbd> / <kbd>↓</kbd> | Navigate up/down through commits or files | Active list |
| <kbd>→</kbd> / <kbd>←</kbd> | Switch focus between History and Files panels | Workspace |
| <kbd>Enter</kbd> / <kbd>Space</kbd> | Select commit or file | Active row |
| Double-click (Tab) | Rename tab or group | Tab bar |

---

## 🚀 Getting Started

### Installing Pre-Built Packages

Download the latest installer from the [Releases](https://github.com/maicondallg/Gitma/releases) page.

**Debian, Ubuntu and derivatives:**

```bash
sudo apt install ./Gitma_*_amd64.deb
```

**Other x64 Linux distributions (AppImage):**

```bash
chmod +x Gitma_*_amd64.AppImage
./Gitma_*_amd64.AppImage
```

**Windows x64:** use the `.msi` or `-setup.exe` installer. Early unsigned
releases may trigger a Microsoft SmartScreen warning.

Gitma requires the `git` command to be installed. The Debian package installs it
automatically; AppImage and Windows users should install Git separately.

### Building from Source

#### Prerequisites
- **Git** in your `$PATH`
- **Node.js** 22.x or higher with `npm`
- **Rust** 1.78+ (via [rustup](https://rustup.rs/))
- **WebKitGTK development headers** (Debian/Ubuntu: `sudo apt install -y libwebkit2gtk-4.1-dev build-essential libssl-dev libayatana-appindicator3-dev librsvg2-dev`)

#### Clone & Run
```bash
# 1. Clone repository
git clone https://github.com/maicondallg/gitma.git
cd Gitma

# 2. Install dependencies
npm install

# 3. Launch desktop app in development mode
npm run tauri dev
```

#### Build Production Binary & .deb
```bash
npm run tauri build -- --bundles deb
```
The compiled binary will be located in `target/release/gitma-desktop`, and the `.deb` installer will be located in `target/release/bundle/deb/`.

---

## 🧪 Testing with Fixtures (Demo Mode)

Gitma includes built-in mock fixtures that allow testing and exploring the full UI state without needing to modify a real Git repository:

```bash
# Inspect uncommitted changes fixture
npm run tauri -- dev -- -- --fixture local

# Inspect split layout fixture
npm run tauri -- dev -- -- --fixture split

# Inspect merge conflict fixture
npm run tauri -- dev -- -- --fixture conflict
```
*Available fixtures:* `welcome`, `local`, `split`, `history`, `clean`, `conflict`, `binary`, `error`.

---

## 🏗️ Project Architecture

```
Gitma/
├── crates/
│   └── gitma-core/          # Pure Rust domain logic, Git CLI runner & graph layout engine
├── src-tauri/              # Native Tauri desktop shell, window lifecycle, dialogs & IPC
├── ui/                     # Frontend UI (React 19, TypeScript, Zustand, Monaco Editor, Vite)
├── docs/                   # Technical documentation & architecture guides
│   ├── ARCHITECTURE.md     # Detailed design & IPC contract
│   └── IMPLEMENTATION_CONTRACT.md
├── scripts/                # Smoke tests and automation utilities
├── .github/                # CI/CD workflows and issue templates
├── CHANGELOG.md            # Version release notes
├── CONTRIBUTING.md         # Contribution guide and standards
└── LICENSE                 # MIT License
```

For more architectural details, refer to [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

---

## 🤝 Contributing

Contributions, bug reports, and feature suggestions are very welcome! Please read our [CONTRIBUTING.md](CONTRIBUTING.md) guide before opening a pull request.
Participation is governed by our [Code of Conduct](CODE_OF_CONDUCT.md). Please
report security issues privately according to the [Security Policy](SECURITY.md).

---

## 📄 License

Gitma is released under the [MIT License](LICENSE).  
Copyright © 2026 Maicon Dall'Agnol and Gitma Contributors.
