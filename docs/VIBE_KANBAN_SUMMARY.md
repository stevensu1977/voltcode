# Vibe Kanban 参考项目分析总结

## 项目概述

**Vibe Kanban** 是一个专业的 AI 编码代理编排平台，通过 **Git Worktree** 实现多个 AI 代理并行工作在同一项目的不同任务上。

> *"Get 10X more out of Claude Code, Gemini CLI, Codex, Amp and other coding agents..."*

| 特性 | 技术栈 |
|------|--------|
| 后端 | Rust (Axum) |
| 前端 | React + TypeScript + Vite |
| 数据库 | SQLite (SQLx) |
| 类型共享 | ts-rs (Rust → TypeScript) |
| 分发 | npm (`npx vibe-kanban`) |

---

## 核心创新：Git Worktree 多代理架构

### 什么是 Git Worktree？

Git Worktree 允许从同一个仓库创建多个工作目录，每个工作目录可以检出不同的分支，实现真正的并行开发。

```
main-repo/
├── .git/
├── worktrees/
│   ├── task-123/  →  分支: feature/task-123
│   ├── task-456/  →  分支: feature/task-456
│   └── task-789/  →  分支: feature/task-789
└── src/
```

### 架构图

```
┌──────────────────────────────────────────────────────────────────┐
│                      Vibe Kanban Web UI                          │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐    │
│  │  TODO   │ │IN PROG  │ │IN REVIEW│ │  DONE   │ │CANCELLED│    │
│  │ Task A  │ │ Task B  │ │ Task C  │ │ Task D  │ │         │    │
│  │ Task E  │ │ Task F  │ │         │ │         │ │         │    │
│  └─────────┘ └─────────┘ └─────────┘ └─────────┘ └─────────┘    │
└──────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────────┐
│                     WorktreeManager (Rust)                       │
│  • 创建隔离的工作目录                                              │
│  • 线程安全的并发控制                                              │
│  • 自动清理和垃圾回收                                              │
└──────────────────────────────────────────────────────────────────┘
                              │
          ┌───────────────────┼───────────────────┐
          ▼                   ▼                   ▼
┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐
│   Worktree A    │ │   Worktree B    │ │   Worktree C    │
│ ─────────────── │ │ ─────────────── │ │ ─────────────── │
│ Branch: task-A  │ │ Branch: task-B  │ │ Branch: task-C  │
│ Agent: Claude   │ │ Agent: Gemini   │ │ Agent: Codex    │
│ Status: Running │ │ Status: Running │ │ Status: Done    │
└─────────────────┘ └─────────────────┘ └─────────────────┘
```

---

## 值得借鉴的亮点

### 1. 🔒 线程安全的 Worktree 管理

```rust
// crates/services/src/services/worktree_manager.rs

// 全局锁：防止并发创建 worktree 时的竞争条件
static WORKTREE_CREATION_LOCKS: LazyLock<Mutex<HashMap<String, Arc<tokio::sync::Mutex<()>>>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));

impl WorktreeManager {
    /// 确保 worktree 存在，必要时重新创建（带同步）
    pub async fn ensure_worktree_exists(
        repo_path: &Path,
        branch_name: &str,
        worktree_path: &Path,
    ) -> Result<(), WorktreeError> {
        let path_str = worktree_path.to_string_lossy().to_string();

        // 为特定 worktree 路径获取或创建锁
        let lock = {
            let mut locks = WORKTREE_CREATION_LOCKS.lock().unwrap();
            locks
                .entry(path_str.clone())
                .or_insert_with(|| Arc::new(tokio::sync::Mutex::new(())))
                .clone()
        };

        // 获取此 worktree 路径的锁
        let _guard = lock.lock().await;

        // 检查 worktree 是否已正确设置
        if Self::is_worktree_properly_set_up(repo_path, worktree_path).await? {
            return Ok(());
        }

        // 重新创建 worktree
        Self::recreate_worktree_internal(repo_path, branch_name, worktree_path).await
    }
}
```

**借鉴点**：
- 细粒度锁（per-worktree）而非全局锁
- 异步锁 (`tokio::sync::Mutex`) 避免阻塞
- 自动重试和清理机制

---

### 2. 🤖 多 Agent 支持

支持 9 种编码代理，统一接口设计：

```rust
// crates/executors/src/executors/mod.rs

#[enum_dispatch]
pub enum CodingAgent {
    ClaudeCode,    // Claude Code CLI
    Amp,           // Sourcegraph Amp
    Gemini,        // Google Gemini CLI
    Codex,         // OpenAI Codex
    Opencode,      // Opencode
    CursorAgent,   // Cursor Agent
    QwenCode,      // 通义灵码
    Copilot,       // GitHub Copilot
    Droid,         // Droid
}

// 每个 Agent 实现统一 trait
#[async_trait]
pub trait StandardCodingAgentExecutor {
    async fn spawn(&self, env: &ExecutionEnv) -> Result<AsyncGroupChild, ExecutorError>;
    fn get_mcp_config(&self) -> McpConfig;
    fn availability_info(&self) -> AvailabilityInfo;
    // ...
}
```

**Agent 配置示例**：
```rust
// 每个 Agent 可以有多个变体配置
pub struct ExecutorProfileId {
    pub executor: BaseCodingAgent,  // CLAUDE_CODE, GEMINI, etc.
    pub variant: Option<String>,    // DEFAULT, PLAN, ROUTER, etc.
}
```

**借鉴点**：
- `enum_dispatch` 实现零成本抽象
- 支持多配置变体（DEFAULT, PLAN, ROUTER 等）
- 统一的可用性检测机制

---

### 3. 📋 Kanban 任务管理

```rust
// crates/db/src/models/task.rs

#[derive(Debug, Clone, Type, Serialize, Deserialize)]
pub enum TaskStatus {
    Todo,        // 待办
    InProgress,  // 进行中
    InReview,    // 审核中
    Done,        // 完成
    Cancelled,   // 已取消
}

pub struct Task {
    pub id: Uuid,
    pub project_id: Uuid,
    pub title: String,
    pub description: Option<String>,
    pub status: TaskStatus,
    pub parent_workspace_id: Option<Uuid>,  // 支持任务嵌套
    pub shared_task_id: Option<Uuid>,       // 支持共享任务
}

// 任务关系追踪
pub struct TaskRelationships {
    pub parent_task: Option<Task>,
    pub current_workspace: Workspace,
    pub children: Vec<Task>,
}
```

---

### 4. 🌳 Workspace 工作空间模型

```rust
// crates/db/src/models/workspace.rs

pub enum WorkspaceStatus {
    SetupRunning,     // 环境设置中
    SetupComplete,    // 环境就绪
    SetupFailed,      // 环境设置失败
    ExecutorRunning,  // Agent 执行中
    ExecutorComplete, // Agent 完成
    ExecutorFailed,   // Agent 失败
}

pub struct Workspace {
    pub id: Uuid,
    pub task_id: Uuid,
    pub container_ref: Option<String>,
    pub branch: String,                    // Git 分支名
    pub agent_working_dir: Option<String>, // Agent 工作目录
    pub setup_completed_at: Option<DateTime<Utc>>,
}

pub struct WorkspaceContext {
    pub workspace: Workspace,
    pub task: Task,
    pub project: Project,
    pub workspace_repos: Vec<RepoWithTargetBranch>,
}
```

**借鉴点**：
- Workspace = Task + Git Branch + Agent
- 完整的状态机管理
- 支持多仓库配置

---

### 5. 🔄 ts-rs 类型共享

Rust 类型自动生成 TypeScript 定义：

```rust
// Rust 定义
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct Task {
    pub id: Uuid,
    pub title: String,
    pub status: TaskStatus,
}

// 自动生成 TypeScript
// shared/types.ts (自动生成，勿手动编辑)
export interface Task {
    id: string;
    title: string;
    status: TaskStatus;
}
```

**命令**：
```bash
pnpm run generate-types       # 生成类型
pnpm run generate-types:check # CI 检查类型一致性
```

**借鉴点**：
- Rust 和 TypeScript 类型同步
- CI 自动检查防止类型漂移
- 单一来源（Rust）消除不一致

---

### 6. 📦 综合清理机制

```rust
impl WorktreeManager {
    /// 综合清理 worktree 路径和元数据
    fn comprehensive_worktree_cleanup(
        repo: &Repository,
        worktree_path: &Path,
    ) -> Result<(), WorktreeError> {
        // Step 1: 使用 GitService 移除 worktree 注册
        git_service.remove_worktree(&git_repo_path, worktree_path, true)?;

        // Step 2: 强制清理元数据目录
        Self::force_cleanup_worktree_metadata(&git_repo_path, worktree_path)?;

        // Step 3: 清理物理 worktree 目录
        if worktree_path.exists() {
            std::fs::remove_dir_all(worktree_path)?;
        }

        // Step 4: 清理其他过期的管理条目
        git_service.prune_worktrees(&git_repo_path)?;
    }
}
```

**借鉴点**：
- 多层清理策略
- 非致命错误继续执行
- 自动垃圾回收

---

### 7. 🔌 统一 MCP 配置

```rust
impl CodingAgent {
    pub fn get_mcp_config(&self) -> McpConfig {
        match self {
            Self::Codex(_) => McpConfig::new(
                vec!["mcp_servers".to_string()],
                serde_json::json!({ "mcp_servers": {} }),
                self.preconfigured_mcp(),
                true,  // 需要合并
            ),
            Self::ClaudeCode(_) => McpConfig::new(
                vec!["mcpServers".to_string()],
                serde_json::json!({ "mcpServers": {} }),
                self.preconfigured_mcp(),
                false,
            ),
            // ... 其他 Agent
        }
    }
}
```

**借鉴点**：
- 不同 Agent 有不同的 MCP 配置路径
- 预配置 MCP 服务器支持
- 配置合并策略

---

## 项目结构

```
vibe-kanban/
├── crates/                    # Rust 工作空间
│   ├── server/               # HTTP API 服务器
│   ├── db/                   # SQLite 数据模型
│   │   ├── migrations/       # 数据库迁移
│   │   └── src/models/
│   │       ├── task.rs       # 任务模型
│   │       ├── workspace.rs  # 工作空间模型
│   │       ├── project.rs    # 项目模型
│   │       └── ...
│   ├── executors/            # Agent 执行器
│   │   └── src/executors/
│   │       ├── claude.rs     # 92KB Claude 集成
│   │       ├── codex.rs      # Codex 集成
│   │       ├── gemini.rs     # Gemini 集成
│   │       └── ...
│   ├── services/             # 业务服务
│   │   └── src/services/
│   │       └── worktree_manager.rs  # Worktree 管理
│   └── utils/                # 工具函数
├── frontend/                 # React 前端
│   └── src/
│       ├── components/       # UI 组件
│       ├── contexts/         # React Context
│       ├── hooks/            # 69 个自定义 Hooks
│       └── stores/           # 状态存储
├── shared/                   # 共享类型 (ts-rs 生成)
│   └── types.ts
├── npx-cli/                  # npm 发布包
└── docs/                     # 文档
```

---

## 数据流程

```
用户创建任务
    │
    ▼
┌─────────────────┐
│ Task 创建       │ → SQLite 存储
│ status: TODO   │
└─────────────────┘
    │
    ▼ 用户点击"开始任务"
┌─────────────────┐
│ Workspace 创建  │
│ • 分配 Git 分支 │
│ • 选择 Agent   │
└─────────────────┘
    │
    ▼
┌─────────────────────────────────────┐
│ WorktreeManager.create_worktree()  │
│ • 创建分支                          │
│ • 创建 worktree 目录                │
│ • 线程安全同步                      │
└─────────────────────────────────────┘
    │
    ▼
┌─────────────────┐
│ Agent 启动      │
│ • 在 worktree  │
│   目录执行     │
│ • 流式输出     │
└─────────────────┘
    │
    ▼ Agent 完成
┌─────────────────┐
│ 用户审核       │ → status: IN_REVIEW
│ • 查看 diff    │
│ • 创建 PR      │
└─────────────────┘
    │
    ▼ 合并
┌─────────────────┐
│ 清理 worktree  │ → status: DONE
└─────────────────┘
```

---

## 推荐借鉴优先级

| 优先级 | 功能 | 复杂度 | 价值 |
|--------|------|--------|------|
| ⭐⭐⭐ | Git Worktree 管理 | 高 | 极高 |
| ⭐⭐⭐ | 多 Agent 统一接口 | 中 | 高 |
| ⭐⭐⭐ | 任务状态机管理 | 中 | 高 |
| ⭐⭐ | ts-rs 类型共享 | 低 | 中 |
| ⭐⭐ | Workspace 模型 | 中 | 中 |
| ⭐ | MCP 统一配置 | 低 | 低 |

---

## 关键命令

```bash
# 安装依赖
pnpm i

# 开发模式
pnpm run dev

# 生成 TypeScript 类型
pnpm run generate-types

# 准备数据库
pnpm run prepare-db

# 构建 npm 包
pnpm run build:npx

# 测试 npm 包
./test-npm-package.sh
```

---

## 总结

Vibe Kanban 最核心的创新是使用 **Git Worktree** 实现多 Agent 并行工作：

1. **隔离性**：每个任务有独立的工作目录和 Git 分支
2. **并发性**：多个 Agent 可以同时工作在不同任务
3. **可追溯**：每个任务的修改在独立分支，易于审核和回滚
4. **统一管理**：Kanban 看板统一管理所有任务状态

这种架构特别适合需要同时处理多个开发任务的场景，比如：
- 一个 Agent 修复 Bug A
- 另一个 Agent 实现功能 B
- 第三个 Agent 重构模块 C

所有工作并行进行，互不干扰，最后通过 PR 合并。

### 对 opencode 项目的启发

如果要实现类似功能，关键是：

1. **WorktreeManager** - 封装 Git worktree 操作，处理并发和清理
2. **Task/Workspace 模型** - 任务与工作空间的关联
3. **Agent 抽象层** - 统一不同 CLI 工具的接口
4. **状态机** - 管理任务和工作空间的生命周期

---

## 🚀 在 Opencode 项目中本地实现的可行性分析

### 结论：完全可行

Git Worktree 是 Git 的原生功能，不依赖任何服务器或云服务，可以在本地完全实现。Opencode 作为 Tauri 应用，具备所有必要的技术条件。

### 技术可行性对比

| 需求 | Vibe Kanban | Opencode 现状 | 可行性 |
|------|-------------|---------------|--------|
| Git 操作 | Rust (git2) | 可用 git2 crate | ✅ |
| 数据存储 | SQLite (SQLx) | 可用 tauri-plugin-sql | ✅ |
| 进程管理 | tokio spawn | 已有 tauri-plugin-shell | ✅ |
| 多 Agent | 9 种 CLI | 已支持 4 种 (Claude/Gemini/Codex/Kiro) | ✅ |
| 前端框架 | React | React | ✅ |

### 实现方案设计

#### 方案一：轻量级集成（推荐起步）

不引入完整的 Kanban 系统，而是在现有聊天界面基础上增加"并行任务"功能。

```
┌─────────────────────────────────────────────────────────────┐
│                     Opencode 主界面                          │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────────────────────────────┐  │
│  │   侧边栏    │  │           工作区                      │  │
│  │             │  │                                      │  │
│  │ [主项目]    │  │  当前聊天: Claude - 修复登录 Bug     │  │
│  │             │  │                                      │  │
│  │ 并行任务 ▼  │  │  ┌──────────────────────────────┐   │  │
│  │ ├─ Task 1   │  │  │  User: 修复登录页面的 Bug    │   │  │
│  │ │  Claude   │  │  │  Agent: 我来检查...          │   │  │
│  │ │  运行中   │  │  └──────────────────────────────┘   │  │
│  │ ├─ Task 2   │  │                                      │  │
│  │ │  Gemini   │  │                                      │  │
│  │ │  完成     │  │                                      │  │
│  │ └─ Task 3   │  │                                      │  │
│  │    Codex    │  │                                      │  │
│  │    待审核   │  │                                      │  │
│  └─────────────┘  └─────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

**核心组件**：

```
src-tauri/src/
├── worktree.rs          # Git Worktree 管理（新增）
├── parallel_tasks.rs    # 并行任务管理（新增）
└── lib.rs               # 现有入口

components/
├── ParallelTaskPanel.tsx  # 并行任务面板（新增）
├── TaskCard.tsx           # 任务卡片（新增）
└── Sidebar.tsx            # 修改：添加任务列表
```

#### 方案二：完整 Kanban 集成（进阶）

引入完整的看板视图，类似 Vibe Kanban。

```
┌────────────────────────────────────────────────────────────────┐
│  Opencode  │  聊天  │  看板  │  终端  │  文件  │  设置         │
├────────────────────────────────────────────────────────────────┤
│                        看板视图                                 │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐          │
│  │  待办    │ │  进行中  │ │  审核中  │ │  完成    │          │
│  │          │ │          │ │          │ │          │          │
│  │ ┌──────┐ │ │ ┌──────┐ │ │ ┌──────┐ │ │ ┌──────┐ │          │
│  │ │修复  │ │ │ │实现  │ │ │ │重构  │ │ │ │优化  │ │          │
│  │ │Bug A │ │ │ │功能 B│ │ │ │模块 C│ │ │ │性能 D│ │          │
│  │ │      │ │ │ │      │ │ │ │      │ │ │ │      │ │          │
│  │ │Claude│ │ │ │Gemini│ │ │ │Codex │ │ │ │Kiro  │ │          │
│  │ └──────┘ │ │ └──────┘ │ │ └──────┘ │ │ └──────┘ │          │
│  │ ┌──────┐ │ │          │ │          │ │          │          │
│  │ │添加  │ │ │          │ │          │ │          │          │
│  │ │测试 E│ │ │          │ │          │ │          │          │
│  │ └──────┘ │ │          │ │          │ │          │          │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘          │
└────────────────────────────────────────────────────────────────┘
```

### 核心模块设计

#### 1. WorktreeManager (Rust)

```rust
// src-tauri/src/worktree.rs (设计稿)

use std::path::PathBuf;
use git2::Repository;

pub struct WorktreeManager {
    repo_path: PathBuf,
    worktrees_dir: PathBuf,  // ~/.opencode/worktrees/{project_hash}/
}

impl WorktreeManager {
    /// 创建新的 worktree
    pub async fn create_worktree(
        &self,
        task_id: &str,
        branch_name: &str,
    ) -> Result<PathBuf, WorktreeError> {
        // 1. 创建分支（基于当前 HEAD）
        // 2. 创建 worktree 目录
        // 3. 返回 worktree 路径
    }

    /// 列出所有 worktree
    pub fn list_worktrees(&self) -> Result<Vec<WorktreeInfo>, WorktreeError> {
        // git worktree list --porcelain
    }

    /// 删除 worktree
    pub async fn remove_worktree(&self, task_id: &str) -> Result<(), WorktreeError> {
        // 1. git worktree remove
        // 2. 清理分支（可选）
    }

    /// 获取 worktree 的 diff
    pub fn get_worktree_diff(&self, task_id: &str) -> Result<String, WorktreeError> {
        // git diff main..{branch}
    }
}
```

#### 2. 任务数据模型

```typescript
// types.ts (设计稿)

export interface ParallelTask {
  id: string;
  title: string;
  description?: string;
  status: 'todo' | 'running' | 'review' | 'done' | 'failed';
  agentId: ToolId;           // claude | gemini | codex | kiro
  branchName: string;        // feature/task-{id}
  worktreePath: string;      // ~/.opencode/worktrees/.../task-{id}
  createdAt: number;
  updatedAt: number;
  // 执行相关
  processId?: number;        // Agent 进程 ID
  outputLog?: string;        // 执行日志
}

export interface ParallelTasksState {
  tasks: ParallelTask[];
  activeTaskId: string | null;
}
```

#### 3. Tauri 命令

```rust
// src-tauri/src/lib.rs (设计稿 - 新增命令)

#[tauri::command]
async fn create_parallel_task(
    project_path: String,
    title: String,
    description: Option<String>,
    agent_id: String,
) -> Result<ParallelTask, String> {
    // 1. 生成任务 ID
    // 2. 创建 worktree
    // 3. 保存到数据库
    // 4. 返回任务信息
}

#[tauri::command]
async fn start_parallel_task(task_id: String) -> Result<(), String> {
    // 1. 获取任务信息
    // 2. 在 worktree 目录启动 Agent
    // 3. 更新状态为 running
}

#[tauri::command]
async fn get_task_diff(task_id: String) -> Result<String, String> {
    // 获取任务分支与主分支的 diff
}

#[tauri::command]
async fn merge_task(task_id: String) -> Result<(), String> {
    // 1. git checkout main
    // 2. git merge {branch}
    // 3. 清理 worktree
    // 4. 更新状态为 done
}
```

### 目录结构规划

```
~/.opencode/
├── worktrees/
│   └── {project_hash}/           # 每个项目的 worktree 目录
│       ├── task-abc123/          # 任务 1 的工作目录
│       ├── task-def456/          # 任务 2 的工作目录
│       └── task-ghi789/          # 任务 3 的工作目录
├── tasks.db                      # SQLite 任务数据库
└── config.json                   # 配置文件
```

### 工作流程

```
1. 用户创建并行任务
   │
   ├─→ 输入任务标题和描述
   ├─→ 选择执行 Agent (Claude/Gemini/Codex/Kiro)
   └─→ 系统自动：
       ├─→ 创建新分支: feature/task-{id}
       └─→ 创建 worktree: ~/.opencode/worktrees/.../task-{id}

2. 启动任务
   │
   └─→ 在 worktree 目录启动选定的 Agent
       └─→ Agent 工作在隔离环境，不影响主项目

3. 监控进度
   │
   ├─→ 实时显示 Agent 输出
   ├─→ 状态更新：running → review
   └─→ 可同时运行多个任务

4. 审核完成
   │
   ├─→ 查看 diff（与主分支对比）
   ├─→ 决定：
   │   ├─→ 合并：git merge → 清理 worktree
   │   ├─→ 修改：继续在 worktree 工作
   │   └─→ 放弃：删除 worktree 和分支
   └─→ 状态更新：done / cancelled

5. 冲突处理
   │
   └─→ 如果合并冲突：
       ├─→ 显示冲突文件
       ├─→ 在 worktree 中解决
       └─→ 重新合并
```

### 实现优先级建议

| 阶段 | 功能 | 工作量 | 描述 |
|------|------|--------|------|
| **Phase 1** | Worktree 基础管理 | 2-3 天 | create/list/remove worktree |
| **Phase 2** | 任务数据模型 | 1-2 天 | SQLite 存储，CRUD 操作 |
| **Phase 3** | Agent 在 Worktree 执行 | 2-3 天 | 修改现有 Agent 执行逻辑，支持指定工作目录 |
| **Phase 4** | 前端任务面板 | 3-4 天 | 任务列表、状态展示、操作按钮 |
| **Phase 5** | Diff 查看与合并 | 2-3 天 | diff 展示、合并操作、冲突处理 |
| **Phase 6** | 完整 Kanban 视图 | 3-5 天 | 拖拽排序、看板布局（可选） |

**总计：约 2-3 周**

### 潜在挑战与解决方案

| 挑战 | 解决方案 |
|------|----------|
| **并发安全** | 使用 Mutex/RwLock 保护共享状态，参考 vibe-kanban 的锁机制 |
| **进程管理** | 使用 Tauri 的 sidecar 或 Command API，记录 PID 以便终止 |
| **状态同步** | 前端轮询或 WebSocket 推送任务状态变化 |
| **磁盘空间** | 定期清理已完成任务的 worktree，设置最大并行任务数 |
| **大型仓库** | worktree 共享 .git 目录，创建速度快，空间占用小 |

### 与 Vibe Kanban 的差异

| 方面 | Vibe Kanban | Opencode 本地版 |
|------|-------------|-----------------|
| **部署方式** | Web 服务 / npx | 桌面应用 |
| **数据存储** | 集中式 SQLite | 本地 SQLite |
| **多用户** | 支持 | 单用户 |
| **远程项目** | 支持 SSH | 本地项目 |
| **Agent 数量** | 9 种 | 4 种（可扩展） |

### 简化版快速实现

如果想快速验证概念，可以先实现最简版本：

```bash
# 手动 Git Worktree 操作（无需代码修改）

# 1. 创建 worktree
git worktree add ../task-fix-bug feature/fix-bug

# 2. 在 worktree 中启动 Agent
cd ../task-fix-bug
claude --dangerously-skip-permissions "修复登录页面的 Bug"

# 3. 查看 diff
git diff main..feature/fix-bug

# 4. 合并
cd ../main-project
git merge feature/fix-bug

# 5. 清理
git worktree remove ../task-fix-bug
git branch -d feature/fix-bug
```

**这可以作为 opencode 的一个"斜杠命令"快速实现**：

```
/parallel-task create "修复登录 Bug" --agent claude
/parallel-task list
/parallel-task start task-123
/parallel-task diff task-123
/parallel-task merge task-123
```

---

## 最终建议

1. **短期**：先实现斜杠命令版本 (`/parallel-task`)，验证工作流
2. **中期**：添加侧边栏任务列表，实现基本 UI
3. **长期**：实现完整 Kanban 看板，支持拖拽和可视化管理

Git Worktree 多任务并行是一个非常实用的功能，可以显著提升 AI 编码助手的生产力，值得投入实现。
