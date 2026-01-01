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
}

export interface SlashCommandResult {
  success: boolean;
  message: string;
  preventSend?: boolean; // If true, don't send message to Claude
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
