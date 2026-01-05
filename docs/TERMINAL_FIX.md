# Terminal 崩溃问题修复

## 问题描述
在 Terminal 标签页中执行命令（如 `ls`、`pwd` 等）后按 Enter 键，Tauri 应用会崩溃。

## 根本原因
1. `terminal_input` 函数执行同步 I/O 操作（写入 PTY），阻塞 Tauri 主线程
2. 使用 `std::sync::Mutex` 而不是 `tokio::sync::Mutex`，导致异步上下文中的死锁
3. 终端生命周期管理不当，关闭终端时尝试 kill PID 0

## 修复方案（参考 kerminal 项目）

### 1. 使用 `tokio::sync::Mutex` 替代 `std::sync::Mutex`
```rust
// 之前
type PtyWriterMap = Arc<Mutex<HashMap<String, Arc<Mutex<PtyWriter>>>>>;

// 之后
type PtyWriterMap = Arc<tokio::sync::Mutex<HashMap<String, Arc<tokio::sync::Mutex<PtyWriter>>>>>;
```

### 2. 在 `spawn_blocking` 中执行同步 I/O
```rust
#[tauri::command]
async fn terminal_input(...) -> Result<(), String> {
    let writer_arc = { /* 获取 writer */ };

    tokio::task::spawn_blocking(move || {
        let rt = tokio::runtime::Handle::current();
        let mut writer = rt.block_on(async {
            writer_arc.lock().await
        });

        writer.write_all(&data_bytes)?;
        writer.flush()?;
        Ok(())
    }).await??;
}
```

### 3. 添加终端生命周期管理
- 添加 `TerminalChildMap` 存储子进程
- 实现 `close_terminal` 命令来正确清理资源
- 前端调用 `close_terminal` 而不是 `kill_process`

### 修改的文件
- `src-tauri/src/lib.rs`:
  - 添加 `TerminalChildMap` 类型和创建函数
  - 更新 `create_interactive_terminal` 存储 child 进程
  - 添加 `close_terminal` 命令
  - 修复 `terminal_input` 使用 `spawn_blocking`
  - 注册新的状态和命令

- `App.tsx`:
  - 更新 `closeTerminal` 调用 `close_terminal` 命令
  - 移除 PID 跟踪逻辑

## 关键改进

### 异步锁
使用 `tokio::sync::Mutex` 避免在异步上下文中阻塞：
```rust
let writer_arc = {
    let map = pty_writer_map.lock().await;  // 异步锁
    map.get(&terminal_id)?.clone()
};
```

### 阻塞任务隔离
将同步 I/O 操作隔离到 `spawn_blocking` 中：
```rust
tokio::task::spawn_blocking(move || {
    // 同步 I/O 操作
    writer.write_all(&data)?;
    writer.flush()?;
}).await??;
```

### 资源清理
正确管理终端生命周期：
```rust
#[tauri::command]
async fn close_terminal(...) -> Result<(), String> {
    // 移除 writer
    pty_writer_map.lock().await.remove(&terminal_id);

    // Kill 并等待子进程
    if let Some(mut child) = terminal_child_map.lock().await.remove(&terminal_id) {
        child.kill()?;
        child.wait()?;
    }
}
```

## 测试步骤
1. 运行 `pnpm run tauri:dev`
2. 点击 Terminal 标签页
3. 点击 "New" 按钮创建新终端
4. 等待 shell 启动
5. 输入命令（如 `ls`、`pwd`、`echo hello`）
6. 按 Enter 键
7. 验证命令正常执行，应用不崩溃 ✅
8. 关闭终端，验证资源正确清理 ✅

## 其他修复
同时修复了以下问题：
- 移除了 `index.html` 中的 ESM importmap（与 Vite 冲突）
- 正确配置了 Tailwind CSS（使用 PostCSS 插件而非 CDN）
- 创建了 `.env.local.example` 作为 API Key 配置模板
- 创建了 `.augmentignore` 排除 Resources 文件夹

