import React, { useState, useEffect } from 'react';
import { Play, Code, Terminal as TerminalIcon, RotateCw, Globe, Maximize2, Monitor, Smartphone } from 'lucide-react';
import { Tab } from '../types';

interface WorkspacePanelProps {
  activeTab: Tab;
  setActiveTab: (tab: Tab) => void;
  code: string | null;
}

const WorkspacePanel: React.FC<WorkspacePanelProps> = ({ activeTab, setActiveTab, code }) => {
  const [iframeKey, setIframeKey] = useState(0);
  const [viewport, setViewport] = useState<'desktop' | 'mobile'>('desktop');

  const handleRefresh = () => {
    setIframeKey(prev => prev + 1);
  };

  return (
    <div className="flex-1 flex flex-col bg-ide-bg h-full overflow-hidden relative">
      {/* Tabs Header */}
      <div className="h-12 border-b border-ide-border flex items-center justify-between px-4 bg-ide-bg">
        <div className="flex items-center gap-1 bg-ide-panel p-1 rounded-lg border border-ide-border">
          <TabButton 
            active={activeTab === Tab.PREVIEW} 
            onClick={() => setActiveTab(Tab.PREVIEW)}
            icon={<Play size={14} />}
            label="Preview"
          />
          <TabButton 
            active={activeTab === Tab.CODE} 
            onClick={() => setActiveTab(Tab.CODE)}
            icon={<Code size={14} />}
            label="Code"
          />
          <TabButton 
            active={activeTab === Tab.TERMINAL} 
            onClick={() => setActiveTab(Tab.TERMINAL)}
            icon={<TerminalIcon size={14} />}
            label="Terminal"
          />
        </div>

        {activeTab === Tab.PREVIEW && (
          <div className="flex items-center gap-2">
             <div className="flex items-center bg-black/40 rounded-md border border-ide-border px-3 py-1.5 text-xs text-gray-400 w-64 gap-2">
               <Globe size={12} />
               <span className="truncate">http://localhost:3000/preview</span>
             </div>
             <button onClick={handleRefresh} className="p-1.5 hover:bg-white/10 rounded-md text-gray-400">
                <RotateCw size={14} />
             </button>
             <div className="w-px h-4 bg-ide-border mx-1"></div>
             <button 
              onClick={() => setViewport('desktop')}
              className={`p-1.5 rounded-md ${viewport === 'desktop' ? 'text-blue-400 bg-blue-500/10' : 'text-gray-400 hover:bg-white/10'}`}>
                <Monitor size={14} />
             </button>
             <button 
              onClick={() => setViewport('mobile')}
              className={`p-1.5 rounded-md ${viewport === 'mobile' ? 'text-blue-400 bg-blue-500/10' : 'text-gray-400 hover:bg-white/10'}`}>
                <Smartphone size={14} />
             </button>
          </div>
        )}
      </div>

      {/* Content Area */}
      <div className="flex-1 relative bg-[#0d0f14] flex items-center justify-center p-4">
        
        {/* PREVIEW TAB */}
        <div className={`w-full h-full flex flex-col items-center justify-center transition-opacity duration-300 ${activeTab === Tab.PREVIEW ? 'opacity-100 z-10' : 'opacity-0 absolute inset-0 -z-10'}`}>
           {code ? (
             <div className={`transition-all duration-300 ease-in-out border border-ide-border shadow-2xl bg-white rounded-lg overflow-hidden ${viewport === 'mobile' ? 'w-[375px] h-[667px]' : 'w-full h-full'}`}>
               <iframe 
                 key={iframeKey}
                 srcDoc={code}
                 title="Preview"
                 className="w-full h-full bg-white"
                 sandbox="allow-scripts allow-modals allow-forms allow-popups allow-same-origin allow-top-navigation"
               />
             </div>
           ) : (
             <div className="flex flex-col items-center text-gray-600 gap-4">
               <div className="w-16 h-16 rounded-full bg-ide-panel border border-ide-border flex items-center justify-center">
                 <Play size={24} className="ml-1 opacity-50"/>
               </div>
               <p>No code generated yet. Ask the agent to build something!</p>
             </div>
           )}
        </div>

        {/* CODE TAB */}
        <div className={`w-full h-full absolute inset-0 bg-ide-bg p-0 overflow-auto ${activeTab === Tab.CODE ? 'opacity-100 z-10' : 'opacity-0 -z-10'}`}>
           {code ? (
             <pre className="p-4 text-sm font-mono text-gray-300 leading-relaxed tab-size-2">
               <code>{code}</code>
             </pre>
           ) : (
             <div className="flex items-center justify-center h-full text-gray-600">
               <p>Source code will appear here</p>
             </div>
           )}
        </div>

        {/* TERMINAL TAB */}
        <div className={`w-full h-full absolute inset-0 bg-black p-4 font-mono text-sm overflow-auto ${activeTab === Tab.TERMINAL ? 'opacity-100 z-10' : 'opacity-0 -z-10'}`}>
           <div className="text-green-500">➜  ~  project initialized</div>
           <div className="text-gray-400 mt-1">   Dependencies installed.</div>
           <div className="text-gray-400 mt-1">   Starting development server...</div>
           <div className="text-blue-400 mt-2">   Ready on http://localhost:3000</div>
           {code && (
             <>
                <div className="text-green-500 mt-4">➜  ~  build success</div>
                <div className="text-gray-400">   [HMR] hot reload active</div>
             </>
           )}
           <div className="mt-2 text-gray-500 animate-pulse">_</div>
        </div>

      </div>
    </div>
  );
};

const TabButton = ({ active, onClick, icon, label }: { active: boolean, onClick: () => void, icon: React.ReactNode, label: string }) => (
  <button 
    onClick={onClick}
    className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
      active 
        ? 'bg-ide-border text-white shadow-sm' 
        : 'text-gray-500 hover:text-gray-300 hover:bg-white/5'
    }`}
  >
    {icon}
    {label}
  </button>
);

export default WorkspacePanel;