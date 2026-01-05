import React, { useState, useEffect, useRef } from 'react';
import Sidebar from './components/Sidebar';
import ChatPanel from './components/ChatPanel';
import WorkspacePanel from './components/WorkspacePanel';
import ConfigPanel from './components/ConfigPanel';
import ProjectSelector from './components/ProjectSelector';
import ProfilePanel from './components/ProfilePanel';
import AgentSwitchDialog from './components/AgentSwitchDialog';
import { Message, Sender, Tab, ToolId, TerminalInstance, ToolChatHistory, TaskStatus, isTaskSession, ChatSession, ContextTransferMode, ParallelTask, QueueStats, ParallelTaskConfig, ExecutionState } from './types';
import { getAgentName, getSummaryPrompt } from './services/agentAnalyzer';
import { cliRouter } from './services/cliRouter';
import { ParallelTaskManager } from './services/parallelTaskManager';
import { sidecarManager } from './services/sidecar';
import { parseSlashCommand, executeSlashCommand } from './services/slashCommands';
import {
  createNewSession,
  createNewTaskSession,
  createInitialToolHistory,
  loadSessions,
  saveSessions,
  saveSessionsImmediate,
  getAllTaskSessions
} from './services/sessionStore';
import {
  updateTaskStatus as updateTaskStatusFn,
  addTaskItem as addTaskItemFn,
  toggleTaskItem,
  completeTaskItemByIndex,
  getTaskStats,
  getTaskElapsedTime,
  syncTaskToFile
} from './services/taskStore';
import { listen } from '@tauri-apps/api/event';

const App: React.FC = () => {
  // Project directory state
  const [projectDir, setProjectDir] = useState<string | null>(null);

  // Chat history per tool
  const [toolHistory, setToolHistory] = useState<Record<ToolId, ToolChatHistory>>(createInitialToolHistory);
  const [isSessionsLoaded, setIsSessionsLoaded] = useState(false);
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

  // Agent switch dialog state (Phase 1.3)
  const [isAgentSwitchDialogOpen, setIsAgentSwitchDialogOpen] = useState(false);
  const [pendingToolSwitch, setPendingToolSwitch] = useState<ToolId | null>(null);
  const [isGeneratingSummary, setIsGeneratingSummary] = useState(false);

  // Parallel task execution state (Phase 2.3)
  const [taskManager] = useState(() => new ParallelTaskManager());
  const [queueStats, setQueueStats] = useState<QueueStats>({
    running: 0,
    queued: 0,
    paused: 0,
    completed: 0,
    maxConcurrency: 3
  });
  const [parallelTasks, setParallelTasks] = useState<{
    running: ParallelTask[];
    queued: ParallelTask[];
    paused: ParallelTask[];
  }>({ running: [], queued: [], paused: [] });
  const [parallelConfig, setParallelConfig] = useState<ParallelTaskConfig>({
    maxConcurrency: 3,
    autoStartQueued: true
  });

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

  // ============================================
  // Task Mode Functions
  // ============================================

  // Create a new task session
  const handleCreateTask = async (title: string) => {
    if (!projectDir) return;

    const newSession = await createNewTaskSession(activeTool, title, projectDir);
    setToolHistory(prev => ({
      ...prev,
      [activeTool]: {
        sessions: [newSession, ...prev[activeTool].sessions],
        activeSessionId: newSession.id
      }
    }));
    setGeneratedCode(null);
  };

  // Update task status (pause, resume, complete)
  const handleUpdateTaskStatus = (status: TaskStatus) => {
    setToolHistory(prev => {
      const toolHist = prev[activeTool];
      const sessionIndex = toolHist.sessions.findIndex(s => s.id === toolHist.activeSessionId);
      if (sessionIndex === -1) return prev;

      const session = toolHist.sessions[sessionIndex];
      if (!isTaskSession(session)) return prev;

      const updatedSession = updateTaskStatusFn(session, status);

      // Sync to TODO.md file
      syncTaskToFile(updatedSession);

      const updatedSessions = [...toolHist.sessions];
      updatedSessions[sessionIndex] = updatedSession;

      return {
        ...prev,
        [activeTool]: {
          ...toolHist,
          sessions: updatedSessions
        }
      };
    });
  };

  // Add a TODO item to current task
  const handleAddTaskItem = (itemTitle: string) => {
    setToolHistory(prev => {
      const toolHist = prev[activeTool];
      const sessionIndex = toolHist.sessions.findIndex(s => s.id === toolHist.activeSessionId);
      if (sessionIndex === -1) return prev;

      const session = toolHist.sessions[sessionIndex];
      if (!isTaskSession(session)) return prev;

      const updatedSession = addTaskItemFn(session, itemTitle);

      // Sync to TODO.md file
      syncTaskToFile(updatedSession);

      const updatedSessions = [...toolHist.sessions];
      updatedSessions[sessionIndex] = updatedSession;

      return {
        ...prev,
        [activeTool]: {
          ...toolHist,
          sessions: updatedSessions
        }
      };
    });
  };

  // Toggle a TODO item by ID
  const handleToggleTaskItem = (itemId: string) => {
    setToolHistory(prev => {
      const toolHist = prev[activeTool];
      const sessionIndex = toolHist.sessions.findIndex(s => s.id === toolHist.activeSessionId);
      if (sessionIndex === -1) return prev;

      const session = toolHist.sessions[sessionIndex];
      if (!isTaskSession(session)) return prev;

      const updatedSession = toggleTaskItem(session, itemId);

      // Sync to TODO.md file
      syncTaskToFile(updatedSession);

      const updatedSessions = [...toolHist.sessions];
      updatedSessions[sessionIndex] = updatedSession;

      return {
        ...prev,
        [activeTool]: {
          ...toolHist,
          sessions: updatedSessions
        }
      };
    });
  };

  // Complete a TODO item by index (1-based, for slash commands)
  const handleCompleteTaskItemByIndex = (index: number) => {
    setToolHistory(prev => {
      const toolHist = prev[activeTool];
      const sessionIndex = toolHist.sessions.findIndex(s => s.id === toolHist.activeSessionId);
      if (sessionIndex === -1) return prev;

      const session = toolHist.sessions[sessionIndex];
      if (!isTaskSession(session)) return prev;

      const updatedSession = completeTaskItemByIndex(session, index);

      // Sync to TODO.md file
      syncTaskToFile(updatedSession);

      const updatedSessions = [...toolHist.sessions];
      updatedSessions[sessionIndex] = updatedSession;

      return {
        ...prev,
        [activeTool]: {
          ...toolHist,
          sessions: updatedSessions
        }
      };
    });
  };

  // Get stats for current task
  const handleGetTaskStats = () => {
    if (!activeSession || !isTaskSession(activeSession)) {
      return { totalItems: 0, completedItems: 0, elapsedTime: 0, progress: 0 };
    }
    return getTaskStats(activeSession);
  };

  // Get all tasks across tools
  const handleGetAllTasks = () => {
    return getAllTaskSessions(toolHistory);
  };

  // Load saved sessions on startup
  useEffect(() => {
    const load = async () => {
      try {
        const savedSessions = await loadSessions();
        if (savedSessions) {
          setToolHistory(savedSessions);
          console.log('[App] Loaded saved sessions');
        }
      } catch (error) {
        console.error('[App] Failed to load sessions:', error);
      } finally {
        setIsSessionsLoaded(true);
      }
    };
    load();
  }, []);

  // Use ref to always have latest toolHistory for async callbacks
  const toolHistoryRef = useRef(toolHistory);
  useEffect(() => {
    toolHistoryRef.current = toolHistory;
  }, [toolHistory]);

  // Save sessions when they change (after initial load)
  useEffect(() => {
    if (isSessionsLoaded) {
      saveSessions(toolHistory);
    }
  }, [toolHistory, isSessionsLoaded]);

  // Periodic auto-save as safety net (every 5 seconds)
  // This ensures data is saved even if Ctrl+C kills the process
  useEffect(() => {
    if (!isSessionsLoaded) return;

    const autoSaveInterval = setInterval(() => {
      console.log('[App] Auto-save triggered');
      saveSessionsImmediate(toolHistoryRef.current);
    }, 5000);

    return () => clearInterval(autoSaveInterval);
  }, [isSessionsLoaded]);

  // Save sessions immediately before app closes (Tauri + browser events)
  useEffect(() => {
    const handleBeforeUnload = () => {
      console.log('[App] beforeunload - saving sessions');
      saveSessionsImmediate(toolHistoryRef.current);
    };

    // Browser beforeunload event
    window.addEventListener('beforeunload', handleBeforeUnload);

    // Tauri window close event - more reliable in Tauri
    let unlistenClose: (() => void) | null = null;
    listen('tauri://close-requested', () => {
      console.log('[App] Tauri close-requested - saving sessions');
      saveSessionsImmediate(toolHistoryRef.current);
    }).then(unlisten => {
      unlistenClose = unlisten;
    });

    // Also listen for destroy event
    let unlistenDestroy: (() => void) | null = null;
    listen('tauri://destroyed', () => {
      console.log('[App] Tauri destroyed - saving sessions');
      saveSessionsImmediate(toolHistoryRef.current);
    }).then(unlisten => {
      unlistenDestroy = unlisten;
    });

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      unlistenClose?.();
      unlistenDestroy?.();
      // Also save when component unmounts
      console.log('[App] Component unmount - saving sessions');
      saveSessionsImmediate(toolHistoryRef.current);
    };
  }, []); // Empty deps - use ref for latest state

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

  // ============================================
  // Agent Switch Dialog Handlers (Phase 1.3)
  // ============================================

  // Open the agent switch dialog
  const handleRequestAgentSwitch = (targetTool: ToolId) => {
    setPendingToolSwitch(targetTool);
    setIsAgentSwitchDialogOpen(true);
  };

  // Close the agent switch dialog
  const handleCloseAgentSwitchDialog = () => {
    setIsAgentSwitchDialogOpen(false);
    setPendingToolSwitch(null);
    setIsGeneratingSummary(false);
  };

  // Confirm the agent switch with context transfer
  const handleConfirmAgentSwitch = async (
    transferMode: ContextTransferMode,
    messageCount?: number
  ) => {
    if (!pendingToolSwitch) return;

    const targetTool = pendingToolSwitch;
    const sourceToolName = getAgentName(activeTool);
    const targetToolName = getAgentName(targetTool);

    try {
      if (transferMode === 'new') {
        // Mode 1: Start fresh - just switch
        setActiveTool(targetTool);
        handleCloseAgentSwitchDialog();

      } else if (transferMode === 'copy') {
        // Mode 2: Copy recent messages
        const msgCount = messageCount || 10;
        const recentMessages = messages.slice(-msgCount);

        // Switch to target tool
        setActiveTool(targetTool);

        // Create a new session for the target tool with copied messages
        const newSession = createNewSession(targetTool);

        // Add context notice and copied messages
        const contextNotice: Message = {
          id: `context-${Date.now()}`,
          text: `📋 **Context transferred from ${sourceToolName}** (${recentMessages.length} messages)\n\n---`,
          sender: Sender.AGENT,
          timestamp: Date.now()
        };

        // Copy messages with new IDs
        const copiedMessages = recentMessages.map((m, idx) => ({
          ...m,
          id: `copied-${Date.now()}-${idx}`
        }));

        newSession.messages = [
          ...newSession.messages,
          contextNotice,
          ...copiedMessages
        ];
        newSession.title = `From ${sourceToolName}`;

        // Add to target tool's history
        setToolHistory(prev => ({
          ...prev,
          [targetTool]: {
            sessions: [newSession, ...prev[targetTool].sessions],
            activeSessionId: newSession.id
          }
        }));

        handleCloseAgentSwitchDialog();

      } else if (transferMode === 'summary') {
        // Mode 3: Generate summary using current agent
        setIsGeneratingSummary(true);

        try {
          // Generate summary using current agent
          const summaryPrompt = getSummaryPrompt(messages);
          const summaryResponse = await cliRouter.sendMessage(activeTool, summaryPrompt, []);
          const summary = summaryResponse.content;

          // Switch to target tool
          setActiveTool(targetTool);

          // Create new session with summary
          const newSession = createNewSession(targetTool);

          // Add summary as first message
          const summaryMsg: Message = {
            id: `summary-${Date.now()}`,
            text: `📝 **Summary from ${sourceToolName}:**\n\n${summary}`,
            sender: Sender.AGENT,
            timestamp: Date.now()
          };

          newSession.messages = [...newSession.messages, summaryMsg];
          newSession.title = `Summary from ${sourceToolName}`;

          // Add to target tool's history
          setToolHistory(prev => ({
            ...prev,
            [targetTool]: {
              sessions: [newSession, ...prev[targetTool].sessions],
              activeSessionId: newSession.id
            }
          }));

          handleCloseAgentSwitchDialog();
        } catch (error) {
          console.error('[App] Failed to generate summary:', error);
          // Fallback to just switching
          setActiveTool(targetTool);
          handleCloseAgentSwitchDialog();
        }
      }
    } catch (error) {
      console.error('[App] Agent switch error:', error);
      handleCloseAgentSwitchDialog();
    }
  };

  // ============================================
  // Parallel Task Execution (Phase 2.3)
  // ============================================

  // Initialize ParallelTaskManager callbacks
  useEffect(() => {
    // Update queue stats callback
    taskManager.setQueueChangeCallback((stats) => {
      setQueueStats(stats);
      // Update parallel tasks list
      setParallelTasks({
        running: taskManager.getRunningTasks(),
        queued: taskManager.getQueuedTasks(),
        paused: taskManager.getPausedTasks()
      });
    });

    // Set base CLI for cloning settings
    taskManager.setBaseCLI(cliRouter);

    // Set terminal callbacks
    taskManager.setTerminalCreateCallback(createTerminal);

    console.log('[App] ParallelTaskManager initialized');

    return () => {
      taskManager.setQueueChangeCallback(null);
    };
  }, [taskManager]);

  // Update base CLI settings when they change
  useEffect(() => {
    if (projectDir) {
      taskManager.setBaseCLI(cliRouter);
    }
  }, [projectDir, taskManager]);

  // Handle parallel config changes
  const handleParallelConfigChange = (config: ParallelTaskConfig) => {
    setParallelConfig(config);
    taskManager.setMaxConcurrency(config.maxConcurrency);
    console.log('[App] Parallel config updated:', config);
  };

  // Parallel task action handlers
  const handlePauseParallelTask = (taskId: string) => {
    taskManager.pauseTask(taskId);
  };

  const handleResumeParallelTask = (taskId: string) => {
    taskManager.resumeTask(taskId);
  };

  const handleCancelParallelTask = (taskId: string) => {
    taskManager.cancelTask(taskId);
  };

  const handleMoveParallelTaskUp = (taskId: string) => {
    taskManager.moveTaskUp(taskId);
  };

  const handleMoveParallelTaskDown = (taskId: string) => {
    taskManager.moveTaskDown(taskId);
  };

  // ============================================
  // Task Panel Navigation Handlers (Phase 2.1)
  // ============================================

  // Navigate to a specific task session from the Task Panel
  const handleNavigateToTask = (toolId: ToolId, sessionId: string) => {
    console.log('[App] Navigating to task:', toolId, sessionId);
    // Switch to the target tool
    setActiveTool(toolId);
    // Switch to the target session
    setToolHistory(prev => ({
      ...prev,
      [toolId]: {
        ...prev[toolId],
        activeSessionId: sessionId
      }
    }));
    // Clear generated code preview
    setGeneratedCode(null);
  };

  // Update task status from Task Panel
  const handleUpdateTaskStatusFromPanel = (
    toolId: ToolId,
    sessionId: string,
    status: TaskStatus
  ) => {
    console.log('[App] Updating task status:', toolId, sessionId, status);
    setToolHistory(prev => {
      const toolHist = prev[toolId];
      const sessionIndex = toolHist.sessions.findIndex(s => s.id === sessionId);
      if (sessionIndex === -1) return prev;

      const session = toolHist.sessions[sessionIndex];
      if (!isTaskSession(session)) return prev;

      const updatedSession = updateTaskStatusFn(session, status);
      // Sync to file
      syncTaskToFile(updatedSession);

      const updatedSessions = [...toolHist.sessions];
      updatedSessions[sessionIndex] = updatedSession;

      return {
        ...prev,
        [toolId]: {
          ...toolHist,
          sessions: updatedSessions
        }
      };
    });
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
        },
        // Task mode context
        projectDir: projectDir || undefined,
        currentSession: activeSession,
        createTask: handleCreateTask,
        updateTaskStatus: handleUpdateTaskStatus,
        addTaskItem: handleAddTaskItem,
        completeTaskItem: handleCompleteTaskItemByIndex,
        getTaskStats: handleGetTaskStats,
        getAllTasks: handleGetAllTasks
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

      // If command has autoSendMessage, send it to the AI
      if (result.autoSendMessage) {
        console.log('[App] Auto-sending message:', result.autoSendMessage);
        // Use setTimeout to ensure the UI updates first
        setTimeout(() => {
          handleSendMessage(result.autoSendMessage!);
        }, 100);
      }
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
        onRequestAgentSwitch={handleRequestAgentSwitch}
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
          // Task mode props
          activeSession={activeSession}
          onPauseTask={() => handleUpdateTaskStatus(TaskStatus.PAUSED)}
          onResumeTask={() => handleUpdateTaskStatus(TaskStatus.IN_PROGRESS)}
          onCompleteTask={() => handleUpdateTaskStatus(TaskStatus.COMPLETED)}
          onToggleTaskItem={handleToggleTaskItem}
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
            toolHistory={toolHistory}
            onNavigateToTask={handleNavigateToTask}
            onUpdateTaskStatus={handleUpdateTaskStatusFromPanel}
            // Parallel task props (Phase 2.3)
            parallelTasks={parallelTasks}
            queueStats={queueStats}
            onPauseParallelTask={handlePauseParallelTask}
            onResumeParallelTask={handleResumeParallelTask}
            onCancelParallelTask={handleCancelParallelTask}
            onMoveTaskUp={handleMoveParallelTaskUp}
            onMoveTaskDown={handleMoveParallelTaskDown}
          />
        )}
      </div>

      <ConfigPanel
        isOpen={isConfigOpen}
        onClose={() => setIsConfigOpen(false)}
        activeTool={activeTool}
        parallelConfig={parallelConfig}
        onParallelConfigChange={handleParallelConfigChange}
      />

      {/* Agent Switch Dialog (Phase 1.3) */}
      {pendingToolSwitch && (
        <AgentSwitchDialog
          isOpen={isAgentSwitchDialogOpen}
          onClose={handleCloseAgentSwitchDialog}
          currentTool={activeTool}
          targetTool={pendingToolSwitch}
          messages={messages}
          onConfirm={handleConfirmAgentSwitch}
          isGeneratingSummary={isGeneratingSummary}
        />
      )}
    </div>
  );
};

export default App;