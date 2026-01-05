import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Send, Bot, User, Sparkles, Files, Sun, Terminal as TerminalIcon, SlidersHorizontal, Copy, Check, ChevronDown, Users, Plus, MessageSquare, Trash2, History, Search, Download, X } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import { Message, Sender, ToolId, ChatSession, isTaskSession } from '../types';
import { exportSessionToMarkdown } from '../services/sessionStore';
import { TaskHeader } from './TaskHeader';

// Built-in Claude Code agents
const BUILT_IN_AGENTS = [
  { name: 'Default', description: 'Standard Claude Code assistant', isBuiltIn: true },
  { name: 'Explore', description: 'Fast codebase exploration', isBuiltIn: true },
  { name: 'Plan', description: 'Software architecture planning', isBuiltIn: true },
];

// Terminal output component using xterm (for chat message display)
const TerminalMessage: React.FC<{ content: string }> = ({ content }) => {
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<Terminal | null>(null);

  useEffect(() => {
    if (!terminalRef.current || xtermRef.current) return;

    const term = new Terminal({
      theme: {
        background: '#0d0d0d',
        foreground: '#e0e0e0',
        cursor: 'transparent',
        cursorAccent: 'transparent',
        selectionBackground: '#3b82f6',
      },
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
      fontSize: 12,
      lineHeight: 1.2,
      cursorBlink: false,
      disableStdin: true,
      convertEol: true,
      scrollback: 0,
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);

    term.open(terminalRef.current);

    // Write content with ANSI codes
    term.write(content);

    // Calculate rows needed
    const lines = content.split('\n').length;
    term.resize(80, Math.max(lines + 1, 3));

    xtermRef.current = term;

    return () => {
      term.dispose();
      xtermRef.current = null;
    };
  }, [content]);

  return (
    <div
      ref={terminalRef}
      className="rounded-lg overflow-hidden border border-white/10 bg-[#0d0d0d]"
      style={{ minHeight: '60px', maxHeight: '300px' }}
    />
  );
};

// Code block with copy button
const CodeBlock: React.FC<{ language?: string; children: string }> = ({ language, children }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(children);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const isCommand = language === 'bash' || language === 'sh' || language === 'shell' || language === 'zsh';
  const isHtml = language === 'html';

  // For HTML code blocks, show a compact message
  if (isHtml && children.length > 200) {
    return (
      <div className="my-2 p-2 bg-black/30 rounded border border-white/10 text-xs font-mono text-emerald-400 flex items-center gap-2">
        <Files size={14} />
        <span>Code generated. Check preview.</span>
      </div>
    );
  }

  return (
    <div className="my-2 relative group">
      <div className="flex items-center justify-between bg-gray-800 px-3 py-1.5 rounded-t border border-white/10 border-b-0">
        <span className="text-[10px] text-gray-400 uppercase font-medium">
          {isCommand ? 'Command' : language || 'code'}
        </span>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1.5 text-[10px] text-gray-400 hover:text-white transition-colors px-2 py-0.5 rounded hover:bg-white/10"
        >
          {copied ? (
            <>
              <Check size={12} className="text-green-400" />
              <span className="text-green-400">Copied!</span>
            </>
          ) : (
            <>
              <Copy size={12} />
              <span>Copy</span>
            </>
          )}
        </button>
      </div>
      <pre className={`p-3 bg-black/40 rounded-b border border-white/10 border-t-0 overflow-x-auto ${
        isCommand ? 'text-yellow-300' : 'text-gray-300'
      }`}>
        <code className="text-xs font-mono">{children}</code>
      </pre>
    </div>
  );
};

// Custom Kiro Icon Component
const KiroIcon = ({ size = 24, className }: { size?: number | string, className?: string }) => (
  <svg 
    xmlns="http://www.w3.org/2000/svg" 
    width={size} 
    height={size} 
    viewBox="0 0 20 24" 
    fill="none" 
    className={className}
  >
    <path d="M3.80081 18.5661C1.32306 24.0572 6.59904 25.434 10.4904 22.2205C11.6339 25.8242 15.926 23.1361 17.4652 20.3445C20.8578 14.1915 19.4877 7.91459 19.1361 6.61988C16.7244 -2.20972 4.67055 -2.21852 2.59581 6.6649C2.11136 8.21946 2.10284 9.98752 1.82846 11.8233C1.69011 12.749 1.59258 13.3398 1.23436 14.3135C1.02841 14.8733 0.745043 15.3704 0.299833 16.2082C-0.391594 17.5095 -0.0998802 20.021 3.46397 18.7186V18.7195L3.80081 18.5661Z" fill="currentColor"></path>
    <path d="M10.9614 10.4413C9.97202 10.4413 9.82422 9.25893 9.82422 8.55407C9.82422 7.91791 9.93824 7.4124 10.1542 7.09197C10.3441 6.81003 10.6158 6.66699 10.9614 6.66699C11.3071 6.66699 11.6036 6.81228 11.8128 7.09892C12.0511 7.42554 12.177 7.92861 12.177 8.55407C12.177 9.73591 11.7226 10.4413 10.9616 10.4413H10.9614Z" fill="black"></path>
    <path d="M15.0318 10.4413C14.0423 10.4413 13.8945 9.25893 13.8945 8.55407C13.8945 7.91791 14.0086 7.4124 14.2245 7.09197C14.4144 6.81003 14.6861 6.66699 15.0318 6.66699C15.3774 6.66699 15.6739 6.81228 15.8831 7.09892C16.1214 7.42554 16.2474 7.92861 16.2474 8.55407C16.2474 9.73591 15.793 10.4413 15.0319 10.4413H15.0318Z" fill="black"></path>
  </svg>
);

interface ChatPanelProps {
  messages: Message[];
  onSendMessage: (text: string) => void;
  isGenerating: boolean;
  activeTool: ToolId;
  onOpenConfig: () => void;
  currentAgent: string;
  onAgentChange: (agent: string) => void;
  // Chat history props
  chatSessions: ChatSession[];
  activeSessionId: string | null;
  onNewChat: () => void;
  onSwitchSession: (sessionId: string) => void;
  onDeleteSession: (sessionId: string) => void;
  // Task mode props
  activeSession?: ChatSession;
  onPauseTask?: () => void;
  onResumeTask?: () => void;
  onCompleteTask?: () => void;
  onToggleTaskItem?: (itemId: string) => void;
}

const ChatPanel: React.FC<ChatPanelProps> = ({
  messages,
  onSendMessage,
  isGenerating,
  activeTool,
  onOpenConfig,
  currentAgent,
  onAgentChange,
  chatSessions,
  activeSessionId,
  onNewChat,
  onSwitchSession,
  onDeleteSession,
  activeSession,
  onPauseTask,
  onResumeTask,
  onCompleteTask,
  onToggleTaskItem
}) => {
  const [inputValue, setInputValue] = useState('');
  const [showAgentDropdown, setShowAgentDropdown] = useState(false);
  const [showHistoryDropdown, setShowHistoryDropdown] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const agentDropdownRef = useRef<HTMLDivElement>(null);
  const historyDropdownRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Filter sessions based on search query
  const filteredSessions = useMemo(() => {
    if (!searchQuery.trim()) {
      return chatSessions;
    }
    const lowerQuery = searchQuery.toLowerCase();
    return chatSessions.filter(session => {
      // Search in title
      if (session.title.toLowerCase().includes(lowerQuery)) {
        return true;
      }
      // Search in messages
      return session.messages.some(msg =>
        msg.text.toLowerCase().includes(lowerQuery)
      );
    });
  }, [chatSessions, searchQuery]);

  // Export session as markdown file
  const handleExportSession = async (session: ChatSession, e: React.MouseEvent) => {
    e.stopPropagation();
    const markdown = exportSessionToMarkdown(session, activeTool);
    const blob = new Blob([markdown], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${session.title.replace(/[^a-zA-Z0-9]/g, '_')}_${new Date(session.createdAt).toISOString().split('T')[0]}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Focus search input when dropdown opens
  useEffect(() => {
    if (showHistoryDropdown && searchInputRef.current) {
      setTimeout(() => searchInputRef.current?.focus(), 100);
    }
    if (!showHistoryDropdown) {
      setSearchQuery('');
    }
  }, [showHistoryDropdown]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (agentDropdownRef.current && !agentDropdownRef.current.contains(event.target as Node)) {
        setShowAgentDropdown(false);
      }
      if (historyDropdownRef.current && !historyDropdownRef.current.contains(event.target as Node)) {
        setShowHistoryDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedInput = inputValue.trim();
    if (trimmedInput && !isGenerating) {
      onSendMessage(trimmedInput);
      setInputValue('');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e as unknown as React.FormEvent);
    }
  };

  const getToolDetails = (id: ToolId) => {
     switch(id) {
        case 'claude': return { name: 'Claude Code', icon: Sun, color: 'text-orange-500' };
        case 'gemini': return { name: 'Gemini CLI', icon: Sparkles, color: 'text-blue-400' };
        case 'codex': return { name: 'Codex CLI', icon: TerminalIcon, color: 'text-purple-400' };
        case 'kiro': return { name: 'Kiro CLI', icon: KiroIcon, color: 'text-emerald-400' };
        default: return { name: 'Agent', icon: Bot, color: 'text-gray-400' };
     }
  }

  const toolInfo = getToolDetails(activeTool);
  const ToolIcon = toolInfo.icon;

  return (
    <div className="flex flex-col h-full bg-ide-panel min-w-[350px] w-[450px] border-r border-ide-border">
      {/* Header */}
      <div className="h-14 border-b border-ide-border flex items-center px-4 justify-between bg-ide-bg">
        <div className="flex items-center gap-2">
            <span className="font-semibold text-base text-ide-textLight flex items-center gap-2">
              <ToolIcon size={18} className={toolInfo.color} />
              {toolInfo.name}
            </span>
            <button
              onClick={onOpenConfig}
              className="p-1.5 rounded-lg hover:bg-white/10 text-gray-400 hover:text-white transition-colors"
              title="Configure"
            >
               <SlidersHorizontal size={14} />
            </button>
        </div>

        <div className="flex items-center gap-2">
          {/* New Chat Button */}
          <button
            onClick={onNewChat}
            className="p-1.5 rounded-lg hover:bg-white/10 text-gray-400 hover:text-white transition-colors"
            title="New Chat"
          >
            <Plus size={16} />
          </button>

          {/* Chat History Dropdown */}
          <div className="relative" ref={historyDropdownRef}>
            <button
              onClick={() => setShowHistoryDropdown(!showHistoryDropdown)}
              className="p-1.5 rounded-lg hover:bg-white/10 text-gray-400 hover:text-white transition-colors"
              title="Chat History"
            >
              <History size={16} />
            </button>

            {showHistoryDropdown && (
              <div className="absolute right-0 top-full mt-1 w-72 bg-ide-panel border border-ide-border rounded-lg shadow-xl z-50 overflow-hidden">
                {/* Header with search */}
                <div className="p-2 border-b border-ide-border space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-gray-500 uppercase tracking-wider">Chat History</span>
                    <span className="text-[10px] text-gray-600">{chatSessions.length} chats</span>
                  </div>
                  {/* Search input */}
                  <div className="relative">
                    <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-500" />
                    <input
                      ref={searchInputRef}
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search chats..."
                      className="w-full bg-ide-bg border border-ide-border rounded pl-7 pr-7 py-1.5 text-xs text-gray-200 placeholder-gray-500 focus:outline-none focus:border-blue-500"
                    />
                    {searchQuery && (
                      <button
                        onClick={() => setSearchQuery('')}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300"
                      >
                        <X size={12} />
                      </button>
                    )}
                  </div>
                </div>

                {/* Session list */}
                <div className="max-h-64 overflow-y-auto">
                  {filteredSessions.length === 0 ? (
                    <div className="p-4 text-center text-gray-500 text-xs">
                      {searchQuery ? 'No matching chats found' : 'No chat history'}
                    </div>
                  ) : (
                    filteredSessions.map((session) => (
                      <div
                        key={session.id}
                        className={`group flex items-center justify-between px-3 py-2 hover:bg-white/5 transition-colors cursor-pointer ${
                          session.id === activeSessionId ? 'bg-blue-600/20 border-l-2 border-blue-500' : ''
                        }`}
                        onClick={() => {
                          onSwitchSession(session.id);
                          setShowHistoryDropdown(false);
                        }}
                      >
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          <MessageSquare size={14} className="text-gray-500 flex-shrink-0" />
                          <div className="flex-1 min-w-0">
                            <span className="text-sm text-gray-200 block truncate">{session.title}</span>
                            <span className="text-[10px] text-gray-500">
                              {new Date(session.updatedAt).toLocaleDateString()}
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all">
                          <button
                            onClick={(e) => handleExportSession(session, e)}
                            className="p-1 rounded hover:bg-blue-500/20 text-gray-500 hover:text-blue-400"
                            title="Export as Markdown"
                          >
                            <Download size={12} />
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onDeleteSession(session.id);
                            }}
                            className="p-1 rounded hover:bg-red-500/20 text-gray-500 hover:text-red-400"
                            title="Delete chat"
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Agent Selector Dropdown - Only show for Claude */}
          {activeTool === 'claude' && (
            <div className="relative" ref={agentDropdownRef}>
              <button
                onClick={() => setShowAgentDropdown(!showAgentDropdown)}
                className="flex items-center gap-1.5 px-2 py-1 text-xs rounded-lg bg-ide-panel border border-ide-border hover:bg-white/5 transition-colors"
              >
                <Users size={12} className="text-gray-400" />
                <span className="text-gray-300">{currentAgent || 'Default'}</span>
                <ChevronDown size={10} className={`text-gray-400 transition-transform ${showAgentDropdown ? 'rotate-180' : ''}`} />
              </button>

              {showAgentDropdown && (
                <div className="absolute right-0 top-full mt-1 w-56 bg-ide-panel border border-ide-border rounded-lg shadow-xl z-50 overflow-hidden">
                  <div className="p-2 border-b border-ide-border">
                    <span className="text-[10px] text-gray-500 uppercase tracking-wider">Built-in Agents</span>
                  </div>
                  {BUILT_IN_AGENTS.map((agent) => (
                    <button
                      key={agent.name}
                      onClick={() => {
                        onAgentChange(agent.name === 'Default' ? '' : agent.name);
                        setShowAgentDropdown(false);
                      }}
                      className={`w-full px-3 py-2 text-left hover:bg-white/5 transition-colors flex flex-col ${
                        (currentAgent === agent.name) || (agent.name === 'Default' && !currentAgent)
                          ? 'bg-blue-600/20 border-l-2 border-blue-500'
                          : ''
                      }`}
                    >
                      <span className="text-sm text-gray-200">{agent.name}</span>
                      <span className="text-[10px] text-gray-500">{agent.description}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Task Header (if current session is a task) */}
      {activeSession && isTaskSession(activeSession) && (
        <TaskHeader
          session={activeSession}
          onPause={onPauseTask || (() => {})}
          onResume={onResumeTask || (() => {})}
          onComplete={onCompleteTask || (() => {})}
          onToggleItem={onToggleTaskItem || (() => {})}
        />
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {messages.length === 0 && (
          <div className="h-full flex flex-col items-center justify-center text-gray-500 space-y-4 opacity-50">
             <div className="w-16 h-16 rounded-full bg-ide-border flex items-center justify-center">
                <ToolIcon size={32} className={toolInfo.color} />
             </div>
             <p className="text-center text-sm">How can I help you code today?</p>
          </div>
        )}
        
        {messages.map((msg) => (
          <div key={msg.id} className={`flex gap-3 ${msg.sender === Sender.USER ? 'flex-row-reverse' : 'flex-row'}`}>
            <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
              msg.sender === Sender.USER ? 'bg-blue-600' : 'bg-ide-border border border-ide-border'
            }`}>
              {msg.sender === Sender.USER ? <User size={16} /> : <ToolIcon size={16} className={toolInfo.color} />}
            </div>
            
            <div className={`max-w-[85%] rounded-2xl p-3 text-sm leading-relaxed ${
              msg.sender === Sender.USER
                ? 'bg-blue-600/10 text-blue-100 rounded-tr-none'
                : 'bg-ide-border/50 text-gray-300 rounded-tl-none'
            }`}>
              {msg.sender === Sender.AGENT ? (
                msg.isTerminalOutput ? (
                  // 终端输出使用 xterm 渲染
                  <TerminalMessage content={msg.text} />
                ) : (
                  <div className="prose prose-invert prose-sm max-w-none">
                    <ReactMarkdown
                      components={{
                        code({node, className, children, ...props}) {
                          const match = /language-(\w+)/.exec(className || '');
                          const language = match ? match[1] : undefined;
                          const codeString = String(children).replace(/\n$/, '');
                          const isBlock = codeString.includes('\n') || language;

                          // Use CodeBlock for code blocks (multi-line or with language)
                          if (isBlock) {
                            return <CodeBlock language={language}>{codeString}</CodeBlock>;
                          }

                          // Inline code
                          return (
                            <code className="px-1.5 py-0.5 bg-black/30 rounded text-xs font-mono text-pink-400" {...props}>
                              {children}
                            </code>
                          );
                        }
                      }}
                    >
                      {msg.text}
                    </ReactMarkdown>
                  </div>
                )
              ) : (
                msg.text
              )}
            </div>
          </div>
        ))}
        
        {isGenerating && (
          <div className="flex gap-3">
             <div className="w-8 h-8 rounded-full bg-ide-border border border-ide-border flex items-center justify-center flex-shrink-0 animate-pulse">
                <ToolIcon size={16} className={toolInfo.color} />
             </div>
             <div className="bg-ide-border/50 rounded-2xl rounded-tl-none p-3 text-sm text-gray-400">
               <span className="animate-pulse">Thinking...</span>
             </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="p-4 border-t border-ide-border bg-ide-bg">
        <form onSubmit={handleSubmit} className="relative">
          <textarea
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={`Ask ${toolInfo.name} to build something...`}
            className="w-full bg-ide-panel border border-ide-border text-ide-textLight rounded-xl pl-4 pr-12 py-3 focus:outline-none focus:border-ide-accent resize-none min-h-[50px] max-h-[120px] text-sm"
            rows={2}
          />
          <button 
            type="submit" 
            disabled={!inputValue.trim() || isGenerating}
            className={`absolute right-2 bottom-2 p-2 rounded-lg transition-colors ${
              inputValue.trim() && !isGenerating
                ? 'bg-blue-600 text-white hover:bg-blue-500' 
                : 'bg-transparent text-gray-600 cursor-not-allowed'
            }`}
          >
            <Send size={18} />
          </button>
        </form>
        <div className="text-[10px] text-gray-600 mt-2 text-center flex justify-center gap-4">
           <span>Model: gemini-3-pro</span>
           <span>Mode: Auto-Dev</span>
        </div>
      </div>
    </div>
  );
};

export default ChatPanel;