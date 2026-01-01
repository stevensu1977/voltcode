import React, { useState, useEffect, useRef } from 'react';
import { X, Box, Server, Terminal, Plus, Sparkles, Sun, Terminal as TerminalIcon, Zap, FileText, ExternalLink, Check, ChevronDown, Trash2 } from 'lucide-react';
import { SkillInfo, ClaudeProvider, McpServerInfo, McpTransportType } from '../types';
import { ToolId } from '../types';
import { cliRouter } from '../services/cliRouter';

// AWS Regions data
const AWS_REGIONS = ['us-east-1', 'us-west-2'];

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

// AWS Bedrock Icon Component
const BedrockIcon = ({ size = 24, className }: { size?: number | string, className?: string }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width={size}
    height={size}
    viewBox="0 0 80 80"
    fill="none"
    className={className}
  >
    <path d="M40 0L73.3 20V60L40 80L6.7 60V20L40 0Z" fill="currentColor" fillOpacity="0.2"/>
    <path d="M40 10L63.3 23.5V50.5L40 64L16.7 50.5V23.5L40 10Z" fill="currentColor" fillOpacity="0.4"/>
    <path d="M40 20L53.3 27.5V42.5L40 50L26.7 42.5V27.5L40 20Z" fill="currentColor"/>
  </svg>
);

const ConfigPanel: React.FC<ConfigPanelProps> = ({ isOpen, onClose, activeTool }) => {
  const [activeTab, setActiveTab] = useState('models');
  const [claudeProvider, setClaudeProvider] = useState<ClaudeProvider>(cliRouter.getProvider());
  const [bedrockRegion, setBedrockRegion] = useState(cliRouter.getBedrockRegion());
  const [showRegionDropdown, setShowRegionDropdown] = useState(false);
  const regionDropdownRef = useRef<HTMLDivElement>(null);

  // Close region dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (regionDropdownRef.current && !regionDropdownRef.current.contains(event.target as Node)) {
        setShowRegionDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Handle provider change
  const handleProviderChange = (provider: ClaudeProvider) => {
    setClaudeProvider(provider);
    cliRouter.setProvider(provider);
  };

  // Handle region change
  const handleRegionChange = (region: string) => {
    setBedrockRegion(region);
    cliRouter.setBedrockRegion(region);
    setShowRegionDropdown(false);
  };

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
            <NavItem
              icon={<Zap size={18} />}
              label="Skills"
              active={activeTab === 'skills'}
              onClick={() => setActiveTab('skills')}
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
              {activeTab === 'skills' && 'Skills'}
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
                 ) : activeTool === 'claude' ? (
                    <div className="space-y-4">
                      <p className="text-xs text-gray-500 mb-2">
                        Select the provider for Claude Code API calls
                      </p>

                      {/* Anthropic Provider */}
                      <ProviderCard
                        name="Anthropic"
                        description="Direct API access via Anthropic"
                        icon={<Sun size={20} className="text-orange-500" />}
                        selected={claudeProvider === 'anthropic'}
                        onClick={() => handleProviderChange('anthropic')}
                      />

                      {/* Amazon Bedrock Provider */}
                      <ProviderCard
                        name="Amazon Bedrock"
                        description="AWS managed service for Claude"
                        icon={<BedrockIcon size={20} className="text-amber-500" />}
                        selected={claudeProvider === 'bedrock'}
                        onClick={() => handleProviderChange('bedrock')}
                      />

                      {/* Bedrock Region Selector - Only show when Bedrock is selected */}
                      {claudeProvider === 'bedrock' && (
                        <div className="bg-[#1a1a1a] border border-ide-border rounded-xl p-4 ml-4">
                          <label className="block text-xs text-gray-500 mb-2">Region</label>

                          {/* Custom Region Dropdown */}
                          <div className="relative" ref={regionDropdownRef}>
                            <button
                              onClick={() => setShowRegionDropdown(!showRegionDropdown)}
                              className="w-full flex items-center justify-between bg-[#0d0d0d] border border-ide-border rounded-lg px-3 py-2 text-sm text-gray-200 hover:border-gray-600 transition-colors"
                            >
                              <span className="font-mono">{bedrockRegion}</span>
                              <ChevronDown
                                size={14}
                                className={`text-gray-500 transition-transform ${showRegionDropdown ? 'rotate-180' : ''}`}
                              />
                            </button>

                            {/* Dropdown Menu */}
                            {showRegionDropdown && (
                              <div className="absolute top-full left-0 right-0 mt-1 bg-[#1a1a1a] border border-ide-border rounded-lg shadow-xl z-50 overflow-hidden">
                                {AWS_REGIONS.map((region) => (
                                  <button
                                    key={region}
                                    onClick={() => handleRegionChange(region)}
                                    className={`w-full flex items-center justify-between px-3 py-2 text-sm font-mono hover:bg-white/5 transition-colors ${
                                      region === bedrockRegion ? 'bg-blue-600/10 text-blue-400' : 'text-gray-300'
                                    }`}
                                  >
                                    {region}
                                    {region === bedrockRegion && <Check size={14} />}
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>

                          <p className="text-[10px] text-gray-500 mt-2">
                            Requires AWS credentials via CLI or env vars
                          </p>
                        </div>
                      )}
                    </div>
                 ) : (
                    <div className="space-y-4">
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
               <McpServersContent activeTool={activeTool} />
            )}

            {activeTab === 'commands' && (
               <div className="flex flex-col items-center justify-center h-full text-gray-500">
                  <Terminal size={48} className="mb-4 opacity-20" />
                  <p>Custom commands will appear here.</p>
               </div>
            )}

            {activeTab === 'skills' && (
               <SkillsContent activeTool={activeTool} />
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

// Provider Card Component for Claude
const ProviderCard = ({
  name,
  description,
  icon,
  selected,
  onClick
}: {
  name: string;
  description: string;
  icon: React.ReactNode;
  selected: boolean;
  onClick: () => void;
}) => (
  <button
    onClick={onClick}
    className={`w-full flex items-center justify-between p-4 rounded-xl border transition-all ${
      selected
        ? 'bg-blue-600/10 border-blue-500/50'
        : 'bg-[#1a1a1a] border-ide-border hover:bg-[#1e1e1e]'
    }`}
  >
    <div className="flex items-center gap-3">
      <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
        selected ? 'bg-blue-500/20' : 'bg-gray-800'
      }`}>
        {icon}
      </div>
      <div className="text-left">
        <span className="font-medium text-gray-200 block">{name}</span>
        <span className="text-xs text-gray-500">{description}</span>
      </div>
    </div>
    {selected && (
      <div className="w-6 h-6 rounded-full bg-blue-500 flex items-center justify-center">
        <Check size={14} className="text-white" />
      </div>
    )}
  </button>
);

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

// Skills Content Component
const SkillsContent: React.FC<{ activeTool: ToolId }> = ({ activeTool }) => {
  const [skills, setSkills] = useState<SkillInfo[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadSkills = async () => {
      if (activeTool !== 'claude') {
        setSkills([]);
        setLoading(false);
        return;
      }

      try {
        const { invoke } = await import('@tauri-apps/api/core');
        const skillsList = await invoke<SkillInfo[]>('read_claude_skills');
        setSkills(skillsList);
      } catch (error) {
        console.error('Failed to load skills:', error);
        setSkills([]);
      } finally {
        setLoading(false);
      }
    };

    loadSkills();
  }, [activeTool]);

  if (activeTool !== 'claude') {
    return (
      <div className="flex flex-col items-center justify-center h-full text-gray-500">
        <Zap size={48} className="mb-4 opacity-20" />
        <p>Skills are only available for Claude Code.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-gray-500">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-ide-accent mb-4" />
        <p>Loading skills...</p>
      </div>
    );
  }

  if (skills.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-gray-500">
        <Zap size={48} className="mb-4 opacity-20" />
        <p>No skills found.</p>
        <p className="text-xs mt-2">Skills are located in ~/.claude/skills/</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-gray-500 mb-4">
        Skills extend Claude Code's capabilities. Located in ~/.claude/skills/
      </p>
      {skills.map((skill, index) => (
        <div
          key={index}
          className="flex items-center justify-between p-4 bg-[#1a1a1a] border border-ide-border rounded-xl hover:bg-[#1e1e1e] transition-colors"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-gradient-to-br from-purple-500/20 to-blue-500/20 text-purple-400">
              <FileText size={20} />
            </div>
            <div>
              <span className="font-medium text-gray-200 block">{skill.name}</span>
              <span className="text-xs text-gray-500">{skill.path}</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {skill.token_count && (
              <span className="text-xs text-gray-500 bg-gray-800 px-2 py-1 rounded">
                {skill.token_count.toLocaleString()} tokens
              </span>
            )}
            <button
              className="p-2 hover:bg-white/10 rounded-lg text-gray-400 hover:text-white transition-colors"
              title="Open skill file"
            >
              <ExternalLink size={16} />
            </button>
          </div>
        </div>
      ))}

      <button className="w-full py-3 border border-dashed border-gray-700 rounded-lg text-gray-400 hover:text-white hover:border-gray-500 hover:bg-white/5 transition-all flex items-center justify-center gap-2 mt-4">
        <Plus size={18} />
        <span>Add Skill</span>
      </button>
    </div>
  );
};

// MCP Servers Content Component
const McpServersContent: React.FC<{ activeTool: ToolId }> = ({ activeTool }) => {
  const [servers, setServers] = useState<McpServerInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [newServer, setNewServer] = useState<{
    name: string;
    transport: McpTransportType;
    command: string;
    args: string;
    url: string;
    token: string;
  }>({ name: '', transport: 'stdio', command: '', args: '', url: '', token: '' });
  const [isAdding, setIsAdding] = useState(false);

  const loadServers = async () => {
    if (activeTool !== 'claude') {
      setServers([]);
      setLoading(false);
      return;
    }

    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const serverList = await invoke<McpServerInfo[]>('read_mcp_servers');
      setServers(serverList);
    } catch (error) {
      console.error('Failed to load MCP servers:', error);
      setServers([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadServers();
  }, [activeTool]);

  const handleAddServer = async () => {
    const { name, transport, command, args, url, token } = newServer;

    // Validate based on transport type
    if (!name.trim()) return;
    if (transport === 'stdio' && !command.trim()) return;
    if (transport === 'http' && !url.trim()) return;

    setIsAdding(true);
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const argsArray = args.trim() ? args.split(' ').filter(a => a) : undefined;

      await invoke('add_mcp_server', {
        name: name.trim(),
        transport,
        command: transport === 'stdio' ? command.trim() : undefined,
        args: transport === 'stdio' ? argsArray : undefined,
        url: transport === 'http' ? url.trim() : undefined,
        token: transport === 'http' && token.trim() ? token.trim() : undefined,
      });

      setNewServer({ name: '', transport: 'stdio', command: '', args: '', url: '', token: '' });
      setShowAddDialog(false);
      await loadServers();
    } catch (error) {
      console.error('Failed to add MCP server:', error);
    } finally {
      setIsAdding(false);
    }
  };

  const handleRemoveServer = async (name: string) => {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('remove_mcp_server', { name });
      await loadServers();
    } catch (error) {
      console.error('Failed to remove MCP server:', error);
    }
  };

  const handleToggleServer = async (name: string, currentDisabled: boolean) => {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('toggle_mcp_server', { name, disabled: !currentDisabled });
      await loadServers();
    } catch (error) {
      console.error('Failed to toggle MCP server:', error);
    }
  };

  if (activeTool !== 'claude') {
    return (
      <div className="flex flex-col items-center justify-center h-full text-gray-500">
        <Server size={48} className="mb-4 opacity-20" />
        <p>MCP Servers are only available for Claude Code.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-gray-500">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-ide-accent mb-4" />
        <p>Loading MCP servers...</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-gray-500 mb-4">
        MCP servers extend Claude Code with additional tools. Config: ~/.claude.json
      </p>

      {servers.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-8 text-gray-500">
          <Server size={40} className="mb-3 opacity-20" />
          <p className="text-sm">No MCP servers configured</p>
        </div>
      ) : (
        servers.map((server) => (
          <div
            key={server.name}
            className={`flex items-center justify-between p-4 bg-[#1a1a1a] border border-ide-border rounded-xl hover:bg-[#1e1e1e] transition-colors group ${
              server.disabled ? 'opacity-50' : ''
            }`}
          >
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${
                server.disabled
                  ? 'bg-gray-700/50 text-gray-500'
                  : server.transport === 'http'
                    ? 'bg-gradient-to-br from-blue-500/20 to-cyan-500/20 text-blue-400'
                    : 'bg-gradient-to-br from-green-500/20 to-emerald-500/20 text-green-400'
              }`}>
                <Server size={20} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className={`font-medium ${server.disabled ? 'text-gray-500' : 'text-gray-200'}`}>
                    {server.name}
                  </span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                    server.disabled
                      ? 'bg-gray-700 text-gray-500'
                      : server.transport === 'http'
                        ? 'bg-blue-500/20 text-blue-400'
                        : 'bg-green-500/20 text-green-400'
                  }`}>
                    {server.transport.toUpperCase()}
                  </span>
                </div>
                <span className="text-xs text-gray-500 truncate block">
                  {server.transport === 'http'
                    ? server.url
                    : `${server.command} ${server.args?.join(' ') || ''}`
                  }
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {/* Enable/Disable Switch */}
              <button
                onClick={() => handleToggleServer(server.name, !!server.disabled)}
                className={`w-10 h-5 rounded-full relative transition-colors ${
                  server.disabled ? 'bg-gray-700' : 'bg-green-500'
                }`}
                title={server.disabled ? 'Enable server' : 'Disable server'}
              >
                <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
                  server.disabled ? 'left-0.5' : 'left-5'
                }`} />
              </button>
              {/* Delete Button */}
              <button
                onClick={() => handleRemoveServer(server.name)}
                className="p-2 hover:bg-red-500/20 rounded-lg text-gray-500 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100"
                title="Remove server"
              >
                <Trash2 size={16} />
              </button>
            </div>
          </div>
        ))
      )}

      {/* Add Server Button / Dialog */}
      {!showAddDialog ? (
        <button
          onClick={() => setShowAddDialog(true)}
          className="w-full py-3 border border-dashed border-gray-700 rounded-lg text-gray-400 hover:text-white hover:border-gray-500 hover:bg-white/5 transition-all flex items-center justify-center gap-2 mt-4"
        >
          <Plus size={18} />
          <span>Add MCP Server</span>
        </button>
      ) : (
        <div className="bg-[#1a1a1a] border border-ide-border rounded-xl p-4 mt-4 space-y-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Server Name</label>
            <input
              type="text"
              value={newServer.name}
              onChange={(e) => setNewServer({ ...newServer, name: e.target.value })}
              placeholder="my-server"
              className="w-full bg-[#0d0d0d] border border-ide-border rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-ide-accent"
            />
          </div>

          {/* Transport Type Selection */}
          <div>
            <label className="block text-xs text-gray-500 mb-1">Transport</label>
            <div className="flex gap-2">
              <button
                onClick={() => setNewServer({ ...newServer, transport: 'stdio' })}
                className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
                  newServer.transport === 'stdio'
                    ? 'bg-green-500/20 text-green-400 border border-green-500/50'
                    : 'bg-[#0d0d0d] text-gray-400 border border-ide-border hover:bg-[#151515]'
                }`}
              >
                STDIO
              </button>
              <button
                onClick={() => setNewServer({ ...newServer, transport: 'http' })}
                className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
                  newServer.transport === 'http'
                    ? 'bg-blue-500/20 text-blue-400 border border-blue-500/50'
                    : 'bg-[#0d0d0d] text-gray-400 border border-ide-border hover:bg-[#151515]'
                }`}
              >
                HTTP
              </button>
            </div>
          </div>

          {/* Conditional Fields based on Transport Type */}
          {newServer.transport === 'stdio' ? (
            <>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Command</label>
                <input
                  type="text"
                  value={newServer.command}
                  onChange={(e) => setNewServer({ ...newServer, command: e.target.value })}
                  placeholder="npx or /path/to/binary"
                  className="w-full bg-[#0d0d0d] border border-ide-border rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-ide-accent"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Arguments (space separated)</label>
                <input
                  type="text"
                  value={newServer.args}
                  onChange={(e) => setNewServer({ ...newServer, args: e.target.value })}
                  placeholder="-y @modelcontextprotocol/server-filesystem /path"
                  className="w-full bg-[#0d0d0d] border border-ide-border rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-ide-accent"
                />
              </div>
            </>
          ) : (
            <>
              <div>
                <label className="block text-xs text-gray-500 mb-1">URL</label>
                <input
                  type="text"
                  value={newServer.url}
                  onChange={(e) => setNewServer({ ...newServer, url: e.target.value })}
                  placeholder="http://localhost:8080/mcp"
                  className="w-full bg-[#0d0d0d] border border-ide-border rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-ide-accent"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">API Token (optional)</label>
                <input
                  type="password"
                  value={newServer.token}
                  onChange={(e) => setNewServer({ ...newServer, token: e.target.value })}
                  placeholder="Bearer token for Authorization header"
                  className="w-full bg-[#0d0d0d] border border-ide-border rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-ide-accent"
                />
                <p className="text-[10px] text-gray-500 mt-1">Will be sent as: Authorization: Bearer &lt;token&gt;</p>
              </div>
            </>
          )}

          <div className="flex gap-2 pt-2">
            <button
              onClick={() => {
                setShowAddDialog(false);
                setNewServer({ name: '', transport: 'stdio', command: '', args: '', url: '', token: '' });
              }}
              className="flex-1 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg text-sm text-gray-300 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleAddServer}
              disabled={
                !newServer.name.trim() ||
                (newServer.transport === 'stdio' && !newServer.command.trim()) ||
                (newServer.transport === 'http' && !newServer.url.trim()) ||
                isAdding
              }
              className="flex-1 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:text-gray-500 rounded-lg text-sm text-white transition-colors"
            >
              {isAdding ? 'Adding...' : 'Add Server'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default ConfigPanel;