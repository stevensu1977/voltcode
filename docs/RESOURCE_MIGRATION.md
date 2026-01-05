# Resource Migration to ~/.opencode

## Overview
Updated the Tauri application to use `~/.opencode` directory for all CLI and Node resources, ensuring consistent access in both development and production modes.

## Directory Structure

```
~/.opencode/
├── node/
│   └── darwin-arm64/
│       └── bin/
│           └── node          # Bundled Node.js binary
└── cli/
    └── node_modules/
        └── .bin/
            └── claude         # Claude Code CLI symlink
```

## Changes Made

### 1. Rust Backend ([src-tauri/src/lib.rs](src-tauri/src/lib.rs))

Added `get_opencode_dir()` helper function:
```rust
fn get_opencode_dir() -> Result<PathBuf, String> {
    let home = std::env::var("HOME")
        .or_else(|_| std::env::var("USERPROFILE"))
        .map_err(|e| format!("Failed to get home directory: {}", e))?;
    Ok(PathBuf::from(home).join(".opencode"))
}
```

Updated commands:
- `extract_cli()`: Now returns paths from `~/.opencode/cli` instead of extracting
- `get_node_path()`: Returns `~/.opencode/node/{platform}/bin/node`
- `get_cli_path()`: Returns `~/.opencode/cli` or `~/.opencode/cli/{cli_name}`

### 2. Resources Setup

Run these commands to set up the directory structure:
```bash
# Create directories
mkdir -p ~/.opencode/{node,cli}

# Copy Node.js
cp -r ./Resources/bundled-node/darwin-arm64 ~/.opencode/node/

# Extract Claude Code
cd ~/.opencode/cli && tar -xzf /path/to/Resources/bundled-agents/darwin-arm64/claude-code-darwin-arm64.tgz
```

## Benefits

1. **Consistent Paths**: Same resource location in dev and prod modes
2. **No Extraction Needed**: Resources extracted once during setup
3. **Cross-Platform**: Uses `HOME` (Unix) or `USERPROFILE` (Windows)
4. **Simplified Logic**: No complex resource_dir() handling

## Testing

The application is now running successfully with:
- Node binary: `~/.opencode/node/darwin-arm64/bin/node`
- Claude CLI: `~/.opencode/cli/node_modules/.bin/claude`

## Next Steps

When testing Claude Code integration:
1. Open the Tauri application
2. Select "Claude Code" tool from sidebar
3. Send a message like "Create a simple HTML button"
4. Verify Claude CLI responds via the integrated sidecar process

## Platform Support

Currently configured for macOS (darwin-arm64). For other platforms:
- macOS Intel: `darwin-x64`
- Windows: `windows-x64`
- Linux: `linux-x64`

The platform detection is automatic based on compilation target.
