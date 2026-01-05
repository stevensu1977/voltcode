import React, { useState } from 'react';
import { open } from '@tauri-apps/plugin-dialog';

interface ProjectSelectorProps {
  onProjectSelect: (path: string) => void;
}

const ProjectSelector: React.FC<ProjectSelectorProps> = ({ onProjectSelect }) => {
  const [isSelecting, setIsSelecting] = useState(false);

  const handleSelectDirectory = async () => {
    setIsSelecting(true);
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: 'Select Project Directory'
      });

      if (selected && typeof selected === 'string') {
        onProjectSelect(selected);
      }
    } catch (error) {
      console.error('Error selecting directory:', error);
      alert('Failed to select directory. Please try again.');
    } finally {
      setIsSelecting(false);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-ide-bg">
      <div className="max-w-md w-full mx-4">
        <div className="bg-ide-panel rounded-lg border border-ide-border p-8 shadow-lg">
          {/* Logo/Icon */}
          <div className="flex justify-center mb-6">
            <div className="w-20 h-20 bg-ide-accent/20 rounded-lg flex items-center justify-center">
              <svg className="w-12 h-12 text-ide-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
              </svg>
            </div>
          </div>

          {/* Title */}
          <h1 className="text-2xl font-bold text-ide-text text-center mb-2">
            VoltCode
          </h1>
          <p className="text-ide-textLight text-center mb-8">
            AI-powered IDE for web development
          </p>

          {/* Description */}
          <div className="bg-ide-bg rounded-md p-4 mb-6">
            <p className="text-sm text-ide-textLight mb-2">
              To get started, select a project directory where all generated files will be saved.
            </p>
            <ul className="text-xs text-ide-textLight space-y-1 list-disc list-inside">
              <li>Choose an empty directory for a new project</li>
              <li>Or select an existing project to continue</li>
              <li>All CLI-generated files will be stored here</li>
            </ul>
          </div>

          {/* Open Button */}
          <button
            onClick={handleSelectDirectory}
            disabled={isSelecting}
            className="w-full bg-ide-accent hover:bg-ide-accent/90 text-white font-medium py-3 px-4 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {isSelecting ? (
              <>
                <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Selecting...
              </>
            ) : (
              <>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 19a2 2 0 01-2-2V7a2 2 0 012-2h4l2 2h4a2 2 0 012 2v1M5 19h14a2 2 0 002-2v-5a2 2 0 00-2-2H9a2 2 0 00-2 2v5a2 2 0 01-2 2z" />
                </svg>
                Open Project
              </>
            )}
          </button>

          {/* Recent Projects (placeholder for future) */}
          <div className="mt-6 pt-6 border-t border-ide-border">
            <p className="text-xs text-ide-textLight text-center">
              Recent projects will appear here
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-4 text-center">
          <p className="text-xs text-ide-textLight">
            Powered by Claude Code, Gemini, Codex, and Kiro
          </p>
        </div>
      </div>
    </div>
  );
};

export default ProjectSelector;
