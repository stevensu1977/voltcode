/**
 * TaskCard Component (Phase 2.1)
 *
 * Individual task card for the Kanban board.
 * Shows title, agent, elapsed time, progress, and quick actions.
 */

import React, { useState, useEffect } from 'react';
import { Sun, Sparkles, Terminal, Play, Pause, CheckCircle } from 'lucide-react';
import { ToolId, ChatSession, TaskStatus, isTaskSession } from '../types';
import { getTaskElapsedTime, getTaskStats } from '../services/taskStore';
import { formatTimeCompact } from '../services/todoParser';

// Kiro Icon Component
const KiroIcon = ({ size = 24, className }: { size?: number | string; className?: string }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width={size}
    height={size}
    viewBox="0 0 20 24"
    fill="none"
    className={className}
  >
    <path d="M3.80081 18.5661C1.32306 24.0572 6.59904 25.434 10.4904 22.2205C11.6339 25.8242 15.926 23.1361 17.4652 20.3445C20.8578 14.1915 19.4877 7.91459 19.1361 6.61988C16.7244 -2.20972 4.67055 -2.21852 2.59581 6.6649C2.11136 8.21946 2.10284 9.98752 1.82846 11.8233C1.69011 12.749 1.59258 13.3398 1.23436 14.3135C1.02841 14.8733 0.745043 15.3704 0.299833 16.2082C-0.391594 17.5095 -0.0998802 20.021 3.46397 18.7186V18.7195L3.80081 18.5661Z" fill="currentColor" />
    <path d="M10.9614 10.4413C9.97202 10.4413 9.82422 9.25893 9.82422 8.55407C9.82422 7.91791 9.93824 7.4124 10.1542 7.09197C10.3441 6.81003 10.6158 6.66699 10.9614 6.66699C11.3071 6.66699 11.6036 6.81228 11.8128 7.09892C12.0511 7.42554 12.177 7.92861 12.177 8.55407C12.177 9.73591 11.7226 10.4413 10.9616 10.4413H10.9614Z" fill="currentColor" />
    <path d="M15.0318 10.4413C14.0423 10.4413 13.8945 9.25893 13.8945 8.55407C13.8945 7.91791 14.0086 7.4124 14.2245 7.09197C14.4144 6.81003 14.6861 6.66699 15.0318 6.66699C15.3774 6.66699 15.6739 6.81228 15.8831 7.09892C16.1214 7.42554 16.2474 7.92861 16.2474 8.55407C16.2474 9.73591 15.793 10.4413 15.0319 10.4413H15.0318Z" fill="currentColor" />
  </svg>
);

// Agent icons and colors mapping
const AGENT_INFO: Record<ToolId, { icon: React.ReactNode; color: string; name: string }> = {
  claude: { icon: <Sun size={12} />, color: 'text-orange-500', name: 'Claude' },
  gemini: { icon: <Sparkles size={12} />, color: 'text-blue-400', name: 'Gemini' },
  codex: { icon: <Terminal size={12} />, color: 'text-purple-400', name: 'Codex' },
  kiro: { icon: <KiroIcon size={12} />, color: 'text-emerald-400', name: 'Kiro' },
};

interface TaskCardProps {
  toolId: ToolId;
  session: ChatSession;
  onNavigate: () => void;
  onUpdateStatus: (status: TaskStatus) => void;
}

export const TaskCard: React.FC<TaskCardProps> = ({
  toolId,
  session,
  onNavigate,
  onUpdateStatus
}) => {
  const [isHovered, setIsHovered] = useState(false);
  const [elapsedTime, setElapsedTime] = useState(0);

  // Type guard check
  if (!isTaskSession(session)) return null;

  const task = session.task;
  const stats = getTaskStats(session);
  const agent = AGENT_INFO[toolId];

  // Update elapsed time for in-progress tasks
  useEffect(() => {
    if (task.status !== TaskStatus.IN_PROGRESS) {
      setElapsedTime(getTaskElapsedTime(session));
      return;
    }

    const updateTime = () => setElapsedTime(getTaskElapsedTime(session));
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, [session, task.status, task.lastResumedAt]);

  return (
    <div
      className="bg-ide-panel rounded-lg border border-ide-border hover:border-ide-accent/50
                 cursor-pointer transition-all duration-200 group"
      onClick={onNavigate}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Card Content */}
      <div className="p-3">
        {/* Header: Title and Agent Badge */}
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-medium text-sm text-ide-textLight line-clamp-2 flex-1">
            {session.title}
          </h3>
          {/* Agent Badge */}
          <div className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-xs ${agent.color} bg-white/5 flex-shrink-0`}>
            {agent.icon}
          </div>
        </div>

        {/* Progress Bar */}
        {stats.totalItems > 0 && (
          <div className="mt-3">
            <div className="flex justify-between text-xs text-ide-text mb-1">
              <span>Progress</span>
              <span>{stats.completedItems}/{stats.totalItems}</span>
            </div>
            <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-blue-500 to-purple-500 transition-all duration-300"
                style={{ width: `${stats.progress}%` }}
              />
            </div>
          </div>
        )}

        {/* Footer: Time & Quick Actions */}
        <div className="mt-3 flex items-center justify-between">
          <div className="text-xs text-ide-text font-mono">
            {formatTimeCompact(elapsedTime)}
          </div>

          {/* Quick Actions (show on hover) */}
          <div className={`flex items-center gap-1 transition-opacity ${isHovered ? 'opacity-100' : 'opacity-0'}`}>
            {task.status === TaskStatus.IN_PROGRESS && (
              <button
                onClick={(e) => { e.stopPropagation(); onUpdateStatus(TaskStatus.PAUSED); }}
                className="p-1 rounded hover:bg-yellow-500/20 text-yellow-400"
                title="Pause"
              >
                <Pause size={12} />
              </button>
            )}
            {task.status === TaskStatus.PAUSED && (
              <button
                onClick={(e) => { e.stopPropagation(); onUpdateStatus(TaskStatus.IN_PROGRESS); }}
                className="p-1 rounded hover:bg-blue-500/20 text-blue-400"
                title="Resume"
              >
                <Play size={12} />
              </button>
            )}
            {task.status !== TaskStatus.COMPLETED && (
              <button
                onClick={(e) => { e.stopPropagation(); onUpdateStatus(TaskStatus.COMPLETED); }}
                className="p-1 rounded hover:bg-green-500/20 text-green-400"
                title="Complete"
              >
                <CheckCircle size={12} />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default TaskCard;
