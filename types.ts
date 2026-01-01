import React from 'react';

export enum Sender {
  USER = 'USER',
  AGENT = 'AGENT'
}

export interface Message {
  id: string;
  text: string;
  sender: Sender;
  timestamp: number;
  isError?: boolean;
  isTerminalOutput?: boolean;  // 是否是终端输出（包含 ANSI 码）
}

export interface GeneratedFile {
  name: string;
  content: string;
  language: string;
}

export interface FileItem {
  name: string;
  path: string;
  isDirectory: boolean;
  size?: number;
  modifiedTime?: number;
  children?: FileItem[];
}

export interface SkillInfo {
  name: string;
  path: string;
  token_count?: number;
}

export type McpTransportType = 'stdio' | 'http';

export interface McpServerInfo {
  name: string;
  transport: McpTransportType;
  disabled?: boolean;
  // stdio transport
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  // http transport
  url?: string;
  headers?: Record<string, string>;
}

export enum Tab {
  PREVIEW = 'PREVIEW',
  CODE = 'CODE',
  FILES = 'FILES',
  GIT = 'GIT',
  TERMINAL = 'TERMINAL'
}

export interface ProjectState {
  messages: Message[];
  currentCode: string | null;
  activeTab: Tab;
  isGenerating: boolean;
}

export type ToolId = 'claude' | 'gemini' | 'codex' | 'kiro';

export interface ToolDefinition {
  id: ToolId;
  name: string;
  icon: React.ReactNode;
  color: string;
}

export type PermissionMode = 'bypassPermissions' | 'acceptEdits' | 'default';

export type ClaudeProvider = 'anthropic' | 'bedrock';

export interface ClaudeProviderConfig {
  provider: ClaudeProvider;
  // Bedrock-specific settings
  bedrockRegion?: string;
  bedrockProfile?: string;
}

export interface ClaudePermissionSettings {
  mode: PermissionMode;
  allowedTools?: string[];
  disallowedTools?: string[];
}

export interface AgentInfo {
  name: string;
  description?: string;
  model?: string;
  isBuiltIn: boolean;
}

export interface TerminalInstance {
  id: string;
  name: string;
  pid: number;
  output: string[];
  isActive: boolean;
  createdAt: number;
}

export interface ChatSession {
  id: string;
  title: string;
  messages: Message[];
  createdAt: number;
  updatedAt: number;
}

export interface ToolChatHistory {
  sessions: ChatSession[];
  activeSessionId: string | null;
}