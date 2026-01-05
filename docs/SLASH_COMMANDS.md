# Slash Commands

This document describes the available slash commands in Gemini Code Studio.

## Available Commands

### `/model` or `/m`
Change the Claude model for the current session.

**Usage:**
```
/model opus      # Switch to Claude Opus 4.5 (most capable)
/model sonnet    # Switch to Claude Sonnet 4.5 (default, balanced)
/model haiku     # Switch to Claude Haiku 4 (fastest)
/model           # Show current model and available options
```

### `/permission` or `/perm` or `/p`
Change the permission mode for file operations.

**Usage:**
```
/permission bypass    # Auto-approve all operations (default)
/permission accept    # Auto-approve edits only
/permission default   # Ask for confirmation (not recommended with --print mode)
/permission           # Show current permission mode
```

**Permission Modes:**
- `bypass` (bypassPermissions): Automatically approve all file operations without asking
- `accept` (acceptEdits): Automatically approve edit operations, but ask for destructive operations
- `default`: Ask for confirmation before each operation (requires interactive mode)

### `/clear` or `/c`
Clear the conversation history and reset the session.

**Usage:**
```
/clear    # Clears all messages and resets session statistics
```

### `/config`
Open the configuration panel.

**Usage:**
```
/config    # Opens the settings panel
```

### `/cost`
Show the total cost and usage statistics for the current session.

**Usage:**
```
/cost
```

**Output includes:**
- Total cost in USD
- Total tokens used (input + output + cache)
- Total number of turns (API calls)

### `/context`
Visualize current context usage.

**Usage:**
```
/context
```

**Output includes:**
- Visual progress bar
- Percentage of context used
- Tokens used vs. total available (200K)

### `/skills`
List available skills and capabilities.

**Usage:**
```
/skills
```

**Shows:**
- Available AI models
- Tools and features
- Permission modes
- Useful tips

### `/help` or `/h` or `/?`
Show all available slash commands.

**Usage:**
```
/help    # Display this help message
```

## Implementation Details

### How It Works

1. **Input Parsing**: When you type a message starting with `/`, it's detected as a slash command
2. **Command Execution**: The command is parsed and executed locally without sending to Claude
3. **State Updates**: Commands update application state (model, permissions, etc.)
4. **Feedback**: A confirmation message is added to the chat

### Command Context

Slash commands have access to:
- Current model selection
- Current permission mode
- Session statistics (cost, tokens, turns)
- Context usage
- Application state (messages, config, etc.)

### Adding New Commands

To add a new slash command, edit `services/slashCommands.ts`:

```typescript
export const slashCommands: Record<string, SlashCommand> = {
  // ... existing commands ...

  mycommand: {
    name: 'mycommand',
    description: 'Description of what this command does',
    aliases: ['mc', 'mycmd'],  // Optional short versions
    execute: (args, context) => {
      // Command logic here
      return {
        success: true,
        message: 'Command executed successfully',
        preventSend: true  // Don't send to Claude
      };
    }
  }
};
```

## Examples

### Switching Models for Different Tasks

```
/model haiku
Write a simple hello world function

/model opus
Design a complex authentication system with JWT, OAuth, and multi-factor auth
```

### Managing Session Cost

```
/cost                    # Check current spending
/clear                   # Reset if needed
/model haiku            # Switch to cheaper model
```

### Checking Context Usage

```
/context                # See how much context is used
/clear                  # Clear context if running low
```

## Tips

1. **Model Selection**:
   - Use `haiku` for simple tasks (fast and cheap)
   - Use `sonnet` for balanced performance (default)
   - Use `opus` for complex reasoning tasks

2. **Permission Management**:
   - Keep `bypass` mode for development (default)
   - Use `accept` mode if you want more control
   - Avoid `default` mode with `--print` (requires interactive terminal)

3. **Cost Optimization**:
   - Use `/cost` regularly to monitor spending
   - Clear conversation with `/clear` to reset context
   - Switch to `haiku` for repetitive tasks

4. **Debugging**:
   - Use `/context` to check if you're running out of space
   - Use `/help` to discover available commands
   - Check browser console for detailed logs

## Technical Notes

- Commands are executed **client-side** and don't count toward API usage
- Command results are added to chat history for reference
- Commands use the `preventSend` flag to avoid sending to Claude CLI
- Session statistics are tracked automatically and persist until `/clear`
