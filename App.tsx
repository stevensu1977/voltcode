import React, { useState, useEffect, useRef } from 'react';
import Sidebar from './components/Sidebar';
import ChatPanel from './components/ChatPanel';
import WorkspacePanel from './components/WorkspacePanel';
import ConfigPanel from './components/ConfigPanel';
import ProjectSelector from './components/ProjectSelector';
import ProfilePanel from './components/ProfilePanel';
import { Message, Sender, Tab, ToolId, TerminalInstance, ChatSession, ToolChatHistory } from './types';
import { cliRouter } from './services/cliRouter';
import { sidecarManager } from './services/sidecar';
import { parseSlashCommand, executeSlashCommand } from './services/slashCommands';

const TOOL_NAMES: Record<ToolId, string> = {
  claude: 'Claude Code',
  gemini: 'Gemini CLI',
  codex: 'Codex CLI',
  kiro: 'Kiro CLI'
};

// Create a new chat session
const createNewSession = (toolId: ToolId): ChatSession => {
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

// Initial state for all tools with chat history
const createInitialToolHistory = (): Record<ToolId, ToolChatHistory> => {
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

const App: React.FC = () => {
  // Project directory state
  const [projectDir, setProjectDir] = useState<string | null>(null);

  // Chat history per tool
  const [toolHistory, setToolHistory] = useState<Record<ToolId, ToolChatHistory>>(createInitialToolHistory);
  const [activeTab, setActiveTab] = useState<Tab>(Tab.PREVIEW);
  const [generatedCode, setGeneratedCode] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [terminals, setTerminals] = useState<TerminalInstance[]>([]);
  const [activeTerminalId, setActiveTerminalId] = useState<string | null>(null);

  // Tool state
  const [activeTool, setActiveTool] = useState<ToolId>('claude');
  const [isConfigOpen, setIsConfigOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [currentAgent, setCurrentAgent] = useState<string>('');

  // Get current tool's active session
  const currentHistory = toolHistory[activeTool];
  const activeSession = currentHistory.sessions.find(s => s.id === currentHistory.activeSessionId);
  const messages = activeSession?.messages || [];
  const chatSessions = currentHistory.sessions;

  // Helper to update current tool's active session messages
  const setMessages = (updater: Message[] | ((prev: Message[]) => Message[])) => {
    setToolHistory(prev => {
      const toolHist = prev[activeTool];
      const sessionIndex = toolHist.sessions.findIndex(s => s.id === toolHist.activeSessionId);
      if (sessionIndex === -1) return prev;

      const currentMessages = toolHist.sessions[sessionIndex].messages;
      const newMessages = typeof updater === 'function' ? updater(currentMessages) : updater;

      // Generate title from first user message if still "New Chat"
      let newTitle = toolHist.sessions[sessionIndex].title;
      if (newTitle === 'New Chat' && newMessages.length > 1) {
        const firstUserMsg = newMessages.find(m => m.sender === Sender.USER);
        if (firstUserMsg) {
          newTitle = firstUserMsg.text.slice(0, 30) + (firstUserMsg.text.length > 30 ? '...' : '');
        }
      }

      const updatedSessions = [...toolHist.sessions];
      updatedSessions[sessionIndex] = {
        ...updatedSessions[sessionIndex],
        messages: newMessages,
        title: newTitle,
        updatedAt: Date.now()
      };

      return {
        ...prev,
        [activeTool]: {
          ...toolHist,
          sessions: updatedSessions
        }
      };
    });
  };

  // Create new chat session
  const handleNewChat = () => {
    const newSession = createNewSession(activeTool);
    setToolHistory(prev => ({
      ...prev,
      [activeTool]: {
        sessions: [newSession, ...prev[activeTool].sessions],
        activeSessionId: newSession.id
      }
    }));
    setGeneratedCode(null);
  };

  // Switch to a different chat session
  const handleSwitchSession = (sessionId: string) => {
    setToolHistory(prev => ({
      ...prev,
      [activeTool]: {
        ...prev[activeTool],
        activeSessionId: sessionId
      }
    }));
    setGeneratedCode(null);
  };

  // Delete a chat session
  const handleDeleteSession = (sessionId: string) => {
    setToolHistory(prev => {
      const toolHist = prev[activeTool];
      const newSessions = toolHist.sessions.filter(s => s.id !== sessionId);

      // If deleting active session, switch to first remaining or create new
      let newActiveId = toolHist.activeSessionId;
      if (sessionId === toolHist.activeSessionId) {
        if (newSessions.length > 0) {
          newActiveId = newSessions[0].id;
        } else {
          const newSession = createNewSession(activeTool);
          newSessions.push(newSession);
          newActiveId = newSession.id;
        }
      }

      return {
        ...prev,
        [activeTool]: {
          sessions: newSessions,
          activeSessionId: newActiveId
        }
      };
    });
  };

  // Set project directory in CLI router when selected
  useEffect(() => {
    if (projectDir) {
      cliRouter.setProjectDir(projectDir);
      // Add welcome message with project path to ALL tools' active sessions
      const projectMsg: Message = {
        id: Date.now().toString(),
        text: `Project directory set to: ${projectDir}\n\nAll generated files will be saved in this directory. You can now start building!`,
        sender: Sender.AGENT,
        timestamp: Date.now()
      };

      setToolHistory(prev => {
        const updated = { ...prev };
        (['claude', 'gemini', 'codex', 'kiro'] as ToolId[]).forEach(toolId => {
          const toolHist = updated[toolId];
          const sessionIndex = toolHist.sessions.findIndex(s => s.id === toolHist.activeSessionId);
          if (sessionIndex !== -1) {
            const updatedSessions = [...toolHist.sessions];
            updatedSessions[sessionIndex] = {
              ...updatedSessions[sessionIndex],
              messages: [...updatedSessions[sessionIndex].messages, { ...projectMsg, id: `${projectMsg.id}-${toolId}` }],
              updatedAt: Date.now()
            };
            updated[toolId] = { ...toolHist, sessions: updatedSessions };
          }
        });
        return updated;
      });
    }
  }, [projectDir]);

  // Listen for terminal output - auto-switch to terminal tab when output arrives
  // Note: XTerminal component in WorkspacePanel handles the actual output display
  useEffect(() => {
    let unlisten: (() => void) | null = null;
    let cancelled = false;

    const setupTerminalListener = async () => {
      const { listen } = await import('@tauri-apps/api/event');
      const listener = await listen<{ terminalId: string; output: string }>('terminal-output', (event) => {
        const { terminalId } = event.payload;

        // Check if terminal exists, if not create it (for background processes)
        setTerminals(prev => {
          const terminal = prev.find(t => t.id === terminalId);
          if (!terminal) {
            // Terminal doesn't exist yet - create it on the fly
            console.log('[Terminal] Creating terminal for:', terminalId);

            // Use friendly names for known terminal IDs
            let terminalName = `Terminal ${terminalId.substring(9, 18)}...`;
            if (terminalId === 'kiro-output') {
              terminalName = 'Kiro Output';
            } else if (terminalId === 'claude-output') {
              terminalName = 'Claude Output';
            }

            const newTerminal: TerminalInstance = {
              id: terminalId,
              name: terminalName,
              pid: 0,
              output: [], // XTerminal handles display, we don't need to store output
              isActive: true,
              createdAt: Date.now()
            };
            return [...prev, newTerminal];
          }
          return prev;
        });

        // Auto-switch to Terminal tab and activate this terminal
        setActiveTab(Tab.TERMINAL);
        setActiveTerminalId(terminalId);
      });

      // If cleanup was called while we were awaiting, unlisten immediately
      if (cancelled) {
        listener();
      } else {
        unlisten = listener;
      }
    };

    setupTerminalListener();

    return () => {
      cancelled = true;
      if (unlisten) {
        unlisten();
      }
    };
  }, []);

  // Store terminals ref for cleanup (to avoid dependency on terminals array)
  const terminalsRef = useRef<TerminalInstance[]>([]);
  useEffect(() => {
    terminalsRef.current = terminals;
  }, [terminals]);

  // Cleanup on unmount only - close all terminals properly
  useEffect(() => {
    return () => {
      sidecarManager.stopAll();
      // Close all terminal sessions (PTY terminals use close_terminal, not kill_process)
      terminalsRef.current.forEach(async (terminal) => {
        try {
          const { invoke } = await import('@tauri-apps/api/core');
          // PTY terminals have pid=0, use close_terminal for them
          if (terminal.pid === 0) {
            await invoke('close_terminal', { terminalId: terminal.id });
          } else {
            // Background processes have real PIDs
            await invoke('kill_process', { pid: terminal.pid });
          }
        } catch (error) {
          console.error('[Terminal] Failed to close terminal:', error);
        }
      });
    };
  }, []); // Empty deps - only run cleanup on unmount

  // Terminal management functions
  const createTerminal = (name: string, pid: number, predefinedId?: string): string => {
    const terminalId = predefinedId || `terminal-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const newTerminal: TerminalInstance = {
      id: terminalId,
      name,
      pid,
      output: [],
      isActive: true,
      createdAt: Date.now()
    };

    setTerminals(prev => [...prev, newTerminal]);
    setActiveTerminalId(terminalId);
    setActiveTab(Tab.TERMINAL);

    console.log('[Terminal] Created new terminal:', terminalId, 'PID:', pid, predefinedId ? '(predefined)' : '(generated)');
    return terminalId;
  };

  const closeTerminal = async (terminalId: string) => {
    const terminal = terminals.find(t => t.id === terminalId);
    if (!terminal) return;

    // Call Rust backend to close terminal and cleanup resources
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('close_terminal', { terminalId });
      console.log('[Terminal] Closed terminal:', terminalId);
    } catch (error) {
      console.error('[Terminal] Failed to close terminal:', error);
    }

    // Remove terminal from list
    setTerminals(prev => prev.filter(t => t.id !== terminalId));

    // If this was the active terminal, switch to another one
    if (activeTerminalId === terminalId) {
      const remaining = terminals.filter(t => t.id !== terminalId);
      setActiveTerminalId(remaining.length > 0 ? remaining[0].id : null);
    }
  };

  const switchTerminal = (terminalId: string) => {
    setActiveTerminalId(terminalId);
  };

  const createInteractiveTerminal = async () => {
    try {
      const { invoke } = await import('@tauri-apps/api/core');

      // Generate terminal ID
      const terminalId = `terminal-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      const terminalName = `Shell ${terminals.length + 1}`;

      // Create terminal in state first
      createTerminal(terminalName, 0, terminalId);

      // Create interactive terminal in Rust
      await invoke('create_interactive_terminal', {
        terminalId,
        cwd: projectDir || undefined
      });

      console.log('[Terminal] Interactive terminal created:', terminalId);
    } catch (error) {
      console.error('[Terminal] Failed to create interactive terminal:', error);
    }
  };

  const sendTerminalInput = async (terminalId: string, data: string) => {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('terminal_input', { terminalId, data });
    } catch (error) {
      console.error('[Terminal] Failed to send input:', error);
    }
  };

  const handleToolSelect = (toolId: ToolId) => {
    setActiveTool(toolId);
    // No switch message needed - each tool has its own context
  };

  const handleChangeProject = () => {
    // Reset project directory to trigger project selector
    setProjectDir(null);
    // Clear all tool chat history
    setToolHistory(createInitialToolHistory());
    // Reset generated code
    setGeneratedCode(null);
    // Reset active tab
    setActiveTab(Tab.PREVIEW);
  };

  const handleAgentChange = (agent: string) => {
    setCurrentAgent(agent);
    cliRouter.setAgent(agent || null);

    // Add agent switch message
    const agentName = agent || 'Default';
    setMessages(prev => [...prev, {
      id: Date.now().toString(),
      text: `Switched to ${agentName} agent.${agent ? ` This agent specializes in: ${
        agent === 'Explore' ? 'fast codebase exploration' :
        agent === 'Plan' ? 'software architecture planning' :
        agent
      }` : ''}`,
      sender: Sender.AGENT,
      timestamp: Date.now()
    }]);
  };

  // Generate commit message with AI
  const handleGenerateCommitMessage = async (diff: string): Promise<string> => {
    const prompt = `Based on the following git diff/changes, generate a concise commit message (one line, max 72 chars). Follow conventional commits format (feat:, fix:, docs:, refactor:, etc). Only output the commit message, nothing else.

Changes:
${diff}`;

    const response = await cliRouter.sendMessage(activeTool, prompt, []);
    // Extract just the first line as commit message
    const message = response.content.split('\n')[0].trim();
    // Remove quotes if present
    return message.replace(/^["']|["']$/g, '');
  };

  // Helper to extract code from markdown code blocks
  const extractCode = (response: string): string | null => {
    // Look for ```html ... ``` blocks
    const htmlMatch = response.match(/```html\n([\s\S]*?)\n```/);
    if (htmlMatch) return htmlMatch[1];
    
    // Look for generic ``` ... ``` blocks if they look like HTML
    const genericMatch = response.match(/```\n([\s\S]*?)\n```/);
    if (genericMatch && genericMatch[1].trim().startsWith('<')) return genericMatch[1];

    return null;
  };

  const handleSendMessage = async (text: string) => {
    // Check if this is a slash command
    const parsed = parseSlashCommand(text);
    console.log('[App] Parsed command:', parsed);

    if (parsed.isCommand && parsed.command) {
      console.log('[App] Executing slash command:', parsed.command, 'with args:', parsed.args);
      // Execute slash command (now async)
      const result = await executeSlashCommand(parsed.command, parsed.args, {
        setModel: (model) => cliRouter.setModel(model),
        setPermissionMode: (mode) => cliRouter.setPermissionMode(mode),
        setAgent: (agent) => handleAgentChange(agent),
        clearMessages: () => {
          handleNewChat();
          cliRouter.resetSessionStats();
        },
        openConfig: () => setIsConfigOpen(true),
        currentModel: cliRouter.getModel(),
        currentPermissionMode: cliRouter.getPermissionMode(),
        currentAgent: currentAgent,
        sessionCost: {
          cost: cliRouter.getSessionStats().totalCost,
          tokens: cliRouter.getSessionStats().totalTokens,
          turns: cliRouter.getSessionStats().totalTurns
        },
        contextUsage: {
          used: messages.reduce((sum, m) => sum + m.text.length, 0),
          total: 200000
        }
      });

      console.log('[App] Command result:', result);

      // Add command result message
      const commandMsg: Message = {
        id: Date.now().toString(),
        text: result.message,
        sender: Sender.AGENT,
        timestamp: Date.now(),
        isError: !result.success
      };

      console.log('[App] Adding command message:', commandMsg);
      setMessages(prev => [...prev, commandMsg]);
      return;
    }

    // 1. Add user message
    const userMsg: Message = {
      id: Date.now().toString(),
      text,
      sender: Sender.USER,
      timestamp: Date.now()
    };

    setMessages(prev => [...prev, userMsg]);
    setIsGenerating(true);

    // 创建一个临时的"思考中"消息
    const thinkingMsgId = `thinking-${Date.now()}`;
    const thinkingMsg: Message = {
      id: thinkingMsgId,
      text: '🤔 Thinking...',
      sender: Sender.AGENT,
      timestamp: Date.now()
    };
    setMessages(prev => [...prev, thinkingMsg]);

    try {
      // 移除"思考中"的消息，准备添加实时进度消息
      setMessages(prev => prev.filter(m => m.id !== thinkingMsgId));

      // 设置进度回调来创建新的消息气泡
      cliRouter.setProgressCallback((update) => {
        // 检测是否是终端输出（带有 __TERMINAL__ 前缀）
        const isTerminalOutput = update.startsWith('__TERMINAL__');
        const text = isTerminalOutput ? update.slice('__TERMINAL__'.length) : update;

        // 为每个进度更新创建一个新的消息
        const progressMsg: Message = {
          id: `progress-${Date.now()}-${Math.random()}`,
          text,
          sender: Sender.AGENT,
          timestamp: Date.now(),
          isTerminalOutput
        };
        setMessages(prev => [...prev, progressMsg]);
      });

      // 设置终端创建回调
      cliRouter.setTerminalCreateCallback(createTerminal);

      // 2. Prepare history for context
      const history = messages
        .filter(m => m.sender !== Sender.AGENT || !m.text.startsWith('Switched to'))
        .map(m => ({
          role: m.sender === Sender.USER ? 'user' as const : 'assistant' as const,
          content: m.text
        }));

      // 3. Route to appropriate CLI
      console.log(`[App] Sending to ${activeTool}:`, text);
      const response = await cliRouter.sendMessage(activeTool, text, history);

      // 清除进度回调
      cliRouter.setProgressCallback(null);
      cliRouter.setTerminalCallback(null);

      // 4. Add agent response
      const agentMsg: Message = {
        id: (Date.now() + 1).toString(),
        text: response.content,
        sender: Sender.AGENT,
        timestamp: Date.now()
      };

      setMessages(prev => [...prev, agentMsg]);

      // 5. Update preview if code was generated
      if (response.code) {
        setGeneratedCode(response.code);
        setActiveTab(Tab.PREVIEW);
      }

    } catch (error) {
      console.error(`[App] Error with ${activeTool}:`, error);
      setMessages(prev => [...prev, {
        id: Date.now().toString(),
        text: `Error with ${activeTool}: ${error instanceof Error ? error.message : 'Unknown error'}. Please try again.`,
        sender: Sender.AGENT,
        timestamp: Date.now(),
        isError: true
      }]);
    } finally {
      setIsGenerating(false);
    }
  };

  // Show project selector if no project is selected
  if (!projectDir) {
    return <ProjectSelector onProjectSelect={setProjectDir} />;
  }

  return (
    <div className="flex w-screen h-screen bg-ide-bg text-ide-text font-sans selection:bg-blue-500/30">
      <Sidebar
        activeTool={activeTool}
        onToolSelect={handleToolSelect}
        onChangeProject={handleChangeProject}
        projectDir={projectDir}
        onOpenProfile={() => setIsProfileOpen(true)}
      />
      <div className="flex-1 flex overflow-hidden">
        <ChatPanel
          messages={messages}
          onSendMessage={handleSendMessage}
          isGenerating={isGenerating}
          activeTool={activeTool}
          onOpenConfig={() => setIsConfigOpen(true)}
          currentAgent={currentAgent}
          onAgentChange={handleAgentChange}
          chatSessions={chatSessions}
          activeSessionId={currentHistory.activeSessionId}
          onNewChat={handleNewChat}
          onSwitchSession={handleSwitchSession}
          onDeleteSession={handleDeleteSession}
        />
        {isProfileOpen ? (
          <ProfilePanel onClose={() => setIsProfileOpen(false)} />
        ) : (
          <WorkspacePanel
            activeTab={activeTab}
            setActiveTab={setActiveTab}
            code={generatedCode}
            projectDir={projectDir}
            terminals={terminals}
            activeTerminalId={activeTerminalId}
            onSwitchTerminal={switchTerminal}
            onCloseTerminal={closeTerminal}
            onCreateTerminal={createInteractiveTerminal}
            onSendInput={sendTerminalInput}
            onGenerateCommitMessage={handleGenerateCommitMessage}
          />
        )}
      </div>

      <ConfigPanel
        isOpen={isConfigOpen}
        onClose={() => setIsConfigOpen(false)}
        activeTool={activeTool}
      />
    </div>
  );
};

export default App;