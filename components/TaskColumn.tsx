/**
 * TaskColumn Component (Phase 2.1)
 *
 * A single Kanban column displaying tasks with a specific status.
 */

import React from 'react';
import { Clock, Pause, CheckCircle } from 'lucide-react';
import { ToolId, ChatSession, TaskStatus } from '../types';
import TaskCard from './TaskCard';

interface TaskColumnProps {
  status: TaskStatus;
  title: string;
  tasks: Array<{ toolId: ToolId; session: ChatSession }>;
  onNavigateToTask: (toolId: ToolId, sessionId: string) => void;
  onUpdateTaskStatus: (toolId: ToolId, sessionId: string, status: TaskStatus) => void;
}

export const TaskColumn: React.FC<TaskColumnProps> = ({
  status,
  title,
  tasks,
  onNavigateToTask,
  onUpdateTaskStatus
}) => {
  const getStatusIcon = () => {
    switch (status) {
      case TaskStatus.IN_PROGRESS:
        return <Clock size={16} className="text-blue-400" />;
      case TaskStatus.PAUSED:
        return <Pause size={16} className="text-yellow-400" />;
      case TaskStatus.COMPLETED:
        return <CheckCircle size={16} className="text-green-400" />;
    }
  };

  const getColumnStyle = () => {
    switch (status) {
      case TaskStatus.IN_PROGRESS:
        return 'border-blue-500/30 bg-blue-500/5';
      case TaskStatus.PAUSED:
        return 'border-yellow-500/30 bg-yellow-500/5';
      case TaskStatus.COMPLETED:
        return 'border-green-500/30 bg-green-500/5';
    }
  };

  return (
    <div className={`flex flex-col rounded-xl border ${getColumnStyle()} min-h-[400px]`}>
      {/* Column Header */}
      <div className="p-3 border-b border-ide-border/50 flex items-center justify-between">
        <div className="flex items-center gap-2">
          {getStatusIcon()}
          <span className="font-medium text-ide-textLight">{title}</span>
        </div>
        <span className="px-2 py-0.5 text-xs rounded-full bg-white/10 text-ide-text">
          {tasks.length}
        </span>
      </div>

      {/* Cards Container */}
      <div className="flex-1 p-2 overflow-y-auto space-y-2">
        {tasks.length === 0 ? (
          <div className="flex items-center justify-center h-32 text-sm text-ide-text/50">
            No {title.toLowerCase()} tasks
          </div>
        ) : (
          tasks.map(({ toolId, session }) => (
            <TaskCard
              key={session.id}
              toolId={toolId}
              session={session}
              onNavigate={() => onNavigateToTask(toolId, session.id)}
              onUpdateStatus={(newStatus) => onUpdateTaskStatus(toolId, session.id, newStatus)}
            />
          ))
        )}
      </div>
    </div>
  );
};

export default TaskColumn;
