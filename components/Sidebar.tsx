import React from 'react';
import {
  Settings,
  Sun,
  Sparkles,
  Terminal,
  Plus,
  Folder,
  UserCircle
} from 'lucide-react';
import { ToolId, ToolDefinition } from '../types';

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
    <path d="M10.9614 10.4413C9.97202 10.4413 9.82422 9.25893 9.82422 8.55407C9.82422 7.91791 9.93824 7.4124 10.1542 7.09197C10.3441 6.81003 10.6158 6.66699 10.9614 6.66699C11.3071 6.66699 11.6036 6.81228 11.8128 7.09892C12.0511 7.42554 12.177 7.92861 12.177 8.55407C12.177 9.73591 11.7226 10.4413 10.9616 10.4413H10.9614Z" fill="currentColor"></path>
    <path d="M15.0318 10.4413C14.0423 10.4413 13.8945 9.25893 13.8945 8.55407C13.8945 7.91791 14.0086 7.4124 14.2245 7.09197C14.4144 6.81003 14.6861 6.66699 15.0318 6.66699C15.3774 6.66699 15.6739 6.81228 15.8831 7.09892C16.1214 7.42554 16.2474 7.92861 16.2474 8.55407C16.2474 9.73591 15.793 10.4413 15.0319 10.4413H15.0318Z" fill="currentColor"></path>
  </svg>
);

interface SidebarProps {
  activeTool: ToolId;
  onToolSelect: (toolId: ToolId) => void;
  onRequestAgentSwitch?: (targetTool: ToolId) => void;  // Opens switch dialog
  onChangeProject?: () => void;
  projectDir?: string | null;
  onOpenProfile?: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({ activeTool, onToolSelect, onRequestAgentSwitch, onChangeProject, projectDir, onOpenProfile }) => {
  // Handler for tool clicks - opens dialog for different agents, does nothing for current
  const handleToolClick = (toolId: ToolId) => {
    if (toolId === activeTool) {
      // Clicking current tool - no action (could open config later)
      return;
    }
    // Opening switch dialog via callback
    if (onRequestAgentSwitch) {
      onRequestAgentSwitch(toolId);
    } else {
      // Fallback to direct switch if no dialog handler
      onToolSelect(toolId);
    }
  };

  // Definition of CLI tools for easy expansion
  const cliTools: ToolDefinition[] = [
    { id: 'claude', name: 'Claude Code', icon: <Sun size={24} />, color: 'text-orange-500' },
    { id: 'gemini', name: 'Gemini CLI', icon: <Sparkles size={24} />, color: 'text-blue-400' },
    { id: 'codex', name: 'Codex CLI', icon: <Terminal size={24} />, color: 'text-purple-400' },
    { 
      id: 'kiro', 
      name: 'Kiro CLI', 
      // Using a purple badge with white icon to match the Kiro brand
      icon: (
        <div className="w-6 h-6 rounded-[6px] bg-[#7c3aed] flex items-center justify-center shadow-sm">
           <KiroIcon size={15} className="text-white" />
        </div>
      ),
      color: 'text-white' 
    },
  ];

  // Get project name from path
  const projectName = projectDir ? projectDir.split('/').pop() || 'Project' : '';

  return (
    <div className="w-16 h-full bg-ide-sidebar border-r border-ide-border flex flex-col items-center py-4 justify-between z-20 shadow-xl">
      <div className="flex flex-col gap-4 w-full items-center">

        {/* Project Folder Button */}
        {onChangeProject && projectDir && (
          <div className="flex flex-col gap-1 w-full items-center pb-4 border-b border-ide-border/50">
            <div
              onClick={onChangeProject}
              className="relative p-2.5 rounded-xl cursor-pointer hover:bg-white/5 text-ide-accent hover:text-ide-textLight transition-all duration-200 group"
              title={`Change Project\nCurrent: ${projectName}`}
            >
              <Folder size={24} />
              {/* Small indicator dot */}
              <div className="absolute bottom-1 right-1 w-2 h-2 bg-green-500 rounded-full" />
            </div>
          </div>
        )}

        {/* Agent/CLI Switcher Section */}
        <div className="flex flex-col gap-3 w-full items-center pb-4 border-b border-ide-border/50">
           {cliTools.map((tool) => (
             <div
               key={tool.id}
               onClick={() => handleToolClick(tool.id)}
               className={`relative p-2.5 rounded-xl cursor-pointer transition-all duration-200 group ${
                 activeTool === tool.id
                   ? 'bg-white/10 shadow-lg'
                   : 'hover:bg-white/5'
               }`}
               title={activeTool === tool.id ? tool.name : `Switch to ${tool.name}`}
             >
               {/* Icon with specific brand color */}
               <div className={`${tool.color} transition-transform group-hover:scale-110 flex items-center justify-center`}>
                 {tool.icon}
               </div>

               {/* Active Indicator Bar (Left) */}
               {activeTool === tool.id && (
                 <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-ide-textLight rounded-r-full -ml-2" />
               )}
             </div>
           ))}

           {/* Add New Tool Button */}
           <div className="p-2.5 rounded-xl cursor-pointer hover:bg-white/5 text-gray-500 hover:text-gray-300 transition-colors" title="Add CLI Tool">
              <Plus size={20} />
           </div>
        </div>
      </div>

      <div className="flex flex-col gap-4">
        <div onClick={onOpenProfile} title="Profile">
          <SidebarIcon icon={<UserCircle size={22} />} />
        </div>
        <SidebarIcon icon={<Settings size={22} />} />
      </div>
    </div>
  );
};

interface SidebarIconProps {
  icon: React.ReactNode;
  active?: boolean;
}

const SidebarIcon: React.FC<SidebarIconProps> = ({ icon, active }) => {
  return (
    <div className={`p-2.5 rounded-lg cursor-pointer transition-colors duration-200 ${
      active ? 'text-ide-textLight bg-white/10' : 'text-gray-500 hover:text-ide-text hover:bg-white/5'
    }`}>
      {icon}
    </div>
  );
};

export default Sidebar;