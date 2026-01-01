use tauri::{Manager, Emitter};
use std::path::PathBuf;
use std::fs;
use tokio::process::Command;
use tokio::io::{AsyncBufReadExt, BufReader};
use std::process::Stdio;
use std::sync::Arc;
use std::collections::HashMap;
use portable_pty::{CommandBuilder, PtySize, native_pty_system};
use tokio::sync::Mutex; // 使用 tokio 的 async Mutex

// 全局状态：PID 到终端 ID 的映射 (这个用 std::sync::Mutex 因为只在 kill_process 中使用)
type TerminalMap = Arc<std::sync::Mutex<HashMap<u32, String>>>;

// PTY 会话存储（存储writer用于输入）- 使用 tokio::sync::Mutex 支持异步
type PtyWriter = Box<dyn std::io::Write + Send>;
type PtyWriterMap = Arc<Mutex<HashMap<String, Arc<Mutex<PtyWriter>>>>>;

// 创建全局状态
fn create_terminal_map() -> TerminalMap {
    Arc::new(std::sync::Mutex::new(HashMap::new()))
}

fn create_pty_writer_map() -> PtyWriterMap {
    Arc::new(Mutex::new(HashMap::new()))
}

#[derive(serde::Serialize, serde::Deserialize)]
struct ExtractResult {
    success: bool,
    path: String,
    message: String,
}

/// 获取 ~/.opencode 目录
fn get_opencode_dir() -> Result<PathBuf, String> {
    let home = std::env::var("HOME")
        .or_else(|_| std::env::var("USERPROFILE"))
        .map_err(|e| format!("Failed to get home directory: {}", e))?;

    Ok(PathBuf::from(home).join(".opencode"))
}

/// 解压指定的 CLI 工具（现在只是返回 ~/.opencode/cli 中的路径）
#[tauri::command]
fn extract_cli(_app_handle: tauri::AppHandle, cli_name: String) -> Result<ExtractResult, String> {
    let opencode_dir = get_opencode_dir()?;
    let cli_dir = opencode_dir.join("cli");

    if !cli_dir.exists() {
        return Err(format!("CLI directory not found: {:?}. Please ensure ~/.opencode/cli exists.", cli_dir));
    }

    // 对于 claude-code，返回 cli 目录路径
    if cli_name == "claude-code" {
        return Ok(ExtractResult {
            success: true,
            path: cli_dir.to_string_lossy().to_string(),
            message: format!("{} is available", cli_name),
        });
    }

    // 其他 CLI 工具（gemini-cli, codex-cli, kiro-cli）的处理
    let specific_cli_dir = cli_dir.join(&cli_name);
    if !specific_cli_dir.exists() {
        return Err(format!("CLI not found: {:?}", specific_cli_dir));
    }

    Ok(ExtractResult {
        success: true,
        path: specific_cli_dir.to_string_lossy().to_string(),
        message: format!("{} is available", cli_name),
    })
}

/// 获取 Node.js 二进制路径（从 ~/.opencode/node）
#[tauri::command]
fn get_node_path(_app_handle: tauri::AppHandle) -> Result<String, String> {
    let opencode_dir = get_opencode_dir()?;

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

    let node_path = opencode_dir.join("node").join(platform).join("bin").join("node");

    if !node_path.exists() {
        return Err(format!("Node binary not found: {:?}. Please ensure ~/.opencode/node/{}/bin/node exists.", node_path, platform));
    }

    Ok(node_path.to_string_lossy().to_string())
}

/// 获取 Kiro CLI 路径（从 ~/.local/bin/kiro-cli）
#[tauri::command]
fn get_kiro_path() -> Result<String, String> {
    let home = std::env::var("HOME")
        .or_else(|_| std::env::var("USERPROFILE"))
        .map_err(|e| format!("Failed to get home directory: {}", e))?;

    let kiro_path = PathBuf::from(home).join(".local").join("bin").join("kiro-cli");

    if !kiro_path.exists() {
        return Err(format!("Kiro CLI not found at {:?}. Please install kiro-cli first.", kiro_path));
    }

    Ok(kiro_path.to_string_lossy().to_string())
}

/// 获取解压后的 CLI 路径（从 ~/.opencode/cli）
#[tauri::command]
fn get_cli_path(_app_handle: tauri::AppHandle, cli_name: String) -> Result<String, String> {
    let opencode_dir = get_opencode_dir()?;
    let cli_dir = opencode_dir.join("cli");

    if cli_name == "claude-code" {
        // Claude Code 直接在 cli 目录下
        if !cli_dir.exists() {
            return Err(format!("CLI directory not found: {:?}", cli_dir));
        }
        return Ok(cli_dir.to_string_lossy().to_string());
    }

    // 其他 CLI 有各自的子目录
    let specific_cli_dir = cli_dir.join(&cli_name);
    if !specific_cli_dir.exists() {
        return Err(format!("CLI not found: {}", cli_name));
    }

    Ok(specific_cli_dir.to_string_lossy().to_string())
}

#[derive(serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct FileItem {
    name: String,
    path: String,
    is_directory: bool,
    size: Option<u64>,
    modified_time: Option<u64>,
}

/// 读取目录中的文件列表
#[tauri::command]
fn read_directory(directory: String) -> Result<Vec<FileItem>, String> {
    let path = PathBuf::from(&directory);

    if !path.exists() {
        return Err(format!("Directory does not exist: {}", directory));
    }

    if !path.is_dir() {
        return Err(format!("Path is not a directory: {}", directory));
    }

    let entries = fs::read_dir(&path)
        .map_err(|e| format!("Failed to read directory: {}", e))?;

    let mut files = Vec::new();

    for entry in entries {
        let entry = entry.map_err(|e| format!("Failed to read entry: {}", e))?;
        let metadata = entry.metadata().map_err(|e| format!("Failed to read metadata: {}", e))?;
        let file_name = entry.file_name().to_string_lossy().to_string();

        // Skip hidden files (starting with .)
        if file_name.starts_with('.') {
            continue;
        }

        let modified_time = metadata.modified()
            .ok()
            .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|d| d.as_secs());

        files.push(FileItem {
            name: file_name,
            path: entry.path().to_string_lossy().to_string(),
            is_directory: metadata.is_dir(),
            size: if metadata.is_file() { Some(metadata.len()) } else { None },
            modified_time,
        });
    }

    // Sort: directories first, then files, both alphabetically
    files.sort_by(|a, b| {
        match (a.is_directory, b.is_directory) {
            (true, false) => std::cmp::Ordering::Less,
            (false, true) => std::cmp::Ordering::Greater,
            _ => a.name.to_lowercase().cmp(&b.name.to_lowercase()),
        }
    });

    Ok(files)
}

/// 读取文件内容
#[tauri::command]
fn read_file_content(file_path: String) -> Result<String, String> {
    let path = PathBuf::from(&file_path);

    if !path.exists() {
        return Err(format!("File does not exist: {}", file_path));
    }

    if !path.is_file() {
        return Err(format!("Path is not a file: {}", file_path));
    }

    fs::read_to_string(&path)
        .map_err(|e| format!("Failed to read file: {}", e))
}

/// 读取文件二进制内容（用于图片等）
#[tauri::command]
fn read_file_bytes(file_path: String) -> Result<Vec<u8>, String> {
    let path = PathBuf::from(&file_path);

    if !path.exists() {
        return Err(format!("File does not exist: {}", file_path));
    }

    if !path.is_file() {
        return Err(format!("Path is not a file: {}", file_path));
    }

    fs::read(&path)
        .map_err(|e| format!("Failed to read file: {}", e))
}

/// 创建新文件
#[tauri::command]
fn create_file(file_path: String, content: Option<String>) -> Result<(), String> {
    let path = PathBuf::from(&file_path);

    if path.exists() {
        return Err(format!("File already exists: {}", file_path));
    }

    // Ensure parent directory exists
    if let Some(parent) = path.parent() {
        if !parent.exists() {
            fs::create_dir_all(parent)
                .map_err(|e| format!("Failed to create parent directory: {}", e))?;
        }
    }

    let content = content.unwrap_or_default();
    fs::write(&path, content)
        .map_err(|e| format!("Failed to create file: {}", e))
}

/// 创建新文件夹
#[tauri::command]
fn create_directory(dir_path: String) -> Result<(), String> {
    let path = PathBuf::from(&dir_path);

    if path.exists() {
        return Err(format!("Directory already exists: {}", dir_path));
    }

    fs::create_dir_all(&path)
        .map_err(|e| format!("Failed to create directory: {}", e))
}

/// 删除文件或文件夹
#[tauri::command]
fn delete_path(target_path: String) -> Result<(), String> {
    let path = PathBuf::from(&target_path);

    if !path.exists() {
        return Err(format!("Path does not exist: {}", target_path));
    }

    if path.is_dir() {
        fs::remove_dir_all(&path)
            .map_err(|e| format!("Failed to delete directory: {}", e))
    } else {
        fs::remove_file(&path)
            .map_err(|e| format!("Failed to delete file: {}", e))
    }
}

/// 重命名文件或文件夹
#[tauri::command]
fn rename_path(old_path: String, new_path: String) -> Result<(), String> {
    let old = PathBuf::from(&old_path);
    let new = PathBuf::from(&new_path);

    if !old.exists() {
        return Err(format!("Path does not exist: {}", old_path));
    }

    if new.exists() {
        return Err(format!("Target path already exists: {}", new_path));
    }

    fs::rename(&old, &new)
        .map_err(|e| format!("Failed to rename: {}", e))
}

/// 保存文件内容
#[tauri::command]
fn save_file(file_path: String, content: String) -> Result<(), String> {
    let path = PathBuf::from(&file_path);

    fs::write(&path, content)
        .map_err(|e| format!("Failed to save file: {}", e))
}

#[derive(serde::Serialize, serde::Deserialize)]
struct SkillInfo {
    name: String,
    path: String,
    token_count: Option<u64>,
}

/// 读取 ~/.claude/skills 目录下的 skills
#[tauri::command]
fn read_claude_skills() -> Result<Vec<SkillInfo>, String> {
    let home = std::env::var("HOME")
        .or_else(|_| std::env::var("USERPROFILE"))
        .map_err(|e| format!("Failed to get home directory: {}", e))?;

    let skills_dir = PathBuf::from(home).join(".claude").join("skills");

    if !skills_dir.exists() {
        return Ok(Vec::new()); // 如果目录不存在，返回空列表
    }

    if !skills_dir.is_dir() {
        return Err(format!("Skills path is not a directory: {:?}", skills_dir));
    }

    let entries = fs::read_dir(&skills_dir)
        .map_err(|e| format!("Failed to read skills directory: {}", e))?;

    let mut skills = Vec::new();

    for entry in entries {
        let entry = entry.map_err(|e| format!("Failed to read entry: {}", e))?;
        let metadata = entry.metadata().map_err(|e| format!("Failed to read metadata: {}", e))?;

        // 只处理目录
        if !metadata.is_dir() {
            continue;
        }

        let skill_name = entry.file_name().to_string_lossy().to_string();

        // 跳过隐藏目录
        if skill_name.starts_with('.') {
            continue;
        }

        // 尝试估算 token 数量（通过读取目录下的文件大小）
        let skill_path = entry.path();
        let token_count = estimate_skill_tokens(&skill_path);

        skills.push(SkillInfo {
            name: skill_name,
            path: skill_path.to_string_lossy().to_string(),
            token_count,
        });
    }

    // 按名称排序
    skills.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));

    Ok(skills)
}

/// 估算 skill 的 token 数量（粗略估计：字符数 / 4）
fn estimate_skill_tokens(skill_path: &PathBuf) -> Option<u64> {
    let mut total_chars = 0u64;

    if let Ok(entries) = fs::read_dir(skill_path) {
        for entry in entries.flatten() {
            if let Ok(metadata) = entry.metadata() {
                if metadata.is_file() {
                    if let Ok(content) = fs::read_to_string(entry.path()) {
                        total_chars += content.len() as u64;
                    }
                }
            }
        }
    }

    if total_chars > 0 {
        // 粗略估计：每个 token 约 4 个字符
        Some(total_chars / 4)
    } else {
        None
    }
}

#[derive(serde::Serialize, serde::Deserialize)]
struct McpServerInfo {
    name: String,
    transport: String,  // "stdio" or "http"
    disabled: Option<bool>,
    // stdio transport
    command: Option<String>,
    args: Option<Vec<String>>,
    env: Option<HashMap<String, String>>,
    // http transport
    url: Option<String>,
    headers: Option<HashMap<String, String>>,
}

/// 读取 ~/.claude.json 中的 MCP servers 配置
#[tauri::command]
fn read_mcp_servers() -> Result<Vec<McpServerInfo>, String> {
    let home = std::env::var("HOME")
        .or_else(|_| std::env::var("USERPROFILE"))
        .map_err(|e| format!("Failed to get home directory: {}", e))?;

    let claude_config_path = PathBuf::from(home).join(".claude.json");

    if !claude_config_path.exists() {
        return Ok(Vec::new()); // 如果配置文件不存在，返回空列表
    }

    let content = fs::read_to_string(&claude_config_path)
        .map_err(|e| format!("Failed to read ~/.claude.json: {}", e))?;

    let config: serde_json::Value = serde_json::from_str(&content)
        .map_err(|e| format!("Failed to parse ~/.claude.json: {}", e))?;

    let mut servers = Vec::new();

    if let Some(mcp_servers) = config.get("mcpServers").and_then(|v| v.as_object()) {
        for (name, server_config) in mcp_servers {
            // Detect transport type: if has "url" field, it's http; otherwise stdio
            let url = server_config.get("url").and_then(|v| v.as_str()).map(|s| s.to_string());
            let transport = if url.is_some() {
                "http".to_string()
            } else {
                "stdio".to_string()
            };

            let command = server_config.get("command").and_then(|v| v.as_str()).map(|s| s.to_string());
            let args = server_config.get("args").and_then(|v| v.as_array()).map(|arr| {
                arr.iter().filter_map(|v| v.as_str().map(|s| s.to_string())).collect()
            });
            let env = server_config.get("env").and_then(|v| v.as_object()).map(|obj| {
                obj.iter()
                    .filter_map(|(k, v)| v.as_str().map(|s| (k.clone(), s.to_string())))
                    .collect()
            });

            let disabled = server_config.get("disabled").and_then(|v| v.as_bool());
            let headers = server_config.get("headers").and_then(|v| v.as_object()).map(|obj| {
                obj.iter()
                    .filter_map(|(k, v)| v.as_str().map(|s| (k.clone(), s.to_string())))
                    .collect()
            });

            servers.push(McpServerInfo {
                name: name.clone(),
                transport,
                disabled,
                command,
                args,
                env,
                url,
                headers,
            });
        }
    }

    // 按名称排序
    servers.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));

    Ok(servers)
}

/// 添加 MCP server 到 ~/.claude.json
#[tauri::command]
fn add_mcp_server(
    name: String,
    transport: String,
    command: Option<String>,
    args: Option<Vec<String>>,
    env: Option<HashMap<String, String>>,
    url: Option<String>,
    token: Option<String>,
) -> Result<(), String> {
    let home = std::env::var("HOME")
        .or_else(|_| std::env::var("USERPROFILE"))
        .map_err(|e| format!("Failed to get home directory: {}", e))?;

    let claude_config_path = PathBuf::from(home).join(".claude.json");

    // Read existing config or create new
    let mut config: serde_json::Value = if claude_config_path.exists() {
        let content = fs::read_to_string(&claude_config_path)
            .map_err(|e| format!("Failed to read ~/.claude.json: {}", e))?;
        serde_json::from_str(&content)
            .map_err(|e| format!("Failed to parse ~/.claude.json: {}", e))?
    } else {
        serde_json::json!({})
    };

    // Ensure mcpServers object exists
    if config.get("mcpServers").is_none() {
        config["mcpServers"] = serde_json::json!({});
    }

    // Create server config based on transport type
    let server_config = if transport == "http" {
        // HTTP transport - requires url
        let url_value = url.ok_or("URL is required for HTTP transport")?;
        let mut cfg = serde_json::json!({
            "type": "http",
            "url": url_value
        });

        // Add Authorization header if token is provided
        if let Some(token_value) = token {
            if !token_value.is_empty() {
                cfg["headers"] = serde_json::json!({
                    "Authorization": format!("Bearer {}", token_value)
                });
            }
        }

        cfg
    } else {
        // stdio transport - requires command
        let cmd = command.ok_or("Command is required for stdio transport")?;
        let mut cfg = serde_json::json!({
            "type": "stdio",
            "command": cmd
        });

        if let Some(args_vec) = args {
            cfg["args"] = serde_json::json!(args_vec);
        }

        if let Some(env_map) = env {
            cfg["env"] = serde_json::json!(env_map);
        }

        cfg
    };

    // Add server to config
    config["mcpServers"][&name] = server_config;

    // Write back to file
    let content = serde_json::to_string_pretty(&config)
        .map_err(|e| format!("Failed to serialize config: {}", e))?;

    fs::write(&claude_config_path, content)
        .map_err(|e| format!("Failed to write ~/.claude.json: {}", e))?;

    Ok(())
}

/// 删除 MCP server 从 ~/.claude.json
#[tauri::command]
fn remove_mcp_server(name: String) -> Result<(), String> {
    let home = std::env::var("HOME")
        .or_else(|_| std::env::var("USERPROFILE"))
        .map_err(|e| format!("Failed to get home directory: {}", e))?;

    let claude_config_path = PathBuf::from(home).join(".claude.json");

    if !claude_config_path.exists() {
        return Err("Config file does not exist".to_string());
    }

    let content = fs::read_to_string(&claude_config_path)
        .map_err(|e| format!("Failed to read ~/.claude.json: {}", e))?;

    let mut config: serde_json::Value = serde_json::from_str(&content)
        .map_err(|e| format!("Failed to parse ~/.claude.json: {}", e))?;

    // Remove server from mcpServers
    if let Some(mcp_servers) = config.get_mut("mcpServers").and_then(|v| v.as_object_mut()) {
        if mcp_servers.remove(&name).is_none() {
            return Err(format!("MCP server '{}' not found", name));
        }
    } else {
        return Err("No MCP servers configured".to_string());
    }

    // Write back to file
    let content = serde_json::to_string_pretty(&config)
        .map_err(|e| format!("Failed to serialize config: {}", e))?;

    fs::write(&claude_config_path, content)
        .map_err(|e| format!("Failed to write ~/.claude.json: {}", e))?;

    Ok(())
}

/// 切换 MCP server 启用/禁用状态
#[tauri::command]
fn toggle_mcp_server(name: String, disabled: bool) -> Result<(), String> {
    let home = std::env::var("HOME")
        .or_else(|_| std::env::var("USERPROFILE"))
        .map_err(|e| format!("Failed to get home directory: {}", e))?;

    let claude_config_path = PathBuf::from(home).join(".claude.json");

    if !claude_config_path.exists() {
        return Err("Config file does not exist".to_string());
    }

    let content = fs::read_to_string(&claude_config_path)
        .map_err(|e| format!("Failed to read ~/.claude.json: {}", e))?;

    let mut config: serde_json::Value = serde_json::from_str(&content)
        .map_err(|e| format!("Failed to parse ~/.claude.json: {}", e))?;

    // Toggle server disabled state
    if let Some(mcp_servers) = config.get_mut("mcpServers").and_then(|v| v.as_object_mut()) {
        if let Some(server) = mcp_servers.get_mut(&name) {
            if disabled {
                server["disabled"] = serde_json::json!(true);
            } else {
                // Remove disabled field if enabling (false = not disabled = enabled)
                if let Some(obj) = server.as_object_mut() {
                    obj.remove("disabled");
                }
            }
        } else {
            return Err(format!("MCP server '{}' not found", name));
        }
    } else {
        return Err("No MCP servers configured".to_string());
    }

    // Write back to file
    let content = serde_json::to_string_pretty(&config)
        .map_err(|e| format!("Failed to serialize config: {}", e))?;

    fs::write(&claude_config_path, content)
        .map_err(|e| format!("Failed to write ~/.claude.json: {}", e))?;

    Ok(())
}

#[derive(serde::Serialize, serde::Deserialize)]
struct GitStatusFile {
    status: String,      // e.g., "M", "A", "D", "??"
    path: String,
    staged: bool,
}

#[derive(serde::Serialize, serde::Deserialize)]
struct GitStatus {
    branch: String,
    ahead: u32,
    behind: u32,
    files: Vec<GitStatusFile>,
    is_repo: bool,
}

/// 获取 git status
#[tauri::command]
fn git_status(project_dir: String) -> Result<GitStatus, String> {
    use std::process::Command;

    // Check if it's a git repo
    let git_dir = PathBuf::from(&project_dir).join(".git");
    if !git_dir.exists() {
        return Ok(GitStatus {
            branch: String::new(),
            ahead: 0,
            behind: 0,
            files: Vec::new(),
            is_repo: false,
        });
    }

    // Get branch name
    let branch_output = Command::new("git")
        .args(["branch", "--show-current"])
        .current_dir(&project_dir)
        .output()
        .map_err(|e| format!("Failed to run git branch: {}", e))?;

    let branch = String::from_utf8_lossy(&branch_output.stdout).trim().to_string();

    // Get ahead/behind info
    let status_branch = Command::new("git")
        .args(["status", "-sb"])
        .current_dir(&project_dir)
        .output()
        .map_err(|e| format!("Failed to run git status: {}", e))?;

    let status_line = String::from_utf8_lossy(&status_branch.stdout);
    let first_line = status_line.lines().next().unwrap_or("");

    let mut ahead = 0u32;
    let mut behind = 0u32;

    if let Some(bracket_start) = first_line.find('[') {
        if let Some(bracket_end) = first_line.find(']') {
            let info = &first_line[bracket_start + 1..bracket_end];
            for part in info.split(", ") {
                if part.starts_with("ahead ") {
                    ahead = part[6..].parse().unwrap_or(0);
                } else if part.starts_with("behind ") {
                    behind = part[7..].parse().unwrap_or(0);
                }
            }
        }
    }

    // Get file status
    let status_output = Command::new("git")
        .args(["status", "--porcelain=v1"])
        .current_dir(&project_dir)
        .output()
        .map_err(|e| format!("Failed to run git status: {}", e))?;

    let status_text = String::from_utf8_lossy(&status_output.stdout);
    let mut files = Vec::new();

    for line in status_text.lines() {
        if line.len() < 4 {
            continue;
        }

        let index_status = line.chars().nth(0).unwrap_or(' ');
        let worktree_status = line.chars().nth(1).unwrap_or(' ');
        let file_path = line[3..].to_string();

        // Determine status code (single letter for cleaner display)
        let status = match (index_status, worktree_status) {
            ('?', '?') => "N".to_string(),  // New/Untracked
            ('M', _) | (_, 'M') => "M".to_string(),  // Modified
            ('A', _) => "A".to_string(),  // Added (staged)
            ('D', _) | (_, 'D') => "D".to_string(),  // Deleted
            ('R', _) => "R".to_string(),  // Renamed
            ('C', _) => "C".to_string(),  // Copied
            ('U', _) => "U".to_string(),  // Unmerged (conflict)
            ('!', '!') => "I".to_string(),  // Ignored
            _ => "?".to_string(),  // Unknown
        };

        let staged = index_status != ' ' && index_status != '?';

        files.push(GitStatusFile {
            status,
            path: file_path,
            staged,
        });
    }

    Ok(GitStatus {
        branch,
        ahead,
        behind,
        files,
        is_repo: true,
    })
}

#[derive(serde::Serialize, serde::Deserialize)]
struct GitCommit {
    graph: String,
    short_hash: String,
    refs: String,
    message: String,
}

/// 获取 git log with graph
#[tauri::command]
fn git_log(project_dir: String, limit: Option<u32>) -> Result<Vec<GitCommit>, String> {
    use std::process::Command;

    let limit = limit.unwrap_or(50);

    // Check if it's a git repo
    let git_dir = PathBuf::from(&project_dir).join(".git");
    if !git_dir.exists() {
        return Ok(Vec::new());
    }

    // Get commit log with graph
    // Format: graph + hash + refs + message
    let log_output = Command::new("git")
        .args([
            "log",
            &format!("-{}", limit),
            "--graph",
            "--pretty=format:%h|%D|%s",
            "--abbrev-commit",
        ])
        .current_dir(&project_dir)
        .output()
        .map_err(|e| format!("Failed to run git log: {}", e))?;

    let log_text = String::from_utf8_lossy(&log_output.stdout);
    let mut commits = Vec::new();

    for line in log_text.lines() {
        // Split at first occurrence of commit hash (7 chars after graph symbols)
        // Graph chars: * | / \ space
        let mut graph_end = 0;
        let chars: Vec<char> = line.chars().collect();

        for (i, c) in chars.iter().enumerate() {
            if *c != '*' && *c != '|' && *c != '/' && *c != '\\' && *c != ' ' && *c != '_' {
                graph_end = i;
                break;
            }
        }

        let graph = chars[..graph_end].iter().collect::<String>();
        let rest = chars[graph_end..].iter().collect::<String>();

        // Parse rest: hash|refs|message
        let parts: Vec<&str> = rest.splitn(3, '|').collect();
        if parts.len() >= 3 {
            commits.push(GitCommit {
                graph,
                short_hash: parts[0].to_string(),
                refs: parts[1].to_string(),
                message: parts[2].to_string(),
            });
        } else if parts.len() >= 1 && !parts[0].is_empty() {
            // Fallback for merge lines without full info
            commits.push(GitCommit {
                graph,
                short_hash: parts.get(0).unwrap_or(&"").to_string(),
                refs: parts.get(1).unwrap_or(&"").to_string(),
                message: parts.get(2).unwrap_or(&"").to_string(),
            });
        } else if !graph.is_empty() {
            // Pure graph line (continuation)
            commits.push(GitCommit {
                graph,
                short_hash: String::new(),
                refs: String::new(),
                message: String::new(),
            });
        }
    }

    Ok(commits)
}

/// Get git diff for files (for AI commit message generation)
#[tauri::command]
fn git_diff(project_dir: String, files: Option<Vec<String>>) -> Result<String, String> {
    use std::process::Command;

    let git_dir = PathBuf::from(&project_dir).join(".git");
    if !git_dir.exists() {
        return Err("Not a git repository".to_string());
    }

    // Get diff for specific files or all
    let output = if let Some(ref file_list) = files {
        if file_list.is_empty() {
            // Get all changes
            Command::new("git")
                .args(["diff", "HEAD", "--stat"])
                .current_dir(&project_dir)
                .output()
                .map_err(|e| format!("Failed to get diff: {}", e))?
        } else {
            let mut args = vec!["diff", "HEAD", "--stat", "--"];
            args.extend(file_list.iter().map(|s| s.as_str()));
            Command::new("git")
                .args(&args)
                .current_dir(&project_dir)
                .output()
                .map_err(|e| format!("Failed to get diff: {}", e))?
        }
    } else {
        Command::new("git")
            .args(["diff", "HEAD", "--stat"])
            .current_dir(&project_dir)
            .output()
            .map_err(|e| format!("Failed to get diff: {}", e))?
    };

    // Also get status for untracked files
    let status_output = Command::new("git")
        .args(["status", "--porcelain"])
        .current_dir(&project_dir)
        .output()
        .map_err(|e| format!("Failed to get status: {}", e))?;

    let diff_text = String::from_utf8_lossy(&output.stdout);
    let status_text = String::from_utf8_lossy(&status_output.stdout);

    // Combine diff and status info
    let mut result = String::new();
    if !diff_text.is_empty() {
        result.push_str(&diff_text);
    }

    // Add untracked files info
    let untracked: Vec<&str> = status_text
        .lines()
        .filter(|l| l.starts_with("??"))
        .map(|l| l.trim_start_matches("?? "))
        .collect();

    if !untracked.is_empty() {
        if !result.is_empty() {
            result.push_str("\n");
        }
        result.push_str("New files:\n");
        for f in untracked {
            result.push_str(&format!("  {}\n", f));
        }
    }

    Ok(result)
}

/// Git commit with message (stages selected files or all if empty)
#[tauri::command]
fn git_commit(project_dir: String, message: String, files: Option<Vec<String>>) -> Result<String, String> {
    use std::process::Command;

    if message.trim().is_empty() {
        return Err("Commit message cannot be empty".to_string());
    }

    // Check if it's a git repo
    let git_dir = PathBuf::from(&project_dir).join(".git");
    if !git_dir.exists() {
        return Err("Not a git repository".to_string());
    }

    // Stage files
    let add_output = if let Some(ref file_list) = files {
        if file_list.is_empty() {
            return Err("No files selected".to_string());
        }
        // Stage specific files
        let mut args = vec!["add", "--"];
        args.extend(file_list.iter().map(|s| s.as_str()));
        Command::new("git")
            .args(&args)
            .current_dir(&project_dir)
            .output()
            .map_err(|e| format!("Failed to stage changes: {}", e))?
    } else {
        // Stage all changes
        Command::new("git")
            .args(["add", "-A"])
            .current_dir(&project_dir)
            .output()
            .map_err(|e| format!("Failed to stage changes: {}", e))?
    };

    if !add_output.status.success() {
        let stderr = String::from_utf8_lossy(&add_output.stderr);
        return Err(format!("Failed to stage changes: {}", stderr));
    }

    // Commit
    let commit_output = Command::new("git")
        .args(["commit", "-m", &message])
        .current_dir(&project_dir)
        .output()
        .map_err(|e| format!("Failed to commit: {}", e))?;

    if !commit_output.status.success() {
        let stderr = String::from_utf8_lossy(&commit_output.stderr);
        let stdout = String::from_utf8_lossy(&commit_output.stdout);
        if stdout.contains("nothing to commit") || stderr.contains("nothing to commit") {
            return Err("Nothing to commit".to_string());
        }
        return Err(format!("Failed to commit: {}", stderr));
    }

    let stdout = String::from_utf8_lossy(&commit_output.stdout);
    Ok(stdout.to_string())
}

/// Associate a PID with a terminal ID
#[tauri::command]
fn associate_terminal(
    terminal_map: tauri::State<TerminalMap>,
    pid: u32,
    terminal_id: String
) -> Result<(), String> {
    println!("[associate_terminal] Associating PID {} with terminal {}", pid, terminal_id);

    let mut map = terminal_map.lock().map_err(|e| format!("Failed to lock terminal map: {}", e))?;
    map.insert(pid, terminal_id);

    println!("[associate_terminal] Current mappings: {:?}", *map);
    Ok(())
}

/// Create a new interactive terminal with PTY
#[tauri::command]
async fn create_interactive_terminal(
    app: tauri::AppHandle,
    pty_writer_map: tauri::State<'_, PtyWriterMap>,
    terminal_id: String,
    cwd: Option<String>,
) -> Result<(), String> {
    println!("[create_interactive_terminal] Creating terminal: {}", terminal_id);
    println!("[create_interactive_terminal] Working directory: {:?}", cwd);

    // Get the user's default shell
    let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/bash".to_string());
    println!("[create_interactive_terminal] Using shell: {}", shell);

    // Create PTY system
    let pty_system = native_pty_system();

    // Create a new PTY with size
    let pair = pty_system
        .openpty(PtySize {
            rows: 24,
            cols: 80,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| format!("Failed to create PTY: {}", e))?;

    // Build shell command
    let mut cmd = CommandBuilder::new(&shell);
    cmd.arg("-l"); // Login shell to load user environment

    if let Some(dir) = cwd {
        cmd.cwd(dir);
    }

    // Spawn the shell in the PTY
    let _child = pair.slave.spawn_command(cmd)
        .map_err(|e| format!("Failed to spawn shell: {}", e))?;

    println!("[create_interactive_terminal] Shell spawned with PID: {:?}", _child.process_id());

    // Get the master PTY reader
    let mut reader = pair.master.try_clone_reader()
        .map_err(|e| format!("Failed to clone reader: {}", e))?;

    // Get and store the writer
    let writer = pair.master.take_writer()
        .map_err(|e| format!("Failed to get writer: {}", e))?;

    // Store writer (using tokio async Mutex with .await)
    {
        let mut map = pty_writer_map.lock().await;
        map.insert(terminal_id.clone(), Arc::new(Mutex::new(writer)));
    }

    // Spawn task to read PTY output and emit to frontend
    // Use tokio::task::spawn_blocking for blocking PTY read operations
    let terminal_id_clone = terminal_id.clone();
    tokio::task::spawn_blocking(move || {
        use std::io::Read;
        let mut buffer = [0u8; 8192];
        loop {
            match reader.read(&mut buffer) {
                Ok(0) => {
                    // EOF - shell exited
                    println!("[Terminal {}] Shell exited", terminal_id_clone);
                    let _ = app.emit("terminal-output", serde_json::json!({
                        "terminalId": terminal_id_clone,
                        "output": "\r\n[Process exited]\r\n"
                    }));
                    break;
                }
                Ok(n) => {
                    // Convert bytes to string (PTY output is usually UTF-8)
                    let output = String::from_utf8_lossy(&buffer[..n]).to_string();

                    // Emit to frontend
                    let _ = app.emit("terminal-output", serde_json::json!({
                        "terminalId": terminal_id_clone,
                        "output": output
                    }));
                }
                Err(e) => {
                    println!("[Terminal {}] Read error: {}", terminal_id_clone, e);
                    break;
                }
            }
        }
    });

    println!("[create_interactive_terminal] Terminal {} created successfully", terminal_id);
    Ok(())
}

/// Close an interactive terminal
#[tauri::command]
async fn close_terminal(
    pty_writer_map: tauri::State<'_, PtyWriterMap>,
    terminal_id: String,
) -> Result<(), String> {
    println!("[close_terminal] Closing terminal: {}", terminal_id);

    // Remove writer (using tokio async Mutex with .await)
    {
        let mut map = pty_writer_map.lock().await;
        map.remove(&terminal_id);
    }

    println!("[close_terminal] Terminal {} closed successfully", terminal_id);
    Ok(())
}

/// Send input to an interactive terminal
#[tauri::command]
async fn terminal_input(
    pty_writer_map: tauri::State<'_, PtyWriterMap>,
    terminal_id: String,
    data: String,
) -> Result<(), String> {
    println!("[terminal_input] START - Terminal: {}, Data length: {}, Data: {:?}", terminal_id, data.len(), data);

    // Get writer Arc from the map (using tokio async Mutex with .await)
    let writer_arc = {
        let map = pty_writer_map.lock().await;
        map.get(&terminal_id)
            .ok_or_else(|| {
                eprintln!("[terminal_input] ERROR: Terminal {} not found in map", terminal_id);
                format!("Terminal {} not found", terminal_id)
            })?
            .clone()
    };

    println!("[terminal_input] Got writer arc, spawning blocking write task...");

    // Use spawn_blocking to perform synchronous I/O operations
    // This prevents blocking the tokio runtime
    let data_bytes = data.into_bytes();
    let result = tokio::task::spawn_blocking(move || {
        use std::io::Write;

        // Block to acquire the lock in sync context
        let rt = tokio::runtime::Handle::current();
        let mut writer = rt.block_on(writer_arc.lock());

        println!("[terminal_input] Writer locked, writing {} bytes...", data_bytes.len());

        // Write data to PTY
        if let Err(e) = writer.write_all(&data_bytes) {
            eprintln!("[terminal_input] ERROR: Failed to write to PTY: {}", e);
            return Err(format!("Failed to write to PTY: {}", e));
        }

        println!("[terminal_input] Data written, flushing...");

        if let Err(e) = writer.flush() {
            eprintln!("[terminal_input] ERROR: Failed to flush PTY: {}", e);
            return Err(format!("Failed to flush PTY: {}", e));
        }

        println!("[terminal_input] SUCCESS - Write completed");
        Ok(())
    }).await.map_err(|e| format!("Task join error: {}", e))?;

    result
}

/// Kill a background process by PID
#[tauri::command]
async fn kill_process(
    terminal_map: tauri::State<'_, TerminalMap>,
    pid: u32
) -> Result<(), String> {
    println!("[kill_process] Attempting to kill process with PID: {}", pid);

    // CRITICAL: Never kill PID 0 - it would kill the entire process group including Tauri itself!
    if pid == 0 {
        println!("[kill_process] Skipping PID 0 (would kill process group)");
        return Ok(());
    }

    #[cfg(target_os = "windows")]
    {
        use std::process::Command as StdCommand;
        let output = StdCommand::new("taskkill")
            .args(["/F", "/PID", &pid.to_string()])
            .output()
            .map_err(|e| format!("Failed to execute taskkill: {}", e))?;

        if output.status.success() {
            println!("[kill_process] Successfully killed process {}", pid);
            // Remove from terminal map
            if let Ok(mut map) = terminal_map.lock() {
                map.remove(&pid);
                println!("[kill_process] Removed PID {} from terminal map", pid);
            }
            Ok(())
        } else {
            let error = String::from_utf8_lossy(&output.stderr);
            Err(format!("Failed to kill process: {}", error))
        }
    }

    #[cfg(not(target_os = "windows"))]
    {
        use nix::sys::signal::{kill, Signal};
        use nix::unistd::Pid;

        let nix_pid = Pid::from_raw(pid as i32);
        kill(nix_pid, Signal::SIGTERM)
            .map_err(|e| format!("Failed to kill process: {}", e))?;

        println!("[kill_process] Successfully sent SIGTERM to process {}", pid);

        // Remove from terminal map
        if let Ok(mut map) = terminal_map.lock() {
            map.remove(&pid);
            println!("[kill_process] Removed PID {} from terminal map", pid);
        }

        Ok(())
    }
}

/// Start a background process (dev server, etc.) that persists after Claude exits
#[tauri::command]
async fn start_background_process(
    app: tauri::AppHandle,
    terminal_map: tauri::State<'_, TerminalMap>,
    command: String,
    args: Vec<String>,
    cwd: String,
    terminal_id: Option<String>,
) -> Result<u32, String> {
    println!("[start_background_process] Starting: {} {:?}", command, args);
    println!("[start_background_process] CWD: {}", cwd);
    println!("[start_background_process] Terminal ID: {:?}", terminal_id);

    // Create the command
    let mut cmd = Command::new(&command);
    cmd.args(&args);
    cmd.current_dir(&cwd);
    cmd.stdout(Stdio::piped());
    cmd.stderr(Stdio::piped());

    // Spawn the process
    let mut child = cmd
        .spawn()
        .map_err(|e| format!("Failed to spawn process: {}", e))?;

    let pid = child.id().ok_or("Failed to get process ID")?;
    println!("[start_background_process] Spawned with PID: {}", pid);

    // If terminal_id is provided, immediately store the mapping
    if let Some(ref term_id) = terminal_id {
        if let Ok(mut map) = terminal_map.lock() {
            map.insert(pid, term_id.clone());
            println!("[start_background_process] Stored mapping: PID {} -> Terminal {}", pid, term_id);
        }
    }

    // Get stdout and stderr
    let stdout = child.stdout.take().ok_or("Failed to get stdout")?;
    let stderr = child.stderr.take().ok_or("Failed to get stderr")?;

    // Create readers
    let stdout_reader = BufReader::new(stdout);
    let stderr_reader = BufReader::new(stderr);

    // Clone terminal_map for async tasks
    let terminal_map_stdout = Arc::clone(&terminal_map.inner());
    let terminal_map_stderr = Arc::clone(&terminal_map.inner());

    // Spawn task to read stdout and emit to frontend with terminal ID
    let app_stdout = app.clone();
    let pid_stdout = pid;
    tokio::spawn(async move {
        let mut lines = stdout_reader.lines();
        while let Ok(Some(line)) = lines.next_line().await {
            println!("[Process {}] {}", pid_stdout, line);

            // Get terminal ID from map
            let terminal_id = terminal_map_stdout.lock()
                .ok()
                .and_then(|map| map.get(&pid_stdout).cloned())
                .unwrap_or_else(|| format!("terminal-{}", pid_stdout));

            // Emit to terminal with terminal ID
            #[derive(serde::Serialize, Clone)]
            #[serde(rename_all = "camelCase")]
            struct TerminalOutput {
                terminal_id: String,
                output: String,
            }

            let _ = app_stdout.emit("terminal-output", TerminalOutput {
                terminal_id,
                output: line,
            });
        }
    });

    // Spawn task to read stderr and emit to frontend with terminal ID
    let app_stderr = app.clone();
    let pid_stderr = pid;
    tokio::spawn(async move {
        let mut lines = stderr_reader.lines();
        while let Ok(Some(line)) = lines.next_line().await {
            println!("[Process {} stderr] {}", pid_stderr, line);

            // Get terminal ID from map
            let terminal_id = terminal_map_stderr.lock()
                .ok()
                .and_then(|map| map.get(&pid_stderr).cloned())
                .unwrap_or_else(|| format!("terminal-{}", pid_stderr));

            // Emit to terminal with terminal ID
            #[derive(serde::Serialize, Clone)]
            #[serde(rename_all = "camelCase")]
            struct TerminalOutput {
                terminal_id: String,
                output: String,
            }

            let _ = app_stderr.emit("terminal-output", TerminalOutput {
                terminal_id,
                output: line,
            });
        }
    });

    // Don't wait for the process - let it run in background
    // The process will continue running even after this function returns

    Ok(pid)
}

/// Execute Kiro CLI with streaming output
#[tauri::command]
async fn execute_kiro_streaming(
    app: tauri::AppHandle,
    kiro_path: String,
    args: Vec<String>,
    cwd: String,
) -> Result<(), String> {
    println!("[execute_kiro_streaming] Starting execution");
    println!("[execute_kiro_streaming] Kiro: {}", kiro_path);
    println!("[execute_kiro_streaming] Args: {:?}", args);
    println!("[execute_kiro_streaming] CWD: {}", cwd);

    // Create the command
    let mut cmd = Command::new(&kiro_path);
    cmd.args(&args);
    cmd.current_dir(&cwd);
    cmd.stdout(Stdio::piped());
    cmd.stderr(Stdio::piped());

    // Spawn the process
    let mut child = cmd
        .spawn()
        .map_err(|e| format!("Failed to spawn Kiro: {}", e))?;

    // Get stdout and stderr
    let stdout = child.stdout.take().ok_or("Failed to get stdout")?;
    let stderr = child.stderr.take().ok_or("Failed to get stderr")?;

    let pid = child.id().unwrap_or(0);
    println!("[execute_kiro_streaming] Spawned process with PID: {}", pid);

    // Create readers
    let stdout_reader = BufReader::new(stdout);
    let stderr_reader = BufReader::new(stderr);

    // Spawn task to read stdout
    let app_stdout = app.clone();
    let stdout_task = tokio::spawn(async move {
        let mut lines = stdout_reader.lines();
        while let Ok(Some(line)) = lines.next_line().await {
            println!("[Kiro stdout] {}", line);
            // Emit to frontend
            let _ = app_stdout.emit("kiro-stream", &line);
        }
    });

    // Spawn task to read stderr
    let app_stderr = app.clone();
    let stderr_task = tokio::spawn(async move {
        let mut lines = stderr_reader.lines();
        while let Ok(Some(line)) = lines.next_line().await {
            println!("[Kiro stderr] {}", line);
            // Emit to frontend
            let _ = app_stderr.emit("kiro-error", &line);
        }
    });

    // Wait for both tasks to complete
    let _ = tokio::join!(stdout_task, stderr_task);

    // Wait for the process to complete
    match child.wait().await {
        Ok(status) => {
            println!("[execute_kiro_streaming] Process exited with status: {}", status);
            let _ = app.emit("kiro-complete", status.success());
            Ok(())
        }
        Err(e) => {
            println!("[execute_kiro_streaming] Process wait failed: {}", e);
            let _ = app.emit("kiro-complete", false);
            Err(format!("Failed to wait for Kiro process: {}", e))
        }
    }
}

/// Execute Claude Code CLI with streaming output
#[tauri::command]
async fn execute_claude_streaming(
    app: tauri::AppHandle,
    node_path: String,
    claude_path: String,
    args: Vec<String>,
    cwd: String,
) -> Result<(), String> {
    println!("[execute_claude_streaming] Starting execution");
    println!("[execute_claude_streaming] Node: {}", node_path);
    println!("[execute_claude_streaming] Claude: {}", claude_path);
    println!("[execute_claude_streaming] Args: {:?}", args);
    println!("[execute_claude_streaming] CWD: {}", cwd);

    // Create the command
    let mut cmd = Command::new(&node_path);
    cmd.arg(&claude_path);
    cmd.args(&args);
    cmd.current_dir(&cwd);
    cmd.stdout(Stdio::piped());
    cmd.stderr(Stdio::piped());

    // Spawn the process
    let mut child = cmd
        .spawn()
        .map_err(|e| format!("Failed to spawn Claude: {}", e))?;

    // Get stdout and stderr
    let stdout = child.stdout.take().ok_or("Failed to get stdout")?;
    let stderr = child.stderr.take().ok_or("Failed to get stderr")?;

    let pid = child.id().unwrap_or(0);
    println!("[execute_claude_streaming] Spawned process with PID: {}", pid);

    // Create readers
    let stdout_reader = BufReader::new(stdout);
    let stderr_reader = BufReader::new(stderr);

    // Spawn task to read stdout
    let app_stdout = app.clone();
    let stdout_task = tokio::spawn(async move {
        let mut lines = stdout_reader.lines();
        while let Ok(Some(line)) = lines.next_line().await {
            println!("[Claude stdout] {}", line);
            // Emit to frontend
            let _ = app_stdout.emit("claude-stream", &line);
        }
    });

    // Spawn task to read stderr
    let app_stderr = app.clone();
    let stderr_task = tokio::spawn(async move {
        let mut lines = stderr_reader.lines();
        while let Ok(Some(line)) = lines.next_line().await {
            println!("[Claude stderr] {}", line);
            // Emit to frontend
            let _ = app_stderr.emit("claude-error", &line);
        }
    });

    // Wait for both tasks to complete
    let _ = tokio::join!(stdout_task, stderr_task);

    // Wait for the process to complete
    match child.wait().await {
        Ok(status) => {
            println!("[execute_claude_streaming] Process exited with status: {}", status);
            let _ = app.emit("claude-complete", status.success());
            Ok(())
        }
        Err(e) => {
            println!("[execute_claude_streaming] Process wait failed: {}", e);
            let _ = app.emit("claude-complete", false);
            Err(format!("Failed to wait for Claude process: {}", e))
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Set up panic hook to log panics
    std::panic::set_hook(Box::new(|panic_info| {
        eprintln!("PANIC: {:?}", panic_info);
        if let Some(location) = panic_info.location() {
            eprintln!("Panic occurred in file '{}' at line {}", location.file(), location.line());
        }
        if let Some(s) = panic_info.payload().downcast_ref::<&str>() {
            eprintln!("Panic message: {}", s);
        }
    }));

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(create_terminal_map())
        .manage(create_pty_writer_map())
        .invoke_handler(tauri::generate_handler![
            extract_cli,
            get_node_path,
            get_kiro_path,
            get_cli_path,
            read_directory,
            read_file_content,
            read_file_bytes,
            create_file,
            create_directory,
            delete_path,
            rename_path,
            save_file,
            read_claude_skills,
            read_mcp_servers,
            add_mcp_server,
            remove_mcp_server,
            toggle_mcp_server,
            git_status,
            git_log,
            git_diff,
            git_commit,
            execute_claude_streaming,
            execute_kiro_streaming,
            start_background_process,
            kill_process,
            associate_terminal,
            create_interactive_terminal,
            close_terminal,
            terminal_input
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
