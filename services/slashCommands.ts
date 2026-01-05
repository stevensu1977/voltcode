// Slash command system for Claude Code integration

export interface SlashCommand {
  name: string;
  description: string;
  aliases?: string[];
  execute: (args: string[], context: SlashCommandContext) => SlashCommandResult | Promise<SlashCommandResult>;
}

export interface SlashCommandContext {
  setModel?: (model: string) => void;
  setPermissionMode?: (mode: 'bypassPermissions' | 'acceptEdits' | 'default') => void;
  setAgent?: (agent: string) => void;
  clearMessages?: () => void;
  openConfig?: () => void;
  currentModel?: string;
  currentPermissionMode?: string;
  currentAgent?: string;
  sessionCost?: {
    cost: number;
    tokens: number;
    turns: number;
  };
  contextUsage?: {
    used: number;
    total: number;
  };
  // Task mode callbacks
  projectDir?: string;
  currentSession?: import('../types').ChatSession;
  createTask?: (title: string) => Promise<void>;
  updateTaskStatus?: (status: import('../types').TaskStatus) => void;
  addTaskItem?: (title: string) => void;
  completeTaskItem?: (index: number) => void;
  getTaskStats?: () => {
    totalItems: number;
    completedItems: number;
    elapsedTime: number;
    progress: number;
  };
  getAllTasks?: () => Array<{
    toolId: string;
    session: import('../types').ChatSession;
  }>;
}

export interface SlashCommandResult {
  success: boolean;
  message: string;
  preventSend?: boolean; // If true, don't send message to Claude
  autoSendMessage?: string; // If set, automatically send this message to the AI after command completes
}

/**
 * Format token count (e.g., 3000 -> "3.0k", 500 -> "500")
 */
function formatTokenCount(tokens: number): string {
  if (tokens >= 1000) {
    return `${(tokens / 1000).toFixed(1)}k`;
  }
  return tokens.toString();
}

/**
 * Parse input to check if it's a slash command
 */
export function parseSlashCommand(input: string): { isCommand: boolean; command?: string; args: string[] } {
  const trimmed = input.trim();
  console.log('[parseSlashCommand] Input:', JSON.stringify(input));
  console.log('[parseSlashCommand] Trimmed:', JSON.stringify(trimmed));
  console.log('[parseSlashCommand] Starts with /:', trimmed.startsWith('/'));

  if (!trimmed.startsWith('/')) {
    return { isCommand: false, args: [] };
  }

  const parts = trimmed.slice(1).split(/\s+/);
  const command = parts[0].toLowerCase();
  const args = parts.slice(1);

  console.log('[parseSlashCommand] Command:', command, 'Args:', args);
  return { isCommand: true, command, args };
}

/**
 * Available slash commands
 */
export const slashCommands: Record<string, SlashCommand> = {
  model: {
    name: 'model',
    description: 'Change the Claude model (e.g., /model opus, /model sonnet, /model haiku)',
    aliases: ['m'],
    execute: (args, context) => {
      if (args.length === 0) {
        return {
          success: false,
          message: `Current model: ${context.currentModel || 'sonnet'}\n\nAvailable models:\n- opus (Claude Opus 4.5)\n- sonnet (Claude Sonnet 4.5 - default)\n- haiku (Claude Haiku 4)\n\nUsage: /model <name>`,
          preventSend: true
        };
      }

      const model = args[0].toLowerCase();
      const validModels = ['opus', 'sonnet', 'haiku'];

      if (!validModels.includes(model)) {
        return {
          success: false,
          message: `Invalid model: ${model}\n\nAvailable models: ${validModels.join(', ')}`,
          preventSend: true
        };
      }

      context.setModel?.(model);
      return {
        success: true,
        message: `✓ Switched to Claude ${model.charAt(0).toUpperCase() + model.slice(1)}`,
        preventSend: true
      };
    }
  },

  config: {
    name: 'config',
    description: 'Open configuration panel',
    aliases: [],
    execute: (args, context) => {
      context.openConfig?.();
      return {
        success: true,
        message: '✓ Opening configuration panel...',
        preventSend: true
      };
    }
  },

  cost: {
    name: 'cost',
    description: 'Show the total cost and usage of the current session',
    aliases: [],
    execute: (args, context) => {
      const cost = context.sessionCost || { cost: 0, tokens: 0, turns: 0 };
      return {
        success: true,
        message: `📊 Session Statistics:\n\n💰 Total cost: $${cost.cost.toFixed(4)}\n🔢 Total tokens: ${cost.tokens.toLocaleString()}\n🔄 Total turns: ${cost.turns}`,
        preventSend: true
      };
    }
  },

  context: {
    name: 'context',
    description: 'Show current context usage',
    aliases: [],
    execute: (args, context) => {
      const usage = context.contextUsage || { used: 0, total: 200000 };
      const percentage = ((usage.used / usage.total) * 100).toFixed(1);
      const bar = '█'.repeat(Math.floor(Number(percentage) / 5)) + '░'.repeat(20 - Math.floor(Number(percentage) / 5));

      return {
        success: true,
        message: `📝 Context Usage:\n\n${bar} ${percentage}%\n\n${usage.used.toLocaleString()} / ${usage.total.toLocaleString()} tokens`,
        preventSend: true
      };
    }
  },

  permission: {
    name: 'permission',
    description: 'Change permission mode (e.g., /permission bypass, /permission accept, /permission default)',
    aliases: ['perm', 'p'],
    execute: (args, context) => {
      if (args.length === 0) {
        return {
          success: false,
          message: `Current permission mode: ${context.currentPermissionMode || 'bypassPermissions'}\n\nAvailable modes:\n- bypass: Auto-approve all operations\n- accept: Auto-approve edits only\n- default: Ask for confirmation\n\nUsage: /permission <mode>`,
          preventSend: true
        };
      }

      const modeMap: Record<string, 'bypassPermissions' | 'acceptEdits' | 'default'> = {
        'bypass': 'bypassPermissions',
        'bypasspermissions': 'bypassPermissions',
        'accept': 'acceptEdits',
        'acceptedits': 'acceptEdits',
        'default': 'default'
      };

      const inputMode = args[0].toLowerCase();
      const mode = modeMap[inputMode];

      if (!mode) {
        return {
          success: false,
          message: `Invalid mode: ${inputMode}\n\nAvailable modes: bypass, accept, default`,
          preventSend: true
        };
      }

      context.setPermissionMode?.(mode);
      return {
        success: true,
        message: `✓ Permission mode set to: ${mode}`,
        preventSend: true
      };
    }
  },

  clear: {
    name: 'clear',
    description: 'Clear the conversation history',
    aliases: ['c'],
    execute: (args, context) => {
      context.clearMessages?.();
      return {
        success: true,
        message: '✓ Conversation cleared',
        preventSend: true
      };
    }
  },

  help: {
    name: 'help',
    description: 'Show available slash commands',
    aliases: ['h', '?'],
    execute: (args, context) => {
      const commandList = Object.values(slashCommands)
        .map(cmd => {
          const aliases = cmd.aliases ? ` (${cmd.aliases.map(a => `/${a}`).join(', ')})` : '';
          return `  /${cmd.name}${aliases}\n    ${cmd.description}`;
        })
        .join('\n\n');

      return {
        success: true,
        message: `Available slash commands:\n\n${commandList}`,
        preventSend: true
      };
    }
  },

  skills: {
    name: 'skills',
    description: 'List available skills and capabilities',
    aliases: [],
    execute: async (args, context) => {
      try {
        // 动态导入 Tauri API
        const { invoke } = await import('@tauri-apps/api/core');

        // 读取 ~/.claude/skills 目录
        const skills = await invoke<Array<{name: string, path: string, token_count?: number}>>('read_claude_skills');

        let skillsList = '## Skills\n\n';

        if (skills.length === 0) {
          skillsList += 'No skills found in ~/.claude/skills\n\n';
          skillsList += 'To add skills, create directories in ~/.claude/skills/';
        } else {
          skillsList += `${skills.length} skill${skills.length > 1 ? 's' : ''}\n\n`;
          skillsList += '### User skills (~/.claude/skills)\n';

          for (const skill of skills) {
            const tokenInfo = skill.token_count
              ? ` · ~${formatTokenCount(skill.token_count)} tokens`
              : '';
            skillsList += `- **${skill.name}**${tokenInfo}\n`;
          }
        }

        return {
          success: true,
          message: skillsList,
          preventSend: true
        };
      } catch (error) {
        console.error('[skills] Error reading skills:', error);
        return {
          success: false,
          message: `Error reading skills: ${error}`,
          preventSend: true
        };
      }
    }
  },

  plugin: {
    name: 'plugin',
    description: 'List configured MCP plugins/servers from ~/.claude.json',
    aliases: ['plugins', 'mcp'],
    execute: async (args, context) => {
      try {
        const { invoke } = await import('@tauri-apps/api/core');

        const servers = await invoke<Array<{
          name: string;
          command?: string;
          args?: string[];
          env?: Record<string, string>;
        }>>('read_mcp_servers');

        let pluginList = '## MCP Plugins\n\n';

        if (servers.length === 0) {
          pluginList += 'No MCP servers configured in ~/.claude.json\n\n';
          pluginList += 'To add MCP servers, edit ~/.claude.json and add a "mcpServers" section.';
        } else {
          pluginList += `${servers.length} plugin${servers.length > 1 ? 's' : ''} configured\n\n`;

          for (const server of servers) {
            pluginList += `### ${server.name}\n`;
            if (server.command) {
              pluginList += `- Command: \`${server.command}\`\n`;
            }
            if (server.args && server.args.length > 0) {
              pluginList += `- Args: \`${server.args.join(' ')}\`\n`;
            }
            if (server.env && Object.keys(server.env).length > 0) {
              const envKeys = Object.keys(server.env).join(', ');
              pluginList += `- Env: ${envKeys}\n`;
            }
            pluginList += '\n';
          }
        }

        return {
          success: true,
          message: pluginList,
          preventSend: true
        };
      } catch (error) {
        console.error('[plugin] Error reading MCP servers:', error);
        return {
          success: false,
          message: `Error reading MCP servers: ${error}`,
          preventSend: true
        };
      }
    }
  },

  agents: {
    name: 'agents',
    description: 'List available agents or switch agent (e.g., /agents, /agents explore, /agents plan)',
    aliases: ['agent', 'a'],
    execute: (args, context) => {
      const builtInAgents = [
        { name: 'Default', description: 'Standard Claude Code assistant' },
        { name: 'Explore', description: 'Fast codebase exploration' },
        { name: 'Plan', description: 'Software architecture planning' },
      ];

      // If no args, show list of agents
      if (args.length === 0) {
        const currentAgent = context.currentAgent || 'Default';
        let agentsList = '## Agents\n\n';
        agentsList += `Current agent: **${currentAgent}**\n\n`;
        agentsList += '### Built-in agents\n';

        for (const agent of builtInAgents) {
          const isCurrent = (agent.name === currentAgent) || (agent.name === 'Default' && !context.currentAgent);
          agentsList += `- **${agent.name}**${isCurrent ? ' ✓' : ''}\n  ${agent.description}\n`;
        }

        agentsList += '\nUsage: `/agents <name>` to switch agent';

        return {
          success: true,
          message: agentsList,
          preventSend: true
        };
      }

      // Switch to specified agent
      const agentName = args[0].toLowerCase();
      const validAgents = builtInAgents.map(a => a.name.toLowerCase());

      if (!validAgents.includes(agentName)) {
        return {
          success: false,
          message: `Unknown agent: ${agentName}\n\nAvailable agents: ${builtInAgents.map(a => a.name).join(', ')}`,
          preventSend: true
        };
      }

      // Capitalize first letter
      const normalizedAgent = agentName.charAt(0).toUpperCase() + agentName.slice(1);
      const agent = normalizedAgent === 'Default' ? '' : normalizedAgent;

      context.setAgent?.(agent);

      const selectedAgent = builtInAgents.find(a => a.name.toLowerCase() === agentName);
      return {
        success: true,
        message: `✓ Switched to ${normalizedAgent} agent\n${selectedAgent?.description || ''}`,
        preventSend: true
      };
    }
  },

  task: {
    name: 'task',
    description: 'Task management commands (create, status, pause, resume, done, add, check, list)',
    aliases: ['t'],
    execute: async (args, context) => {
      // Dynamic imports for task functionality
      const { isTaskSession, TaskStatus } = await import('../types');
      const { formatTimeCompact, getStatusEmoji, getStatusText } = await import('./todoParser');

      const subcommand = args[0]?.toLowerCase() || 'status';
      const subArgs = args.slice(1);

      // Helper to check if current session is a task
      const isCurrentTask = context.currentSession && isTaskSession(context.currentSession);

      switch (subcommand) {
        case 'create':
        case 'new': {
          const title = subArgs.join(' ');
          if (!title) {
            return {
              success: false,
              message: 'Usage: /task create <title>\n\nExample: /task create Fix login page bug',
              preventSend: true
            };
          }

          if (!context.projectDir) {
            return {
              success: false,
              message: 'No project directory set. Please open a project first.',
              preventSend: true
            };
          }

          if (!context.createTask) {
            return {
              success: false,
              message: 'Task creation is not available in this context.',
              preventSend: true
            };
          }

          try {
            await context.createTask(title);
            // Build the auto-send message to start the task
            const taskPrompt = `I need help with the following task: "${title}"

Please analyze what needs to be done and help me complete this task. Start by understanding the requirements and then proceed with the implementation.`;

            return {
              success: true,
              message: `✓ Task created: **${title}**\n\nTimer started. Sending task to AI...`,
              preventSend: true,
              autoSendMessage: taskPrompt
            };
          } catch (error) {
            return {
              success: false,
              message: `Failed to create task: ${error}`,
              preventSend: true
            };
          }
        }

        case 'status':
        case 's': {
          if (!isCurrentTask) {
            return {
              success: true,
              message: '📋 No active task in this session.\n\nUse `/task create <title>` to start a new task.',
              preventSend: true
            };
          }

          const stats = context.getTaskStats?.() || { totalItems: 0, completedItems: 0, elapsedTime: 0, progress: 0 };
          const session = context.currentSession!;
          const task = (session as any).task;
          const statusEmoji = getStatusEmoji(task.status);
          const statusText = getStatusText(task.status);
          const timeDisplay = formatTimeCompact(stats.elapsedTime);

          let message = `## ${session.title}\n\n`;
          message += `**Status:** ${statusEmoji} ${statusText}\n`;
          message += `**Time:** ${timeDisplay}\n`;
          message += `**Progress:** ${stats.completedItems}/${stats.totalItems} items (${stats.progress}%)\n\n`;

          // Show TODO items
          if (task.items.length > 0) {
            message += '### TODO Items\n';
            task.items.forEach((item: any, index: number) => {
              const checkbox = item.completed ? '☑' : '☐';
              message += `${index + 1}. ${checkbox} ${item.title}\n`;
            });
          } else {
            message += '_No TODO items. Use `/task add <item>` to add one._';
          }

          return {
            success: true,
            message,
            preventSend: true
          };
        }

        case 'pause':
        case 'p': {
          if (!isCurrentTask) {
            return {
              success: false,
              message: 'No active task to pause.',
              preventSend: true
            };
          }

          const task = (context.currentSession as any).task;
          if (task.status !== TaskStatus.IN_PROGRESS) {
            return {
              success: false,
              message: `Cannot pause: task is ${getStatusText(task.status).toLowerCase()}.`,
              preventSend: true
            };
          }

          context.updateTaskStatus?.(TaskStatus.PAUSED);
          return {
            success: true,
            message: '⏸ Task paused. Timer stopped.\n\nUse `/task resume` to continue.',
            preventSend: true
          };
        }

        case 'resume':
        case 'r': {
          if (!isCurrentTask) {
            return {
              success: false,
              message: 'No task to resume.',
              preventSend: true
            };
          }

          const task = (context.currentSession as any).task;
          if (task.status !== TaskStatus.PAUSED) {
            return {
              success: false,
              message: `Cannot resume: task is ${getStatusText(task.status).toLowerCase()}.`,
              preventSend: true
            };
          }

          context.updateTaskStatus?.(TaskStatus.IN_PROGRESS);
          return {
            success: true,
            message: '▶️ Task resumed. Timer running.\n\nUse `/task pause` to pause again.',
            preventSend: true
          };
        }

        case 'done':
        case 'complete':
        case 'd': {
          if (!isCurrentTask) {
            return {
              success: false,
              message: 'No active task to complete.',
              preventSend: true
            };
          }

          const stats = context.getTaskStats?.() || { totalItems: 0, completedItems: 0, elapsedTime: 0, progress: 0 };
          const timeDisplay = formatTimeCompact(stats.elapsedTime);

          context.updateTaskStatus?.(TaskStatus.COMPLETED);
          return {
            success: true,
            message: `✅ Task completed!\n\n**Time spent:** ${timeDisplay}\n**Items completed:** ${stats.completedItems}/${stats.totalItems}`,
            preventSend: true
          };
        }

        case 'add':
        case 'a': {
          const itemTitle = subArgs.join(' ');
          if (!itemTitle) {
            return {
              success: false,
              message: 'Usage: /task add <item description>\n\nExample: /task add Write unit tests',
              preventSend: true
            };
          }

          if (!isCurrentTask) {
            return {
              success: false,
              message: 'No active task. Create a task first with `/task create <title>`.',
              preventSend: true
            };
          }

          context.addTaskItem?.(itemTitle);
          return {
            success: true,
            message: `✓ Added: ${itemTitle}`,
            preventSend: true
          };
        }

        case 'check':
        case 'x': {
          const indexStr = subArgs[0];
          const index = parseInt(indexStr, 10);

          if (isNaN(index) || index < 1) {
            return {
              success: false,
              message: 'Usage: /task check <number>\n\nExample: /task check 1',
              preventSend: true
            };
          }

          if (!isCurrentTask) {
            return {
              success: false,
              message: 'No active task.',
              preventSend: true
            };
          }

          const task = (context.currentSession as any).task;
          if (index > task.items.length) {
            return {
              success: false,
              message: `Invalid item number. Task has ${task.items.length} items.`,
              preventSend: true
            };
          }

          context.completeTaskItem?.(index);
          const item = task.items[index - 1];
          return {
            success: true,
            message: `☑ Completed: ${item.title}`,
            preventSend: true
          };
        }

        case 'list':
        case 'ls': {
          const tasks = context.getAllTasks?.() || [];

          if (tasks.length === 0) {
            return {
              success: true,
              message: '📋 No tasks found.\n\nUse `/task create <title>` to create a new task.',
              preventSend: true
            };
          }

          let message = `## All Tasks (${tasks.length})\n\n`;

          for (const { toolId, session } of tasks) {
            if (isTaskSession(session)) {
              const task = session.task;
              const statusEmoji = getStatusEmoji(task.status);
              const timeDisplay = formatTimeCompact(task.totalTimeSpent);
              const completedCount = task.items.filter(i => i.completed).length;

              message += `${statusEmoji} **${session.title}** (${toolId})\n`;
              message += `   Time: ${timeDisplay} | Items: ${completedCount}/${task.items.length}\n\n`;
            }
          }

          return {
            success: true,
            message,
            preventSend: true
          };
        }

        default:
          return {
            success: false,
            message: `Unknown task command: ${subcommand}\n\nAvailable commands:\n- /task create <title> - Create a new task\n- /task status - View current task status\n- /task pause - Pause the timer\n- /task resume - Resume the timer\n- /task done - Mark task complete\n- /task add <item> - Add a TODO item\n- /task check <n> - Complete item #n\n- /task list - List all tasks`,
            preventSend: true
          };
      }
    }
  }
};

/**
 * Execute a slash command
 */
export async function executeSlashCommand(
  command: string,
  args: string[],
  context: SlashCommandContext
): Promise<SlashCommandResult> {
  // Find command by name or alias
  const cmd = Object.values(slashCommands).find(
    c => c.name === command || c.aliases?.includes(command)
  );

  if (!cmd) {
    return {
      success: false,
      message: `Unknown command: /${command}\n\nType /help to see available commands.`,
      preventSend: true
    };
  }

  return await cmd.execute(args, context);
}
