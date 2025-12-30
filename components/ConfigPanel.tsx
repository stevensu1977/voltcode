import React, { useState } from 'react';
import { X, Box, Server, Terminal, Plus, Sparkles, Sun, Terminal as TerminalIcon } from 'lucide-react';
import { ToolId } from '../types';

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

interface ConfigPanelProps {
  isOpen: boolean;
  onClose: () => void;
  activeTool: ToolId;
}

const ConfigPanel: React.FC<ConfigPanelProps> = ({ isOpen, onClose, activeTool }) => {
  const [activeTab, setActiveTab] = useState('models');

  // Mock data for models based on the selected tool
  const getToolName = (id: ToolId) => {
    switch(id) {
      case 'claude': return 'Claude Code';
      case 'gemini': return 'Gemini CLI';
      case 'codex': return 'Codex CLI';
      case 'kiro': return 'Kiro CLI';
      default: return 'CLI Tool';
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-[800px] h-[500px] bg-[#141414] rounded-xl border border-ide-border shadow-2xl flex overflow-hidden flex-row">
        
        {/* Sidebar */}
        <div className="w-64 bg-[#1a1a1a] border-r border-ide-border p-4 flex flex-col">
          <div className="flex items-center justify-between mb-8">
            <h2 className="font-semibold text-gray-200">{getToolName(activeTool)}</h2>
          </div>

          <div className="space-y-1">
            <NavItem 
              icon={<Box size={18} />} 
              label="Models" 
              active={activeTab === 'models'} 
              onClick={() => setActiveTab('models')}
            />
            <NavItem 
              icon={<Server size={18} />} 
              label="MCP Servers" 
              active={activeTab === 'mcp'} 
              onClick={() => setActiveTab('mcp')}
            />
            <NavItem 
              icon={<Terminal size={18} />} 
              label="Commands" 
              active={activeTab === 'commands'} 
              onClick={() => setActiveTab('commands')}
            />
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 flex flex-col bg-[#141414]">
          <div className="h-14 border-b border-ide-border flex items-center justify-between px-6">
            <h3 className="font-medium text-lg text-white">
              {activeTab === 'models' && 'Models'}
              {activeTab === 'mcp' && 'MCP Servers'}
              {activeTab === 'commands' && 'Commands'}
            </h3>
            <button 
              onClick={onClose}
              className="p-1.5 hover:bg-white/10 rounded-full text-gray-400 hover:text-white transition-colors"
            >
              <X size={20} />
            </button>
          </div>

          <div className="p-6 overflow-y-auto flex-1">
            {activeTab === 'models' && (
              <div className="space-y-6">
                 {/* Tool Specific Model Configuration */}
                 {activeTool === 'gemini' ? (
                    <div className="bg-[#1a1a1a] border border-ide-border rounded-xl overflow-hidden p-4">
                        <div className="flex items-center justify-between mb-4">
                            <div className="flex items-center gap-3">
                                {/* Gemini Icon with gradient effect to match branding */}
                                <Sparkles className="text-blue-400" size={20} fill="currentColor" fillOpacity={0.2} />
                                <span className="font-medium text-gray-200">Gemini</span>
                            </div>
                            <SwitchButton enabled={true} />
                        </div>
                        
                        <div className="border border-ide-border rounded-lg overflow-hidden flex flex-col">
                            <ModelRow name="Gemini 3" />
                            <ModelRow name="Gemini 2.5 Pro" />
                            <ModelRow name="Gemini 2.0 Flash" isLast />
                        </div>
                    </div>
                 ) : (
                    <div className="space-y-4">
                        {activeTool === 'claude' && <ModelItem name="Anthropic" icon={<Sun size={18} className="text-orange-500" />} enabled />}
                        {activeTool === 'codex' && <ModelItem name="OpenAI" icon={<TerminalIcon size={18} className="text-purple-500" />} enabled />}
                        {activeTool === 'kiro' && <ModelItem name="Kiro" icon={<KiroIcon size={18} className="text-emerald-500" />} enabled />}
                    </div>
                 )}

                 <button className="w-full py-3 border border-dashed border-gray-700 rounded-lg text-gray-400 hover:text-white hover:border-gray-500 hover:bg-white/5 transition-all flex items-center justify-center gap-2">
                   <Plus size={18} />
                   <span>Add Configuration</span>
                 </button>
              </div>
            )}
            
            {activeTab === 'mcp' && (
               <div className="flex flex-col items-center justify-center h-full text-gray-500">
                  <Server size={48} className="mb-4 opacity-20" />
                  <p>No MCP Servers configured.</p>
               </div>
            )}

            {activeTab === 'commands' && (
               <div className="flex flex-col items-center justify-center h-full text-gray-500">
                  <Terminal size={48} className="mb-4 opacity-20" />
                  <p>Custom commands will appear here.</p>
               </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

const NavItem = ({ icon, label, active, onClick }: { icon: React.ReactNode, label: string, active: boolean, onClick: () => void }) => (
  <button 
    onClick={onClick}
    className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
      active 
        ? 'bg-ide-accent/10 text-ide-accent' 
        : 'text-gray-400 hover:bg-white/5 hover:text-gray-200'
    }`}
  >
    {icon}
    {label}
  </button>
);

const ModelItem = ({ name, icon, enabled = false }: { name: string, icon?: React.ReactNode, enabled?: boolean }) => {
  return (
    <div className="flex items-center justify-between p-4 bg-[#1a1a1a] border border-ide-border rounded-xl">
      <div className="flex items-center gap-3">
         <div className={`w-8 h-8 rounded-lg flex items-center justify-center bg-gray-800 text-gray-400`}>
            {icon ? icon : <span className="font-bold text-xs">{name[0]}</span>}
         </div>
         <span className="font-medium text-gray-200">{name}</span>
      </div>
      <SwitchButton enabled={enabled} />
    </div>
  );
};

const SwitchButton = ({ enabled }: { enabled: boolean }) => {
    const [isOn, setIsOn] = useState(enabled);
    return (
      <button 
        onClick={() => setIsOn(!isOn)}
        className={`w-12 h-6 rounded-full relative transition-colors duration-200 ease-in-out ${
          isOn ? 'bg-white' : 'bg-gray-700'
        }`}
      >
        <div className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-black transition-transform duration-200 ease-in-out ${
           isOn ? 'translate-x-6' : 'translate-x-0'
        }`} />
      </button>
    );
};

const ModelRow = ({ name, isLast }: { name: string, isLast?: boolean }) => (
    <div className={`px-4 py-3 bg-[#1e1e1e] hover:bg-[#252525] text-sm text-gray-300 cursor-pointer transition-colors ${!isLast ? 'border-b border-ide-border' : ''}`}>
        {name}
    </div>
);

export default ConfigPanel;