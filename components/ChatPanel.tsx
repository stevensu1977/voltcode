import React, { useState, useRef, useEffect } from 'react';
import { Send, Bot, User, Sparkles, Files, Sun, Terminal, SlidersHorizontal } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { Message, Sender, ToolId } from '../types';

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
}

const ChatPanel: React.FC<ChatPanelProps> = ({ 
  messages, 
  onSendMessage, 
  isGenerating,
  activeTool,
  onOpenConfig
}) => {
  const [inputValue, setInputValue] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputValue.trim() && !isGenerating) {
      onSendMessage(inputValue);
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
        case 'codex': return { name: 'Codex CLI', icon: Terminal, color: 'text-purple-400' };
        case 'kiro': return { name: 'Kiro CLI', icon: KiroIcon, color: 'text-emerald-400' };
        default: return { name: 'Agent', icon: Bot, color: 'text-gray-400' };
     }
  }

  const toolInfo = getToolDetails(activeTool);
  const ToolIcon = toolInfo.icon;

  return (
    <div className="flex flex-col h-full bg-ide-panel min-w-[350px] w-[450px] border-r border-ide-border">
      {/* Header */}
      <div className="h-14 border-b border-ide-border flex items-center px-6 justify-between bg-ide-bg">
        <div className="flex items-center gap-3">
            <span className="font-semibold text-lg text-ide-textLight flex items-center gap-2">
              <ToolIcon size={20} className={toolInfo.color} />
              {toolInfo.name}
            </span>
            <button 
              onClick={onOpenConfig}
              className="p-1.5 rounded-lg bg-ide-panel hover:bg-white/10 text-gray-400 hover:text-white transition-colors border border-ide-border group"
              title="Configure"
            >
               <SlidersHorizontal size={14} className="group-hover:text-ide-textLight" />
            </button>
        </div>

        <div className="flex bg-ide-panel rounded-full p-1 border border-ide-border">
            <button className="px-3 py-0.5 text-xs rounded-full bg-ide-border text-white font-medium shadow-sm">Agent</button>
            <button className="px-3 py-0.5 text-xs rounded-full text-gray-500 hover:text-gray-300">Coach</button>
        </div>
      </div>

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
                 <div className="prose prose-invert prose-sm max-w-none">
                   <ReactMarkdown 
                    components={{
                      code({node, className, children, ...props}) {
                         // Hide large blocks of code in chat to keep it clean, user sees it in right panel
                         const match = /language-(\w+)/.exec(className || '')
                         const isBlock = match && String(children).includes('\n');
                         if (isBlock) {
                           return (
                             <div className="my-2 p-2 bg-black/30 rounded border border-white/10 text-xs font-mono text-emerald-400 flex items-center gap-2">
                               <Files size={14} />
                               <span>Code generated. Check preview.</span>
                             </div>
                           )
                         }
                         return <code className={className} {...props}>{children}</code>
                      }
                    }}
                   >
                     {msg.text}
                   </ReactMarkdown>
                 </div>
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