/**
 * ParallelTaskManager (Phase 2.3)
 *
 * Core service for managing parallel task execution with max concurrency limit.
 * Handles task queue, execution, pause/resume, and cleanup.
 */

import {
  ToolId,
  ExecutionState,
  ParallelTask,
  QueueStats,
  ParallelTaskConfig,
  Message,
  Sender
} from '../types';
import { CLIRouter, ProgressCallback, TerminalCallback, TerminalCreateCallback } from './cliRouter';
import { CLITool } from './sidecar';

// Default configuration
const DEFAULT_CONFIG: ParallelTaskConfig = {
  maxConcurrency: 3,
  autoStartQueued: true
};

// Generate unique task ID
const generateTaskId = (): string => {
  return `task-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
};

/**
 * Callback types for UI updates
 */
export type TaskUpdateCallback = (task: ParallelTask) => void;
export type QueueChangeCallback = (stats: QueueStats) => void;
export type MessageCallback = (taskId: string, message: Message) => void;

/**
 * ParallelTaskManager class
 *
 * Manages concurrent task execution with configurable max limit.
 */
export class ParallelTaskManager {
  // Task storage
  private tasks: Map<string, ParallelTask> = new Map();
  private queue: string[] = [];  // Task IDs in priority order (higher priority first)
  private runningTasks: Set<string> = new Set();
  private pausedTasks: Set<string> = new Set();

  // Per-task CLI instances for isolation
  private cliInstances: Map<string, CLIRouter> = new Map();

  // Configuration
  private config: ParallelTaskConfig;

  // Base CLI router to clone settings from
  private baseCLI: CLIRouter | null = null;

  // Callbacks for UI updates
  private onTaskUpdate: TaskUpdateCallback | null = null;
  private onQueueChange: QueueChangeCallback | null = null;
  private onMessage: MessageCallback | null = null;

  // Terminal callbacks (passed from App)
  private terminalCallback: TerminalCallback | null = null;
  private terminalCreateCallback: TerminalCreateCallback | null = null;

  constructor(config: Partial<ParallelTaskConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    console.log('[ParallelTaskManager] Initialized with config:', this.config);
  }

  /**
   * Set the base CLI router to clone settings from
   */
  setBaseCLI(cli: CLIRouter): void {
    this.baseCLI = cli;
  }

  /**
   * Set callback for task updates
   */
  setTaskUpdateCallback(callback: TaskUpdateCallback | null): void {
    this.onTaskUpdate = callback;
  }

  /**
   * Set callback for queue changes
   */
  setQueueChangeCallback(callback: QueueChangeCallback | null): void {
    this.onQueueChange = callback;
  }

  /**
   * Set callback for new messages
   */
  setMessageCallback(callback: MessageCallback | null): void {
    this.onMessage = callback;
  }

  /**
   * Set terminal output callback
   */
  setTerminalCallback(callback: TerminalCallback | null): void {
    this.terminalCallback = callback;
  }

  /**
   * Set terminal create callback
   */
  setTerminalCreateCallback(callback: TerminalCreateCallback | null): void {
    this.terminalCreateCallback = callback;
  }

  /**
   * Get current configuration
   */
  getConfig(): ParallelTaskConfig {
    return { ...this.config };
  }

  /**
   * Update max concurrency limit
   */
  setMaxConcurrency(max: number): void {
    const oldMax = this.config.maxConcurrency;
    this.config.maxConcurrency = Math.max(1, Math.min(10, max));  // Clamp between 1-10
    console.log(`[ParallelTaskManager] Max concurrency changed: ${oldMax} -> ${this.config.maxConcurrency}`);

    // If we increased the limit, try to start more queued tasks
    if (this.config.maxConcurrency > oldMax) {
      this.processQueue();
    }

    this.notifyQueueChange();
  }

  /**
   * Enqueue a new task
   * Returns the task ID
   */
  enqueueTask(
    sessionId: string,
    toolId: ToolId,
    prompt: string,
    priority: number = 0
  ): string {
    const taskId = generateTaskId();

    const task: ParallelTask = {
      id: taskId,
      sessionId,
      toolId,
      state: ExecutionState.QUEUED,
      prompt,
      queuedAt: Date.now(),
      priority
    };

    this.tasks.set(taskId, task);

    // Insert into queue based on priority (higher priority first)
    this.insertIntoQueue(taskId, priority);

    console.log(`[ParallelTaskManager] Task enqueued: ${taskId} (priority: ${priority})`);

    this.notifyTaskUpdate(task);
    this.notifyQueueChange();

    // Try to execute immediately if under limit
    this.processQueue();

    return taskId;
  }

  /**
   * Insert task into queue maintaining priority order
   */
  private insertIntoQueue(taskId: string, priority: number): void {
    const task = this.tasks.get(taskId);
    if (!task) return;

    // Find insertion point (higher priority = earlier in queue)
    let insertIndex = this.queue.length;
    for (let i = 0; i < this.queue.length; i++) {
      const queuedTask = this.tasks.get(this.queue[i]);
      if (queuedTask && queuedTask.priority < priority) {
        insertIndex = i;
        break;
      }
    }

    this.queue.splice(insertIndex, 0, taskId);
  }

  /**
   * Process the queue - start tasks if under concurrency limit
   */
  private processQueue(): void {
    if (!this.config.autoStartQueued) return;

    while (
      this.runningTasks.size < this.config.maxConcurrency &&
      this.queue.length > 0
    ) {
      const taskId = this.queue.shift();
      if (taskId) {
        this.executeTask(taskId);
      }
    }
  }

  /**
   * Execute a task
   */
  private async executeTask(taskId: string): Promise<void> {
    const task = this.tasks.get(taskId);
    if (!task) {
      console.error(`[ParallelTaskManager] Task not found: ${taskId}`);
      return;
    }

    // Update state to running
    task.state = ExecutionState.RUNNING;
    task.startedAt = Date.now();
    this.runningTasks.add(taskId);

    console.log(`[ParallelTaskManager] Starting task: ${taskId}`);

    this.notifyTaskUpdate(task);
    this.notifyQueueChange();

    try {
      // Create isolated CLI instance for this task
      const cli = this.createTaskCLI(task);
      this.cliInstances.set(taskId, cli);

      // Set up progress callback
      cli.setProgressCallback((update: string) => {
        task.progress = update;
        this.notifyTaskUpdate(task);

        // Create message for the session
        if (this.onMessage) {
          const message: Message = {
            id: `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            text: update,
            sender: Sender.AGENT,
            timestamp: Date.now()
          };
          this.onMessage(taskId, message);
        }
      });

      // Set terminal callbacks
      if (this.terminalCallback) {
        cli.setTerminalCallback(this.terminalCallback);
      }
      if (this.terminalCreateCallback) {
        cli.setTerminalCreateCallback(this.terminalCreateCallback);
      }

      // Execute the task
      const result = await cli.sendMessage(
        task.toolId as CLITool,
        task.prompt,
        []  // History would be loaded from session
      );

      // Check if task was cancelled/paused during execution
      const currentTask = this.tasks.get(taskId);
      if (!currentTask || currentTask.state === ExecutionState.CANCELLED) {
        console.log(`[ParallelTaskManager] Task was cancelled: ${taskId}`);
        return;
      }

      if (currentTask.state === ExecutionState.PAUSED) {
        console.log(`[ParallelTaskManager] Task was paused: ${taskId}`);
        return;
      }

      // Task completed successfully
      currentTask.state = ExecutionState.COMPLETED;
      currentTask.completedAt = Date.now();

      console.log(`[ParallelTaskManager] Task completed: ${taskId}`);

      // Create completion message
      if (this.onMessage) {
        const message: Message = {
          id: `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          text: result.content,
          sender: Sender.AGENT,
          timestamp: Date.now()
        };
        this.onMessage(taskId, message);
      }

      this.notifyTaskUpdate(currentTask);

    } catch (error) {
      // Task failed
      const currentTask = this.tasks.get(taskId);
      if (currentTask) {
        currentTask.state = ExecutionState.FAILED;
        currentTask.completedAt = Date.now();
        currentTask.error = error instanceof Error ? error.message : String(error);

        console.error(`[ParallelTaskManager] Task failed: ${taskId}`, error);

        // Create error message
        if (this.onMessage) {
          const message: Message = {
            id: `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            text: `Error: ${currentTask.error}`,
            sender: Sender.AGENT,
            timestamp: Date.now(),
            isError: true
          };
          this.onMessage(taskId, message);
        }

        this.notifyTaskUpdate(currentTask);
      }
    } finally {
      // Cleanup
      this.runningTasks.delete(taskId);
      this.cleanupTask(taskId);
      this.notifyQueueChange();

      // Process queue to start next task
      this.processQueue();
    }
  }

  /**
   * Create an isolated CLI instance for a task
   */
  private createTaskCLI(task: ParallelTask): CLIRouter {
    if (this.baseCLI) {
      // Clone from base CLI to preserve settings
      const cli = this.baseCLI.clone();
      cli.setTaskId(task.id);
      return cli;
    }

    // Create new CLI with defaults
    const cli = new CLIRouter();
    cli.setTaskId(task.id);
    return cli;
  }

  /**
   * Cleanup task resources
   */
  private cleanupTask(taskId: string): void {
    const cli = this.cliInstances.get(taskId);
    if (cli) {
      // Abort any ongoing operations
      cli.abort();
      this.cliInstances.delete(taskId);
    }
  }

  /**
   * Pause a running task
   */
  pauseTask(taskId: string): boolean {
    const task = this.tasks.get(taskId);
    if (!task || task.state !== ExecutionState.RUNNING) {
      return false;
    }

    task.state = ExecutionState.PAUSED;
    this.runningTasks.delete(taskId);
    this.pausedTasks.add(taskId);

    // Abort the CLI instance
    const cli = this.cliInstances.get(taskId);
    if (cli) {
      cli.abort();
    }

    console.log(`[ParallelTaskManager] Task paused: ${taskId}`);

    this.notifyTaskUpdate(task);
    this.notifyQueueChange();

    // Start next queued task
    this.processQueue();

    return true;
  }

  /**
   * Resume a paused task
   */
  resumeTask(taskId: string): boolean {
    const task = this.tasks.get(taskId);
    if (!task || task.state !== ExecutionState.PAUSED) {
      return false;
    }

    this.pausedTasks.delete(taskId);

    // Re-queue the task with same priority (at the front of same priority)
    task.state = ExecutionState.QUEUED;
    this.insertIntoQueue(taskId, task.priority + 0.1);  // Slight bump to be at front

    console.log(`[ParallelTaskManager] Task resumed: ${taskId}`);

    this.notifyTaskUpdate(task);
    this.notifyQueueChange();

    // Try to execute
    this.processQueue();

    return true;
  }

  /**
   * Cancel a task (running, queued, or paused)
   */
  cancelTask(taskId: string): boolean {
    const task = this.tasks.get(taskId);
    if (!task) {
      return false;
    }

    // Remove from any collection
    this.runningTasks.delete(taskId);
    this.pausedTasks.delete(taskId);
    const queueIndex = this.queue.indexOf(taskId);
    if (queueIndex >= 0) {
      this.queue.splice(queueIndex, 1);
    }

    // Update state
    task.state = ExecutionState.CANCELLED;
    task.completedAt = Date.now();

    // Cleanup CLI instance
    this.cleanupTask(taskId);

    console.log(`[ParallelTaskManager] Task cancelled: ${taskId}`);

    this.notifyTaskUpdate(task);
    this.notifyQueueChange();

    // Start next queued task if a running slot was freed
    this.processQueue();

    return true;
  }

  /**
   * Change task priority (reorder in queue)
   */
  setTaskPriority(taskId: string, priority: number): boolean {
    const task = this.tasks.get(taskId);
    if (!task || task.state !== ExecutionState.QUEUED) {
      return false;
    }

    // Remove from current position
    const currentIndex = this.queue.indexOf(taskId);
    if (currentIndex >= 0) {
      this.queue.splice(currentIndex, 1);
    }

    // Update priority and re-insert
    task.priority = priority;
    this.insertIntoQueue(taskId, priority);

    console.log(`[ParallelTaskManager] Task priority changed: ${taskId} -> ${priority}`);

    this.notifyTaskUpdate(task);
    this.notifyQueueChange();

    return true;
  }

  /**
   * Move task up in queue
   */
  moveTaskUp(taskId: string): boolean {
    const task = this.tasks.get(taskId);
    if (!task || task.state !== ExecutionState.QUEUED) {
      return false;
    }

    const index = this.queue.indexOf(taskId);
    if (index <= 0) return false;

    // Swap with previous task's priority + 0.1
    const prevTaskId = this.queue[index - 1];
    const prevTask = this.tasks.get(prevTaskId);
    if (prevTask) {
      return this.setTaskPriority(taskId, prevTask.priority + 0.1);
    }

    return false;
  }

  /**
   * Move task down in queue
   */
  moveTaskDown(taskId: string): boolean {
    const task = this.tasks.get(taskId);
    if (!task || task.state !== ExecutionState.QUEUED) {
      return false;
    }

    const index = this.queue.indexOf(taskId);
    if (index < 0 || index >= this.queue.length - 1) return false;

    // Swap with next task's priority - 0.1
    const nextTaskId = this.queue[index + 1];
    const nextTask = this.tasks.get(nextTaskId);
    if (nextTask) {
      return this.setTaskPriority(taskId, nextTask.priority - 0.1);
    }

    return false;
  }

  /**
   * Get a specific task
   */
  getTask(taskId: string): ParallelTask | undefined {
    return this.tasks.get(taskId);
  }

  /**
   * Get all tasks
   */
  getAllTasks(): ParallelTask[] {
    return Array.from(this.tasks.values());
  }

  /**
   * Get running tasks
   */
  getRunningTasks(): ParallelTask[] {
    return Array.from(this.runningTasks)
      .map(id => this.tasks.get(id))
      .filter((t): t is ParallelTask => t !== undefined);
  }

  /**
   * Get queued tasks (in priority order)
   */
  getQueuedTasks(): ParallelTask[] {
    return this.queue
      .map(id => this.tasks.get(id))
      .filter((t): t is ParallelTask => t !== undefined);
  }

  /**
   * Get paused tasks
   */
  getPausedTasks(): ParallelTask[] {
    return Array.from(this.pausedTasks)
      .map(id => this.tasks.get(id))
      .filter((t): t is ParallelTask => t !== undefined);
  }

  /**
   * Get completed tasks
   */
  getCompletedTasks(): ParallelTask[] {
    return Array.from(this.tasks.values())
      .filter(t => t.state === ExecutionState.COMPLETED || t.state === ExecutionState.FAILED);
  }

  /**
   * Get tasks by session ID
   */
  getTasksBySession(sessionId: string): ParallelTask[] {
    return Array.from(this.tasks.values())
      .filter(t => t.sessionId === sessionId);
  }

  /**
   * Get tasks by tool ID
   */
  getTasksByTool(toolId: ToolId): ParallelTask[] {
    return Array.from(this.tasks.values())
      .filter(t => t.toolId === toolId);
  }

  /**
   * Get queue statistics
   */
  getQueueStats(): QueueStats {
    return {
      running: this.runningTasks.size,
      queued: this.queue.length,
      paused: this.pausedTasks.size,
      completed: this.getCompletedTasks().length,
      maxConcurrency: this.config.maxConcurrency
    };
  }

  /**
   * Check if any task is running for a session
   */
  isSessionBusy(sessionId: string): boolean {
    return Array.from(this.runningTasks).some(taskId => {
      const task = this.tasks.get(taskId);
      return task && task.sessionId === sessionId;
    });
  }

  /**
   * Clear completed/failed/cancelled tasks
   */
  clearFinishedTasks(): void {
    const toRemove: string[] = [];
    for (const [id, task] of this.tasks) {
      if (
        task.state === ExecutionState.COMPLETED ||
        task.state === ExecutionState.FAILED ||
        task.state === ExecutionState.CANCELLED
      ) {
        toRemove.push(id);
      }
    }

    toRemove.forEach(id => this.tasks.delete(id));

    console.log(`[ParallelTaskManager] Cleared ${toRemove.length} finished tasks`);

    this.notifyQueueChange();
  }

  /**
   * Notify task update callback
   */
  private notifyTaskUpdate(task: ParallelTask): void {
    if (this.onTaskUpdate) {
      this.onTaskUpdate({ ...task });
    }
  }

  /**
   * Notify queue change callback
   */
  private notifyQueueChange(): void {
    if (this.onQueueChange) {
      this.onQueueChange(this.getQueueStats());
    }
  }
}

// Export singleton instance (can also create new instances)
export const parallelTaskManager = new ParallelTaskManager();
