# Contributing to Gitma

First off, thank you for considering contributing to Gitma! It's people like you that make open-source tools great.

Please take a moment to review this document to ensure a smooth contribution process.

---

## 📋 Table of Contents

1. [Code of Conduct](#code-of-conduct)
2. [Architecture Overview](#architecture-overview)
3. [Setting Up Your Development Environment](#setting-up-your-development-environment)
4. [Running Gitma Locally](#running-Gitma-locally)
5. [Testing & Verification](#testing--verification)
6. [Coding Guidelines](#coding-guidelines)
7. [Submitting a Pull Request](#submitting-a-pull-request)

---

## 🤝 Code of Conduct

We are committed to providing a welcoming, inclusive, and harassment-free experience for everyone. Be respectful, kind, and constructive in all discussions, issues, and pull requests.

---

## 🏗️ Architecture Overview

Gitma is a local desktop Git client designed with performance, zero telemetry, and simplicity in mind:

- **`crates/gitma-core` (Rust)**:
  - Core domain logic, git process execution, topological graph lane calculation, and diff generation.
  - Interacts directly with the system `git` binary using clean environment variables (`GIT_TERMINAL_PROMPT=0`).
  - Completely decoupled from the UI framework; independently testable via unit tests.
- **`src-tauri` (Rust / Tauri v2)**:
  - Bridges the native OS window and the Rust core using Tauri's typed IPC (`invoke`).
  - Handles native dialogs, filesystem interactions, and window lifecycle.
- **`ui` (React / TypeScript / Vite)**:
  - Modern web UI rendered inside a local native WebKit/Chromium webview.
  - State management powered by [Zustand](https://github.com/pmndrs/zustand).
  - Diff previews rendered via [Monaco Editor](https://microsoft.github.io/monaco-editor/).
  - Virtualized lists powered by `@tanstack/react-virtual`.

For a deeper dive into design decisions, see [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

---

## 🛠️ Setting Up Your Development Environment

### Prerequisites

Ensure you have the following installed on your machine:

1. **Git**: Installed and available in your `$PATH`.
2. **Node.js**: Version 22.x or higher with `npm`.
3. **Rust & Cargo**: Stable toolchain (Rust 1.78+). Install via [rustup.rs](https://rustup.rs/).
4. **Platform Dependencies** (Linux):
   - **Debian / Ubuntu**:
     ```bash
     sudo apt update && sudo apt install -y \
       libwebkit2gtk-4.1-dev \
       build-essential \
       curl \
       wget \
       file \
       libxdo-dev \
       libssl-dev \
       libayatana-appindicator3-dev \
       librsvg2-dev
     ```
   - **Fedora**:
     ```bash
     sudo dnf install -y webkit2gtk4.1-devel openssl-devel curl
     ```
   - **Arch Linux**:
     ```bash
     sudo pacman -S --needed webkit2gtk-4.1 base-devel curl
     ```

---

## 🚀 Running Gitma Locally

1. **Clone the repository**:
   ```bash
   git clone https://github.com/maicondallg/gitma.git
   cd Gitma
   ```

2. **Install frontend dependencies**:
   ```bash
   npm install
   ```

3. **Start in development mode**:
   ```bash
   npm run tauri dev
   ```

4. **Launch with demo fixtures** (great for UI testing without altering a real repository):
   ```bash
   npm run tauri -- dev -- -- --fixture local
   ```
   *Available fixtures:* `welcome`, `local`, `split`, `history`, `clean`, `conflict`, `binary`, `error`.

5. **Open a specific repository directly**:
   ```bash
   npm run tauri -- dev -- -- --repo /path/to/any/repo
   ```

---

## 🧪 Testing & Verification

Always run test suites before creating a pull request:

```bash
# Type check frontend
npm run check

# Run frontend tests (Vitest)
npm test

# Run Rust unit and integration tests
cargo test

# Build production bundle
npm run tauri build
```

---

## 🎨 Coding Guidelines

### Rust (`crates/gitma-core`, `src-tauri`)
- Keep functions pure and deterministic whenever possible.
- Avoid panics (`unwrap()` / `expect()`) in production paths; propagate errors via `Result`.
- Ensure all new Git commands sanitize input arguments and respect `GIT_TERMINAL_PROMPT=0`.
- Format code using `cargo fmt` and verify with `cargo clippy`.

### Frontend (`ui/`)
- Write modular, type-safe TypeScript code (`strict: true`).
- Prefer functional components and React hooks.
- Manage global application state using Zustand in `ui/src/store/app.ts`.
- Avoid heavy CSS libraries in components; follow the existing scoped CSS patterns in `ui/src/styles.css` and `ui/src/components/*.css`.
- Ensure accessibility: provide ARIA labels for icon buttons and keyboard navigation support.

---

## 📥 Submitting a Pull Request

1. **Fork the repo** and create a feature branch (`git checkout -b feature/amazing-idea`).
2. **Commit your changes** with clear, concise commit messages (e.g., `feat: add stash inspection popover` or `fix: resolve graph header misalignment`).
3. **Ensure all tests pass** (`cargo test` and `npm test`).
4. **Push to your branch** (`git push origin feature/amazing-idea`).
5. **Open a Pull Request** against `main` explaining the problem, the solution, and any testing performed.
