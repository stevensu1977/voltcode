import React, { useState } from 'react';
import Sidebar from './components/Sidebar';
import ChatPanel from './components/ChatPanel';
import WorkspacePanel from './components/WorkspacePanel';
import ConfigPanel from './components/ConfigPanel';
import { Message, Sender, Tab, ToolId } from './types';
import { sendMessageToGemini } from './services/gemini';

// Initial welcome message
const INITIAL_MESSAGES: Message[] = [
  {
    id: '1',
    text: "Hello! I'm your AI coding assistant. I can help you build web apps, components, and prototypes instantly. Select a tool and start building!",
    sender: Sender.AGENT,
    timestamp: Date.now()
  }
];

const App: React.FC = () => {
  const [messages, setMessages] = useState<Message[]>(INITIAL_MESSAGES);
  const [activeTab, setActiveTab] = useState<Tab>(Tab.PREVIEW);
  const [generatedCode, setGeneratedCode] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  
  // Tool state
  const [activeTool, setActiveTool] = useState<ToolId>('claude');
  const [isConfigOpen, setIsConfigOpen] = useState(false);

  const handleToolSelect = (toolId: ToolId) => {
    setActiveTool(toolId);
    // Only switch the tool context, do not open config automatically
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
    // 1. Add user message
    const userMsg: Message = {
      id: Date.now().toString(),
      text,
      sender: Sender.USER,
      timestamp: Date.now()
    };
    
    setMessages(prev => [...prev, userMsg]);
    setIsGenerating(true);

    try {
      // 2. Call Gemini (simulating different agents with the same backend for this demo)
      // Prepare history for context
      const history = messages.map(m => ({
        role: m.sender === Sender.USER ? 'user' : 'model',
        parts: [{ text: m.text }]
      }));

      // In a real app, you would swap the service/endpoint based on activeTool
      const responseText = await sendMessageToGemini(text, history);

      // 3. Process response
      const code = extractCode(responseText);
      
      const agentMsg: Message = {
        id: (Date.now() + 1).toString(),
        text: responseText,
        sender: Sender.AGENT,
        timestamp: Date.now()
      };

      setMessages(prev => [...prev, agentMsg]);

      if (code) {
        setGeneratedCode(code);
        setActiveTab(Tab.PREVIEW); // Auto switch to preview when code is generated
      }

    } catch (error) {
      console.error(error);
      setMessages(prev => [...prev, {
        id: Date.now().toString(),
        text: "Sorry, I encountered an error while processing your request. Please try again.",
        sender: Sender.AGENT,
        timestamp: Date.now(),
        isError: true
      }]);
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="flex w-screen h-screen bg-ide-bg text-ide-text font-sans selection:bg-blue-500/30">
      <Sidebar 
        activeTool={activeTool} 
        onToolSelect={handleToolSelect} 
      />
      <div className="flex-1 flex overflow-hidden">
        <ChatPanel 
          messages={messages} 
          onSendMessage={handleSendMessage}
          isGenerating={isGenerating}
          activeTool={activeTool}
          onOpenConfig={() => setIsConfigOpen(true)}
        />
        <WorkspacePanel 
          activeTab={activeTab} 
          setActiveTab={setActiveTab}
          code={generatedCode}
        />
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