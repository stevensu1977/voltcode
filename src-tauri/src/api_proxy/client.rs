//! HTTP Client for upstream API requests
//!
//! This module handles making requests to OpenAI, Gemini, and Anthropic APIs.

use super::convert::{convert_anthropic_to_openai, convert_openai_to_anthropic, map_model, generate_message_id};
use super::types::*;
use futures_util::StreamExt;
use reqwest::{Client, header};
use serde::Deserialize;
use serde_json::json;
use tokio::sync::mpsc;

/// API client for making requests to upstream providers
#[derive(Clone)]
pub struct ApiClient {
    client: Client,
    config: ProxyConfig,
}

impl ApiClient {
    /// Create a new API client with the given configuration
    pub fn new(config: ProxyConfig) -> Self {
        let client = Client::builder()
            .timeout(std::time::Duration::from_secs(300))
            .build()
            .expect("Failed to create HTTP client");

        Self { client, config }
    }

    /// Create a new API client from environment variables
    pub fn from_env() -> Self {
        Self::new(ProxyConfig::from_env())
    }

    /// Get the base URL for a provider
    fn get_base_url(&self, provider: &str) -> String {
        match provider {
            "openai" => self
                .config
                .openai_base_url
                .clone()
                .unwrap_or_else(|| "https://api.openai.com/v1".to_string()),
            "gemini" => "https://generativelanguage.googleapis.com/v1beta".to_string(),
            "anthropic" => "https://api.anthropic.com/v1".to_string(),
            _ => "https://api.openai.com/v1".to_string(),
        }
    }

    /// Get the API key for a provider
    fn get_api_key(&self, provider: &str) -> Option<&str> {
        match provider {
            "openai" => self.config.openai_api_key.as_deref(),
            "gemini" | "google" => self.config.gemini_api_key.as_deref(),
            "anthropic" => self.config.anthropic_api_key.as_deref(),
            _ => None,
        }
    }

    /// Send a non-streaming request
    pub async fn send_message(
        &self,
        request: &MessagesRequest,
    ) -> Result<MessagesResponse, ApiError> {
        let original_model = request.model.clone();
        let mapped = map_model(&request.model, &self.config);

        log::debug!(
            "Model mapping: {} -> {} (provider: {})",
            original_model,
            mapped.full_name,
            mapped.provider
        );

        // If targeting Anthropic directly, use native format
        if mapped.provider == "anthropic" {
            return self.send_anthropic_native(request).await;
        }

        // Convert to OpenAI format
        let openai_request = convert_anthropic_to_openai(request, &mapped);

        // Send request
        let response = self.send_openai_request(&openai_request, &mapped).await?;

        // Convert response back to Anthropic format
        Ok(convert_openai_to_anthropic(&response, &original_model))
    }

    /// Send a streaming request
    pub async fn send_message_streaming(
        &self,
        request: &MessagesRequest,
    ) -> Result<mpsc::Receiver<Result<StreamEvent, ApiError>>, ApiError> {
        let original_model = request.model.clone();
        let mapped = map_model(&request.model, &self.config);

        log::debug!(
            "Streaming model mapping: {} -> {} (provider: {})",
            original_model,
            mapped.full_name,
            mapped.provider
        );

        // Create streaming request
        let mut streaming_request = request.clone();
        streaming_request.stream = true;

        // If targeting Anthropic directly, use native streaming
        if mapped.provider == "anthropic" {
            return self.stream_anthropic_native(&streaming_request).await;
        }

        // Convert to OpenAI format
        let openai_request = convert_anthropic_to_openai(&streaming_request, &mapped);

        // Send streaming request
        self.stream_openai_request(&openai_request, &mapped, &original_model)
            .await
    }

    /// Send native Anthropic request
    async fn send_anthropic_native(
        &self,
        request: &MessagesRequest,
    ) -> Result<MessagesResponse, ApiError> {
        let api_key = self
            .get_api_key("anthropic")
            .ok_or_else(|| ApiError::MissingApiKey("anthropic".to_string()))?;

        let base_url = self.get_base_url("anthropic");
        let url = format!("{}/messages", base_url);

        let response = self
            .client
            .post(&url)
            .header("x-api-key", api_key)
            .header("anthropic-version", "2023-06-01")
            .header(header::CONTENT_TYPE, "application/json")
            .json(request)
            .send()
            .await
            .map_err(|e| ApiError::RequestFailed(e.to_string()))?;

        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();
            return Err(ApiError::UpstreamError {
                status: status.as_u16(),
                message: body,
            });
        }

        response
            .json()
            .await
            .map_err(|e| ApiError::ParseError(e.to_string()))
    }

    /// Send OpenAI-format request
    async fn send_openai_request(
        &self,
        request: &OpenAIRequest,
        mapped: &super::convert::MappedModel,
    ) -> Result<OpenAIResponse, ApiError> {
        let api_key = self
            .get_api_key(&mapped.provider)
            .ok_or_else(|| ApiError::MissingApiKey(mapped.provider.clone()))?;

        let (url, auth_header) = if mapped.provider == "gemini" {
            // Gemini uses URL-based API key
            let base_url = self.get_base_url("gemini");
            let url = format!(
                "{}/models/{}:generateContent?key={}",
                base_url, mapped.model, api_key
            );
            (url, None)
        } else {
            // OpenAI uses Authorization header
            let base_url = self.get_base_url("openai");
            let url = format!("{}/chat/completions", base_url);
            (url, Some(format!("Bearer {}", api_key)))
        };

        let mut req = self
            .client
            .post(&url)
            .header(header::CONTENT_TYPE, "application/json");

        if let Some(auth) = auth_header {
            req = req.header(header::AUTHORIZATION, auth);
        }

        let response = req
            .json(request)
            .send()
            .await
            .map_err(|e| ApiError::RequestFailed(e.to_string()))?;

        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();
            return Err(ApiError::UpstreamError {
                status: status.as_u16(),
                message: body,
            });
        }

        response
            .json()
            .await
            .map_err(|e| ApiError::ParseError(e.to_string()))
    }

    /// Stream native Anthropic response
    async fn stream_anthropic_native(
        &self,
        request: &MessagesRequest,
    ) -> Result<mpsc::Receiver<Result<StreamEvent, ApiError>>, ApiError> {
        let api_key = self
            .get_api_key("anthropic")
            .ok_or_else(|| ApiError::MissingApiKey("anthropic".to_string()))?
            .to_string();

        let base_url = self.get_base_url("anthropic");
        let url = format!("{}/messages", base_url);

        let response = self
            .client
            .post(&url)
            .header("x-api-key", &api_key)
            .header("anthropic-version", "2023-06-01")
            .header(header::CONTENT_TYPE, "application/json")
            .header(header::ACCEPT, "text/event-stream")
            .json(request)
            .send()
            .await
            .map_err(|e| ApiError::RequestFailed(e.to_string()))?;

        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();
            return Err(ApiError::UpstreamError {
                status: status.as_u16(),
                message: body,
            });
        }

        let (tx, rx) = mpsc::channel(100);
        let mut stream = response.bytes_stream();

        tokio::spawn(async move {
            let mut buffer = String::new();

            while let Some(chunk) = stream.next().await {
                match chunk {
                    Ok(bytes) => {
                        buffer.push_str(&String::from_utf8_lossy(&bytes));

                        // Process complete SSE events
                        while let Some(pos) = buffer.find("\n\n") {
                            let event_str = buffer[..pos].to_string();
                            buffer = buffer[pos + 2..].to_string();

                            if let Some(event) = parse_anthropic_sse(&event_str) {
                                if tx.send(Ok(event)).await.is_err() {
                                    return;
                                }
                            }
                        }
                    }
                    Err(e) => {
                        let _ = tx.send(Err(ApiError::StreamError(e.to_string()))).await;
                        return;
                    }
                }
            }
        });

        Ok(rx)
    }

    /// Stream OpenAI-format response and convert to Anthropic format
    async fn stream_openai_request(
        &self,
        request: &OpenAIRequest,
        mapped: &super::convert::MappedModel,
        original_model: &str,
    ) -> Result<mpsc::Receiver<Result<StreamEvent, ApiError>>, ApiError> {
        let api_key = self
            .get_api_key(&mapped.provider)
            .ok_or_else(|| ApiError::MissingApiKey(mapped.provider.clone()))?
            .to_string();

        let (url, auth_header) = if mapped.provider == "gemini" {
            let base_url = self.get_base_url("gemini");
            let url = format!(
                "{}/models/{}:streamGenerateContent?key={}&alt=sse",
                base_url, mapped.model, api_key
            );
            (url, None)
        } else {
            let base_url = self.get_base_url("openai");
            let url = format!("{}/chat/completions", base_url);
            (url, Some(format!("Bearer {}", api_key)))
        };

        let mut req = self
            .client
            .post(&url)
            .header(header::CONTENT_TYPE, "application/json")
            .header(header::ACCEPT, "text/event-stream");

        if let Some(auth) = auth_header {
            req = req.header(header::AUTHORIZATION, auth);
        }

        let response = req
            .json(request)
            .send()
            .await
            .map_err(|e| ApiError::RequestFailed(e.to_string()))?;

        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();
            return Err(ApiError::UpstreamError {
                status: status.as_u16(),
                message: body,
            });
        }

        let (tx, rx) = mpsc::channel(100);
        let mut stream = response.bytes_stream();
        let model = original_model.to_string();

        tokio::spawn(async move {
            let message_id = generate_message_id();
            let mut buffer = String::new();
            let mut sent_message_start = false;
            let mut sent_content_block_start = false;
            let mut current_tool_index: Option<u32> = None;
            let mut content_index = 0u32;

            while let Some(chunk) = stream.next().await {
                match chunk {
                    Ok(bytes) => {
                        buffer.push_str(&String::from_utf8_lossy(&bytes));

                        // Process complete SSE events
                        while let Some(pos) = buffer.find("\n\n") {
                            let event_str = buffer[..pos].to_string();
                            buffer = buffer[pos + 2..].to_string();

                            // Parse SSE event
                            let data_line = event_str
                                .lines()
                                .find(|l| l.starts_with("data: "))
                                .map(|l| &l[6..]);

                            if let Some(data) = data_line {
                                if data == "[DONE]" {
                                    // Send message_stop
                                    let _ = tx.send(Ok(StreamEvent::MessageStop)).await;
                                    return;
                                }

                                // Parse OpenAI chunk
                                if let Ok(chunk) = serde_json::from_str::<OpenAIStreamChunk>(data) {
                                    // Send message_start if not sent
                                    if !sent_message_start {
                                        sent_message_start = true;
                                        let _ = tx
                                            .send(Ok(StreamEvent::MessageStart {
                                                message: StreamMessage {
                                                    id: message_id.clone(),
                                                    message_type: "message".to_string(),
                                                    role: "assistant".to_string(),
                                                    model: model.clone(),
                                                    content: vec![],
                                                    stop_reason: None,
                                                    stop_sequence: None,
                                                    usage: StreamUsage::default(),
                                                },
                                            }))
                                            .await;
                                    }

                                    if let Some(choice) = chunk.choices.first() {
                                        // Handle text content
                                        if let Some(ref content) = choice.delta.content {
                                            if !content.is_empty() {
                                                // Send content_block_start if not sent
                                                if !sent_content_block_start {
                                                    sent_content_block_start = true;
                                                    let _ = tx
                                                        .send(Ok(StreamEvent::ContentBlockStart {
                                                            index: content_index,
                                                            content_block: StreamContentBlock::Text {
                                                                text: String::new(),
                                                            },
                                                        }))
                                                        .await;
                                                }

                                                // Send text delta
                                                let _ = tx
                                                    .send(Ok(StreamEvent::ContentBlockDelta {
                                                        index: content_index,
                                                        delta: StreamDelta::TextDelta {
                                                            text: content.clone(),
                                                        },
                                                    }))
                                                    .await;
                                            }
                                        }

                                        // Handle tool calls
                                        if let Some(ref tool_calls) = choice.delta.tool_calls {
                                            for tool_call in tool_calls {
                                                let tool_idx = tool_call.index.unwrap_or(0);

                                                // New tool call
                                                if current_tool_index != Some(tool_idx) {
                                                    // Close previous text block if needed
                                                    if sent_content_block_start && current_tool_index.is_none() {
                                                        let _ = tx
                                                            .send(Ok(StreamEvent::ContentBlockStop {
                                                                index: content_index,
                                                            }))
                                                            .await;
                                                        content_index += 1;
                                                    }

                                                    current_tool_index = Some(tool_idx);

                                                    // Send tool_use content_block_start
                                                    if let Some(ref function) = tool_call.function {
                                                        let _ = tx
                                                            .send(Ok(StreamEvent::ContentBlockStart {
                                                                index: content_index,
                                                                content_block: StreamContentBlock::ToolUse {
                                                                    id: tool_call.id.clone().unwrap_or_else(|| {
                                                                        format!("toolu_{}", uuid::Uuid::new_v4().simple())
                                                                    }),
                                                                    name: function.name.clone().unwrap_or_default(),
                                                                    input: json!({}),
                                                                },
                                                            }))
                                                            .await;
                                                    }
                                                }

                                                // Send tool call arguments as delta
                                                if let Some(ref function) = tool_call.function {
                                                    if let Some(ref args) = function.arguments {
                                                        if !args.is_empty() {
                                                            let _ = tx
                                                                .send(Ok(StreamEvent::ContentBlockDelta {
                                                                    index: content_index,
                                                                    delta: StreamDelta::InputJsonDelta {
                                                                        partial_json: args.clone(),
                                                                    },
                                                                }))
                                                                .await;
                                                        }
                                                    }
                                                }
                                            }
                                        }

                                        // Handle finish_reason
                                        if let Some(ref finish_reason) = choice.finish_reason {
                                            // Close any open content blocks
                                            let _ = tx
                                                .send(Ok(StreamEvent::ContentBlockStop {
                                                    index: content_index,
                                                }))
                                                .await;

                                            // Map finish reason
                                            let stop_reason = match finish_reason.as_str() {
                                                "stop" => Some(StopReason::EndTurn),
                                                "length" => Some(StopReason::MaxTokens),
                                                "tool_calls" => Some(StopReason::ToolUse),
                                                _ => Some(StopReason::EndTurn),
                                            };

                                            // Send message_delta with stop reason
                                            let _ = tx
                                                .send(Ok(StreamEvent::MessageDelta {
                                                    delta: MessageDeltaData {
                                                        stop_reason,
                                                        stop_sequence: None,
                                                    },
                                                    usage: StreamUsage {
                                                        output_tokens: chunk.usage.as_ref().map(|u| u.completion_tokens).unwrap_or(0),
                                                        ..Default::default()
                                                    },
                                                }))
                                                .await;

                                            // Send message_stop
                                            let _ = tx.send(Ok(StreamEvent::MessageStop)).await;
                                            return;
                                        }
                                    }
                                }
                            }
                        }
                    }
                    Err(e) => {
                        let _ = tx.send(Err(ApiError::StreamError(e.to_string()))).await;
                        return;
                    }
                }
            }

            // Send final message_stop if we haven't yet
            let _ = tx.send(Ok(StreamEvent::MessageStop)).await;
        });

        Ok(rx)
    }
}

/// OpenAI streaming chunk
#[derive(Debug, Clone, Deserialize)]
struct OpenAIStreamChunk {
    id: Option<String>,
    choices: Vec<OpenAIStreamChoice>,
    usage: Option<OpenAIStreamUsage>,
}

#[derive(Debug, Clone, Deserialize)]
struct OpenAIStreamChoice {
    index: u32,
    delta: OpenAIStreamDelta,
    finish_reason: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
struct OpenAIStreamDelta {
    role: Option<String>,
    content: Option<String>,
    tool_calls: Option<Vec<OpenAIStreamToolCall>>,
}

#[derive(Debug, Clone, Deserialize)]
struct OpenAIStreamToolCall {
    index: Option<u32>,
    id: Option<String>,
    #[serde(rename = "type")]
    call_type: Option<String>,
    function: Option<OpenAIStreamFunction>,
}

#[derive(Debug, Clone, Deserialize)]
struct OpenAIStreamFunction {
    name: Option<String>,
    arguments: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
struct OpenAIStreamUsage {
    prompt_tokens: u32,
    completion_tokens: u32,
    total_tokens: u32,
}

/// Parse Anthropic SSE event
fn parse_anthropic_sse(event_str: &str) -> Option<StreamEvent> {
    let mut event_type = None;
    let mut data = None;

    for line in event_str.lines() {
        if line.starts_with("event: ") {
            event_type = Some(&line[7..]);
        } else if line.starts_with("data: ") {
            data = Some(&line[6..]);
        }
    }

    let data = data?;
    if data == "[DONE]" {
        return Some(StreamEvent::MessageStop);
    }

    // Try to parse as a stream event
    serde_json::from_str(data).ok()
}

/// API error types
#[derive(Debug, Clone)]
pub enum ApiError {
    MissingApiKey(String),
    RequestFailed(String),
    ParseError(String),
    StreamError(String),
    UpstreamError { status: u16, message: String },
}

impl std::fmt::Display for ApiError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            ApiError::MissingApiKey(provider) => {
                write!(f, "Missing API key for provider: {}", provider)
            }
            ApiError::RequestFailed(msg) => write!(f, "Request failed: {}", msg),
            ApiError::ParseError(msg) => write!(f, "Parse error: {}", msg),
            ApiError::StreamError(msg) => write!(f, "Stream error: {}", msg),
            ApiError::UpstreamError { status, message } => {
                write!(f, "Upstream error ({}): {}", status, message)
            }
        }
    }
}

impl std::error::Error for ApiError {}

impl serde::Serialize for ApiError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_str(&self.to_string())
    }
}
