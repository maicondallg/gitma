# Gitma (Português)

<p align="center">
  <strong>Um cliente Git desktop nativo, extremamente rápido e leve, construído em Rust e Tauri v2.</strong>
</p>

<p align="center">
  <a href="https://github.com/maicondallg/Gitma/actions/workflows/ci.yml"><img src="https://github.com/maicondallg/Gitma/actions/workflows/ci.yml/badge.svg" alt="Status da CI" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/licen%C3%A7a-MIT-blue.svg" alt="Licença: MIT" /></a>
  <a href="https://www.rust-lang.org/"><img src="https://img.shields.io/badge/rust-1.78%2B-orange.svg" alt="Rust 1.78+" /></a>
  <a href="https://tauri.app/"><img src="https://img.shields.io/badge/tauri-v2-24C8D8.svg" alt="Tauri v2" /></a>
  <a href="https://react.dev/"><img src="https://img.shields.io/badge/react-19-61DAFB.svg" alt="React 19" /></a>
  <a href="README.md"><img src="https://img.shields.io/badge/docs-English-blue.svg" alt="English Documentation" /></a>
</p>

---

O **Gitma** foi desenvolvido para desenvolvedores que buscam uma interface gráfica ágil, moderna e livre de distrações para o Git, sem o consumo excessivo de memória RAM característico de aplicações baseadas em Electron.

Construído com um motor de backend em **Rust** e encapsulado nativamente pelo **Tauri v2**, o Gitma inicializa instantaneamente, consome poucos recursos e executa todas as operações de Git localmente através de IPC direto. **Sem telemetria, sem rastreamento e sem necessidade de cadastro ou nuvem.**

---

## 🌟 Principais Funcionalidades

### 🌳 Grafo Topológico Interativo de Commits
- **Visualização DAG em Tempo Real**: Linhas bezier suaves geradas por um algoritmo de ordenação topológica otimizado.
- **Identificadores de Referência Claros**: Badges visuais para branches locais, branches de rastreamento remoto, HEAD ativa, tags e stashes.
- **Escopo do Grafo**: Alterne entre "Todas as branches" (`--all`) e "Branch atual" (`HEAD`) com um único clique.
- **Comparação Arbitrária de Commits**: Compare quaisquer dois commits do histórico com <kbd>Ctrl</kbd>+Clique ou menu de contexto para inspecionar métricas combinadas e arquivos alterados.
- **Alternância Rápida de Branch (Checkout)**: Duplo clique ou clique com botão direito em qualquer badge para mudar de branch instantaneamente.
- **Detalhes Ricos e Metadados do Commit**: Assunto, descrição completa em múltiplas linhas, distinção visual de committer e badges de hashes pais clicáveis para navegação direta.

### 📑 Múltiplos Repositórios em Abas e Grupos Coloridos
- **Interface Multi-Aba**: Abra e alterne entre diversos repositórios sem perder o contexto.
- **Indicadores Ahead / Behind**: Badges em tempo real na barra de ferramentas indicando commits à frente (`↑`) ou atrás (`↓`) da branch remota, com Push e Pull em um clique.
- **Gerenciador de Remotes**: Modal completo para consultar URLs de fetch/push, adicionar remotes, editar URLs, remover remotes e executar "Fetch & Prune" (`git fetch --prune`).
- **Grupos com Cores Customizáveis**: Organize projetos correlacionados em grupos de cores e defina nomes personalizados.
- **Reordenação por Arraste (Drag-and-Drop)**: Reorganize a ordem de abas e de grupos facilmente arrastando com o mouse.
- **Recolhimento de Grupos**: Oculte visualmente grupos inativos para manter sua barra de trabalho limpa.

### 🔍 Visualizador de Diff com Monaco Editor & Solucionador de Conflitos
- **Preparação Interativa de Blocos (`git add -p`)**: Prepare, desfaça a preparação ou descarte blocos avulsos (hunks) com navegação de blocos anterior/próximo e atalhos de teclado.
- **Solucionador Visual de Conflitos de Merge**: Visualização direta dos marcadores de conflito no Monaco com banner de 1 clique: "Aceitar Atual (HEAD)", "Aceitar Entrada", "Aceitar Ambos" ou "Marcar como Resolvido".
- **Modos Lado a Lado (Split) e Em Linha (Inline)**: Alterne entre a visão unificada e dividida com um único clique.
- **Visualizador Integrado de Git Blame**: Coluna de blame sincronizada exibindo hash, autor, data relativa e navegação direta para o commit.
- **Ocultação Inteligente ("Apenas Alterações")**: Dobre trechos não modificados para focar exclusivamente nas linhas alteradas.
- **Navegação em Árvore ou Lista Plana**: Explore os arquivos modificados em formato de lista simples ou em árvore com métricas numstat (`+` adições / `-` deleções).

### ⚡ Operações Completas do Fluxo Diário do Git
- **Menu de Contexto de Arquivos**: Clique com botão direito em qualquer arquivo para preparar, descartar, ignorar via `.gitignore` (arquivo, extensão ou pasta), copiar caminhos ou abrir em editores externos.
- **Histórico Completo do Arquivo**: Inspecione o histórico de revisões de qualquer arquivo via `git log --follow` com busca instantânea.
- **Inspetor Visual de Reflog**: Explore o histórico local do reflog (`HEAD@{n}`) com cópia de SHA, criação de branches ou redefinição de HEAD (soft/mixed/hard).
- **Gerenciamento de Branches**: Criação de branches locais, checkout de branches remotas com tracking configurado, alternância rápida e exclusão local/remota com confirmação segura.
- **Merge & Squash**: Mesclagem rápida (fast-forward), merge de 3 vias e squash merge em um clique.
- **Detecção de Operações em Andamento**: Banner interativo inteligente ao detectar rebases, merges, reverts ou cherry-picks incompletos, com ações diretas de **Continuar** e **Abortar**.
- **Gerenciamento Completo de Stash**: Guarde alterações temporárias, visualize múltiplos stashes no mesmo commit e execute `apply`, `pop` ou `drop`.
- **Modos de Reset**: Redefina a branch para qualquer ponto histórico nos modos **Soft**, **Mixed** ou **Hard**, protegidos por janela de confirmação.
- **Reverter Commit & Cherry-Pick**: Crie commits inversos seguros sem reescrever histórico ou aplique commits avulsos de outras branches.
- **Push Seguro (`--force-with-lease`)**: Opção de envio forçado protegido acessível pelo botão direito no botão Push.
- **Integração com Ferramentas Externas**: Abra o terminal do sistema, VS Code ou explorador de arquivos diretamente das abas e arquivos.
- **Busca em Tempo Real no Histórico (`Ctrl+F`)**: Filtre milhares de commits por mensagem, autor ou hash de forma instantânea.

### 🔒 100% Offline e Privado
- **Zero Telemetria**: Sem analytics, sem conexões externas ocultas e sem rastreamento.
- **IPC Local Direto**: Toda a comunicação ocorre estritamente dentro da sua máquina através do canal IPC tipado do Tauri.
- **Autenticação Nativa**: Utiliza diretamente suas chaves SSH, agentes de autenticação e credenciais configuradas no próprio Git do sistema.

---

## ⌨️ Atalhos de Teclado

| Atalho | Ação | Contexto |
| :--- | :--- | :--- |
| <kbd>Ctrl</kbd> + <kbd>Enter</kbd> | Confirmar commit com arquivos preparados | Formulário de commit |
| <kbd>Espaço</kbd> | Preparar / Desfazer preparação do arquivo selecionado | Painel de arquivos |
| <kbd>Ctrl</kbd> + <kbd>Alt</kbd> + <kbd>S</kbd> | Preparar bloco (hunk) atual | Visualizador de diff |
| <kbd>Ctrl</kbd> + <kbd>Alt</kbd> + <kbd>U</kbd> | Desfazer preparação do bloco (hunk) atual | Visualizador de diff |
| <kbd>Ctrl</kbd> + Clique | Selecionar commit para comparação arbitrária | Grafo de histórico |
| <kbd>Ctrl</kbd> + <kbd>F</kbd> | Focar campo de busca no histórico | Painel de histórico |
| <kbd>Esc</kbd> | Limpar pesquisa / Fechar modais e menus | Global |
| <kbd>↑</kbd> / <kbd>↓</kbd> | Navegar entre commits ou arquivos | Lista ativa |
| <kbd>→</kbd> / <kbd>←</kbd> | Alternar foco entre painéis de Histórico e Arquivos | Janela principal |
| <kbd>Enter</kbd> | Selecionar commit ou arquivo em foco | Linha selecionada |
| Duplo clique (Aba) | Renomear aba ou grupo | Barra de abas |

---

## 🚀 Como Executar

### Instalando os Pacotes Prontos

Baixe o instalador mais recente em [Releases](https://github.com/maicondallg/Gitma/releases).

**Debian, Ubuntu e derivados:**

```bash
sudo apt install ./Gitma_*_amd64.deb
```

**Outras distribuições Linux x64 (AppImage):**

```bash
chmod +x Gitma_*_amd64.AppImage
./Gitma_*_amd64.AppImage
```

**Windows x64:** use o instalador `.msi` ou `-setup.exe`. As primeiras versões
sem assinatura digital podem exibir um alerta do Microsoft SmartScreen.

O Gitma requer o comando `git`. O pacote Debian instala essa dependência
automaticamente; usuários do AppImage e Windows devem instalar o Git separadamente.

### Compilando a partir do Código-Fonte

#### Pré-requisitos
- **Git** instalado no sistema
- **Node.js** 22.x ou superior com `npm`
- **Rust** 1.78+ (instalável via [rustup.rs](https://rustup.rs/))
- **Bibliotecas de desenvolvimento WebKitGTK** (no Ubuntu/Debian: `sudo apt install -y libwebkit2gtk-4.1-dev build-essential libssl-dev libayatana-appindicator3-dev librsvg2-dev`)

#### Clonar e Rodar
```bash
# 1. Clonar repositório
git clone https://github.com/maicondallg/gitma.git
cd Gitma

# 2. Instalar dependências da interface
npm install

# 3. Iniciar a aplicação em modo de desenvolvimento
npm run tauri dev
```

#### Compilar Pacote de Produção (.deb)
```bash
npm run tauri build -- --bundles deb
```
O pacote `.deb` gerado estará disponível no diretório `target/release/bundle/deb/`.

---

## 🧪 Modo de Demonstração (Fixtures)

O Gitma possui cenários pré-configurados que permitem inspecionar e testar todos os estados da interface sem alterar nenhum repositório real:

```bash
# Inspecionar alterações locais
npm run tauri -- dev -- -- --fixture local

# Inspecionar layout split
npm run tauri -- dev -- -- --fixture split

# Inspecionar cenário de conflitos de merge
npm run tauri -- dev -- -- --fixture conflict
```
*Fixtures disponíveis:* `welcome`, `local`, `split`, `history`, `clean`, `conflict`, `binary`, `error`.

---

## 📄 Licença

Distribuído sob a [Licença MIT](LICENSE).  
Copyright © 2026 Maicon Dall'Agnol e Contribuidores do Gitma.

Contribuições seguem o [Código de Conduta](CODE_OF_CONDUCT.md). Vulnerabilidades
devem ser comunicadas de forma privada conforme a [Política de Segurança](SECURITY.md).
