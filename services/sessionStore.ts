/**
 * Session Store Service
 *
 * Handles persisting and loading chat sessions using tauri-plugin-store.
 * Data is stored in ~/.local/share/com.voltcode.app/sessions.json (or equivalent on other platforms)
 */

import { Store } from '@tauri-apps/plugin-store';
import { ToolId, ToolChatHistory, ChatSession, Message, Sender, TaskStatus, isTaskSession } from '../types';
import { createTaskSession as createTaskSessionFromStore } from './taskStore';

// Storage format version for migrations
// v1: Initial version
// v2: Added task session support (isTask, task, todoFilePath fields)
const STORAGE_VERSION = 2;

interface StoredData {
  version: number;
  data: Record<ToolId, ToolChatHistory>;
  lastUpdated: number;
}

// Store instance (lazy-loaded)
let storeInstance: Store | null = null;

// Debounce timer for saves
let saveTimer: ReturnType<typeof setTimeout> | null = null;
const SAVE_DEBOUNCE_MS = 300; // Reduced from 1000ms for more responsive saves

// Tool names for initial messages
const TOOL_NAMES: Record<ToolId, string> = {
  claude: 'Claude Code',
  gemini: 'Gemini CLI',
  codex: 'Codex CLI',
  kiro: 'Kiro CLI'
};

/**
 * Create a new empty session for a tool
 */
export const createNewSession = (toolId: ToolId): ChatSession => {
  const now = Date.now();
  return {
    id: `${toolId}-${now}-${Math.random().toString(36).substr(2, 9)}`,
    title: 'New Chat',
    messages: [{
      id: `${toolId}-welcome-${now}`,
      text: `Hello! I'm ${TOOL_NAMES[toolId]}. I can help you build web apps, components, and prototypes instantly. Start chatting to begin!`,
      sender: Sender.AGENT,
      timestamp: now
    }],
    createdAt: now,
    updatedAt: now
  };
};

/**
 * Create a new task session for a tool
 * This creates a session with task tracking and a TODO.md file
 */
export const createNewTaskSession = async (
  toolId: ToolId,
  title: string,
  projectDir: string
): Promise<ChatSession> => {
  return createTaskSessionFromStore(toolId, title, projectDir);
};

/**
 * Find the active task session across all tools (if any)
 */
export function findActiveTaskSession(
  history: Record<ToolId, ToolChatHistory>
): { toolId: ToolId; session: ChatSession } | null {
  for (const [toolId, toolHistory] of Object.entries(history) as [ToolId, ToolChatHistory][]) {
    for (const session of toolHistory.sessions) {
      if (isTaskSession(session) && session.task.status === TaskStatus.IN_PROGRESS) {
        return { toolId, session };
      }
    }
  }
  return null;
}

/**
 * Get all task sessions across all tools
 */
export function getAllTaskSessions(
  history: Record<ToolId, ToolChatHistory>
): Array<{ toolId: ToolId; session: ChatSession }> {
  const tasks: Array<{ toolId: ToolId; session: ChatSession }> = [];

  for (const [toolId, toolHistory] of Object.entries(history) as [ToolId, ToolChatHistory][]) {
    for (const session of toolHistory.sessions) {
      if (isTaskSession(session)) {
        tasks.push({ toolId, session });
      }
    }
  }

  // Sort by most recently updated
  tasks.sort((a, b) => b.session.updatedAt - a.session.updatedAt);

  return tasks;
}

/**
 * Create initial tool history with one session per tool
 */
export const createInitialToolHistory = (): Record<ToolId, ToolChatHistory> => {
  const tools: ToolId[] = ['claude', 'gemini', 'codex', 'kiro'];
  const history: Record<ToolId, ToolChatHistory> = {} as Record<ToolId, ToolChatHistory>;

  tools.forEach(toolId => {
    const session = createNewSession(toolId);
    history[toolId] = {
      sessions: [session],
      activeSessionId: session.id
    };
  });

  return history;
};

/**
 * Get or create the store instance
 */
async function getStore(): Promise<Store> {
  if (!storeInstance) {
    storeInstance = await Store.load('sessions.json');
  }
  return storeInstance;
}

/**
 * Load sessions from persistent storage
 */
export async function loadSessions(): Promise<Record<ToolId, ToolChatHistory> | null> {
  try {
    const store = await getStore();
    const stored = await store.get<StoredData>('sessions');

    if (!stored) {
      console.log('[SessionStore] No saved sessions found');
      return null;
    }

    // Handle migrations if needed
    const migrated = migrateData(stored);

    console.log('[SessionStore] Loaded sessions:', {
      version: migrated.version,
      tools: Object.keys(migrated.data),
      sessionCounts: Object.entries(migrated.data).map(([tool, hist]) => `${tool}: ${hist.sessions.length}`)
    });

    return migrated.data;
  } catch (error) {
    console.error('[SessionStore] Failed to load sessions:', error);
    return null;
  }
}

/**
 * Save sessions to persistent storage (debounced)
 */
export function saveSessions(data: Record<ToolId, ToolChatHistory>): void {
  // Clear existing timer
  if (saveTimer) {
    clearTimeout(saveTimer);
  }

  // Debounce saves to avoid excessive writes
  saveTimer = setTimeout(async () => {
    try {
      const store = await getStore();

      const storedData: StoredData = {
        version: STORAGE_VERSION,
        data,
        lastUpdated: Date.now()
      };

      await store.set('sessions', storedData);
      await store.save();

      console.log('[SessionStore] Sessions saved');
    } catch (error) {
      console.error('[SessionStore] Failed to save sessions:', error);
    }
  }, SAVE_DEBOUNCE_MS);
}

/**
 * Force immediate save (use when app is closing)
 */
export async function saveSessionsImmediate(data: Record<ToolId, ToolChatHistory>): Promise<void> {
  // Clear any pending debounced save
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }

  try {
    const store = await getStore();

    const storedData: StoredData = {
      version: STORAGE_VERSION,
      data,
      lastUpdated: Date.now()
    };

    await store.set('sessions', storedData);
    await store.save();

    console.log('[SessionStore] Sessions saved immediately');
  } catch (error) {
    console.error('[SessionStore] Failed to save sessions:', error);
  }
}

/**
 * Migrate data from older versions
 */
function migrateData(stored: any): StoredData {
  // If no version, it's legacy format
  if (!stored.version) {
    console.log('[SessionStore] Migrating from legacy format');
    return {
      version: STORAGE_VERSION,
      data: stored,
      lastUpdated: Date.now()
    };
  }

  // Migration from v1 to v2: Add task session support
  // v1 sessions are compatible with v2 since task fields are optional
  if (stored.version === 1) {
    console.log('[SessionStore] Migrating from v1 to v2 (task session support)');
    // No data transformation needed - task fields are optional
    // Just update the version number
    return {
      version: STORAGE_VERSION,
      data: stored.data,
      lastUpdated: Date.now()
    };
  }

  return stored;
}

/**
 * Export a session to Markdown format
 */
export function exportSessionToMarkdown(session: ChatSession, toolId: ToolId): string {
  const lines: string[] = [];

  // Header
  lines.push(`# ${session.title}`);
  lines.push('');
  lines.push(`**Tool:** ${TOOL_NAMES[toolId]}`);
  lines.push(`**Created:** ${new Date(session.createdAt).toLocaleString()}`);
  lines.push(`**Last Updated:** ${new Date(session.updatedAt).toLocaleString()}`);

  // Task info if it's a task session
  if (isTaskSession(session)) {
    lines.push(`**Type:** Task`);
    lines.push(`**Status:** ${session.task.status}`);
    const hours = Math.floor(session.task.totalTimeSpent / 3600000);
    const minutes = Math.floor((session.task.totalTimeSpent % 3600000) / 60000);
    lines.push(`**Time Spent:** ${hours}h ${minutes}m`);
    lines.push('');

    // TODO items
    if (session.task.items.length > 0) {
      lines.push('## TODO Items');
      lines.push('');
      for (const item of session.task.items) {
        const checkbox = item.completed ? '[x]' : '[ ]';
        lines.push(`- ${checkbox} ${item.title}`);
      }
      lines.push('');
    }
  }

  lines.push('');
  lines.push('---');
  lines.push('');

  // Messages
  for (const msg of session.messages) {
    const sender = msg.sender === Sender.USER ? 'User' : TOOL_NAMES[toolId];
    const time = new Date(msg.timestamp).toLocaleTimeString();

    lines.push(`### ${sender} (${time})`);
    lines.push('');
    lines.push(msg.text);
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Search sessions by query (searches titles and message content)
 */
export function searchSessions(
  history: Record<ToolId, ToolChatHistory>,
  query: string
): Array<{ toolId: ToolId; session: ChatSession; matches: string[] }> {
  const results: Array<{ toolId: ToolId; session: ChatSession; matches: string[] }> = [];
  const lowerQuery = query.toLowerCase();

  for (const [toolId, toolHistory] of Object.entries(history) as [ToolId, ToolChatHistory][]) {
    for (const session of toolHistory.sessions) {
      const matches: string[] = [];

      // Check title
      if (session.title.toLowerCase().includes(lowerQuery)) {
        matches.push(`Title: "${session.title}"`);
      }

      // Check messages
      for (const msg of session.messages) {
        if (msg.text.toLowerCase().includes(lowerQuery)) {
          // Get a snippet around the match
          const idx = msg.text.toLowerCase().indexOf(lowerQuery);
          const start = Math.max(0, idx - 30);
          const end = Math.min(msg.text.length, idx + query.length + 30);
          let snippet = msg.text.slice(start, end);
          if (start > 0) snippet = '...' + snippet;
          if (end < msg.text.length) snippet = snippet + '...';
          matches.push(`Message: "${snippet}"`);
        }
      }

      if (matches.length > 0) {
        results.push({ toolId, session, matches });
      }
    }
  }

  // Sort by most recently updated
  results.sort((a, b) => b.session.updatedAt - a.session.updatedAt);

  return results;
}

/**
 * Prune old sessions to keep storage size manageable
 */
export function pruneSessions(
  history: Record<ToolId, ToolChatHistory>,
  maxSessionsPerTool: number = 50
): Record<ToolId, ToolChatHistory> {
  const pruned: Record<ToolId, ToolChatHistory> = {} as Record<ToolId, ToolChatHistory>;

  for (const [toolId, toolHistory] of Object.entries(history) as [ToolId, ToolChatHistory][]) {
    // Sort by updated time (most recent first)
    const sortedSessions = [...toolHistory.sessions].sort((a, b) => b.updatedAt - a.updatedAt);

    // Keep only the most recent sessions
    const keptSessions = sortedSessions.slice(0, maxSessionsPerTool);

    // Make sure active session is included
    let activeSessionId = toolHistory.activeSessionId;
    if (activeSessionId && !keptSessions.find(s => s.id === activeSessionId)) {
      // Active session was pruned, set to most recent
      activeSessionId = keptSessions[0]?.id || null;
    }

    pruned[toolId] = {
      sessions: keptSessions,
      activeSessionId
    };
  }

  return pruned;
}

/**
 * Get session statistics
 */
export function getSessionStats(history: Record<ToolId, ToolChatHistory>): {
  totalSessions: number;
  totalMessages: number;
  totalTasks: number;
  activeTasks: number;
  completedTasks: number;
  totalTaskTime: number;
  byTool: Record<ToolId, { sessions: number; messages: number; tasks: number }>;
} {
  const stats = {
    totalSessions: 0,
    totalMessages: 0,
    totalTasks: 0,
    activeTasks: 0,
    completedTasks: 0,
    totalTaskTime: 0,
    byTool: {} as Record<ToolId, { sessions: number; messages: number; tasks: number }>
  };

  for (const [toolId, toolHistory] of Object.entries(history) as [ToolId, ToolChatHistory][]) {
    const sessionCount = toolHistory.sessions.length;
    const messageCount = toolHistory.sessions.reduce((sum, s) => sum + s.messages.length, 0);
    let taskCount = 0;

    for (const session of toolHistory.sessions) {
      if (isTaskSession(session)) {
        taskCount++;
        stats.totalTasks++;
        stats.totalTaskTime += session.task.totalTimeSpent;

        if (session.task.status === TaskStatus.IN_PROGRESS) {
          stats.activeTasks++;
        } else if (session.task.status === TaskStatus.COMPLETED) {
          stats.completedTasks++;
        }
      }
    }

    stats.totalSessions += sessionCount;
    stats.totalMessages += messageCount;
    stats.byTool[toolId] = { sessions: sessionCount, messages: messageCount, tasks: taskCount };
  }

  return stats;
}
