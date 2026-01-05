/**
 * Agent Switch Dialog (Phase 1.3)
 *
 * Dialog for confirming agent switches with context transfer options.
 */

import React, { useState, useMemo } from 'react';
import { X, ArrowRight, Lightbulb, MessageSquare, FileText, Sparkles } from 'lucide-react';
import { ToolId, ContextTransferMode, Message, Sender } from '../types';
import { AGENT_CAPABILITIES, getAgentName, getAgentStrengths, analyzeAndRecommend } from '../services/agentAnalyzer';

interface AgentSwitchDialogProps {
  isOpen: boolean;
  onClose: () => void;
  currentTool: ToolId;
  targetTool: ToolId;
  messages: Message[];
  onConfirm: (transferMode: ContextTransferMode, messageCount?: number) => void;
  isGeneratingSummary?: boolean;
}

// Message count options for copy mode
const MESSAGE_COUNT_OPTIONS = [5, 10, 20, 50];

export const AgentSwitchDialog: React.FC<AgentSwitchDialogProps> = ({
  isOpen,
  onClose,
  currentTool,
  targetTool,
  messages,
  onConfirm,
  isGeneratingSummary = false,
}) => {
  const [transferMode, setTransferMode] = useState<ContextTransferMode>('new');
  const [messageCount, setMessageCount] = useState(10);

  // Analyze conversation for recommendations
  const recommendation = useMemo(() => {
    return analyzeAndRecommend(messages, currentTool);
  }, [messages, currentTool]);

  const currentToolName = getAgentName(currentTool);
  const targetToolName = getAgentName(targetTool);
  const targetStrengths = getAgentStrengths(targetTool);

  // Check if target matches recommendation
  const isRecommended = recommendation?.recommended === targetTool;

  // Count user messages (for display)
  const userMessageCount = messages.filter(m => m.sender === Sender.USER).length;

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-[480px] bg-[#141414] rounded-xl border border-ide-border shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="h-14 border-b border-ide-border flex items-center justify-between px-5">
          <div className="flex items-center gap-2">
            <ArrowRight size={18} className="text-ide-accent" />
            <h3 className="font-medium text-white">Switch to {targetToolName}</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-white/10 rounded-full text-gray-400 hover:text-white transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-4">
          {/* AI Recommendation Badge */}
          {isRecommended && recommendation && (
            <div className="bg-gradient-to-r from-blue-500/10 to-purple-500/10 border border-blue-500/30 rounded-lg p-3">
              <div className="flex items-start gap-2">
                <Lightbulb size={16} className="text-yellow-400 mt-0.5 flex-shrink-0" />
                <div>
                  <span className="text-sm text-blue-300 font-medium">AI Recommended</span>
                  <p className="text-xs text-gray-400 mt-0.5">{recommendation.reason}</p>
                </div>
              </div>
            </div>
          )}

          {/* Target Agent Info */}
          <div className="bg-[#1a1a1a] border border-ide-border rounded-lg p-4">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-500/20 to-purple-500/20 flex items-center justify-center">
                <Sparkles size={20} className="text-blue-400" />
              </div>
              <div>
                <span className="font-medium text-gray-200">{targetToolName}</span>
                <p className="text-xs text-gray-500">
                  {targetStrengths.slice(0, 2).join(' • ')}
                </p>
              </div>
            </div>
          </div>

          {/* Current Session Info */}
          {messages.length > 0 && (
            <div className="flex items-center gap-2 text-sm text-gray-400">
              <MessageSquare size={14} />
              <span>Current session: {messages.length} messages ({userMessageCount} from you)</span>
            </div>
          )}

          {/* Context Transfer Options */}
          <div className="space-y-2">
            <span className="text-xs text-gray-500 uppercase tracking-wide">Context Transfer</span>

            {/* Option 1: New Conversation */}
            <TransferOption
              selected={transferMode === 'new'}
              onClick={() => setTransferMode('new')}
              title="Start fresh"
              description="Begin a new conversation without any context"
              icon={<Sparkles size={16} />}
            />

            {/* Option 2: Copy Messages */}
            <TransferOption
              selected={transferMode === 'copy'}
              onClick={() => setTransferMode('copy')}
              title="Copy recent messages"
              description={`Transfer the last ${messageCount} messages to the new session`}
              icon={<MessageSquare size={16} />}
              disabled={messages.length === 0}
            >
              {transferMode === 'copy' && (
                <div className="mt-3 flex items-center gap-2">
                  <span className="text-xs text-gray-500">Messages:</span>
                  <div className="flex gap-1">
                    {MESSAGE_COUNT_OPTIONS.map((count) => (
                      <button
                        key={count}
                        onClick={(e) => {
                          e.stopPropagation();
                          setMessageCount(count);
                        }}
                        className={`px-2 py-0.5 text-xs rounded transition-colors ${
                          messageCount === count
                            ? 'bg-blue-500/30 text-blue-300 border border-blue-500/50'
                            : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                        }`}
                      >
                        {count}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </TransferOption>

            {/* Option 3: Generate Summary */}
            <TransferOption
              selected={transferMode === 'summary'}
              onClick={() => setTransferMode('summary')}
              title="Generate summary"
              description={`Let ${currentToolName} summarize the conversation first`}
              icon={<FileText size={16} />}
              disabled={messages.length < 3}
            />
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-ide-border p-4 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 bg-gray-800 hover:bg-gray-700 rounded-lg text-sm text-gray-300 transition-colors"
            disabled={isGeneratingSummary}
          >
            Cancel
          </button>
          <button
            onClick={() => onConfirm(transferMode, transferMode === 'copy' ? messageCount : undefined)}
            disabled={isGeneratingSummary}
            className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-600/50 rounded-lg text-sm text-white transition-colors flex items-center justify-center gap-2"
          >
            {isGeneratingSummary ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                <span>Generating...</span>
              </>
            ) : (
              <>
                <span>Switch</span>
                <ArrowRight size={14} />
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

// Transfer Option Component
interface TransferOptionProps {
  selected: boolean;
  onClick: () => void;
  title: string;
  description: string;
  icon: React.ReactNode;
  disabled?: boolean;
  children?: React.ReactNode;
}

const TransferOption: React.FC<TransferOptionProps> = ({
  selected,
  onClick,
  title,
  description,
  icon,
  disabled = false,
  children,
}) => (
  <button
    onClick={onClick}
    disabled={disabled}
    className={`w-full text-left p-3 rounded-lg border transition-all ${
      selected
        ? 'bg-blue-500/10 border-blue-500/50'
        : disabled
        ? 'bg-[#1a1a1a] border-ide-border opacity-50 cursor-not-allowed'
        : 'bg-[#1a1a1a] border-ide-border hover:bg-[#1e1e1e] hover:border-gray-600'
    }`}
  >
    <div className="flex items-start gap-3">
      {/* Radio Indicator */}
      <div className={`w-4 h-4 rounded-full border-2 mt-0.5 flex items-center justify-center flex-shrink-0 ${
        selected ? 'border-blue-500 bg-blue-500' : 'border-gray-500'
      }`}>
        {selected && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className={`${selected ? 'text-blue-300' : 'text-gray-400'}`}>{icon}</span>
          <span className={`font-medium ${selected ? 'text-blue-200' : 'text-gray-300'}`}>
            {title}
          </span>
        </div>
        <p className="text-xs text-gray-500 mt-0.5">{description}</p>
        {children}
      </div>
    </div>
  </button>
);

export default AgentSwitchDialog;
