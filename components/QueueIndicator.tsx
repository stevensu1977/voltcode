/**
 * QueueIndicator Component (Phase 2.3)
 *
 * A small status indicator showing running/queued task counts.
 * Displayed in the header area to give users visibility into parallel execution.
 */

import React from 'react';
import { Layers, Play, Pause, Clock } from 'lucide-react';
import { QueueStats } from '../types';

interface QueueIndicatorProps {
  stats: QueueStats;
  onClick?: () => void;
}

export const QueueIndicator: React.FC<QueueIndicatorProps> = ({ stats, onClick }) => {
  const hasActivity = stats.running > 0 || stats.queued > 0 || stats.paused > 0;

  if (!hasActivity && stats.completed === 0) {
    return null;  // Don't show when nothing is happening
  }

  return (
    <div
      className={`
        flex items-center gap-2 px-3 py-1.5 rounded-lg
        bg-ide-panel border border-ide-border
        ${onClick ? 'cursor-pointer hover:bg-ide-bg transition-colors' : ''}
      `}
      onClick={onClick}
      title="Click to view Task Board"
    >
      {/* Running indicator */}
      <div className="flex items-center gap-1">
        <span className={stats.running > 0 ? 'text-green-400' : 'text-ide-text'}>
          {stats.running}
        </span>
        <span className="text-ide-text/50">/</span>
        <span className="text-ide-text">{stats.maxConcurrency}</span>
        <Layers size={14} className="text-ide-text ml-0.5" />
      </div>

      {/* Queued indicator */}
      {stats.queued > 0 && (
        <div className="flex items-center gap-1 text-yellow-400">
          <Clock size={12} className="animate-spin" style={{ animationDuration: '3s' }} />
          <span className="text-xs">+{stats.queued}</span>
        </div>
      )}

      {/* Paused indicator */}
      {stats.paused > 0 && (
        <div className="flex items-center gap-1 text-orange-400">
          <Pause size={12} />
          <span className="text-xs">{stats.paused}</span>
        </div>
      )}

      {/* Running animation */}
      {stats.running > 0 && (
        <div className="relative flex items-center justify-center w-2 h-2">
          <div className="absolute w-2 h-2 bg-green-400 rounded-full animate-ping opacity-75" />
          <div className="absolute w-1.5 h-1.5 bg-green-400 rounded-full" />
        </div>
      )}
    </div>
  );
};

/**
 * Compact version for tighter spaces
 */
export const QueueIndicatorCompact: React.FC<QueueIndicatorProps> = ({ stats, onClick }) => {
  if (stats.running === 0 && stats.queued === 0) {
    return null;
  }

  return (
    <div
      className={`
        flex items-center gap-1.5 px-2 py-1 rounded
        bg-ide-bg/50 text-xs
        ${onClick ? 'cursor-pointer hover:bg-ide-bg transition-colors' : ''}
      `}
      onClick={onClick}
      title={`Running: ${stats.running}/${stats.maxConcurrency}, Queued: ${stats.queued}`}
    >
      {stats.running > 0 && (
        <>
          <Play size={10} className="text-green-400 fill-green-400" />
          <span className="text-green-400">{stats.running}</span>
        </>
      )}
      {stats.queued > 0 && (
        <>
          <Clock size={10} className="text-yellow-400" />
          <span className="text-yellow-400">{stats.queued}</span>
        </>
      )}
    </div>
  );
};

export default QueueIndicator;
