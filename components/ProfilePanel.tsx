import React from 'react';
import { X, Mail, MapPin, Calendar, Github, ExternalLink } from 'lucide-react';

interface ProfilePanelProps {
  onClose: () => void;
}

// Mock user data
const mockUser = {
  name: 'John Developer',
  email: 'john.dev@example.com',
  avatar: null, // Using initials instead
  location: 'San Francisco, CA',
  joinDate: 'January 2024',
  bio: 'Full-stack developer passionate about building great products with AI assistance.',
  github: 'johndev',
  stats: {
    projects: 12,
    commits: 847,
    conversations: 156
  }
};

const ProfilePanel: React.FC<ProfilePanelProps> = ({ onClose }) => {
  const initials = mockUser.name.split(' ').map(n => n[0]).join('');

  return (
    <div className="flex-1 h-full bg-ide-panel border-l border-ide-border flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-ide-border">
        <h2 className="text-sm font-medium text-ide-textLight">Profile</h2>
        <button
          onClick={onClose}
          className="p-1.5 rounded-lg hover:bg-white/10 text-ide-text hover:text-ide-textLight transition-colors"
          title="Back to Workspace"
        >
          <X size={16} />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {/* Banner */}
        <div className="h-32 bg-gradient-to-r from-blue-600 via-purple-600 to-pink-600" />

        {/* Avatar */}
        <div className="px-6 -mt-16">
          <div className="w-32 h-32 rounded-2xl bg-ide-bg border-4 border-ide-panel flex items-center justify-center text-3xl font-bold text-ide-textLight shadow-lg">
            {initials}
          </div>
        </div>

        {/* User Info */}
        <div className="px-6 pt-4 pb-6">
          <h2 className="text-2xl font-semibold text-ide-textLight">{mockUser.name}</h2>
          <p className="text-sm text-ide-text mt-2">{mockUser.bio}</p>

          {/* Details */}
          <div className="mt-6 space-y-3">
            <div className="flex items-center gap-3 text-sm text-ide-text">
              <Mail size={16} className="text-ide-accent" />
              <span>{mockUser.email}</span>
            </div>
            <div className="flex items-center gap-3 text-sm text-ide-text">
              <MapPin size={16} className="text-ide-accent" />
              <span>{mockUser.location}</span>
            </div>
            <div className="flex items-center gap-3 text-sm text-ide-text">
              <Calendar size={16} className="text-ide-accent" />
              <span>Joined {mockUser.joinDate}</span>
            </div>
            <div className="flex items-center gap-3 text-sm text-ide-text">
              <Github size={16} className="text-ide-accent" />
              <a href={`https://github.com/${mockUser.github}`} target="_blank" rel="noopener noreferrer" className="hover:text-ide-textLight flex items-center gap-1">
                {mockUser.github}
                <ExternalLink size={14} />
              </a>
            </div>
          </div>

          {/* Stats */}
          <div className="mt-8 grid grid-cols-3 gap-4">
            <div className="bg-ide-bg rounded-xl p-4 text-center">
              <div className="text-2xl font-bold text-ide-textLight">{mockUser.stats.projects}</div>
              <div className="text-xs text-ide-text mt-1">Projects</div>
            </div>
            <div className="bg-ide-bg rounded-xl p-4 text-center">
              <div className="text-2xl font-bold text-ide-textLight">{mockUser.stats.commits}</div>
              <div className="text-xs text-ide-text mt-1">Commits</div>
            </div>
            <div className="bg-ide-bg rounded-xl p-4 text-center">
              <div className="text-2xl font-bold text-ide-textLight">{mockUser.stats.conversations}</div>
              <div className="text-xs text-ide-text mt-1">Chats</div>
            </div>
          </div>

          {/* Actions */}
          <div className="mt-8 flex gap-4">
            <button className="flex-1 py-3 px-4 bg-ide-accent hover:bg-ide-accent/80 text-white rounded-xl font-medium transition-colors">
              Edit Profile
            </button>
            <button className="flex-1 py-3 px-4 bg-ide-bg hover:bg-white/10 text-ide-textLight rounded-xl font-medium transition-colors border border-ide-border">
              Settings
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProfilePanel;
