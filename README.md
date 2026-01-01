<div align="center">

# Open Code Studio

**AI-powered IDE for generating and previewing web applications**

A modern desktop application built with Tauri + React + TypeScript, featuring chat-based code generation with multiple AI backends.

![Open Code Studio](Screenshots/opencode-claudecode.jpeg)

</div>

## ✨ Features

- 🤖 **Multiple AI Backends** - Support for Claude Code, Gemini, Codex, and Kiro
- 💬 **Chat-based Code Generation** - Natural language to code conversion
- 🖥️ **Live Preview** - Real-time preview of generated web applications
- 📁 **File Explorer** - Browse and edit project files
- 🔧 **Integrated Terminal** - Full PTY terminal with xterm.js
- 🎨 **Dark Theme IDE** - Modern dark-themed interface
- 📱 **Responsive Preview** - Toggle between mobile and desktop viewports
- 🔌 **MCP Server Support** - Configure Model Context Protocol servers (stdio & HTTP)
- 📦 **Git Integration** - Built-in Git support for version control

## 📸 Screenshots

### Main Interface
![Open Code Studio with Claude Code](Screenshots/opencode-claudecode.jpeg)

### MCP Server Configuration
![MCP Server Configuration](Screenshots/opencode-claudecode-mcp-server.jpeg)

### MCP Server Test
![MCP Server Test](Screenshots/opencode-claudecode-mcp-server-test.jpeg)

### Git Integration
![Git Integration](Screenshots/opencode-git.jpeg)

## 🏗️ Architecture

```
opencode/
├── App.tsx                 # Main application orchestrator
├── components/
│   ├── ChatPanel.tsx       # Chat interface with AI
│   ├── WorkspacePanel.tsx  # Preview/Code/Terminal tabs
│   ├── Sidebar.tsx         # Tool selector
│   ├── XTerminal.tsx       # Terminal component (xterm.js)
│   ├── ProjectSelector.tsx # Project folder selection
│   └── ConfigPanel.tsx     # Settings modal
├── services/
│   ├── gemini.ts           # Gemini AI integration
│   ├── cliRouter.ts        # CLI routing for AI tools
│   ├── sidecar.ts          # Sidecar process management
│   └── slashCommands.ts    # Slash command parser
├── src-tauri/
│   ├── src/lib.rs          # Rust backend (PTY, process management)
│   └── tauri.conf.json     # Tauri configuration
└── Resources/
    ├── bundled-node/       # Bundled Node.js runtime
    ├── bundled-agents/     # AI agent configurations
    └── codex-acp/          # Codex CLI integration
```

## 🚀 Getting Started

### Prerequisites

- **Node.js** >= 18.0
- **pnpm** (recommended) or npm
- **Rust** >= 1.70 (for Tauri)

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/user/opencode.git
   cd opencode
   ```

2. **Install dependencies**
   ```bash
   pnpm install
   ```

3. **Configure API Keys**

   Copy the example environment file and add your API key:
   ```bash
   cp .env.local.example .env.local
   ```

   Edit `.env.local` and set your Gemini API key:
   ```
   GEMINI_API_KEY=your_api_key_here
   ```

4. **Run in development mode**
   ```bash
   pnpm run tauri:dev
   ```

5. **Build for production**
   ```bash
   pnpm run tauri:build
   ```

## 🛠️ Tech Stack

| Layer | Technology |
|-------|------------|
| **Desktop Framework** | [Tauri 2.0](https://tauri.app/) |
| **Frontend** | React 19 + TypeScript |
| **Styling** | Tailwind CSS |
| **Build Tool** | Vite |
| **Terminal** | xterm.js + portable-pty |
| **AI Integration** | Google Gemini, Claude Code |

## 📦 Available Scripts

| Command | Description |
|---------|-------------|
| `pnpm dev` | Start Vite dev server only |
| `pnpm build` | Build frontend for production |
| `pnpm tauri:dev` | Run Tauri app in development |
| `pnpm tauri:build` | Build Tauri app for distribution |

## 🔌 AI Tools

Open Code Studio supports multiple AI backends:

- **Claude Code** - Anthropic's Claude with coding capabilities
- **Gemini** - Google's Gemini Pro with thinking budget
- **Codex** - OpenAI Codex integration
- **Kiro** - Custom AI agent

Switch between tools using the sidebar icons.

## 📄 License

MIT License - see [LICENSE](LICENSE) for details.

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.
