import React, { useEffect, useState } from 'react';
import { Play, Pause, CheckCircle, Clock, ListTodo, ChevronDown, ChevronUp } from 'lucide-react';
import { ChatSession, TaskStatus, isTaskSession, TaskItem } from '../types';
import { formatTimeCompact, getStatusEmoji, getStatusText } from '../services/todoParser';
import { getTaskElapsedTime, getTaskStats } from '../services/taskStore';

interface TaskHeaderProps {
  session: ChatSession;
  onPause: () => void;
  onResume: () => void;
  onComplete: () => void;
  onToggleItem: (itemId: string) => void;
}

export const TaskHeader: React.FC<TaskHeaderProps> = ({
  session,
  onPause,
  onResume,
  onComplete,
  onToggleItem,
}) => {
  const [elapsedTime, setElapsedTime] = useState(0);
  const [isExpanded, setIsExpanded] = useState(false);

  // Only render if this is a task session
  if (!isTaskSession(session)) {
    return null;
  }

  const task = session.task;
  const stats = getTaskStats(session);

  // Update elapsed time every second when in progress
  useEffect(() => {
    if (task.status !== TaskStatus.IN_PROGRESS) {
      setElapsedTime(getTaskElapsedTime(session));
      return;
    }

    const updateTime = () => {
      setElapsedTime(getTaskElapsedTime(session));
    };

    updateTime();
    const interval = setInterval(updateTime, 1000);

    return () => clearInterval(interval);
  }, [session, task.status, task.lastResumedAt]);

  const statusEmoji = getStatusEmoji(task.status);
  const statusText = getStatusText(task.status);
  const timeDisplay = formatTimeCompact(elapsedTime);

  // Progress bar
  const progressPercent = stats.totalItems > 0
    ? Math.round((stats.completedItems / stats.totalItems) * 100)
    : 0;

  return (
    <div className="bg-gradient-to-r from-blue-900/30 to-purple-900/30 border-b border-white/10">
      {/* Main header row */}
      <div className="px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          {/* Task icon and title */}
          <div className="flex items-center gap-2">
            <span className="text-lg">{statusEmoji}</span>
            <span className="font-medium text-white">{session.title}</span>
          </div>

          {/* Status badge */}
          <span className={`text-xs px-2 py-0.5 rounded-full ${
            task.status === TaskStatus.IN_PROGRESS
              ? 'bg-blue-500/20 text-blue-400'
              : task.status === TaskStatus.PAUSED
              ? 'bg-yellow-500/20 text-yellow-400'
              : 'bg-green-500/20 text-green-400'
          }`}>
            {statusText}
          </span>
        </div>

        <div className="flex items-center gap-4">
          {/* Timer display */}
          <div className="flex items-center gap-1.5 text-sm text-white/80 font-mono">
            <Clock size={14} className={task.status === TaskStatus.IN_PROGRESS ? 'text-blue-400' : 'text-white/50'} />
            <span>{timeDisplay}</span>
          </div>

          {/* Progress indicator */}
          {stats.totalItems > 0 && (
            <div className="flex items-center gap-2">
              <div className="w-20 h-1.5 bg-white/10 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-blue-500 to-purple-500 transition-all duration-300"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
              <span className="text-xs text-white/60">
                {stats.completedItems}/{stats.totalItems}
              </span>
            </div>
          )}

          {/* Action buttons */}
          <div className="flex items-center gap-2">
            {task.status === TaskStatus.IN_PROGRESS && (
              <button
                onClick={onPause}
                className="flex items-center gap-1 px-2 py-1 text-xs bg-yellow-500/20 text-yellow-400 rounded hover:bg-yellow-500/30 transition-colors"
                title="Pause timer"
              >
                <Pause size={12} />
                <span>Pause</span>
              </button>
            )}

            {task.status === TaskStatus.PAUSED && (
              <button
                onClick={onResume}
                className="flex items-center gap-1 px-2 py-1 text-xs bg-blue-500/20 text-blue-400 rounded hover:bg-blue-500/30 transition-colors"
                title="Resume timer"
              >
                <Play size={12} />
                <span>Resume</span>
              </button>
            )}

            {task.status !== TaskStatus.COMPLETED && (
              <button
                onClick={onComplete}
                className="flex items-center gap-1 px-2 py-1 text-xs bg-green-500/20 text-green-400 rounded hover:bg-green-500/30 transition-colors"
                title="Mark complete"
              >
                <CheckCircle size={12} />
                <span>Done</span>
              </button>
            )}

            {/* Expand/collapse TODO items */}
            {task.items.length > 0 && (
              <button
                onClick={() => setIsExpanded(!isExpanded)}
                className="flex items-center gap-1 px-2 py-1 text-xs bg-white/10 text-white/70 rounded hover:bg-white/20 transition-colors"
                title={isExpanded ? 'Hide TODO items' : 'Show TODO items'}
              >
                <ListTodo size={12} />
                {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Expandable TODO items */}
      {isExpanded && task.items.length > 0 && (
        <div className="px-4 pb-3 border-t border-white/5 pt-2">
          <div className="flex flex-wrap gap-2">
            {task.items.map((item, index) => (
              <TodoItemBadge
                key={item.id}
                item={item}
                index={index + 1}
                onToggle={() => onToggleItem(item.id)}
                disabled={task.status === TaskStatus.COMPLETED}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

// Individual TODO item badge
const TodoItemBadge: React.FC<{
  item: TaskItem;
  index: number;
  onToggle: () => void;
  disabled: boolean;
}> = ({ item, index, onToggle, disabled }) => {
  return (
    <button
      onClick={onToggle}
      disabled={disabled}
      className={`flex items-center gap-1.5 px-2 py-1 text-xs rounded transition-all ${
        item.completed
          ? 'bg-green-500/20 text-green-400 line-through opacity-70'
          : 'bg-white/10 text-white/80 hover:bg-white/20'
      } ${disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}
      title={item.completed ? 'Completed' : 'Click to complete'}
    >
      <span className={`w-4 h-4 flex items-center justify-center rounded border text-[10px] font-bold ${
        item.completed
          ? 'border-green-500/50 bg-green-500/20 text-green-400'
          : 'border-white/30'
      }`}>
        {item.completed ? '✓' : index}
      </span>
      <span className="max-w-[200px] truncate">{item.title}</span>
    </button>
  );
};

export default TaskHeader;
