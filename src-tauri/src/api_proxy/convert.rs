//! Request/Response Conversion
//!
//! This module handles conversion between Anthropic API format and OpenAI API format.

use super::types::*;
use serde_json::json;
use uuid::Uuid;

/// Known OpenAI models
const OPENAI_MODELS: &[&str] = &[
    "o3-mini",
    "o1",
    "o1-mini",
    "o1-pro",
    "gpt-4.5-preview",
    "gpt-4o",
    "gpt-4o-audio-preview",
    "chatgpt-4o-latest",
    "gpt-4o-mini",
    "gpt-4o-mini-audio-preview",
    "gpt-4.1",
    "gpt-4.1-mini",
];

/// Known Gemini models
const GEMINI_MODELS: &[&str] = &["gemini-2.5-flash", "gemini-2.5-pro"];

/// Model mapping result
#[derive(Debug, Clone)]
pub struct MappedModel {
    pub provider: String,
    pub model: String,
    pub full_name: String,
}

/// Map Claude model names to target provider models
pub fn map_model(model: &str, config: &ProxyConfig) -> MappedModel {
    // Remove any existing provider prefix
    let clean_model = model
        .strip_prefix("anthropic/")
        .or_else(|| model.strip_prefix("openai/"))
        .or_else(|| model.strip_prefix("gemini/"))
        .unwrap_or(model);

    let lower_model = clean_model.to_lowercase();

    // Check for Anthropic provider preference
    if matches!(config.preferred_provider, Provider::Anthropic) {
        return MappedModel {
            provider: "anthropic".to_string(),
            model: clean_model.to_string(),
            full_name: format!("anthropic/{}", clean_model),
        };
    }

    // Map haiku -> small model
    if lower_model.contains("haiku") {
        let (provider, model) = match config.preferred_provider {
            Provider::Google if GEMINI_MODELS.contains(&config.small_model.as_str()) => {
                ("gemini", &config.small_model)
            }
            _ => ("openai", &config.small_model),
        };
        return MappedModel {
            provider: provider.to_string(),
            model: model.clone(),
            full_name: format!("{}/{}", provider, model),
        };
    }

    // Map sonnet -> big model
    if lower_model.contains("sonnet") {
        let (provider, model) = match config.preferred_provider {
            Provider::Google if GEMINI_MODELS.contains(&config.big_model.as_str()) => {
                ("gemini", &config.big_model)
            }
            _ => ("openai", &config.big_model),
        };
        return MappedModel {
            provider: provider.to_string(),
            model: model.clone(),
            full_name: format!("{}/{}", provider, model),
        };
    }

    // Map opus -> big model (opus is more powerful, map to big)
    if lower_model.contains("opus") {
        let (provider, model) = match config.preferred_provider {
            Provider::Google if GEMINI_MODELS.contains(&config.big_model.as_str()) => {
                ("gemini", &config.big_model)
            }
            _ => ("openai", &config.big_model),
        };
        return MappedModel {
            provider: provider.to_string(),
            model: model.clone(),
            full_name: format!("{}/{}", provider, model),
        };
    }

    // Check if model is a known Gemini model
    if GEMINI_MODELS.contains(&clean_model) {
        return MappedModel {
            provider: "gemini".to_string(),
            model: clean_model.to_string(),
            full_name: format!("gemini/{}", clean_model),
        };
    }

    // Check if model is a known OpenAI model
    if OPENAI_MODELS.contains(&clean_model) {
        return MappedModel {
            provider: "openai".to_string(),
            model: clean_model.to_string(),
            full_name: format!("openai/{}", clean_model),
        };
    }

    // Default: pass through with preferred provider prefix
    let provider = match config.preferred_provider {
        Provider::OpenAI => "openai",
        Provider::Google => "gemini",
        Provider::Anthropic => "anthropic",
    };
    MappedModel {
        provider: provider.to_string(),
        model: clean_model.to_string(),
        full_name: format!("{}/{}", provider, clean_model),
    }
}

/// Extract text from system content
fn extract_system_text(system: &SystemContent) -> String {
    match system {
        SystemContent::Text(text) => text.clone(),
        SystemContent::Blocks(blocks) => blocks
            .iter()
            .map(|b| b.text.as_str())
            .collect::<Vec<_>>()
            .join("\n\n"),
    }
}

/// Parse tool result content to string
fn parse_tool_result_content(content: &ToolResultContent) -> String {
    match content {
        ToolResultContent::Text(text) => text.clone(),
        ToolResultContent::Blocks(blocks) => {
            let mut result = String::new();
            for block in blocks {
                match block {
                    ContentBlock::Text { text } => {
                        result.push_str(text);
                        result.push('\n');
                    }
                    _ => {
                        if let Ok(json) = serde_json::to_string(block) {
                            result.push_str(&json);
                            result.push('\n');
                        }
                    }
                }
            }
            result.trim().to_string()
        }
    }
}

/// Clean JSON schema for Gemini compatibility
/// Removes unsupported fields like additionalProperties and default
fn clean_gemini_schema(schema: &mut serde_json::Value) {
    if let Some(obj) = schema.as_object_mut() {
        obj.remove("additionalProperties");
        obj.remove("default");

        // Remove unsupported format for string types
        if obj.get("type").and_then(|v| v.as_str()) == Some("string") {
            if let Some(format) = obj.get("format").and_then(|v| v.as_str()) {
                let allowed_formats = ["enum", "date-time"];
                if !allowed_formats.contains(&format) {
                    obj.remove("format");
                }
            }
        }

        // Recursively clean nested schemas
        for (_, value) in obj.iter_mut() {
            clean_gemini_schema(value);
        }
    } else if let Some(arr) = schema.as_array_mut() {
        for item in arr.iter_mut() {
            clean_gemini_schema(item);
        }
    }
}

/// Convert Anthropic request to OpenAI format
pub fn convert_anthropic_to_openai(
    request: &MessagesRequest,
    mapped_model: &MappedModel,
) -> OpenAIRequest {
    let mut messages = Vec::new();

    // Add system message if present
    if let Some(ref system) = request.system {
        let system_text = extract_system_text(system);
        messages.push(OpenAIMessage {
            role: "system".to_string(),
            content: OpenAIContent::Text(system_text),
            name: None,
            tool_calls: None,
            tool_call_id: None,
        });
    }

    // Convert conversation messages
    for msg in &request.messages {
        match &msg.content {
            MessageContent::Text(text) => {
                messages.push(OpenAIMessage {
                    role: msg.role.clone(),
                    content: OpenAIContent::Text(text.clone()),
                    name: None,
                    tool_calls: None,
                    tool_call_id: None,
                });
            }
            MessageContent::Blocks(blocks) => {
                // Check if message contains tool results (user message with tool_result)
                let has_tool_results = blocks.iter().any(|b| matches!(b, ContentBlock::ToolResult { .. }));

                if msg.role == "user" && has_tool_results {
                    // For user messages with tool results, convert to text format
                    let mut text_content = String::new();

                    for block in blocks {
                        match block {
                            ContentBlock::Text { text } => {
                                text_content.push_str(text);
                                text_content.push('\n');
                            }
                            ContentBlock::ToolResult { tool_use_id, content, .. } => {
                                let result_text = parse_tool_result_content(content);
                                text_content.push_str(&format!(
                                    "Tool result for {}:\n{}\n",
                                    tool_use_id, result_text
                                ));
                            }
                            _ => {}
                        }
                    }

                    messages.push(OpenAIMessage {
                        role: "user".to_string(),
                        content: OpenAIContent::Text(text_content.trim().to_string()),
                        name: None,
                        tool_calls: None,
                        tool_call_id: None,
                    });
                } else {
                    // Regular message - convert content blocks
                    let mut parts = Vec::new();
                    let mut tool_calls = Vec::new();

                    for block in blocks {
                        match block {
                            ContentBlock::Text { text } => {
                                parts.push(OpenAIContentPart::Text { text: text.clone() });
                            }
                            ContentBlock::Image { source } => {
                                // Convert base64 image to data URL
                                let url = format!(
                                    "data:{};base64,{}",
                                    source.media_type, source.data
                                );
                                parts.push(OpenAIContentPart::ImageUrl {
                                    image_url: OpenAIImageUrl { url },
                                });
                            }
                            ContentBlock::ToolUse { id, name, input } => {
                                tool_calls.push(OpenAIToolCall {
                                    id: id.clone(),
                                    call_type: "function".to_string(),
                                    function: OpenAIFunction {
                                        name: name.clone(),
                                        arguments: serde_json::to_string(input).unwrap_or_default(),
                                    },
                                });
                            }
                            ContentBlock::ToolResult { tool_use_id, content, .. } => {
                                let result_text = parse_tool_result_content(content);
                                parts.push(OpenAIContentPart::Text {
                                    text: format!("Tool result for {}:\n{}", tool_use_id, result_text),
                                });
                            }
                        }
                    }

                    let content = if parts.len() == 1 {
                        if let OpenAIContentPart::Text { text } = &parts[0] {
                            OpenAIContent::Text(text.clone())
                        } else {
                            OpenAIContent::Parts(parts)
                        }
                    } else if parts.is_empty() {
                        OpenAIContent::Text("...".to_string())
                    } else {
                        OpenAIContent::Parts(parts)
                    };

                    let tool_calls_opt = if tool_calls.is_empty() {
                        None
                    } else {
                        Some(tool_calls)
                    };

                    messages.push(OpenAIMessage {
                        role: msg.role.clone(),
                        content,
                        name: None,
                        tool_calls: tool_calls_opt,
                        tool_call_id: None,
                    });
                }
            }
        }
    }

    // Cap max_tokens for OpenAI/Gemini models
    let max_tokens = if mapped_model.provider == "openai" || mapped_model.provider == "gemini" {
        Some(request.max_tokens.min(16384))
    } else {
        Some(request.max_tokens)
    };

    // Convert tools
    let tools = request.tools.as_ref().map(|tools| {
        tools
            .iter()
            .map(|tool| {
                let mut params = tool.input_schema.clone();
                if mapped_model.provider == "gemini" {
                    clean_gemini_schema(&mut params);
                }
                OpenAITool {
                    tool_type: "function".to_string(),
                    function: OpenAIFunctionDef {
                        name: tool.name.clone(),
                        description: tool.description.clone(),
                        parameters: params,
                    },
                }
            })
            .collect()
    });

    // Convert tool_choice
    let tool_choice = request.tool_choice.as_ref().map(|tc| {
        match tc.choice_type.as_str() {
            "auto" => json!("auto"),
            "any" => json!("any"),
            "tool" => {
                if let Some(ref name) = tc.name {
                    json!({
                        "type": "function",
                        "function": { "name": name }
                    })
                } else {
                    json!("auto")
                }
            }
            _ => json!("auto"),
        }
    });

    OpenAIRequest {
        model: mapped_model.full_name.clone(),
        messages,
        max_completion_tokens: max_tokens,
        temperature: request.temperature,
        top_p: request.top_p,
        stop: request.stop_sequences.clone(),
        stream: request.stream,
        tools,
        tool_choice,
    }
}

/// Convert OpenAI response to Anthropic format
pub fn convert_openai_to_anthropic(
    response: &OpenAIResponse,
    original_model: &str,
) -> MessagesResponse {
    let choice = response.choices.first();

    let mut content = Vec::new();

    if let Some(choice) = choice {
        // Add text content if present
        if let Some(ref text) = choice.message.content {
            if !text.is_empty() {
                content.push(ResponseContentBlock::Text { text: text.clone() });
            }
        }

        // Add tool calls if present
        if let Some(ref tool_calls) = choice.message.tool_calls {
            for tool_call in tool_calls {
                let input: serde_json::Value = serde_json::from_str(&tool_call.function.arguments)
                    .unwrap_or_else(|_| json!({ "raw": tool_call.function.arguments }));

                content.push(ResponseContentBlock::ToolUse {
                    id: tool_call.id.clone(),
                    name: tool_call.function.name.clone(),
                    input,
                });
            }
        }
    }

    // Ensure content is never empty
    if content.is_empty() {
        content.push(ResponseContentBlock::Text {
            text: String::new(),
        });
    }

    // Map finish_reason to stop_reason
    let stop_reason = choice.and_then(|c| {
        c.finish_reason.as_ref().map(|r| match r.as_str() {
            "stop" => StopReason::EndTurn,
            "length" => StopReason::MaxTokens,
            "tool_calls" => StopReason::ToolUse,
            _ => StopReason::EndTurn,
        })
    });

    MessagesResponse {
        id: response.id.clone(),
        model: original_model.to_string(),
        role: "assistant".to_string(),
        content,
        response_type: "message".to_string(),
        stop_reason,
        stop_sequence: None,
        usage: Usage {
            input_tokens: response.usage.prompt_tokens,
            output_tokens: response.usage.completion_tokens,
            cache_creation_input_tokens: 0,
            cache_read_input_tokens: 0,
        },
    }
}

/// Generate a unique message ID
pub fn generate_message_id() -> String {
    format!("msg_{}", Uuid::new_v4().simple())
}

/// Generate a unique tool use ID
pub fn generate_tool_id() -> String {
    format!("toolu_{}", Uuid::new_v4().simple())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_map_model_haiku() {
        let config = ProxyConfig::default();
        let result = map_model("claude-3-haiku-20240307", &config);
        assert_eq!(result.provider, "openai");
        assert_eq!(result.model, "gpt-4.1-mini");
    }

    #[test]
    fn test_map_model_sonnet() {
        let config = ProxyConfig::default();
        let result = map_model("claude-3-sonnet-20240229", &config);
        assert_eq!(result.provider, "openai");
        assert_eq!(result.model, "gpt-4.1");
    }

    #[test]
    fn test_map_model_with_prefix() {
        let config = ProxyConfig::default();
        let result = map_model("anthropic/claude-3-haiku", &config);
        assert_eq!(result.provider, "openai");
        assert_eq!(result.model, "gpt-4.1-mini");
    }

    #[test]
    fn test_map_model_gemini_provider() {
        let config = ProxyConfig {
            preferred_provider: Provider::Google,
            big_model: "gemini-2.5-pro".to_string(),
            small_model: "gemini-2.5-flash".to_string(),
            ..Default::default()
        };
        let result = map_model("claude-3-sonnet", &config);
        assert_eq!(result.provider, "gemini");
        assert_eq!(result.model, "gemini-2.5-pro");
    }
}
