# Any-Code 参考项目分析总结

## 项目概述

**Any Code** 是一个专业的 AI CLI 桌面工具包，版本 5.17.5，支持多引擎（Claude、Codex、Gemini）。它是一个成熟的 Tauri v2 应用，拥有完善的架构设计。

| 特性 | 技术栈 |
|------|--------|
| 前端 | React 18 + TypeScript + Vite |
| 后端 | Rust (Tauri v2) |
| UI 框架 | Radix UI + Tailwind CSS v4 |
| 状态管理 | React Context API |
| 国际化 | i18next (中/英/繁体) |
| 包管理 | bun/pnpm |

---

## 值得借鉴的亮点

### 1. 🏗️ 优秀的架构设计

#### Context Provider 嵌套模式
```tsx
// App.tsx - 清晰的 Provider 层次结构
<UpdateProvider>
  <OutputCacheProvider>
    <NavigationProvider>
      <ProjectProvider>
        <TabProvider>
          <AppLayout>
            <ViewRouter />
          </AppLayout>
        </TabProvider>
      </ProjectProvider>
    </NavigationProvider>
  </OutputCacheProvider>
</UpdateProvider>
```

**借鉴点**：
- 将全局状态按职责拆分为多个 Context
- 避免单一巨大的全局 state
- 使用 `useMemo` 优化 Context value，避免不必要的重渲染

#### SessionContext 示例
```tsx
// 使用 useMemo 缓存 context 值，只有依赖真正变化时才重新创建
const contextValue = React.useMemo<SessionContextValue>(
  () => ({ session, projectPath, sessionId, ... }),
  [session, projectPath, sessionId, ...]
);
```

---

### 2. 🔌 插件化工具注册系统 (Tool Registry)

```typescript
// lib/toolRegistry.ts
class ToolRegistryClass {
  private renderers: Map<string, ToolRenderer> = new Map();
  private patternRenderers: ToolRenderer[] = [];

  register(renderer: ToolRenderer): void {
    // 精确名称注册
    this.renderers.set(renderer.name.toLowerCase(), renderer);

    // 正则模式注册（支持 MCP 工具等动态工具）
    if (renderer.pattern) {
      this.patternRenderers.push(renderer);
      // 按优先级排序
      this.patternRenderers.sort((a, b) => (b.priority || 0) - (a.priority || 0));
    }
  }

  getRenderer(toolName: string): ToolRenderer | null {
    // 1. 精确匹配
    // 2. 正则模式匹配（按优先级）
  }
}
```

**借鉴点**：
- 支持精确匹配和正则模式匹配
- 优先级机制解决冲突
- 可扩展的插件架构

---

### 3. 🌐 统一的 MCP 服务器管理

#### 数据结构设计
```typescript
// MCP 服务器规范
interface MCPServerSpec {
  type?: "stdio" | "http" | "sse";
  command?: string;      // stdio
  args?: string[];
  env?: Record<string, string>;
  url?: string;          // http/sse
  headers?: Record<string, string>;
}

// 多应用启用状态
interface McpApps {
  claude: boolean;
  codex: boolean;
  gemini: boolean;
}

// 统一的 MCP 服务器结构
interface McpServer {
  id: string;
  name: string;
  server: MCPServerSpec;
  apps: McpApps;         // 哪些引擎启用此 MCP
  description?: string;
  homepage?: string;
  tags?: string[];
}
```

**借鉴点**：
- 统一管理所有引擎的 MCP 配置
- 支持按引擎单独启用/禁用
- 完整的元数据支持（描述、主页、标签）

---

### 4. 💰 完整的定价和用量追踪系统

```typescript
// lib/pricing.ts
const MODEL_PRICING: Record<string, ModelPricing> = {
  'claude-opus-4.5': { input: 5.0, output: 25.0, cacheWrite: 6.25, cacheRead: 0.50 },
  'claude-sonnet-4.5': { input: 3.0, output: 15.0, cacheWrite: 3.75, cacheRead: 0.30 },
  'gpt-5.1-codex': { input: 1.25, output: 10.00, cacheWrite: 0, cacheRead: 0.125 },
  // ... 更多模型
};

// 用量统计结构
interface UsageStats {
  total_cost: number;
  total_tokens: number;
  by_model: ModelUsage[];
  by_date: DailyUsage[];
  by_project: ProjectUsage[];
  by_api_base_url?: ApiBaseUrlUsage[];
}
```

**借鉴点**：
- 按模型、日期、项目、API 端点分组统计
- 缓存 token 单独计费
- 实时费用追踪

---

### 5. 🔄 流式消息处理架构

```typescript
// lib/stream/SessionConnection.ts
class SessionConnection {
  private messageQueue: AsyncQueue<ClaudeStreamMessage>;
  private rawQueue: AsyncQueue<string>;

  // 使用 AsyncQueue 实现异步迭代
  get messages(): AsyncQueue<ClaudeStreamMessage> {
    return this.messageQueue;
  }

  // 支持 for await...of 语法
  async *iterate() {
    for await (const msg of this.messageQueue) {
      yield msg;
    }
  }
}
```

**借鉴点**：
- `AsyncQueue` 封装异步消息流
- 统一的消息转换器架构 (converterRegistry)
- 支持多引擎的统一消息格式

---

### 6. 🎨 主题与国际化

```typescript
// i18n 配置
const resources = {
  en: { translation: en },
  zh: { translation: zh },
  'zh-TW': { translation: zhTW }
};

// 使用 i18next-browser-languagedetector 自动检测语言
i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: 'zh',
    detection: {
      order: ['localStorage', 'navigator', 'htmlTag'],
      caches: ['localStorage'],
    },
  });
```

**借鉴点**：
- 完整的中英文翻译（60KB+ 翻译文件）
- 自动语言检测
- localStorage 缓存用户偏好

---

### 7. 🔧 Hooks 系统管理

```typescript
// lib/hooksManager.ts
class HooksManager {
  // 支持三级配置合并：user < project < local
  static mergeConfigs(
    user: HooksConfiguration,
    project: HooksConfiguration,
    local: HooksConfiguration
  ): HooksConfiguration {
    // 按优先级合并
  }

  // 支持的 Hook 事件
  const allEvents = [
    'PreToolUse', 'PostToolUse', 'Notification',
    'UserPromptSubmit', 'Stop', 'SubagentStop',
    'PreCompact', 'SessionStart', 'SessionEnd'
  ];
}
```

**借鉴点**：
- Claude Code hooks 的完整支持
- 三级配置优先级合并
- Hook 验证机制

---

### 8. 📊 Rust 后端功能模块

| 模块 | 功能 | 代码量 |
|------|------|--------|
| `claude_binary.rs` | Claude CLI 集成 | 84KB |
| `commands/acemcp.rs` | ACE MCP 协议 | 58KB |
| `commands/wsl_utils.rs` | WSL 支持 | 71KB |
| `commands/prompt_tracker.rs` | Prompt 追踪 | 54KB |
| `commands/mcp.rs` | MCP 管理 | 36KB |
| `commands/usage.rs` | 用量统计 | 29KB |
| `commands/translator.rs` | 翻译服务 | 20KB |

**借鉴点**：
- 模块化的命令组织
- 分引擎目录 (`commands/claude/`, `commands/codex/`, `commands/gemini/`)
- SQLite 数据存储 (`subagents_schema.sql`)

---

### 9. 🚀 构建优化配置

```toml
# Cargo.toml 构建配置

# 开发构建（快速）
[profile.dev-release]
inherits = "release"
opt-level = 2
lto = "thin"
codegen-units = 16
incremental = true
debug = true

# 生产构建（最小体积）
[profile.release]
opt-level = "z"
lto = true
codegen-units = 1
panic = "abort"
strip = true
```

**借鉴点**：
- 双构建配置（dev-release / release）
- 开发时启用增量编译
- 生产构建最小化体积

---

### 10. 🔐 SDK 直连绕过 CORS

```typescript
// lib/claudeSDK.ts
async sendMessageDirect(messages: ClaudeMessage[], options: {}): Promise<ClaudeResponse> {
  // 使用 Tauri HTTP 插件直接发送，绕过 CORS
  const response = await tauriFetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(requestBody),
  });
}
```

**借鉴点**：
- 使用 `@tauri-apps/plugin-http` 绕过浏览器 CORS 限制
- 支持第三方 API 代理
- 自动 URL 规范化

---

## 推荐借鉴优先级

| 优先级 | 功能 | 复杂度 | 价值 |
|--------|------|--------|------|
| ⭐⭐⭐ | Tool Registry 插件系统 | 中 | 高 |
| ⭐⭐⭐ | Context Provider 架构 | 低 | 高 |
| ⭐⭐⭐ | 统一 MCP 管理 | 中 | 高 |
| ⭐⭐ | 流式消息 AsyncQueue | 中 | 中 |
| ⭐⭐ | 用量追踪与定价 | 中 | 中 |
| ⭐⭐ | i18n 国际化 | 低 | 中 |
| ⭐ | Hooks 管理 | 中 | 低 |
| ⭐ | 构建优化配置 | 低 | 低 |

---

## 文件结构参考

```
Any-code/
├── src/
│   ├── App.tsx                 # 入口，Provider 嵌套
│   ├── main.tsx               # 渲染入口
│   ├── components/
│   │   ├── ui/                # Radix UI 组件
│   │   ├── layout/            # 布局组件
│   │   ├── message/           # 消息展示
│   │   ├── widgets/           # 工具 Widget
│   │   │   ├── mcp/          # MCP Widget
│   │   │   ├── file-operations/
│   │   │   └── ...
│   │   └── settings/          # 设置页面
│   ├── contexts/              # React Context
│   │   ├── SessionContext.tsx
│   │   ├── ProjectContext.tsx
│   │   └── ...
│   ├── hooks/                 # 自定义 Hooks
│   │   ├── usePromptExecution.ts  # 75KB 核心执行逻辑
│   │   └── ...
│   ├── lib/                   # 工具库
│   │   ├── api.ts            # 118KB Tauri 调用封装
│   │   ├── claudeSDK.ts      # SDK 集成
│   │   ├── toolRegistry.ts   # 工具注册
│   │   ├── pricing.ts        # 定价
│   │   └── stream/           # 流式处理
│   ├── types/                 # TypeScript 类型
│   └── i18n/                  # 国际化
│       └── locales/
│           ├── en.json       # 64KB
│           ├── zh.json       # 61KB
│           └── zh-TW.json    # 61KB
└── src-tauri/
    ├── src/
    │   ├── main.rs           # 21KB 入口
    │   ├── claude_binary.rs  # 84KB Claude 集成
    │   ├── claude_mcp.rs     # MCP
    │   ├── codex_mcp.rs
    │   ├── gemini_mcp.rs
    │   ├── commands/         # Tauri 命令
    │   │   ├── claude/
    │   │   ├── codex/
    │   │   ├── gemini/
    │   │   ├── mcp.rs
    │   │   ├── usage.rs
    │   │   └── ...
    │   └── process/          # 进程管理
    ├── Cargo.toml
    └── tauri.conf.json
```

---

### 11. 📂 Claude Code 历史会话数据加载

Any-Code 最强大的功能之一是能够直接读取 Claude Code CLI 的原生历史会话数据。

#### Claude Code 数据存储位置

```
~/.claude/
├── projects/                          # 项目会话目录
│   ├── -Users-xxx-project1/          # 项目路径编码后的目录名
│   │   ├── abc123def.jsonl           # 会话历史文件 (JSONL 格式)
│   │   ├── xyz789ghi.jsonl
│   │   └── agent-*.jsonl             # 子代理会话（被过滤）
│   └── -Users-xxx-project2/
├── todos/                             # TODO 数据
│   └── {session_id}.json
├── settings.json                      # 全局设置
└── hidden_projects.json               # 隐藏项目列表
```

#### Rust 后端实现 (project_store.rs)

```rust
// 1. 列出所有项目
pub fn list_projects(&self) -> Result<Vec<Project>, String> {
    let projects_dir = self.claude_dir.join("projects");

    for entry in fs::read_dir(&projects_dir) {
        let dir_name = entry.file_name();

        // 从目录名解码原始项目路径
        let project_path = decode_project_path(dir_name);

        // 扫描 .jsonl 会话文件
        for session_entry in fs::read_dir(&project_dir) {
            if session_path.extension() == Some("jsonl") {
                // 提取第一条用户消息作为会话标题
                let (first_message, timestamp) = extract_first_user_message(&session_path);
                sessions.push(session_id);
            }
        }
    }
}

// 2. 获取项目的所有会话
pub fn get_project_sessions(&self, project_id: &str) -> Result<Vec<Session>, String> {
    // 读取 JSONL 文件，提取元数据
    let (first_message, message_timestamp) = extract_first_user_message(&path);
    let last_message_timestamp = extract_last_message_timestamp(&path);
    let model = extract_session_model(&path);

    // 加载 TODO 数据
    let todo_data = fs::read_to_string(todos_dir.join(format!("{}.json", session_id)));

    sessions.push(Session {
        id: session_id,
        project_id,
        project_path,
        first_message,            // 会话标题（第一条用户消息）
        message_timestamp,        // 第一条消息时间
        last_message_timestamp,   // 最后活跃时间
        model,                    // 使用的模型
        todo_data,
    });
}
```

#### Session 数据结构

```typescript
// lib/api.ts
interface Session {
  id: string;                      // 会话 ID（JSONL 文件名）
  project_id: string;              // 项目 ID（编码后的目录名）
  project_path: string;            // 原始项目路径
  created_at: number;              // 创建时间 (Unix timestamp)
  first_message?: string;          // 第一条用户消息（会话标题）
  message_timestamp?: string;      // 第一条消息时间 (ISO)
  last_message_timestamp?: string; // 最后消息时间 (ISO)
  model?: string;                  // 使用的模型
  engine?: 'claude' | 'codex' | 'gemini';  // 引擎类型
  todo_data?: any;                 // TODO 数据
}
```

#### 会话历史加载 (JSONL 解析)

```typescript
// lib/api.ts
async loadSessionHistory(sessionId: string, projectId: string, engine?: 'claude' | 'codex') {
  // Codex 会话使用不同的存储位置
  if (engine === 'codex') {
    return this.loadCodexSessionHistory(sessionId);
  }
  // Claude 会话调用 Rust 后端
  return invoke("load_session_history", { sessionId, projectId });
}
```

```rust
// session_history.rs - JSONL 解析
pub fn load_session_history(session_id: &str, project_id: &str) -> Result<Vec<Value>, String> {
    let session_file = projects_dir.join(project_id).join(format!("{}.jsonl", session_id));

    let file = File::open(&session_file)?;
    let reader = BufReader::new(file);

    let mut messages = Vec::new();
    for line in reader.lines() {
        if let Ok(json) = serde_json::from_str::<Value>(&line?) {
            messages.push(json);
        }
    }
    Ok(messages)
}

// 提取第一条用户消息作为会话标题
pub fn extract_first_user_message(path: &Path) -> (Option<String>, Option<String>) {
    let file = File::open(path)?;
    let reader = BufReader::new(file);

    for line in reader.lines() {
        if let Ok(json) = serde_json::from_str::<Value>(&line?) {
            if json.get("type") == Some(&Value::String("user".to_string())) {
                // 提取用户消息文本
                let content = json.get("message")?.get("content")?;
                // ... 处理 string 或 array 格式
                return (Some(text), Some(timestamp));
            }
        }
    }
    (None, None)
}
```

#### 项目路径编解码

Claude Code 使用特殊编码存储项目路径：

```rust
// paths.rs
// 编码: /Users/xxx/project → -Users-xxx-project
pub fn encode_project_path(path: &str) -> String {
    path.replace("/", "-").replace("\\", "-")
}

// 解码: -Users-xxx-project → /Users/xxx/project
pub fn decode_project_path(encoded: &str) -> String {
    // 处理各种编码变体（-- 代表特殊字符等）
    let decoded = encoded
        .replace("---", "\x00")        // 临时标记
        .replace("--", "/")            // 双横线 → 斜杠
        .replace("-", "/")             // 单横线 → 斜杠
        .replace("\x00", "-");         // 恢复真正的横线

    // 处理 Windows 盘符 (C:)
    // 处理 macOS /private 符号链接
}
```

#### 会话列表 UI 组件 (SessionList.tsx)

```tsx
// 过滤无效会话（没有 first_message 的空会话）
const validSessions = filterValidSessions(sessions);

// 按引擎类型筛选
const filteredSessions = validSessions.filter(session => {
  if (sessionFilter === 'claude') {
    return !session.engine || session.engine === 'claude';
  }
  // ... codex, gemini
});

// 按最后活跃时间排序
const sortedSessions = [...filteredSessions].sort((a, b) => {
  const timeA = a.last_message_timestamp
    ? new Date(a.last_message_timestamp).getTime()
    : a.created_at * 1000;
  const timeB = b.last_message_timestamp
    ? new Date(b.last_message_timestamp).getTime()
    : b.created_at * 1000;
  return timeB - timeA;  // 降序
});
```

**借鉴点**：
- 直接读取 `~/.claude/projects/` 目录获取所有 Claude Code 历史
- JSONL 流式解析，提取会话元数据（标题、时间、模型）
- 项目路径编解码处理各种边界情况
- 多引擎会话统一管理（Claude/Codex/Gemini）
- 会话过滤、排序、分页的完整实现

---

## 总结

Any-Code 是一个成熟度很高的项目，代码量约 **273 个 TypeScript 文件**，Rust 后端约 **500KB+ 源码**。最值得借鉴的是：

1. **架构设计**：清晰的 Context 分层，避免 prop drilling
2. **插件化**：Tool Registry 支持动态工具注册
3. **统一管理**：MCP 服务器跨引擎统一管理
4. **完整功能**：用量追踪、i18n、Hooks 管理
5. **历史会话**：直接读取 Claude Code 原生会话数据，实现会话续接

建议按优先级逐步借鉴实现，从 Context 架构和 Tool Registry 开始。

---

## 借鉴 Claude Code 历史会话功能的实现计划

如果要在 Opencode 中实现类似功能，需要以下步骤：

### 1. Rust 后端模块

```
src-tauri/src/
├── commands/
│   └── claude_history/
│       ├── mod.rs           # 模块入口
│       ├── project_store.rs # 项目/会话管理
│       ├── session_history.rs # JSONL 解析
│       └── paths.rs         # 路径编解码
```

### 2. 核心 Tauri 命令

| 命令 | 功能 |
|------|------|
| `list_claude_projects` | 列出 ~/.claude/projects 所有项目 |
| `get_project_sessions` | 获取项目的所有会话 |
| `load_session_history` | 加载会话的 JSONL 历史 |

### 3. 前端集成

```typescript
// services/claudeHistory.ts
export const claudeHistoryApi = {
  listProjects: () => invoke<Project[]>('list_claude_projects'),
  getSessions: (projectId: string) => invoke<Session[]>('get_project_sessions', { projectId }),
  loadHistory: (sessionId: string, projectId: string) => invoke<any[]>('load_session_history', { sessionId, projectId }),
};
```

### 4. UI 组件

- `ClaudeProjectList` - 项目列表
- `ClaudeSessionList` - 会话列表
- `ClaudeSessionViewer` - 会话详情/消息展示

**预计工作量**：中等（2-3 天），主要工作在 Rust JSONL 解析和路径编解码。
