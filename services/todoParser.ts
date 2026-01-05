/**
 * TODO.md Parser Service
 *
 * Handles parsing and serializing the TODO.md file format.
 * Format:
 *
 * # Task: Task Title
 *
 * <!-- voltcode:task {"id":"task-xxx","status":"in_progress","timeSpent":3600000} -->
 *
 * ## TODO
 * - [ ] Uncompleted item
 * - [x] Completed item
 *
 * ## Notes
 * User notes here...
 */

import { TaskItem, TaskStatus, TaskData } from '../types';

/**
 * Metadata stored in the hidden HTML comment
 */
interface TodoMetadata {
  id: string;
  status: TaskStatus;
  timeSpent: number;
  startedAt: number;
  pausedAt?: number;
  lastResumedAt?: number;
}

/**
 * Parsed TODO.md structure
 */
export interface ParsedTodo {
  title: string;
  metadata: TodoMetadata;
  items: TaskItem[];
  notes: string;
}

/**
 * Parse TODO.md content into structured data
 */
export function parseTodoMd(content: string): ParsedTodo | null {
  try {
    const lines = content.split('\n');

    // Extract title from first heading
    let title = 'Untitled Task';
    const titleMatch = content.match(/^#\s+Task:\s*(.+)$/m);
    if (titleMatch) {
      title = titleMatch[1].trim();
    }

    // Extract metadata from HTML comment
    let metadata: TodoMetadata = {
      id: `task-${Date.now()}`,
      status: TaskStatus.IN_PROGRESS,
      timeSpent: 0,
      startedAt: Date.now()
    };

    const metadataMatch = content.match(/<!--\s*voltcode:task\s+({.*?})\s*-->/);
    if (metadataMatch) {
      try {
        const parsed = JSON.parse(metadataMatch[1]);
        metadata = {
          id: parsed.id || metadata.id,
          status: parsed.status || metadata.status,
          timeSpent: parsed.timeSpent || 0,
          startedAt: parsed.startedAt || metadata.startedAt,
          pausedAt: parsed.pausedAt,
          lastResumedAt: parsed.lastResumedAt
        };
      } catch (e) {
        console.error('[todoParser] Failed to parse metadata:', e);
      }
    }

    // Extract TODO items
    const items: TaskItem[] = [];
    const todoRegex = /^-\s+\[([ xX])\]\s+(.+)$/gm;
    let match;
    let itemIndex = 0;

    while ((match = todoRegex.exec(content)) !== null) {
      const completed = match[1].toLowerCase() === 'x';
      const itemTitle = match[2].trim();

      items.push({
        id: `item-${itemIndex++}`,
        title: itemTitle,
        completed,
        createdAt: metadata.startedAt,
        completedAt: completed ? Date.now() : undefined
      });
    }

    // Extract notes section
    let notes = '';
    const notesMatch = content.match(/##\s+Notes\s*\n([\s\S]*?)(?=\n##|$)/i);
    if (notesMatch) {
      notes = notesMatch[1].trim();
    }

    return { title, metadata, items, notes };
  } catch (error) {
    console.error('[todoParser] Failed to parse TODO.md:', error);
    return null;
  }
}

/**
 * Serialize task data to TODO.md format
 */
export function serializeTodoMd(
  title: string,
  taskData: TaskData,
  taskId: string,
  notes: string = ''
): string {
  const metadata: TodoMetadata = {
    id: taskId,
    status: taskData.status,
    timeSpent: taskData.totalTimeSpent,
    startedAt: taskData.startedAt,
    pausedAt: taskData.pausedAt,
    lastResumedAt: taskData.lastResumedAt
  };

  const metadataJson = JSON.stringify(metadata);
  const formattedTime = formatTime(taskData.totalTimeSpent);
  const statusEmoji = getStatusEmoji(taskData.status);
  const statusText = getStatusText(taskData.status);

  // Build TODO items section
  const todoItems = taskData.items.map(item => {
    const checkbox = item.completed ? '[x]' : '[ ]';
    return `- ${checkbox} ${item.title}`;
  }).join('\n');

  return `# Task: ${title}

<!-- voltcode:task ${metadataJson} -->

**Status:** ${statusEmoji} ${statusText}
**Time Spent:** ${formattedTime}
**Started:** ${new Date(taskData.startedAt).toLocaleString()}

## TODO
${todoItems || '- [ ] No items yet'}

## Notes
${notes || '_Add your notes here..._'}

---
*Managed by VoltCode - Cross-tool task management*
`;
}

/**
 * Format milliseconds to human readable time
 */
export function formatTime(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
  } else if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  } else {
    return `${seconds}s`;
  }
}

/**
 * Format milliseconds to compact display (for UI)
 */
export function formatTimeCompact(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  } else {
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  }
}

/**
 * Get emoji for task status
 */
export function getStatusEmoji(status: TaskStatus): string {
  switch (status) {
    case TaskStatus.IN_PROGRESS:
      return '🔵';
    case TaskStatus.COMPLETED:
      return '✅';
    case TaskStatus.PAUSED:
      return '⏸️';
    default:
      return '📋';
  }
}

/**
 * Get text label for task status
 */
export function getStatusText(status: TaskStatus): string {
  switch (status) {
    case TaskStatus.IN_PROGRESS:
      return 'In Progress';
    case TaskStatus.COMPLETED:
      return 'Completed';
    case TaskStatus.PAUSED:
      return 'Paused';
    default:
      return 'Unknown';
  }
}

/**
 * Create a default TODO.md content for a new task
 */
export function createDefaultTodoMd(title: string, taskId: string): string {
  const now = Date.now();
  const taskData: TaskData = {
    status: TaskStatus.IN_PROGRESS,
    items: [],
    totalTimeSpent: 0,
    startedAt: now,
    lastResumedAt: now
  };

  return serializeTodoMd(title, taskData, taskId);
}
