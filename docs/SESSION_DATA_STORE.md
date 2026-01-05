# Session Data Storage Strategy

本文档讨论 Tauri 应用中用户聊天会话数据的持久化存储方案。

## 数据结构

```typescript
interface ChatSession {
  id: string;
  title: string;
  messages: Message[];
  createdAt: number;
  updatedAt: number;
}

interface ToolChatHistory {
  sessions: ChatSession[];
  activeSessionId: string | null;
}

// 完整存储结构
type StoredData = Record<ToolId, ToolChatHistory>;
```

## 存储位置选项

### 1. Tauri App Data Directory (推荐)

使用 Tauri 的 `app_data_dir` 或 `app_local_data_dir` API。

**路径示例：**
| 平台 | 路径 |
|------|------|
| macOS | `~/Library/Application Support/com.opencode.app/` |
| Windows | `C:\Users\<User>\AppData\Roaming\com.opencode.app\` |
| Linux | `~/.local/share/com.opencode.app/` |

**优点：**
- 跨平台标准位置
- 用户数据与应用分离
- 卸载时可选择保留数据
- Tauri 原生支持

**缺点：**
- 需要 Rust 后端配合

### 2. tauri-plugin-store (推荐)

官方 key-value 存储插件，基于 JSON 文件。

```toml
# Cargo.toml
[dependencies]
tauri-plugin-store = "2"
```

```typescript
// 前端使用
import { Store } from '@tauri-apps/plugin-store';

const store = await Store.load('sessions.json');
await store.set('claude', chatHistory);
await store.save();
```

**优点：**
- 官方维护，API 简洁
- 自动处理路径和序列化
- 支持自动保存
- 前端直接调用

**缺点：**
- 大数据量性能一般
- 不支持复杂查询

### 3. SQLite Database

使用 `tauri-plugin-sql` 插件。

```toml
# Cargo.toml
[dependencies]
tauri-plugin-sql = { version = "2", features = ["sqlite"] }
```

**表结构设计：**
```sql
CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  tool_id TEXT NOT NULL,
  title TEXT,
  created_at INTEGER,
  updated_at INTEGER
);

CREATE TABLE messages (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  text TEXT,
  sender TEXT,
  timestamp INTEGER,
  is_error INTEGER DEFAULT 0,
  is_terminal_output INTEGER DEFAULT 0,
  FOREIGN KEY (session_id) REFERENCES sessions(id)
);

CREATE INDEX idx_messages_session ON messages(session_id);
CREATE INDEX idx_sessions_tool ON sessions(tool_id);
```

**优点：**
- 高性能，支持大数据量
- 支持复杂查询和索引
- 数据完整性保证
- 增量更新效率高

**缺点：**
- 实现复杂度较高
- 需要编写 SQL 语句

### 4. IndexedDB (浏览器存储)

使用 WebView 内置的 IndexedDB。

```typescript
const db = await openDB('opencode-sessions', 1, {
  upgrade(db) {
    db.createObjectStore('sessions', { keyPath: 'id' });
  }
});
```

**优点：**
- 纯前端实现
- 无需 Rust 代码
- 支持大数据量

**缺点：**
- 数据存储在 WebView 缓存中
- 清除浏览器数据会丢失
- 不同 WebView 引擎行为可能不同

### 5. JSON 文件 (Rust 实现)

在 Rust 后端直接读写 JSON 文件。

```rust
// src-tauri/src/session_store.rs
use std::fs;
use std::path::PathBuf;
use tauri::Manager;

#[tauri::command]
pub fn save_sessions(app: tauri::AppHandle, data: serde_json::Value) -> Result<(), String> {
    let path = get_sessions_path(&app)?;
    let json = serde_json::to_string_pretty(&data).map_err(|e| e.to_string())?;
    fs::write(path, json).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn load_sessions(app: tauri::AppHandle) -> Result<serde_json::Value, String> {
    let path = get_sessions_path(&app)?;
    if !path.exists() {
        return Ok(serde_json::json!({}));
    }
    let content = fs::read_to_string(path).map_err(|e| e.to_string())?;
    serde_json::from_str(&content).map_err(|e| e.to_string())
}

fn get_sessions_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(&data_dir).map_err(|e| e.to_string())?;
    Ok(data_dir.join("sessions.json"))
}
```

**优点：**
- 完全控制存储逻辑
- 可自定义压缩、加密
- 无额外依赖

**缺点：**
- 需要手动实现
- 大文件读写性能问题

## 推荐方案

### 小型应用 / 快速实现：tauri-plugin-store

```
sessions.json
├── claude: { sessions: [...], activeSessionId: "..." }
├── gemini: { sessions: [...], activeSessionId: "..." }
├── codex: { sessions: [...], activeSessionId: "..." }
└── kiro: { sessions: [...], activeSessionId: "..." }
```

### 大型应用 / 高性能需求：SQLite

适用于：
- 会话数量多 (>100)
- 需要搜索历史消息
- 需要统计分析功能

## 实现建议

### 1. 自动保存策略

```typescript
// 防抖保存，避免频繁写入
const debouncedSave = debounce(async (data) => {
  await store.set('sessions', data);
  await store.save();
}, 1000);

// 每次状态变化时调用
useEffect(() => {
  debouncedSave(toolHistory);
}, [toolHistory]);
```

### 2. 启动时加载

```typescript
// App.tsx
useEffect(() => {
  const loadSavedSessions = async () => {
    const store = await Store.load('sessions.json');
    const saved = await store.get<StoredData>('sessions');
    if (saved) {
      setToolHistory(saved);
    }
  };
  loadSavedSessions();
}, []);
```

### 3. 数据迁移

考虑版本升级时的数据迁移：

```typescript
interface StoredDataV1 {
  version: 1;
  data: Record<ToolId, ToolChatHistory>;
}

// 迁移函数
function migrateData(stored: any): StoredDataV1 {
  if (!stored.version) {
    // 从旧格式迁移
    return { version: 1, data: stored };
  }
  return stored;
}
```

### 4. 数据大小控制

```typescript
const MAX_SESSIONS_PER_TOOL = 50;
const MAX_MESSAGES_PER_SESSION = 200;

function pruneOldSessions(history: ToolChatHistory): ToolChatHistory {
  const sorted = [...history.sessions].sort((a, b) => b.updatedAt - a.updatedAt);
  return {
    ...history,
    sessions: sorted.slice(0, MAX_SESSIONS_PER_TOOL)
  };
}
```

## 文件组织

```
~/.local/share/com.opencode.app/    # Linux
~/Library/Application Support/com.opencode.app/    # macOS
C:\Users\<User>\AppData\Roaming\com.opencode.app\  # Windows
│
├── sessions.json          # 会话数据 (tauri-plugin-store)
├── settings.json          # 用户设置
├── logs/                  # 日志文件
│   └── app.log
└── cache/                 # 缓存数据
    └── ...
```

## 安全考虑

1. **敏感信息**：不要存储 API 密钥或敏感凭证在会话数据中
2. **数据加密**：如需加密，可使用 `tauri-plugin-stronghold`
3. **备份提示**：提供导出/导入功能供用户备份

## 总结

| 方案 | 复杂度 | 性能 | 推荐场景 |
|------|--------|------|----------|
| tauri-plugin-store | 低 | 中 | 快速实现，中小数据量 |
| SQLite | 高 | 高 | 大数据量，复杂查询 |
| JSON 文件 | 中 | 中 | 完全自定义需求 |
| IndexedDB | 低 | 中 | 纯前端方案 |

**本项目推荐：tauri-plugin-store**

理由：
1. 会话数据结构简单，key-value 足够
2. 官方插件，维护有保障
3. 实现快速，API 友好
4. 可后续迁移到 SQLite
