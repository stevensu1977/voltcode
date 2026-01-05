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
  TERMINAL = 'TERMINAL',
  TASKS = 'TASKS'
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

export interface ToolChatHistory {
  sessions: ChatSession[];
  activeSessionId: string | null;
}

// ============================================
// Task Mode Types (Phase 1.2)
// ============================================

/**
 * Task status enum
 */
export enum TaskStatus {
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  PAUSED = 'paused'
}

/**
 * A single TODO item within a task
 */
export interface TaskItem {
  id: string;
  title: string;
  completed: boolean;
  createdAt: number;
  completedAt?: number;
}

/**
 * Task metadata attached to a session
 */
export interface TaskData {
  status: TaskStatus;
  items: TaskItem[];
  totalTimeSpent: number;   // Total time in milliseconds
  startedAt: number;        // When the task was created
  pausedAt?: number;        // When the task was last paused
  lastResumedAt?: number;   // When the task was last resumed (for tracking)
}

/**
 * Extended ChatSession with task support
 * When isTask is true, the session has task data
 */
export interface ChatSession {
  id: string;
  title: string;
  messages: Message[];
  createdAt: number;
  updatedAt: number;
  // Task mode fields (optional for backwards compatibility)
  isTask?: boolean;
  task?: TaskData;
  todoFilePath?: string;    // Path to TODO.md: projectDir/.voltcode/TODO.md
}

/**
 * Type guard to check if a session is a task session
 */
export function isTaskSession(session: ChatSession): session is ChatSession & { isTask: true; task: TaskData; todoFilePath: string } {
  return session.isTask === true && session.task !== undefined;
}

// ============================================
// Agent Switch Types (Phase 1.3)
// ============================================

/**
 * Context transfer mode when switching agents
 */
export type ContextTransferMode = 'new' | 'copy' | 'summary';

/**
 * Agent capability definition for recommendations
 */
export interface AgentCapability {
  name: string;
  strengths: string[];
  keywords: string[];
}

/**
 * Options for switching between agents
 */
export interface AgentSwitchOptions {
  targetTool: ToolId;
  transferMode: ContextTransferMode;
  messageCount?: number;  // Number of messages to copy (for 'copy' mode)
}

// ============================================
// Parallel Task Execution Types (Phase 2.3)
// ============================================

/**
 * Execution state for parallel tasks
 */
export enum ExecutionState {
  QUEUED = 'queued',       // Waiting in queue
  RUNNING = 'running',     // Currently executing
  PAUSED = 'paused',       // Manually paused
  COMPLETED = 'completed', // Finished successfully
  FAILED = 'failed',       // Finished with error
  CANCELLED = 'cancelled'  // User cancelled
}

/**
 * A parallel task execution record
 */
export interface ParallelTask {
  id: string;                    // Unique task ID
  sessionId: string;             // Associated ChatSession ID
  toolId: ToolId;                // Which agent (claude, gemini, codex, kiro)
  state: ExecutionState;         // Current execution state
  prompt: string;                // The user's request
  queuedAt: number;              // When added to queue
  startedAt?: number;            // When execution started
  completedAt?: number;          // When execution finished
  error?: string;                // Error message if failed
  priority: number;              // Queue priority (higher = sooner)
  progress?: string;             // Current progress indicator
}

/**
 * Queue statistics for UI display
 */
export interface QueueStats {
  running: number;
  queued: number;
  paused: number;
  completed: number;
  maxConcurrency: number;
}

/**
 * Task manager configuration
 */
export interface ParallelTaskConfig {
  maxConcurrency: number;        // Max tasks running simultaneously (default: 3)
  autoStartQueued: boolean;      // Auto-start queued tasks when slot opens
}