# Tauri Sidecar 配置指南

本文档说明如何使用 `tauri-plugin-shell` 插件来启动 Resources 目录下的 Sidecar 进程（Node.js 和 Gemini CLI），并将它们与现有的 Gemini Code Studio UI 集成。

## 目录

1. [目录结构](#目录结构)
2. [配置步骤](#配置步骤)
3. [与现有 UI 集成](#与现有-ui-集成)
4. [使用示例](#使用示例)
5. [React Hook 封装](#react-hook-封装)
6. [跨平台支持](#跨平台支持)
7. [安全注意事项](#安全注意事项)
8. [调试技巧](#调试技巧)

## 目录结构

```
Resources/
├── bundled-node/
│   └── darwin-arm64/
│       └── bin/
│           └── node (106MB 可执行文件)
├── bundled-agents/
│   └── darwin-arm64/
│       ├── claude-code-darwin-arm64.tgz (98MB)
│       ├── gemini-cli-darwin-arm64.tgz (3.9MB)
│       └── manifest.json
├── codex-acp/
└── configs/
```

## 配置步骤

### 1. 更新 tauri.conf.json

在 `src-tauri/tauri.conf.json` 中配置 Sidecar 二进制文件：

```json
{
  "$schema": "https://schema.tauri.app/config/2",
  "bundle": {
    "resources": [
      "Resources/bundled-node/darwin-arm64/bin/node",
      "Resources/bundled-agents/darwin-arm64/*.tgz",
      "Resources/bundled-agents/darwin-arm64/manifest.json"
    ],
    "externalBin": [
      "Resources/bundled-node/darwin-arm64/bin/node",
      "Resources/bundled-agents/darwin-arm64/gemini-cli"
    ]
  },
  "plugins": {
    "shell": {
      "open": true,
      "sidecar": true,
      "scope": [
        {
          "name": "node-sidecar",
          "cmd": "Resources/bundled-node/darwin-arm64/bin/node",
          "args": true,
          "sidecar": true
        },
        {
          "name": "gemini-cli-sidecar",
          "cmd": "Resources/bundled-agents/darwin-arm64/gemini-cli",
          "args": true,
          "sidecar": true
        }
      ]
    }
  }
}
```

### 2. 更新 Cargo.toml

确保 `src-tauri/Cargo.toml` 包含 `tauri-plugin-shell`：

```toml
[dependencies]
tauri = { version = "2.0", features = ["devtools"] }
tauri-plugin-shell = "2.0"
serde = { version = "1", features = ["derive"] }
serde_json = "1"
```

### 3. 更新 Rust 代码 (src-tauri/src/lib.rs)

```rust
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            #[cfg(debug_assertions)]
            {
                let window = app.get_webview_window("main").unwrap();
                window.open_devtools();
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

## 与现有 UI 集成

本节说明如何将 Sidecar 进程与现有的 Gemini Code Studio UI 集成，实现 Claude、Gemini、Codex 和 Kiro 四个 CLI 工具的无缝切换。

### 架构概览

现有 UI 架构：
```
App.tsx (主应用)
├── Sidebar.tsx (工具选择: claude/gemini/codex/kiro)
├── ChatPanel.tsx (聊天界面)
├── WorkspacePanel.tsx (预览/代码/终端)
└── ConfigPanel.tsx (配置面板)

当前实现:
- activeTool: ToolId ('claude' | 'gemini' | 'codex' | 'kiro')
- handleSendMessage: 通过 services/gemini.ts 调用 Gemini API
- extractCode: 从响应中提取 HTML 代码块
```

集成目标：
```
App.tsx
├── Sidecar 管理器 (启动/停止 CLI 进程)
├── CLI 路由器 (根据 activeTool 选择对应的 CLI)
└── 消息适配器 (统一不同 CLI 的输入/输出格式)
```

### 步骤 1: 创建 Sidecar 管理服务

创建 `services/sidecar.ts` 来管理所有 CLI 进程：

```typescript
// services/sidecar.ts
import { Command, Child } from '@tauri-apps/plugin-shell';
import { invoke } from '@tauri-apps/api/core';

export type CLITool = 'claude' | 'gemini' | 'codex' | 'kiro';

interface SidecarProcess {
  tool: CLITool;
  process: Child | null;
  isRunning: boolean;
  port?: number; // 如果 CLI 启动 HTTP 服务器
}

class SidecarManager {
  private processes: Map<CLITool, SidecarProcess> = new Map();
  private outputHandlers: Map<CLITool, (data: string) => void> = new Map();

  /**
   * 启动指定的 CLI 工具
   */
  async startCLI(tool: CLITool): Promise<void> {
    // 如果已经在运行，直接返回
    if (this.processes.get(tool)?.isRunning) {
      console.log(`${tool} CLI is already running`);
      return;
    }

    try {
      let command: Command;

      switch (tool) {
        case 'claude':
          // 启动 Claude Code CLI
          command = await this.createClaudeCommand();
          break;
        case 'gemini':
          // 启动 Gemini CLI
          command = await this.createGeminiCommand();
          break;
        case 'codex':
          // 启动 Codex CLI
          command = await this.createCodexCommand();
          break;
        case 'kiro':
          // 启动 Kiro CLI
          command = await this.createKiroCommand();
          break;
      }

      // 设置输出监听
      command.stdout.on('data', (line) => {
        console.log(`[${tool}] stdout:`, line);
        this.outputHandlers.get(tool)?.(line);
      });

      command.stderr.on('data', (line) => {
        console.error(`[${tool}] stderr:`, line);
      });

      command.on('close', (data) => {
        console.log(`[${tool}] exited with code ${data.code}`);
        this.processes.set(tool, {
          tool,
          process: null,
          isRunning: false
        });
      });

      const child = await command.spawn();

      this.processes.set(tool, {
        tool,
        process: child,
        isRunning: true,
        port: this.getDefaultPort(tool)
      });

      console.log(`${tool} CLI started with PID:`, child.pid);
    } catch (error) {
      console.error(`Failed to start ${tool} CLI:`, error);
      throw error;
    }
  }

  /**
   * 停止指定的 CLI 工具
   */
  async stopCLI(tool: CLITool): Promise<void> {
    const sidecar = this.processes.get(tool);
    if (sidecar?.process) {
      try {
        await sidecar.process.kill();
        this.processes.delete(tool);
        console.log(`${tool} CLI stopped`);
      } catch (error) {
        console.error(`Failed to stop ${tool} CLI:`, error);
      }
    }
  }

  /**
   * 停止所有 CLI 工具
   */
  async stopAll(): Promise<void> {
    const promises = Array.from(this.processes.keys()).map(tool =>
      this.stopCLI(tool)
    );
    await Promise.all(promises);
  }

  /**
   * 检查 CLI 是否正在运行
   */
  isRunning(tool: CLITool): boolean {
    return this.processes.get(tool)?.isRunning ?? false;
  }

  /**
   * 获取 CLI 的端口（如果有）
   */
  getPort(tool: CLITool): number | undefined {
    return this.processes.get(tool)?.port;
  }

  /**
   * 注册输出处理器
   */
  onOutput(tool: CLITool, handler: (data: string) => void): void {
    this.outputHandlers.set(tool, handler);
  }

  /**
   * 移除输出处理器
   */
  offOutput(tool: CLITool): void {
    this.outputHandlers.delete(tool);
  }

  // 私有辅助方法

  private async createClaudeCommand(): Promise<Command> {
    // 解压 claude-code-darwin-arm64.tgz 到临时目录
    await invoke('extract_cli', { cliName: 'claude-code' });

    // 启动 Claude Code CLI 服务器模式
    return Command.create('node-sidecar', [
      'path/to/extracted/claude-code/index.js',
      '--server',
      '--port', '3001'
    ]);
  }

  private async createGeminiCommand(): Promise<Command> {
    await invoke('extract_cli', { cliName: 'gemini-cli' });

    return Command.create('node-sidecar', [
      'path/to/extracted/gemini-cli/index.js',
      '--server',
      '--port', '3002'
    ]);
  }

  private async createCodexCommand(): Promise<Command> {
    // Codex CLI 实现
    return Command.create('node-sidecar', [
      'path/to/codex/index.js',
      '--server',
      '--port', '3003'
    ]);
  }

  private async createKiroCommand(): Promise<Command> {
    // Kiro CLI 实现
    return Command.create('node-sidecar', [
      'path/to/kiro/index.js',
      '--server',
      '--port', '3004'
    ]);
  }

  private getDefaultPort(tool: CLITool): number {
    const ports = {
      claude: 3001,
      gemini: 3002,
      codex: 3003,
      kiro: 3004
    };
    return ports[tool];
  }
}

// 导出单例
export const sidecarManager = new SidecarManager();
```

### 步骤 2: 创建 CLI 路由服务

创建 `services/cliRouter.ts` 来统一不同 CLI 的接口：

```typescript
// services/cliRouter.ts
import { CLITool, sidecarManager } from './sidecar';
import { sendMessageToGemini } from './gemini';

interface CLIMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface CLIResponse {
  content: string;
  code?: string; // 提取的代码块
}

/**
 * CLI 路由器 - 根据选择的工具调用对应的 CLI
 */
export class CLIRouter {
  /**
   * 发送消息到指定的 CLI 工具
   */
  async sendMessage(
    tool: CLITool,
    message: string,
    history: CLIMessage[] = []
  ): Promise<CLIResponse> {
    switch (tool) {
      case 'claude':
        return await this.sendToClaudeCLI(message, history);
      case 'gemini':
        return await this.sendToGeminiCLI(message, history);
      case 'codex':
        return await this.sendToCodexCLI(message, history);
      case 'kiro':
        return await this.sendToKiroCLI(message, history);
      default:
        throw new Error(`Unknown CLI tool: ${tool}`);
    }
  }

  /**
   * Claude Code CLI 集成
   */
  private async sendToClaudeCLI(
    message: string,
    history: CLIMessage[]
  ): Promise<CLIResponse> {
    // 确保 Claude CLI 正在运行
    if (!sidecarManager.isRunning('claude')) {
      await sidecarManager.startCLI('claude');
      // 等待 CLI 启动
      await this.wait(2000);
    }

    const port = sidecarManager.getPort('claude');

    // 通过 HTTP 调用 Claude CLI
    const response = await fetch(`http://localhost:${port}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message,
        history,
        stream: false
      })
    });

    const data = await response.json();
    return {
      content: data.content,
      code: this.extractCode(data.content)
    };
  }

  /**
   * Gemini CLI 集成
   */
  private async sendToGeminiCLI(
    message: string,
    history: CLIMessage[]
  ): Promise<CLIResponse> {
    // 方案 1: 使用现有的 Gemini API (保持兼容)
    // 将 CLIMessage[] 转换为 Gemini 历史格式
    const geminiHistory = history.map(m => ({
      role: m.role === 'user' ? 'user' : 'model',
      parts: [{ text: m.content }]
    }));

    const content = await sendMessageToGemini(message, geminiHistory);

    return {
      content,
      code: this.extractCode(content)
    };

    // 方案 2: 使用 Gemini CLI Sidecar（如果需要）
    /*
    if (!sidecarManager.isRunning('gemini')) {
      await sidecarManager.startCLI('gemini');
      await this.wait(2000);
    }

    const port = sidecarManager.getPort('gemini');
    const response = await fetch(`http://localhost:${port}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, history })
    });

    const data = await response.json();
    return {
      content: data.content,
      code: this.extractCode(data.content)
    };
    */
  }

  /**
   * Codex CLI 集成
   */
  private async sendToCodexCLI(
    message: string,
    history: CLIMessage[]
  ): Promise<CLIResponse> {
    if (!sidecarManager.isRunning('codex')) {
      await sidecarManager.startCLI('codex');
      await this.wait(2000);
    }

    const port = sidecarManager.getPort('codex');
    const response = await fetch(`http://localhost:${port}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, history })
    });

    const data = await response.json();
    return {
      content: data.content,
      code: this.extractCode(data.content)
    };
  }

  /**
   * Kiro CLI 集成
   */
  private async sendToKiroCLI(
    message: string,
    history: CLIMessage[]
  ): Promise<CLIResponse> {
    if (!sidecarManager.isRunning('kiro')) {
      await sidecarManager.startCLI('kiro');
      await this.wait(2000);
    }

    const port = sidecarManager.getPort('kiro');
    const response = await fetch(`http://localhost:${port}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, history })
    });

    const data = await response.json();
    return {
      content: data.content,
      code: this.extractCode(data.content)
    };
  }

  /**
   * 从响应中提取代码块
   */
  private extractCode(response: string): string | undefined {
    // 匹配 ```html ... ```
    const htmlMatch = response.match(/```html\n([\s\S]*?)\n```/);
    if (htmlMatch) return htmlMatch[1];

    // 匹配 ``` ... ```
    const genericMatch = response.match(/```\n([\s\S]*?)\n```/);
    if (genericMatch && genericMatch[1].trim().startsWith('<')) {
      return genericMatch[1];
    }

    return undefined;
  }

  private wait(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// 导出单例
export const cliRouter = new CLIRouter();
```

### 步骤 3: 更新 App.tsx

修改 `App.tsx` 来使用新的 CLI 路由器：

```typescript
// App.tsx
import React, { useState, useEffect } from 'react';
import Sidebar from './components/Sidebar';
import ChatPanel from './components/ChatPanel';
import WorkspacePanel from './components/WorkspacePanel';
import ConfigPanel from './components/ConfigPanel';
import { Message, Sender, Tab, ToolId } from './types';
import { cliRouter } from './services/cliRouter';
import { sidecarManager } from './services/sidecar';

const INITIAL_MESSAGES: Message[] = [
  {
    id: '1',
    text: "Hello! I'm your AI coding assistant. Select a tool from the sidebar and start building!",
    sender: Sender.AGENT,
    timestamp: Date.now()
  }
];

const App: React.FC = () => {
  const [messages, setMessages] = useState<Message[]>(INITIAL_MESSAGES);
  const [activeTab, setActiveTab] = useState<Tab>(Tab.PREVIEW);
  const [generatedCode, setGeneratedCode] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [activeTool, setActiveTool] = useState<ToolId>('gemini');
  const [isConfigOpen, setIsConfigOpen] = useState(false);

  // 在组件卸载时清理所有 Sidecar 进程
  useEffect(() => {
    return () => {
      sidecarManager.stopAll();
    };
  }, []);

  const handleToolSelect = (toolId: ToolId) => {
    setActiveTool(toolId);

    // 添加工具切换消息
    const toolNames = {
      claude: 'Claude Code',
      gemini: 'Gemini CLI',
      codex: 'Codex CLI',
      kiro: 'Kiro CLI'
    };

    setMessages(prev => [...prev, {
      id: Date.now().toString(),
      text: `Switched to ${toolNames[toolId]}. Ready to assist!`,
      sender: Sender.AGENT,
      timestamp: Date.now()
    }]);
  };

  const handleSendMessage = async (text: string) => {
    // 1. 添加用户消息
    const userMsg: Message = {
      id: Date.now().toString(),
      text,
      sender: Sender.USER,
      timestamp: Date.now()
    };

    setMessages(prev => [...prev, userMsg]);
    setIsGenerating(true);

    try {
      // 2. 准备历史记录
      const history = messages.map(m => ({
        role: m.sender === Sender.USER ? 'user' : 'assistant',
        content: m.text
      }));

      // 3. 通过 CLI 路由器发送消息
      const response = await cliRouter.sendMessage(
        activeTool,
        text,
        history
      );

      // 4. 添加 Agent 响应
      const agentMsg: Message = {
        id: (Date.now() + 1).toString(),
        text: response.content,
        sender: Sender.AGENT,
        timestamp: Date.now()
      };

      setMessages(prev => [...prev, agentMsg]);

      // 5. 如果有代码，更新预览
      if (response.code) {
        setGeneratedCode(response.code);
        setActiveTab(Tab.PREVIEW);
      }

    } catch (error) {
      console.error('CLI Error:', error);
      setMessages(prev => [...prev, {
        id: Date.now().toString(),
        text: `Error with ${activeTool}: ${error instanceof Error ? error.message : 'Unknown error'}`,
        sender: Sender.AGENT,
        timestamp: Date.now(),
        isError: true
      }]);
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="flex w-screen h-screen bg-ide-bg text-ide-text font-sans selection:bg-blue-500/30">
      <Sidebar
        activeTool={activeTool}
        onToolSelect={handleToolSelect}
      />
      <div className="flex-1 flex overflow-hidden">
        <ChatPanel
          messages={messages}
          onSendMessage={handleSendMessage}
          isGenerating={isGenerating}
          activeTool={activeTool}
          onOpenConfig={() => setIsConfigOpen(true)}
        />
        <WorkspacePanel
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          code={generatedCode}
        />
      </div>

      <ConfigPanel
        isOpen={isConfigOpen}
        onClose={() => setIsConfigOpen(false)}
        activeTool={activeTool}
      />
    </div>
  );
};

export default App;
```

### 步骤 4: 添加 Rust 后端支持

在 `src-tauri/src/lib.rs` 中添加解压和管理 CLI 的命令：

```rust
use tauri::Manager;
use std::fs;
use std::path::PathBuf;
use std::process::Command as StdCommand;

#[derive(serde::Serialize, serde::Deserialize)]
struct ExtractResult {
    success: bool,
    path: String,
    message: String,
}

/// 解压指定的 CLI 工具
#[tauri::command]
fn extract_cli(app_handle: tauri::AppHandle, cli_name: String) -> Result<ExtractResult, String> {
    let resource_path = app_handle.path()
        .resource_dir()
        .map_err(|e| e.to_string())?;

    // 确定平台
    let platform = if cfg!(target_os = "macos") {
        if cfg!(target_arch = "aarch64") {
            "darwin-arm64"
        } else {
            "darwin-x64"
        }
    } else if cfg!(target_os = "windows") {
        "windows-x64"
    } else {
        "linux-x64"
    };

    let tgz_path = resource_path.join(format!(
        "Resources/bundled-agents/{}/{}-{}.tgz",
        platform, cli_name, platform
    ));

    if !tgz_path.exists() {
        return Err(format!("CLI archive not found: {:?}", tgz_path));
    }

    // 解压到应用数据目录
    let app_data = app_handle.path()
        .app_data_dir()
        .map_err(|e| e.to_string())?;

    let extract_dir = app_data.join("cli").join(&cli_name);
    fs::create_dir_all(&extract_dir).map_err(|e| e.to_string())?;

    // 解压
    let output = StdCommand::new("tar")
        .args(&[
            "-xzf",
            tgz_path.to_str().unwrap(),
            "-C",
            extract_dir.to_str().unwrap(),
        ])
        .output()
        .map_err(|e| e.to_string())?;

    if !output.status.success() {
        return Err(format!(
            "Failed to extract: {}",
            String::from_utf8_lossy(&output.stderr)
        ));
    }

    Ok(ExtractResult {
        success: true,
        path: extract_dir.to_string_lossy().to_string(),
        message: format!("{} extracted successfully", cli_name),
    })
}

/// 获取 Node.js 二进制路径
#[tauri::command]
fn get_node_path(app_handle: tauri::AppHandle) -> Result<String, String> {
    let resource_path = app_handle.path()
        .resource_dir()
        .map_err(|e| e.to_string())?;

    let platform = if cfg!(target_os = "macos") {
        if cfg!(target_arch = "aarch64") {
            "darwin-arm64"
        } else {
            "darwin-x64"
        }
    } else if cfg!(target_os = "windows") {
        "windows-x64"
    } else {
        "linux-x64"
    };

    let node_path = resource_path.join(format!(
        "Resources/bundled-node/{}/bin/node",
        platform
    ));

    Ok(node_path.to_string_lossy().to_string())
}

/// 获取解压后的 CLI 路径
#[tauri::command]
fn get_cli_path(app_handle: tauri::AppHandle, cli_name: String) -> Result<String, String> {
    let app_data = app_handle.path()
        .app_data_dir()
        .map_err(|e| e.to_string())?;

    let cli_dir = app_data.join("cli").join(&cli_name);

    if !cli_dir.exists() {
        return Err(format!("CLI not extracted yet: {}", cli_name));
    }

    Ok(cli_dir.to_string_lossy().to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![
            extract_cli,
            get_node_path,
            get_cli_path
        ])
        .setup(|app| {
            #[cfg(debug_assertions)]
            {
                let window = app.get_webview_window("main").unwrap();
                window.open_devtools();
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

### 步骤 5: 更新 Sidecar Manager 使用 Rust 命令

更新 `services/sidecar.ts` 中的 CLI 创建方法：

```typescript
private async createClaudeCommand(): Promise<Command> {
  // 1. 解压 CLI
  const extractResult = await invoke<{success: boolean, path: string, message: string}>(
    'extract_cli',
    { cliName: 'claude-code' }
  );

  if (!extractResult.success) {
    throw new Error(`Failed to extract Claude CLI: ${extractResult.message}`);
  }

  // 2. 获取 Node 路径
  const nodePath = await invoke<string>('get_node_path');

  // 3. 启动 CLI
  return Command.create('run', [], {
    cmd: nodePath,
    args: [
      `${extractResult.path}/index.js`,
      '--server',
      '--port', '3001'
    ]
  });
}

// 类似地更新其他 CLI 的创建方法
```

### 步骤 6: 添加状态指示器

在 Sidebar 中添加 CLI 运行状态指示：

```typescript
// components/Sidebar.tsx
import { sidecarManager } from '../services/sidecar';

const Sidebar: React.FC<SidebarProps> = ({ activeTool, onToolSelect }) => {
  const [cliStatuses, setCLIStatuses] = useState<Record<ToolId, boolean>>({
    claude: false,
    gemini: false,
    codex: false,
    kiro: false
  });

  // 定期检查 CLI 状态
  useEffect(() => {
    const interval = setInterval(() => {
      setCLIStatuses({
        claude: sidecarManager.isRunning('claude'),
        gemini: sidecarManager.isRunning('gemini'),
        codex: sidecarManager.isRunning('codex'),
        kiro: sidecarManager.isRunning('kiro')
      });
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="w-16 h-full bg-ide-sidebar border-r border-ide-border flex flex-col items-center py-4 justify-between z-20 shadow-xl">
      <div className="flex flex-col gap-4 w-full items-center">
        <div className="flex flex-col gap-3 w-full items-center pb-4 border-b border-ide-border/50">
          {cliTools.map((tool) => (
            <div
              key={tool.id}
              onClick={() => onToolSelect(tool.id)}
              className={`relative p-2.5 rounded-xl cursor-pointer transition-all duration-200 group ${
                activeTool === tool.id
                  ? 'bg-white/10 shadow-lg'
                  : 'hover:bg-white/5'
              }`}
              title={`${tool.name} ${cliStatuses[tool.id] ? '(Running)' : '(Stopped)'}`}
            >
              <div className={`${tool.color} transition-transform group-hover:scale-110 flex items-center justify-center`}>
                {tool.icon}
              </div>

              {/* CLI 运行状态指示器 */}
              {cliStatuses[tool.id] && (
                <div className="absolute top-1 right-1 w-2 h-2 bg-green-500 rounded-full animate-pulse" />
              )}

              {activeTool === tool.id && (
                <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-ide-textLight rounded-r-full -ml-2" />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* 底部图标... */}
    </div>
  );
};
```

### 完整的集成流程

1. **用户选择工具**: 在 Sidebar 点击 Claude/Gemini/Codex/Kiro 图标
2. **工具切换**: `handleToolSelect` 更新 `activeTool` 状态
3. **发送消息**: 用户在 ChatPanel 输入消息
4. **路由到 CLI**: `cliRouter.sendMessage()` 根据 `activeTool` 选择对应的 CLI
5. **启动 Sidecar** (如需): `sidecarManager.startCLI()` 启动对应的 CLI 进程
6. **解压二进制** (首次): Rust 命令 `extract_cli` 解压 .tgz 文件
7. **进程通信**: 通过 HTTP/stdin-stdout 与 CLI 通信
8. **返回响应**: CLI 返回响应，提取代码块
9. **更新 UI**: 显示响应消息，预览生成的代码

### 优势

✅ **统一接口**: 所有 CLI 工具使用相同的接口
✅ **自动管理**: Sidecar 进程自动启动和停止
✅ **无缝切换**: 用户可���随时切换不同的 AI 工具
✅ **状态可视**: UI 显示 CLI 运行状态
✅ **错误处理**: 完善的错误处理和用户反馈
✅ **向后兼容**: Gemini 继续使用现有的 API 实现

## 使用示例

### 方案 A: 使用已解压的二进制文件

如果你需要先解压 `.tgz` 文件，可以在应用启动时执行：

#### Frontend (TypeScript/React)

```typescript
import { Command } from '@tauri-apps/plugin-shell';

// 启动 Node.js Sidecar
async function startNodeSidecar(scriptPath: string) {
  try {
    const command = Command.create('node-sidecar', [scriptPath]);

    command.on('close', data => {
      console.log(`Node sidecar exited with code ${data.code} and signal ${data.signal}`);
    });

    command.on('error', error => console.error(`Node sidecar error: "${error}"`));

    command.stdout.on('data', line => console.log(`Node stdout: "${line}"`));
    command.stderr.on('data', line => console.log(`Node stderr: "${line}"`));

    const child = await command.spawn();
    console.log('Node sidecar PID:', child.pid);

    return child;
  } catch (error) {
    console.error('Failed to start Node sidecar:', error);
    throw error;
  }
}

// 启动 Gemini CLI Sidecar
async function startGeminiCliSidecar(args: string[]) {
  try {
    const command = Command.create('gemini-cli-sidecar', args);

    command.on('close', data => {
      console.log(`Gemini CLI exited with code ${data.code}`);
    });

    command.on('error', error => console.error(`Gemini CLI error: "${error}"`));

    command.stdout.on('data', line => console.log(`Gemini stdout: "${line}"`));
    command.stderr.on('data', line => console.log(`Gemini stderr: "${line}"`));

    const child = await command.spawn();
    console.log('Gemini CLI PID:', child.pid);

    return child;
  } catch (error) {
    console.error('Failed to start Gemini CLI sidecar:', error);
    throw error;
  }
}

// 使用示例
async function example() {
  // 启动 Node.js 运行脚本
  const nodeProcess = await startNodeSidecar('path/to/your/script.js');

  // 启动 Gemini CLI
  const geminiProcess = await startGeminiCliSidecar(['--help']);

  // 稍后可以终止进程
  // await nodeProcess.kill();
  // await geminiProcess.kill();
}
```

### 方案 B: 使用 Tauri Command 解压和启动

#### Backend (Rust)

在 `src-tauri/src/lib.rs` 中添加命令：

```rust
use tauri::Manager;
use std::process::{Command as StdCommand, Stdio};
use std::path::PathBuf;

#[tauri::command]
fn extract_and_start_gemini(app_handle: tauri::AppHandle) -> Result<String, String> {
    let resource_path = app_handle.path()
        .resource_dir()
        .map_err(|e| e.to_string())?;

    let tgz_path = resource_path
        .join("Resources/bundled-agents/darwin-arm64/gemini-cli-darwin-arm64.tgz");

    let extract_dir = resource_path.join("extracted");
    std::fs::create_dir_all(&extract_dir).map_err(|e| e.to_string())?;

    // 解压 .tgz 文件
    let output = StdCommand::new("tar")
        .args(&["-xzf", tgz_path.to_str().unwrap()])
        .arg("-C")
        .arg(extract_dir.to_str().unwrap())
        .output()
        .map_err(|e| e.to_string())?;

    if !output.status.success() {
        return Err(format!("Failed to extract: {}", String::from_utf8_lossy(&output.stderr)));
    }

    Ok("Gemini CLI extracted successfully".to_string())
}

#[tauri::command]
fn get_node_path(app_handle: tauri::AppHandle) -> Result<String, String> {
    let resource_path = app_handle.path()
        .resource_dir()
        .map_err(|e| e.to_string())?;

    let node_path = resource_path
        .join("Resources/bundled-node/darwin-arm64/bin/node");

    Ok(node_path.to_string_lossy().to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![
            extract_and_start_gemini,
            get_node_path
        ])
        .setup(|app| {
            #[cfg(debug_assertions)]
            {
                let window = app.get_webview_window("main").unwrap();
                window.open_devtools();
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

#### Frontend (TypeScript)

```typescript
import { invoke } from '@tauri-apps/api/core';
import { Command } from '@tauri-apps/plugin-shell';

// 解压 Gemini CLI
async function extractGeminiCli() {
  try {
    const result = await invoke<string>('extract_and_start_gemini');
    console.log(result);
  } catch (error) {
    console.error('Failed to extract Gemini CLI:', error);
  }
}

// 获取 Node 路径并启动
async function startNodeWithDynamicPath(scriptPath: string) {
  try {
    const nodePath = await invoke<string>('get_node_path');

    const command = Command.create('run', [scriptPath], {
      cwd: '.',
      env: { NODE_PATH: nodePath }
    });

    const child = await command.spawn();
    console.log('Node process started with PID:', child.pid);

    return child;
  } catch (error) {
    console.error('Failed to start Node:', error);
    throw error;
  }
}
```

### 方案 C: 直接使用 Shell 命令（简化版）

```typescript
import { Command } from '@tauri-apps/plugin-shell';

async function runNodeScript(scriptPath: string) {
  // 直接调用 node 二进制
  const output = await Command.create('node-sidecar', [scriptPath]).execute();
  console.log('Node output:', output.stdout);
  console.log('Node errors:', output.stderr);
  return output;
}

async function runGeminiCli(args: string[]) {
  const output = await Command.create('gemini-cli-sidecar', args).execute();
  console.log('Gemini output:', output.stdout);
  return output;
}
```

## React Hook 封装

创建一个自定义 Hook 来管理 Sidecar 进程：

```typescript
// hooks/useSidecar.ts
import { useState, useEffect, useCallback } from 'react';
import { Command, Child } from '@tauri-apps/plugin-shell';

interface SidecarOptions {
  name: string;
  args?: string[];
  onStdout?: (data: string) => void;
  onStderr?: (data: string) => void;
  onClose?: (code: number) => void;
  autoStart?: boolean;
}

export function useSidecar({
  name,
  args = [],
  onStdout,
  onStderr,
  onClose,
  autoStart = false
}: SidecarOptions) {
  const [process, setProcess] = useState<Child | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const start = useCallback(async () => {
    try {
      setError(null);
      const command = Command.create(name, args);

      if (onStdout) {
        command.stdout.on('data', onStdout);
      }

      if (onStderr) {
        command.stderr.on('data', onStderr);
      }

      command.on('close', (data) => {
        setIsRunning(false);
        setProcess(null);
        onClose?.(data.code);
      });

      command.on('error', (err) => {
        setError(err);
        setIsRunning(false);
      });

      const child = await command.spawn();
      setProcess(child);
      setIsRunning(true);

      return child;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      setError(errorMsg);
      setIsRunning(false);
      throw err;
    }
  }, [name, args, onStdout, onStderr, onClose]);

  const stop = useCallback(async () => {
    if (process) {
      try {
        await process.kill();
        setIsRunning(false);
        setProcess(null);
      } catch (err) {
        console.error('Failed to kill process:', err);
      }
    }
  }, [process]);

  useEffect(() => {
    if (autoStart) {
      start();
    }

    return () => {
      if (process) {
        process.kill().catch(console.error);
      }
    };
  }, [autoStart]);

  return {
    start,
    stop,
    isRunning,
    error,
    process
  };
}
```

### 使用 Hook 示例

```typescript
// components/NodeProcess.tsx
import React from 'react';
import { useSidecar } from '../hooks/useSidecar';

export function NodeProcessManager() {
  const {
    start,
    stop,
    isRunning,
    error
  } = useSidecar({
    name: 'node-sidecar',
    args: ['server.js'],
    onStdout: (data) => console.log('Node:', data),
    onStderr: (data) => console.error('Node error:', data),
    onClose: (code) => console.log('Node exited with code:', code)
  });

  return (
    <div>
      <h3>Node.js Process</h3>
      <p>Status: {isRunning ? '🟢 Running' : '⚫ Stopped'}</p>
      {error && <p style={{ color: 'red' }}>Error: {error}</p>}
      <button onClick={start} disabled={isRunning}>
        Start Node
      </button>
      <button onClick={stop} disabled={!isRunning}>
        Stop Node
      </button>
    </div>
  );
}
```

## 跨平台支持

为了支持多平台，需要在 `tauri.conf.json` 中为每个平台配置：

```json
{
  "bundle": {
    "resources": {
      "darwin-arm64": [
        "Resources/bundled-node/darwin-arm64/bin/node",
        "Resources/bundled-agents/darwin-arm64/*.tgz"
      ],
      "darwin-x64": [
        "Resources/bundled-node/darwin-x64/bin/node",
        "Resources/bundled-agents/darwin-x64/*.tgz"
      ],
      "windows-x64": [
        "Resources/bundled-node/windows-x64/node.exe",
        "Resources/bundled-agents/windows-x64/*.zip"
      ],
      "linux-x64": [
        "Resources/bundled-node/linux-x64/bin/node",
        "Resources/bundled-agents/linux-x64/*.tar.gz"
      ]
    }
  }
}
```

在 Rust 代码中检测平台：

```rust
#[tauri::command]
fn get_platform_specific_path(app_handle: tauri::AppHandle, binary: String) -> Result<String, String> {
    let resource_path = app_handle.path().resource_dir().map_err(|e| e.to_string())?;

    let platform = if cfg!(target_os = "macos") {
        if cfg!(target_arch = "aarch64") {
            "darwin-arm64"
        } else {
            "darwin-x64"
        }
    } else if cfg!(target_os = "windows") {
        "windows-x64"
    } else {
        "linux-x64"
    };

    let binary_path = resource_path
        .join(format!("Resources/bundled-node/{}/bin/{}", platform, binary));

    Ok(binary_path.to_string_lossy().to_string())
}
```

## 安全注意事项

1. **权限控制**: 在 `tauri.conf.json` 中严格定义允许的命令
2. **路径验证**: 始终验证传递给 Sidecar 的路径
3. **输入清理**: 清理所有用户输入，防止命令注入
4. **资源限制**: 监控 Sidecar 进程的资源使用

```typescript
// 输入验证示例
function validateScriptPath(path: string): boolean {
  // 只允许特定目录下的脚本
  const allowedDir = '/safe/scripts/';
  return path.startsWith(allowedDir) && !path.includes('..');
}

async function safeRunScript(scriptPath: string) {
  if (!validateScriptPath(scriptPath)) {
    throw new Error('Invalid script path');
  }

  return await Command.create('node-sidecar', [scriptPath]).execute();
}
```

## 调试技巧

### 1. 启用详细日志

```typescript
const command = Command.create('node-sidecar', ['-v', 'script.js']);

command.stdout.on('data', line => {
  console.log('[STDOUT]', line);
});

command.stderr.on('data', line => {
  console.error('[STDERR]', line);
});
```

### 2. 检查进程状态

```typescript
const child = await command.spawn();
console.log('Process started:', {
  pid: child.pid,
  timestamp: new Date().toISOString()
});

// 监听退出
command.on('close', data => {
  console.log('Process exited:', {
    code: data.code,
    signal: data.signal,
    timestamp: new Date().toISOString()
  });
});
```

### 3. 测试二进制文件

在开发模式下测试：

```bash
# 测试 Node 二进制
./Resources/bundled-node/darwin-arm64/bin/node --version

# 解压并测试 Gemini CLI
cd Resources/bundled-agents/darwin-arm64
tar -xzf gemini-cli-darwin-arm64.tgz
./gemini-cli --help
```

## 常见问题

### Q: Sidecar 进程未启动？

检查：
1. 二进制文件是否有执行权限：`chmod +x Resources/bundled-node/darwin-arm64/bin/node`
2. tauri.conf.json 中的路径是否正确
3. 查看控制台错误日志

### Q: 如何在应用退出时清理进程？

```typescript
useEffect(() => {
  return () => {
    // 组件卸载时清理
    if (process) {
      process.kill().catch(console.error);
    }
  };
}, [process]);
```

### Q: 如何与 Sidecar 进程通信？

使用 stdin/stdout 或通过 HTTP/WebSocket：

```typescript
// 使用 stdin
const command = Command.create('node-sidecar', ['interactive.js']);
const child = await command.spawn();

await child.write('{"command": "ping"}\n');

command.stdout.on('data', line => {
  const response = JSON.parse(line);
  console.log('Response:', response);
});
```

## 参考资料

- [Tauri Shell Plugin 文档](https://v2.tauri.app/plugin/shell/)
- [Tauri Sidecar 指南](https://v2.tauri.app/develop/sidecar/)
- [Tauri 配置参考](https://v2.tauri.app/reference/config/)
