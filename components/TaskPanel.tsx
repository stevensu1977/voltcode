/**
 * TaskPanel Component (Phase 2.1 + 2.3)
 *
 * Main Kanban-style task board showing all tasks across all agents.
 * Includes parallel task execution columns (Running, Queued).
 */

import React, { useMemo } from 'react';
import { ListTodo, Clock, Pause, CheckCircle, Play, Layers, X, ArrowUp, ArrowDown } from 'lucide-react';
import { ToolId, ToolChatHistory, TaskStatus, isTaskSession, ParallelTask, ExecutionState, QueueStats } from '../types';
import { getAllTaskSessions } from '../services/sessionStore';
import TaskColumn from './TaskColumn';

interface TaskPanelProps {
  toolHistory: Record<ToolId, ToolChatHistory>;
  onNavigateToTask: (toolId: ToolId, sessionId: string) => void;
  onUpdateTaskStatus: (toolId: ToolId, sessionId: string, status: TaskStatus) => void;
  // Phase 2.3: Parallel task props
  parallelTasks?: {
    running: ParallelTask[];
    queued: ParallelTask[];
    paused: ParallelTask[];
  };
  queueStats?: QueueStats;
  onPauseParallelTask?: (taskId: string) => void;
  onResumeParallelTask?: (taskId: string) => void;
  onCancelParallelTask?: (taskId: string) => void;
  onMoveTaskUp?: (taskId: string) => void;
  onMoveTaskDown?: (taskId: string) => void;
}

export const TaskPanel: React.FC<TaskPanelProps> = ({
  toolHistory,
  onNavigateToTask,
  onUpdateTaskStatus,
  parallelTasks,
  queueStats,
  onPauseParallelTask,
  onResumeParallelTask,
  onCancelParallelTask,
  onMoveTaskUp,
  onMoveTaskDown
}) => {
  // Get all tasks and organize by status
  const allTasks = useMemo(() => getAllTaskSessions(toolHistory), [toolHistory]);

  const tasksByStatus = useMemo(() => ({
    [TaskStatus.IN_PROGRESS]: allTasks.filter(
      t => isTaskSession(t.session) && t.session.task.status === TaskStatus.IN_PROGRESS
    ),
    [TaskStatus.PAUSED]: allTasks.filter(
      t => isTaskSession(t.session) && t.session.task.status === TaskStatus.PAUSED
    ),
    [TaskStatus.COMPLETED]: allTasks.filter(
      t => isTaskSession(t.session) && t.session.task.status === TaskStatus.COMPLETED
    ),
  }), [allTasks]);

  // Calculate statistics including parallel tasks
  const stats = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayMs = today.getTime();

    // Count tasks completed today (based on when any item was completed today)
    const completedToday = tasksByStatus[TaskStatus.COMPLETED].filter(t => {
      if (!isTaskSession(t.session)) return false;
      // Consider a task "completed today" if it was updated today
      return t.session.updatedAt >= todayMs;
    }).length;

    return {
      total: allTasks.length + (queueStats?.running || 0) + (queueStats?.queued || 0),
      active: tasksByStatus[TaskStatus.IN_PROGRESS].length,
      paused: tasksByStatus[TaskStatus.PAUSED].length,
      completed: tasksByStatus[TaskStatus.COMPLETED].length,
      completedToday,
      // Parallel task stats
      running: queueStats?.running || 0,
      queued: queueStats?.queued || 0,
      maxConcurrency: queueStats?.maxConcurrency || 3
    };
  }, [allTasks, tasksByStatus, queueStats]);

  // Check if we have parallel tasks
  const hasParallelTasks = parallelTasks && (
    parallelTasks.running.length > 0 ||
    parallelTasks.queued.length > 0 ||
    parallelTasks.paused.length > 0
  );

  return (
    <div className="h-full flex flex-col">
      {/* Header with Statistics */}
      <div className="p-4 border-b border-ide-border bg-ide-panel">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ListTodo size={20} className="text-ide-accent" />
            <h2 className="text-lg font-semibold text-ide-textLight">Task Board</h2>
          </div>
          <div className="flex items-center gap-4 text-sm">
            <StatBadge icon={<ListTodo size={14} />} value={stats.total} label="Total" />
            {/* Parallel execution stats */}
            {queueStats && (
              <div className="flex items-center gap-1 px-2 py-1 bg-ide-bg rounded-lg">
                <Play size={12} className="text-green-400" />
                <span className="text-green-400 font-medium">{stats.running}</span>
                <span className="text-ide-text/50">/</span>
                <span className="text-ide-text">{stats.maxConcurrency}</span>
                {stats.queued > 0 && (
                  <>
                    <span className="text-ide-text/50 mx-1">|</span>
                    <Clock size={12} className="text-yellow-400" />
                    <span className="text-yellow-400">{stats.queued}</span>
                  </>
                )}
              </div>
            )}
            <StatBadge icon={<Clock size={14} />} value={stats.active} label="Active" color="text-blue-400" />
            <StatBadge icon={<Pause size={14} />} value={stats.paused} label="Paused" color="text-yellow-400" />
            <StatBadge icon={<CheckCircle size={14} />} value={stats.completedToday} label="Today" color="text-green-400" />
          </div>
        </div>
      </div>

      {/* Kanban Columns */}
      <div className="flex-1 overflow-auto p-4">
        {allTasks.length === 0 && !hasParallelTasks ? (
          <EmptyState />
        ) : (
          <div className="space-y-6">
            {/* Parallel Execution Section */}
            {hasParallelTasks && (
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-sm text-ide-textLight">
                  <Layers size={16} className="text-ide-accent" />
                  <span className="font-medium">Parallel Execution</span>
                </div>
                <div className="grid grid-cols-3 gap-4">
                  {/* Running Column */}
                  <ParallelTaskColumn
                    title="Running"
                    tasks={parallelTasks?.running || []}
                    icon={<Play size={16} className="text-green-400" />}
                    colorClass="border-green-500/30 bg-green-500/5"
                    onPause={onPauseParallelTask}
                    onCancel={onCancelParallelTask}
                  />
                  {/* Queued Column */}
                  <ParallelTaskColumn
                    title="Queued"
                    tasks={parallelTasks?.queued || []}
                    icon={<Clock size={16} className="text-yellow-400" />}
                    colorClass="border-yellow-500/30 bg-yellow-500/5"
                    isQueued
                    onMoveUp={onMoveTaskUp}
                    onMoveDown={onMoveTaskDown}
                    onCancel={onCancelParallelTask}
                  />
                  {/* Parallel Paused Column */}
                  <ParallelTaskColumn
                    title="Paused"
                    tasks={parallelTasks?.paused || []}
                    icon={<Pause size={16} className="text-orange-400" />}
                    colorClass="border-orange-500/30 bg-orange-500/5"
                    onResume={onResumeParallelTask}
                    onCancel={onCancelParallelTask}
                  />
                </div>
              </div>
            )}

            {/* Session Tasks Section */}
            {allTasks.length > 0 && (
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-sm text-ide-textLight">
                  <ListTodo size={16} className="text-ide-accent" />
                  <span className="font-medium">Session Tasks</span>
                </div>
                <div className="grid grid-cols-3 gap-4 min-h-[400px]">
                  <TaskColumn
                    status={TaskStatus.IN_PROGRESS}
                    title="In Progress"
                    tasks={tasksByStatus[TaskStatus.IN_PROGRESS]}
                    onNavigateToTask={onNavigateToTask}
                    onUpdateTaskStatus={onUpdateTaskStatus}
                  />
                  <TaskColumn
                    status={TaskStatus.PAUSED}
                    title="Paused"
                    tasks={tasksByStatus[TaskStatus.PAUSED]}
                    onNavigateToTask={onNavigateToTask}
                    onUpdateTaskStatus={onUpdateTaskStatus}
                  />
                  <TaskColumn
                    status={TaskStatus.COMPLETED}
                    title="Completed"
                    tasks={tasksByStatus[TaskStatus.COMPLETED]}
                    onNavigateToTask={onNavigateToTask}
                    onUpdateTaskStatus={onUpdateTaskStatus}
                  />
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

// Statistics badge component
const StatBadge: React.FC<{
  icon: React.ReactNode;
  value: number;
  label: string;
  color?: string;
}> = ({ icon, value, label, color = 'text-ide-text' }) => (
  <div className="flex items-center gap-1.5">
    <span className={color}>{icon}</span>
    <span className="font-medium text-ide-textLight">{value}</span>
    <span className="text-ide-text">{label}</span>
  </div>
);

// Empty state when no tasks exist
const EmptyState: React.FC = () => (
  <div className="h-full flex flex-col items-center justify-center text-center">
    <ListTodo size={48} className="text-ide-text/20 mb-4" />
    <h3 className="text-lg font-medium text-ide-textLight mb-2">No Tasks Yet</h3>
    <p className="text-sm text-ide-text max-w-md">
      Create a task using the <code className="bg-white/10 px-1.5 py-0.5 rounded text-xs">/task create</code> command in the chat to get started.
    </p>
  </div>
);

// ============================================
// Parallel Task Components (Phase 2.3)
// ============================================

interface ParallelTaskColumnProps {
  title: string;
  tasks: ParallelTask[];
  icon: React.ReactNode;
  colorClass: string;
  isQueued?: boolean;
  onPause?: (taskId: string) => void;
  onResume?: (taskId: string) => void;
  onCancel?: (taskId: string) => void;
  onMoveUp?: (taskId: string) => void;
  onMoveDown?: (taskId: string) => void;
}

const ParallelTaskColumn: React.FC<ParallelTaskColumnProps> = ({
  title,
  tasks,
  icon,
  colorClass,
  isQueued,
  onPause,
  onResume,
  onCancel,
  onMoveUp,
  onMoveDown
}) => (
  <div className={`flex flex-col rounded-xl border ${colorClass} min-h-[200px]`}>
    {/* Column Header */}
    <div className="p-3 border-b border-ide-border/50 flex items-center justify-between">
      <div className="flex items-center gap-2">
        {icon}
        <span className="font-medium text-ide-textLight">{title}</span>
      </div>
      <span className="px-2 py-0.5 text-xs rounded-full bg-white/10 text-ide-text">
        {tasks.length}
      </span>
    </div>

    {/* Cards Container */}
    <div className="flex-1 p-2 overflow-y-auto space-y-2">
      {tasks.length === 0 ? (
        <div className="flex items-center justify-center h-20 text-sm text-ide-text/50">
          No {title.toLowerCase()} tasks
        </div>
      ) : (
        tasks.map((task, index) => (
          <ParallelTaskCard
            key={task.id}
            task={task}
            index={index}
            totalTasks={tasks.length}
            isQueued={isQueued}
            onPause={onPause}
            onResume={onResume}
            onCancel={onCancel}
            onMoveUp={onMoveUp}
            onMoveDown={onMoveDown}
          />
        ))
      )}
    </div>
  </div>
);

interface ParallelTaskCardProps {
  task: ParallelTask;
  index: number;
  totalTasks: number;
  isQueued?: boolean;
  onPause?: (taskId: string) => void;
  onResume?: (taskId: string) => void;
  onCancel?: (taskId: string) => void;
  onMoveUp?: (taskId: string) => void;
  onMoveDown?: (taskId: string) => void;
}

const ParallelTaskCard: React.FC<ParallelTaskCardProps> = ({
  task,
  index,
  totalTasks,
  isQueued,
  onPause,
  onResume,
  onCancel,
  onMoveUp,
  onMoveDown
}) => {
  // Get tool color
  const getToolColor = (toolId: ToolId): string => {
    switch (toolId) {
      case 'claude': return 'text-orange-400';
      case 'gemini': return 'text-blue-400';
      case 'codex': return 'text-purple-400';
      case 'kiro': return 'text-emerald-400';
      default: return 'text-ide-text';
    }
  };

  // Calculate elapsed time
  const getElapsedTime = (): string => {
    const start = task.startedAt || task.queuedAt;
    const elapsed = Date.now() - start;
    const seconds = Math.floor(elapsed / 1000);
    const minutes = Math.floor(seconds / 60);
    if (minutes > 0) {
      return `${minutes}:${String(seconds % 60).padStart(2, '0')}`;
    }
    return `${seconds}s`;
  };

  return (
    <div className="bg-ide-bg/50 rounded-lg p-3 group hover:bg-ide-bg transition-colors">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          {/* Queue position for queued tasks */}
          {isQueued && (
            <span className="text-xs text-yellow-400 font-mono">#{index + 1}</span>
          )}
          {/* Task prompt (truncated) */}
          <p className="text-sm text-ide-textLight truncate">
            {task.prompt.length > 50 ? task.prompt.substring(0, 50) + '...' : task.prompt}
          </p>
          {/* Tool and time */}
          <div className="flex items-center gap-2 mt-1 text-xs">
            <span className={`font-medium ${getToolColor(task.toolId)}`}>
              {task.toolId}
            </span>
            <span className="text-ide-text/50">{getElapsedTime()}</span>
            {task.progress && (
              <span className="text-ide-text/70 truncate max-w-[100px]">{task.progress}</span>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          {/* Queue reorder buttons */}
          {isQueued && (
            <>
              {index > 0 && onMoveUp && (
                <button
                  onClick={() => onMoveUp(task.id)}
                  className="p-1 hover:bg-white/10 rounded text-ide-text hover:text-white"
                  title="Move up"
                >
                  <ArrowUp size={14} />
                </button>
              )}
              {index < totalTasks - 1 && onMoveDown && (
                <button
                  onClick={() => onMoveDown(task.id)}
                  className="p-1 hover:bg-white/10 rounded text-ide-text hover:text-white"
                  title="Move down"
                >
                  <ArrowDown size={14} />
                </button>
              )}
            </>
          )}
          {/* Pause button (for running tasks) */}
          {task.state === ExecutionState.RUNNING && onPause && (
            <button
              onClick={() => onPause(task.id)}
              className="p-1 hover:bg-yellow-500/20 rounded text-ide-text hover:text-yellow-400"
              title="Pause"
            >
              <Pause size={14} />
            </button>
          )}
          {/* Resume button (for paused tasks) */}
          {task.state === ExecutionState.PAUSED && onResume && (
            <button
              onClick={() => onResume(task.id)}
              className="p-1 hover:bg-green-500/20 rounded text-ide-text hover:text-green-400"
              title="Resume"
            >
              <Play size={14} />
            </button>
          )}
          {/* Cancel button */}
          {onCancel && (
            <button
              onClick={() => onCancel(task.id)}
              className="p-1 hover:bg-red-500/20 rounded text-ide-text hover:text-red-400"
              title="Cancel"
            >
              <X size={14} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default TaskPanel;
