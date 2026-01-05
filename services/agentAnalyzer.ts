/**
 * Agent Analyzer Service (Phase 1.3)
 *
 * Provides agent recommendation based on conversation content
 * and generates summaries for context transfer.
 */

import { Message, ToolId, AgentCapability } from '../types';

// Agent capability definitions
export const AGENT_CAPABILITIES: Record<ToolId, AgentCapability> = {
  claude: {
    name: 'Claude Code',
    strengths: ['Code Refactoring', 'Bug Fixing', 'Architecture Design', 'Code Review'],
    keywords: ['refactor', 'fix', 'bug', 'design', 'review', 'architecture', 'restructure', 'optimize', 'debug', 'error', 'issue', 'problem', 'improve']
  },
  gemini: {
    name: 'Gemini CLI',
    strengths: ['Documentation', 'Explanation', 'Code Review', 'Long Text Processing'],
    keywords: ['doc', 'explain', 'document', 'readme', 'comment', 'describe', 'summarize', 'understand', 'what', 'how', 'why']
  },
  codex: {
    name: 'Codex CLI',
    strengths: ['Test Writing', 'Code Completion', 'Performance Optimization'],
    keywords: ['test', 'complete', 'performance', 'speed', 'fast', 'benchmark', 'unit', 'integration', 'coverage']
  },
  kiro: {
    name: 'Kiro CLI',
    strengths: ['Bug Fixing', 'Quick Iteration', 'Code Generation'],
    keywords: ['fix', 'generate', 'create', 'new', 'add', 'implement', 'build', 'make', 'quick']
  }
};

/**
 * Get agent display name
 */
export function getAgentName(toolId: ToolId): string {
  return AGENT_CAPABILITIES[toolId]?.name || toolId;
}

/**
 * Get agent strengths
 */
export function getAgentStrengths(toolId: ToolId): string[] {
  return AGENT_CAPABILITIES[toolId]?.strengths || [];
}

/**
 * Analyze conversation and recommend the best agent
 * Returns null if no strong recommendation
 */
export function analyzeAndRecommend(
  messages: Message[],
  currentTool: ToolId
): { recommended: ToolId; reason: string } | null {
  if (messages.length === 0) {
    return null;
  }

  // Extract text from recent messages (last 10)
  const recentMessages = messages.slice(-10);
  const recentText = recentMessages
    .map(m => m.text)
    .join(' ')
    .toLowerCase();

  // Calculate match scores for each agent
  const scores: Record<ToolId, number> = {
    claude: 0,
    gemini: 0,
    codex: 0,
    kiro: 0
  };

  for (const [toolId, capability] of Object.entries(AGENT_CAPABILITIES)) {
    for (const keyword of capability.keywords) {
      // Count keyword occurrences
      const regex = new RegExp(`\\b${keyword}\\b`, 'gi');
      const matches = recentText.match(regex);
      if (matches) {
        scores[toolId as ToolId] += matches.length;
      }
    }
  }

  // Remove current tool from consideration
  scores[currentTool] = -1;

  // Find the highest scoring agent
  const sortedAgents = Object.entries(scores)
    .filter(([_, score]) => score > 0)
    .sort((a, b) => b[1] - a[1]);

  if (sortedAgents.length === 0) {
    return null;
  }

  const [recommendedTool, score] = sortedAgents[0];

  // Only recommend if score is significant (at least 2 keyword matches)
  if (score < 2) {
    return null;
  }

  const capability = AGENT_CAPABILITIES[recommendedTool as ToolId];
  const reason = `Suitable for: ${capability.strengths.slice(0, 2).join(', ')}`;

  return {
    recommended: recommendedTool as ToolId,
    reason
  };
}

/**
 * Generate a summary prompt for context transfer
 */
export function getSummaryPrompt(messages: Message[]): string {
  const conversationText = messages
    .map(m => `${m.sender === 'USER' ? 'User' : 'Assistant'}: ${m.text}`)
    .join('\n\n');

  return `Please summarize the following conversation concisely. Focus on:
1. The user's main request/goal
2. What work has been completed
3. Any pending issues or next steps

Keep the summary under 200 words.

Conversation:
${conversationText}

Summary:`;
}

/**
 * Format messages for display in copy mode
 */
export function formatMessagesForTransfer(
  messages: Message[],
  sourceToolName: string
): string {
  return `--- Context transferred from ${sourceToolName} (${messages.length} messages) ---\n\n` +
    messages.map(m => {
      const role = m.sender === 'USER' ? 'User' : 'Assistant';
      // Truncate very long messages
      const text = m.text.length > 500 ? m.text.slice(0, 500) + '...' : m.text;
      return `**${role}**: ${text}`;
    }).join('\n\n');
}
