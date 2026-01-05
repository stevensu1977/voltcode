/**
 * Task Store Service
 *
 * Handles task CRUD operations, time tracking, and TODO.md file sync.
 */

import { invoke } from '@tauri-apps/api/core';
import { ChatSession, TaskData, TaskItem, TaskStatus, Sender, isTaskSession } from '../types';
import { parseTodoMd, serializeTodoMd, createDefaultTodoMd } from './todoParser';

// Debounce timer for file writes
let saveTimer: ReturnType<typeof setTimeout> | null = null;
const SAVE_DEBOUNCE_MS = 300;

/**
 * Generate a unique task ID
 */
export function generateTaskId(): string {
  return `task-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Generate a unique item ID
 */
export function generateItemId(): string {
  return `item-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
}

/**
 * Get the TODO.md file path for a project
 */
export function getTodoFilePath(projectDir: string): string {
  return `${projectDir}/.voltcode/TODO.md`;
}

/**
 * Ensure the .voltcode directory exists
 */
async function ensureVoltcodeDir(projectDir: string): Promise<void> {
  const dirPath = `${projectDir}/.voltcode`;
  try {
    await invoke('create_directory', { dirPath });
  } catch (error) {
    // Directory might already exist, which is OK
    console.log('[taskStore] .voltcode directory check:', error);
  }
}

/**
 * Read TODO.md file content
 */
async function readTodoFile(filePath: string): Promise<string | null> {
  try {
    const content = await invoke<string>('read_file_content', { filePath });
    return content;
  } catch (error) {
    // File doesn't exist is OK, return null
    console.log('[taskStore] TODO.md not found, will create new one');
    return null;
  }
}

/**
 * Write TODO.md file content (debounced)
 */
async function writeTodoFile(filePath: string, content: string): Promise<void> {
  // Clear existing timer
  if (saveTimer) {
    clearTimeout(saveTimer);
  }

  // Debounce writes
  return new Promise((resolve, reject) => {
    saveTimer = setTimeout(async () => {
      try {
        await invoke('save_file', { filePath, content });
        console.log('[taskStore] TODO.md saved');
        resolve();
      } catch (error) {
        console.error('[taskStore] Failed to write TODO.md:', error);
        reject(error);
      }
    }, SAVE_DEBOUNCE_MS);
  });
}

/**
 * Write TODO.md file immediately (no debounce)
 */
async function writeTodoFileImmediate(filePath: string, content: string): Promise<void> {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }

  try {
    await invoke('save_file', { filePath, content });
    console.log('[taskStore] TODO.md saved immediately');
  } catch (error) {
    console.error('[taskStore] Failed to write TODO.md:', error);
    throw error;
  }
}

/**
 * Create a new task session
 */
export async function createTaskSession(
  toolId: string,
  title: string,
  projectDir: string
): Promise<ChatSession> {
  const now = Date.now();
  const taskId = generateTaskId();
  const todoFilePath = getTodoFilePath(projectDir);

  // Ensure .voltcode directory exists
  await ensureVoltcodeDir(projectDir);

  // Create initial task data
  const taskData: TaskData = {
    status: TaskStatus.IN_PROGRESS,
    items: [],
    totalTimeSpent: 0,
    startedAt: now,
    lastResumedAt: now
  };

  // Create and write TODO.md
  const todoContent = createDefaultTodoMd(title, taskId);
  await writeTodoFileImmediate(todoFilePath, todoContent);

  // Create the session
  const session: ChatSession = {
    id: taskId,
    title,
    messages: [{
      id: `${taskId}-welcome`,
      text: `📋 Task created: **${title}**\n\nTimer started. Use \`/task\` commands to manage this task.`,
      sender: Sender.AGENT,
      timestamp: now
    }],
    createdAt: now,
    updatedAt: now,
    isTask: true,
    task: taskData,
    todoFilePath
  };

  return session;
}

/**
 * Update task status
 */
export function updateTaskStatus(session: ChatSession, status: TaskStatus): ChatSession {
  if (!isTaskSession(session)) {
    return session;
  }

  const now = Date.now();
  const task = { ...session.task };

  // Handle status transitions
  if (status === TaskStatus.PAUSED && task.status === TaskStatus.IN_PROGRESS) {
    // Pausing: accumulate time since last resume
    if (task.lastResumedAt) {
      task.totalTimeSpent += now - task.lastResumedAt;
    }
    task.pausedAt = now;
    task.lastResumedAt = undefined;
  } else if (status === TaskStatus.IN_PROGRESS && task.status === TaskStatus.PAUSED) {
    // Resuming: record resume time
    task.lastResumedAt = now;
    task.pausedAt = undefined;
  } else if (status === TaskStatus.COMPLETED) {
    // Completing: accumulate any remaining time
    if (task.status === TaskStatus.IN_PROGRESS && task.lastResumedAt) {
      task.totalTimeSpent += now - task.lastResumedAt;
    }
    task.lastResumedAt = undefined;
    task.pausedAt = undefined;
  }

  task.status = status;

  return {
    ...session,
    task,
    updatedAt: now
  };
}

/**
 * Add elapsed time to task (called by timer interval)
 */
export function addTaskTime(session: ChatSession, elapsedMs: number): ChatSession {
  if (!isTaskSession(session) || session.task.status !== TaskStatus.IN_PROGRESS) {
    return session;
  }

  // We don't directly add time here; time is calculated from lastResumedAt
  // This function is mainly for triggering UI updates
  return {
    ...session,
    updatedAt: Date.now()
  };
}

/**
 * Get current elapsed time for a task
 */
export function getTaskElapsedTime(session: ChatSession): number {
  if (!isTaskSession(session)) {
    return 0;
  }

  const task = session.task;
  let total = task.totalTimeSpent;

  // Add time since last resume if currently in progress
  if (task.status === TaskStatus.IN_PROGRESS && task.lastResumedAt) {
    total += Date.now() - task.lastResumedAt;
  }

  return total;
}

/**
 * Add a TODO item to task
 */
export function addTaskItem(session: ChatSession, title: string): ChatSession {
  if (!isTaskSession(session)) {
    return session;
  }

  const now = Date.now();
  const newItem: TaskItem = {
    id: generateItemId(),
    title,
    completed: false,
    createdAt: now
  };

  return {
    ...session,
    task: {
      ...session.task,
      items: [...session.task.items, newItem]
    },
    updatedAt: now
  };
}

/**
 * Toggle a TODO item completion status
 */
export function toggleTaskItem(session: ChatSession, itemId: string): ChatSession {
  if (!isTaskSession(session)) {
    return session;
  }

  const now = Date.now();
  const items = session.task.items.map(item => {
    if (item.id === itemId) {
      return {
        ...item,
        completed: !item.completed,
        completedAt: !item.completed ? now : undefined
      };
    }
    return item;
  });

  return {
    ...session,
    task: {
      ...session.task,
      items
    },
    updatedAt: now
  };
}

/**
 * Complete a TODO item by index (1-based for user convenience)
 */
export function completeTaskItemByIndex(session: ChatSession, index: number): ChatSession {
  if (!isTaskSession(session)) {
    return session;
  }

  const actualIndex = index - 1;
  if (actualIndex < 0 || actualIndex >= session.task.items.length) {
    return session;
  }

  const itemId = session.task.items[actualIndex].id;
  const now = Date.now();

  const items = session.task.items.map((item, idx) => {
    if (idx === actualIndex && !item.completed) {
      return {
        ...item,
        completed: true,
        completedAt: now
      };
    }
    return item;
  });

  return {
    ...session,
    task: {
      ...session.task,
      items
    },
    updatedAt: now
  };
}

/**
 * Remove a TODO item
 */
export function removeTaskItem(session: ChatSession, itemId: string): ChatSession {
  if (!isTaskSession(session)) {
    return session;
  }

  return {
    ...session,
    task: {
      ...session.task,
      items: session.task.items.filter(item => item.id !== itemId)
    },
    updatedAt: Date.now()
  };
}

/**
 * Sync task session to TODO.md file
 */
export async function syncTaskToFile(session: ChatSession, notes: string = ''): Promise<void> {
  if (!isTaskSession(session)) {
    return;
  }

  const content = serializeTodoMd(
    session.title,
    session.task,
    session.id,
    notes
  );

  await writeTodoFile(session.todoFilePath, content);
}

/**
 * Sync task session to TODO.md file immediately
 */
export async function syncTaskToFileImmediate(session: ChatSession, notes: string = ''): Promise<void> {
  if (!isTaskSession(session)) {
    return;
  }

  const content = serializeTodoMd(
    session.title,
    session.task,
    session.id,
    notes
  );

  await writeTodoFileImmediate(session.todoFilePath, content);
}

/**
 * Load task data from TODO.md file
 */
export async function loadTaskFromFile(todoFilePath: string): Promise<Partial<TaskData> | null> {
  const content = await readTodoFile(todoFilePath);
  if (!content) {
    return null;
  }

  const parsed = parseTodoMd(content);
  if (!parsed) {
    return null;
  }

  return {
    status: parsed.metadata.status,
    items: parsed.items,
    totalTimeSpent: parsed.metadata.timeSpent,
    startedAt: parsed.metadata.startedAt,
    pausedAt: parsed.metadata.pausedAt,
    lastResumedAt: parsed.metadata.lastResumedAt
  };
}

/**
 * Get task statistics summary
 */
export function getTaskStats(session: ChatSession): {
  totalItems: number;
  completedItems: number;
  elapsedTime: number;
  progress: number;
} {
  if (!isTaskSession(session)) {
    return {
      totalItems: 0,
      completedItems: 0,
      elapsedTime: 0,
      progress: 0
    };
  }

  const totalItems = session.task.items.length;
  const completedItems = session.task.items.filter(item => item.completed).length;
  const elapsedTime = getTaskElapsedTime(session);
  const progress = totalItems > 0 ? Math.round((completedItems / totalItems) * 100) : 0;

  return { totalItems, completedItems, elapsedTime, progress };
}
