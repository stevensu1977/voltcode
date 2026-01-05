//! HTTP Server for API Proxy
//!
//! This module provides a standalone HTTP server that can be run to proxy
//! Anthropic API requests to OpenAI, Gemini, or other providers.

use super::client::{ApiClient, ApiError};
use super::types::*;
use axum::{
    extract::{Json, State},
    http::StatusCode,
    response::{IntoResponse, Response, Sse},
    routing::{get, post},
    Router,
};
use futures_util::stream::StreamExt;
use serde_json::json;
use std::convert::Infallible;
use std::net::SocketAddr;
use std::sync::Arc;
use tokio_stream::wrappers::ReceiverStream;

/// Server state
#[derive(Clone)]
pub struct AppState {
    pub client: ApiClient,
}

/// Create the router with all endpoints
pub fn create_router(state: AppState) -> Router {
    Router::new()
        .route("/", get(root))
        .route("/v1/messages", post(create_message))
        .route("/v1/messages/count_tokens", post(count_tokens))
        .with_state(Arc::new(state))
}

/// Root endpoint
async fn root() -> impl IntoResponse {
    Json(json!({
        "message": "Anthropic API Proxy for OpenAI/Gemini",
        "version": "1.0.0",
        "endpoints": {
            "messages": "POST /v1/messages",
            "count_tokens": "POST /v1/messages/count_tokens"
        }
    }))
}

/// Create message endpoint - handles both streaming and non-streaming
async fn create_message(
    State(state): State<Arc<AppState>>,
    Json(request): Json<MessagesRequest>,
) -> Response {
    let original_model = request.model.clone();
    log::info!(
        "POST /v1/messages - model: {}, stream: {}",
        original_model,
        request.stream
    );

    if request.stream {
        // Handle streaming response
        match state.client.send_message_streaming(&request).await {
            Ok(rx) => {
                let stream = ReceiverStream::new(rx).map(|result| {
                    match result {
                        Ok(event) => {
                            let event_type = match &event {
                                StreamEvent::MessageStart { .. } => "message_start",
                                StreamEvent::ContentBlockStart { .. } => "content_block_start",
                                StreamEvent::ContentBlockDelta { .. } => "content_block_delta",
                                StreamEvent::ContentBlockStop { .. } => "content_block_stop",
                                StreamEvent::MessageDelta { .. } => "message_delta",
                                StreamEvent::MessageStop => "message_stop",
                                StreamEvent::Ping => "ping",
                            };
                            let data = serde_json::to_string(&event).unwrap_or_default();
                            Ok::<_, Infallible>(
                                axum::response::sse::Event::default()
                                    .event(event_type)
                                    .data(data),
                            )
                        }
                        Err(e) => {
                            log::error!("Stream error: {}", e);
                            Ok(axum::response::sse::Event::default()
                                .event("error")
                                .data(e.to_string()))
                        }
                    }
                });

                Sse::new(stream)
                    .keep_alive(axum::response::sse::KeepAlive::default())
                    .into_response()
            }
            Err(e) => {
                log::error!("Failed to start streaming: {}", e);
                error_response(e)
            }
        }
    } else {
        // Handle non-streaming response
        match state.client.send_message(&request).await {
            Ok(response) => {
                log::info!(
                    "Response: model={}, tokens={}/{}",
                    response.model,
                    response.usage.input_tokens,
                    response.usage.output_tokens
                );
                Json(response).into_response()
            }
            Err(e) => {
                log::error!("Request failed: {}", e);
                error_response(e)
            }
        }
    }
}

/// Count tokens endpoint
async fn count_tokens(
    State(_state): State<Arc<AppState>>,
    Json(request): Json<TokenCountRequest>,
) -> impl IntoResponse {
    log::info!("POST /v1/messages/count_tokens - model: {}", request.model);

    // Simple token estimation (4 chars per token on average)
    let mut char_count = 0usize;

    // Count system content
    if let Some(ref system) = request.system {
        match system {
            SystemContent::Text(text) => char_count += text.len(),
            SystemContent::Blocks(blocks) => {
                for block in blocks {
                    char_count += block.text.len();
                }
            }
        }
    }

    // Count messages
    for msg in &request.messages {
        match &msg.content {
            MessageContent::Text(text) => char_count += text.len(),
            MessageContent::Blocks(blocks) => {
                for block in blocks {
                    match block {
                        ContentBlock::Text { text } => char_count += text.len(),
                        ContentBlock::ToolResult { content, .. } => {
                            match content {
                                ToolResultContent::Text(text) => char_count += text.len(),
                                ToolResultContent::Blocks(inner_blocks) => {
                                    for inner in inner_blocks {
                                        if let ContentBlock::Text { text } = inner {
                                            char_count += text.len();
                                        }
                                    }
                                }
                            }
                        }
                        _ => {}
                    }
                }
            }
        }
    }

    // Count tools
    if let Some(ref tools) = request.tools {
        for tool in tools {
            char_count += tool.name.len();
            if let Some(ref desc) = tool.description {
                char_count += desc.len();
            }
            char_count += serde_json::to_string(&tool.input_schema)
                .map(|s| s.len())
                .unwrap_or(0);
        }
    }

    // Estimate tokens (4 chars per token is a rough estimate)
    let estimated_tokens = (char_count / 4) as u32;

    Json(TokenCountResponse {
        input_tokens: estimated_tokens.max(1),
    })
}

/// Convert ApiError to HTTP response
fn error_response(error: ApiError) -> Response {
    let (status, message) = match &error {
        ApiError::MissingApiKey(_) => (StatusCode::UNAUTHORIZED, error.to_string()),
        ApiError::RequestFailed(_) => (StatusCode::BAD_GATEWAY, error.to_string()),
        ApiError::ParseError(_) => (StatusCode::INTERNAL_SERVER_ERROR, error.to_string()),
        ApiError::StreamError(_) => (StatusCode::INTERNAL_SERVER_ERROR, error.to_string()),
        ApiError::UpstreamError { status, message } => {
            (StatusCode::from_u16(*status).unwrap_or(StatusCode::BAD_GATEWAY), message.clone())
        }
    };

    let body = json!({
        "type": "error",
        "error": {
            "type": "api_error",
            "message": message
        }
    });

    (status, Json(body)).into_response()
}

/// Run the server on the specified address
pub async fn run_server(config: ProxyConfig, addr: SocketAddr) -> Result<(), Box<dyn std::error::Error>> {
    let client = ApiClient::new(config);
    let state = AppState { client };
    let app = create_router(state);

    log::info!("Starting API proxy server on {}", addr);
    println!("🚀 Anthropic API Proxy running on http://{}", addr);
    println!("   Endpoints:");
    println!("   - POST /v1/messages");
    println!("   - POST /v1/messages/count_tokens");

    let listener = tokio::net::TcpListener::bind(addr).await?;
    axum::serve(listener, app).await?;

    Ok(())
}

/// Run the server with default configuration from environment
pub async fn run_server_from_env(port: u16) -> Result<(), Box<dyn std::error::Error>> {
    let config = ProxyConfig::from_env();
    let addr = SocketAddr::from(([0, 0, 0, 0], port));
    run_server(config, addr).await
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::http::Request;
    use tower::ServiceExt;

    #[tokio::test]
    async fn test_root_endpoint() {
        let config = ProxyConfig::default();
        let client = ApiClient::new(config);
        let state = AppState { client };
        let app = create_router(state);

        let response = app
            .oneshot(Request::builder().uri("/").body(Body::empty()).unwrap())
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::OK);
    }
}
