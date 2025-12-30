import React from 'react';

export enum Sender {
  USER = 'USER',
  AGENT = 'AGENT'
}

export interface Message {
  id: string;
  text: string;
  sender: Sender;
  timestamp: number;
  isError?: boolean;
}

export interface GeneratedFile {
  name: string;
  content: string;
  language: string;
}

export enum Tab {
  PREVIEW = 'PREVIEW',
  CODE = 'CODE',
  TERMINAL = 'TERMINAL'
}

export interface ProjectState {
  messages: Message[];
  currentCode: string | null;
  activeTab: Tab;
  isGenerating: boolean;
}

export type ToolId = 'claude' | 'gemini' | 'codex' | 'kiro';

export interface ToolDefinition {
  id: ToolId;
  name: string;
  icon: React.ReactNode;
  color: string;
}