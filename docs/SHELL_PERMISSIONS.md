# Tauri Shell Permissions Configuration

## Problem
When trying to execute Claude CLI using `Command.create('exec', ...)`, the application threw an error:
```
shell.execute not allowed. Permissions associated with this command: shell:allow-execute
```

## Solution
Tauri 2.0 uses a **capabilities-based permission system**. Shell commands must be explicitly allowed through capabilities files.

## Implementation

### 1. Created Capabilities File
**File**: [src-tauri/capabilities/default.json](src-tauri/capabilities/default.json)

```json
{
  "$schema": "https://schema.tauri.app/config/2",
  "identifier": "default",
  "description": "Default capabilities for the application",
  "windows": ["main"],
  "permissions": [
    "core:default",
    "shell:default",
    {
      "identifier": "shell:allow-execute",
      "allow": [
        {
          "name": "exec",
          "cmd": "",
          "args": true,
          "sidecar": false
        }
      ]
    }
  ]
}
```

### 2. Updated tauri.conf.json
**File**: [src-tauri/tauri.conf.json](src-tauri/tauri.conf.json:49)

Removed incorrect `plugins.shell.scope` configuration:
```json
{
  "plugins": {}
}
```

## How It Works

1. **Capabilities Declaration**: The `default.json` file declares what permissions the application needs
2. **Window Association**: The "main" window gets these permissions via `"windows": ["main"]`
3. **Shell Command**: The "exec" command is explicitly allowed with:
   - `name`: "exec" (matches `Command.create('exec', ...)`)
   - `cmd`: "" (empty string allows any command path)
   - `args`: true (allows passing arguments)
   - `sidecar`: false (not a sidecar binary)

## Testing

The Tauri application is now running successfully. You can test Claude Code integration by:

1. Opening the running application
2. Ensuring "Claude Code" is selected in the sidebar
3. Sending a message like "who are you"
4. Claude CLI should respond via the shell command execution

## Verifying Permissions

If you encounter permission errors, check:
1. The capabilities file exists at `src-tauri/capabilities/default.json`
2. The window label in capabilities matches tauri.conf.json (`"main"`)
3. The command name matches what's used in TypeScript (`"exec"`)
4. Tauri dev server has reloaded after changes

## Security Considerations

Current configuration allows:
- ✅ Executing any command (`cmd: ""`)
- ✅ Passing any arguments (`args: true`)
- ❌ This is permissive for development

For production, consider:
- Restricting `cmd` to specific binaries (e.g., Node.js path)
- Validating arguments before execution
- Using more specific command names

## References

- [Tauri Security Documentation](https://tauri.app/v2/security/)
- [Shell Plugin Documentation](https://tauri.app/v2/reference/cli/shell/)
- [Capabilities System](https://tauri.app/v2/reference/config/#capabilities)
