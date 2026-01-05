//! API Proxy Module
//!
//! This module provides functionality to proxy Anthropic API requests to
//! other providers like OpenAI and Google Gemini.
//!
//! # Features
//!
//! - **Model Mapping**: Automatically maps Claude model names (haiku, sonnet, opus) to
//!   equivalent models from OpenAI or Gemini based on configuration.
//!
//! - **Request/Response Conversion**: Converts between Anthropic's Messages API format
//!   and OpenAI's Chat Completions API format.
//!
//! - **Streaming Support**: Full support for server-sent events (SSE) streaming,
//!   converting OpenAI stream format to Anthropic stream format.
//!
//! - **Tool Use**: Supports function calling / tool use with proper format conversion.
//!
//! # Usage
//!
//! ## As a standalone HTTP server
//!
//! ```no_run
//! use voltcode_lib::api_proxy::{server, types::ProxyConfig};
//!
//! #[tokio::main]
//! async fn main() {
//!     // Run with default config from environment
//!     server::run_server_from_env(8082).await.unwrap();
//! }
//! ```
//!
//! ## As a library
//!
//! ```no_run
//! use voltcode_lib::api_proxy::{client::ApiClient, types::*};
//!
//! #[tokio::main]
//! async fn main() {
//!     let client = ApiClient::from_env();
//!
//!     let request = MessagesRequest {
//!         model: "claude-3-sonnet".to_string(),
//!         max_tokens: 1024,
//!         messages: vec![Message {
//!             role: "user".to_string(),
//!             content: MessageContent::Text("Hello!".to_string()),
//!         }],
//!         system: None,
//!         stop_sequences: None,
//!         stream: false,
//!         temperature: None,
//!         top_p: None,
//!         top_k: None,
//!         metadata: None,
//!         tools: None,
//!         tool_choice: None,
//!         thinking: None,
//!     };
//!
//!     let response = client.send_message(&request).await.unwrap();
//!     println!("Response: {:?}", response);
//! }
//! ```
//!
//! # Configuration
//!
//! The proxy can be configured via environment variables:
//!
//! - `PREFERRED_PROVIDER`: Default provider to use ("openai", "google", or "anthropic")
//! - `BIG_MODEL`: Model to use for sonnet/opus (default: "gpt-4.1")
//! - `SMALL_MODEL`: Model to use for haiku (default: "gpt-4.1-mini")
//! - `OPENAI_API_KEY`: API key for OpenAI
//! - `GEMINI_API_KEY`: API key for Google Gemini
//! - `ANTHROPIC_API_KEY`: API key for Anthropic (for passthrough)
//! - `OPENAI_BASE_URL`: Custom base URL for OpenAI-compatible APIs

pub mod client;
pub mod convert;
pub mod server;
pub mod types;

// Re-export commonly used types
pub use client::{ApiClient, ApiError};
pub use convert::map_model;
pub use server::{create_router, run_server, run_server_from_env, AppState};
pub use types::{
    ContentBlock, Message, MessageContent, MessagesRequest, MessagesResponse, ProxyConfig,
    ResponseContentBlock, StopReason, StreamEvent, Tool, Usage,
};
