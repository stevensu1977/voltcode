# API Proxy Rust 组件总结

基于 claude-code-proxy Python 项目，已成功实现 Rust 版本的 Anthropic API 代理组件。

## 功能概述

将 Anthropic Messages API 请求转换为 OpenAI 或 Gemini API 格式，支持：

- **模型映射**：自动将 Claude 模型名映射到 OpenAI/Gemini 等效模型
- **请求/响应转换**：在 Anthropic 和 OpenAI 格式之间进行双向转换
- **流式响应**：完整支持 Server-Sent Events (SSE) 流式输出
- **工具调用**：支持 function calling / tool use 的格式转换

## 文件结构

```
src-tauri/src/api_proxy/
├── mod.rs          # 模块入口，公开 API
├── types.rs        # 类型定义（Anthropic/OpenAI 格式）
├── convert.rs      # 格式转换逻辑
├── client.rs       # HTTP 客户端（请求上游 API）
└── server.rs       # Axum HTTP 服务器
```

## 模型映射规则

| Claude 模型 | 默认映射 (OpenAI) | Google 映射 |
|------------|-------------------|-------------|
| haiku      | gpt-4.1-mini      | gemini-2.5-flash |
| sonnet     | gpt-4.1           | gemini-2.5-pro |
| opus       | gpt-4.1           | gemini-2.5-pro |

## 使用方式

### 1. 作为独立 HTTP 服务器

```rust
use open_code_studio_lib::api_proxy::{server, types::ProxyConfig};

#[tokio::main]
async fn main() {
    // 使用环境变量配置
    server::run_server_from_env(8082).await.unwrap();
}
```

环境变量：
- `PREFERRED_PROVIDER`: openai | google | anthropic
- `BIG_MODEL`: 大模型名称（默认 gpt-4.1）
- `SMALL_MODEL`: 小模型名称（默认 gpt-4.1-mini）
- `OPENAI_API_KEY`: OpenAI API 密钥
- `GEMINI_API_KEY`: Gemini API 密钥
- `ANTHROPIC_API_KEY`: Anthropic API 密钥（直通模式）
- `OPENAI_BASE_URL`: 自定义 OpenAI 兼容端点

### 2. 作为 Tauri 命令（集成到 opencode）

已添加以下 Tauri 命令：

```typescript
// 启动代理服务器
await invoke('start_api_proxy', {
  port: 8082,
  preferredProvider: 'openai',
  bigModel: 'gpt-4.1',
  smallModel: 'gpt-4.1-mini'
});

// 停止代理服务器
await invoke('stop_api_proxy');

// 直接发送消息（无需启动服务器）
const response = await invoke('api_proxy_send_message', {
  model: 'claude-3-sonnet',
  messages: [{ role: 'user', content: 'Hello!' }],
  maxTokens: 1024,
  system: 'You are a helpful assistant.',
  preferredProvider: 'openai'
});

// 获取模型映射
const mapped = await invoke('get_mapped_model', {
  model: 'claude-3-haiku',
  preferredProvider: 'openai'
});
// 返回: { original: 'claude-3-haiku', provider: 'openai', model: 'gpt-4.1-mini', full_name: 'openai/gpt-4.1-mini' }
```

### 3. 作为 Rust 库

```rust
use open_code_studio_lib::api_proxy::{ApiClient, MessagesRequest, Message, MessageContent};

let client = ApiClient::from_env();

let request = MessagesRequest {
    model: "claude-3-sonnet".to_string(),
    max_tokens: 1024,
    messages: vec![Message {
        role: "user".to_string(),
        content: MessageContent::Text("Hello!".to_string()),
    }],
    ..Default::default()
};

let response = client.send_message(&request).await?;
```

## API 端点

代理服务器暴露以下端点：

| 端点 | 方法 | 描述 |
|------|------|------|
| `/` | GET | 健康检查 |
| `/v1/messages` | POST | 消息 API（支持流式） |
| `/v1/messages/count_tokens` | POST | Token 计数 |

## 请求格式（Anthropic 兼容）

```json
{
  "model": "claude-3-sonnet-20240229",
  "max_tokens": 1024,
  "system": "You are a helpful assistant.",
  "messages": [
    {
      "role": "user",
      "content": "Hello!"
    }
  ],
  "stream": false,
  "temperature": 0.7,
  "tools": [
    {
      "name": "get_weather",
      "description": "Get weather for a location",
      "input_schema": {
        "type": "object",
        "properties": {
          "location": { "type": "string" }
        },
        "required": ["location"]
      }
    }
  ]
}
```

## 响应格式（Anthropic 兼容）

```json
{
  "id": "msg_01XzYwKA...",
  "type": "message",
  "role": "assistant",
  "model": "claude-3-sonnet-20240229",
  "content": [
    {
      "type": "text",
      "text": "Hello! How can I help you today?"
    }
  ],
  "stop_reason": "end_turn",
  "usage": {
    "input_tokens": 12,
    "output_tokens": 8
  }
}
```

## 流式响应事件

流式响应遵循 Anthropic SSE 格式：

1. `message_start` - 消息开始
2. `content_block_start` - 内容块开始
3. `content_block_delta` - 内容增量（text_delta / input_json_delta）
4. `content_block_stop` - 内容块结束
5. `message_delta` - 消息增量（stop_reason, usage）
6. `message_stop` - 消息结束

## 与 Python 版本对比

| 特性 | Python (claude-code-proxy) | Rust (api_proxy) |
|------|---------------------------|------------------|
| 依赖 | FastAPI, LiteLLM, httpx | Axum, reqwest |
| 性能 | 较慢，GIL 限制 | 高性能，零成本抽象 |
| 部署 | 需要 Python 环境 | 单个二进制 |
| 集成 | 独立服务 | 可嵌入 Tauri 应用 |
| 代码量 | ~1500 行 | ~1200 行 |

## 依赖项（已添加到 Cargo.toml）

```toml
reqwest = { version = "0.12", features = ["json", "stream"] }
axum = { version = "0.7", features = ["macros"] }
futures-util = "0.3"
tokio-stream = "0.1"
uuid = { version = "1", features = ["v4"] }
log = "0.4"
env_logger = "0.11"
```

## 下一步

1. **测试**：添加更完整的单元测试和集成测试
2. **错误处理**：改进错误消息和重试逻辑
3. **缓存**：添加请求/响应缓存
4. **监控**：添加请求计数和延迟指标
5. **前端集成**：在 opencode 前端添加代理配置 UI
