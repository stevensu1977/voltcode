# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is **Gemini Code Studio**, an AI-powered IDE for generating and previewing web applications. It's a React + TypeScript single-page application built with Vite, featuring a dark-themed interface with chat-based code generation.

AI Studio URL: https://ai.studio/apps/drive/1cBg3dvgmTMqN8B2MQqx-qAWTXDcb2nw4

## Development Commands

```bash
npm install          # Install dependencies
npm run dev          # Start dev server on http://localhost:3000
npm run build        # Build for production
npm run preview      # Preview production build
```

## Environment Setup

Set `GEMINI_API_KEY` in `.env.local` before running. The Vite config maps this to `process.env.API_KEY` at build time (see vite.config.ts:14).

## Architecture

### Core Application Flow

1. **App.tsx** - Main orchestrator that manages:
   - Message state (conversation history)
   - Generated code state
   - Active tool selection (claude/gemini/codex/kiro)
   - Tab state (Preview/Code/Terminal)

2. **services/gemini.ts** - AI integration layer:
   - Uses `@google/genai` SDK with model `gemini-3-pro-preview`
   - System instruction configures agent as Frontend React expert
   - Expects responses with HTML wrapped in markdown code blocks
   - History is formatted as `{role: 'user'|'model', parts: [{text}]}`

3. **Components**:
   - **ChatPanel.tsx**: Left panel with message history, uses ReactMarkdown for agent responses, hides large code blocks in chat (displays "Code generated" notice)
   - **WorkspacePanel.tsx**: Right panel with tabbed Preview/Code/Terminal views, iframe sandbox for preview, mobile/desktop viewport toggle
   - **Sidebar.tsx**: Tool selector (not read but referenced)
   - **ConfigPanel.tsx**: Tool configuration modal (not read but referenced)

### Key Patterns

- **Code Extraction**: App.tsx:35-45 extracts HTML from ```html...``` or generic ``` ``` blocks
- **Message Flow**: User message → Gemini API with history → Parse response → Extract code → Update state → Auto-switch to Preview tab
- **Error Handling**: Catches API errors and adds error message to chat with `isError: true` flag
- **Tool Abstraction**: All tools currently use same Gemini backend (see App.tsx:60 comment)

### Type System (types.ts)

- `ToolId`: 'claude' | 'gemini' | 'codex' | 'kiro'
- `Sender`: USER | AGENT
- `Tab`: PREVIEW | CODE | TERMINAL
- `Message`: Contains id, text, sender, timestamp, optional isError

### Styling

Uses Tailwind CSS via inline classes with custom IDE theme colors:
- `bg-ide-bg`: Main background
- `bg-ide-panel`: Panel background
- `bg-ide-border`: Border color
- `text-ide-text`: Default text
- `text-ide-textLight`: Lighter text
- `text-ide-accent`: Accent color

Theme defined in index.html (not read but evident from usage).

## Important Implementation Details

- **Iframe Sandbox**: Preview uses sandbox with `allow-scripts allow-modals allow-forms allow-popups allow-same-origin allow-top-navigation`
- **Code Generation**: Agent must return SINGLE HTML file with embedded CSS/JS, uses Tailwind CDN
- **History Management**: Full conversation history sent to API for context on each request
- **Thinking Budget**: Gemini uses 1024 thinking budget for reasoning (services/gemini.ts:50)
