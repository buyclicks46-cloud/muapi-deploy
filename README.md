# MuAPI MCP Server — Claude Desktop Setup Kit

Automated install, configuration, and troubleshooting for the **MuAPI local MCP server** on Claude Desktop (Windows, macOS, Linux).

## What This Does

MuAPI exposes marketing/analytics tools via an MCP server. This kit bridges the gap between `muapi-cli` and Claude Desktop by fixing three known incompatibilities:

| Problem | Fix |
|---------|-----|
| `muapi-cli` reports protocol version `2025-06-18` but Claude Desktop requires `2025-11-25` | `proxy-mcp.js` rewrites the version on the fly |
| `muapi-cli` includes non-standard `outputSchema` / `annotations` fields that Claude Desktop's validator silently rejects | Proxy strips those fields before forwarding |
| 25-tool payload (~15KB) may arrive chunked across multiple `stdout` events, corrupting JSON | Proxy buffers by newline, only forwarding complete JSON lines |

## Files

| File | Purpose |
|------|---------|
| `proxy-mcp.js` | Middleware between Claude Desktop and `muapi-cli` |
| `setup-muapi.js` | One-command setup & diagnostic script |
| `CLAUDE.md` | Instructions for Claude Code (AI-assisted repair) |
| `MuAPI-Setup-Guide.html` | Visual setup guide for clients |

## Prerequisites

- [Node.js](https://nodejs.org) v18 or later
- Claude Desktop installed
- A MuAPI API key (64-character hex string) — get one at [muapi.ai](https://muapi.ai)

## Quick Start

```bash
node setup-muapi.js --api-key YOUR_MUAPI_API_KEY
```

Then **fully restart Claude Desktop** (quit and reopen — not just a new chat).

## CLI Reference

```bash
# Install and configure
node setup-muapi.js --api-key <KEY>

# Run diagnostics only (no changes made)
node setup-muapi.js --test-only

# Remove MuAPI from Claude Desktop config
node setup-muapi.js --uninstall

# Show help
node setup-muapi.js --help
```

## What the Setup Script Does

1. Detects your OS and Claude Desktop installation type (Store vs Direct)
2. Locates `claude_desktop_config.json`
3. Copies `proxy-mcp.js` to the Claude config directory
4. Adds/updates the `muapi` entry in `mcpServers`
5. Backs up your existing config before any changes
6. Runs a 4-point diagnostic test (handshake, protocol version, tool count, field validation)

## Claude Desktop Config Locations

| OS | Path |
|----|------|
| Windows (Store) | `%LOCALAPPDATA%\Packages\Claude_*\LocalCache\Roaming\Claude\` |
| Windows (Direct) | `%APPDATA%\Claude\` |
| macOS | `~/Library/Application Support/Claude/` |
| Linux | `~/.config/Claude/` |

## Manual Setup (if the script can't run)

1. Copy `proxy-mcp.js` to your Claude config directory (see table above).
2. Edit `claude_desktop_config.json` and add:

```json
{
  "mcpServers": {
    "muapi": {
      "command": "node",
      "args": ["FULL_PATH_TO/proxy-mcp.js"],
      "env": {
        "MUAPI_API_KEY": "YOUR_API_KEY"
      }
    }
  }
}
```

3. Fully restart Claude Desktop.

## Verification

After restart, run the diagnostic to confirm everything works:

```bash
node setup-muapi.js --test-only
```

All 4 tests should pass:
- Server starts successfully
- Protocol version is `2025-11-25`
- 25 tools received
- No non-standard fields in tool definitions

MuAPI tools are **auto-active in all chats** — they do not appear as toggleable Connectors. Check **Settings > Extensions** or the Developer tools section to confirm they are loaded.

## Troubleshooting

**Tools don't appear after restart**
- Confirm Claude Desktop was fully quit (check Task Manager / Activity Monitor)
- Check the MCP log for errors:
  - Windows Store: `%LOCALAPPDATA%\Packages\Claude_*\LocalCache\Roaming\Claude\logs\mcp-server-muapi.log`
  - Windows Direct: `%APPDATA%\Claude\logs\mcp-server-muapi.log`

**"Missing command" error in logs**
- The proxy correctly uses `muapi mcp serve` — if you see this, an old config may be pointing directly at `muapi-cli`. Re-run setup.

**Old version of muapi-cli used**
- The proxy always fetches `muapi-cli@latest` via npx to bypass the local cache.

**Windows: npx not found**
- On Windows, use `npx.cmd` instead of `npx`. The setup script handles this automatically.

## AI-Assisted Repair

If a client is having issues, open this project folder in **Claude Code**:

```bash
claude
```

Claude will read `CLAUDE.md` and can run `setup-muapi.js` automatically after you provide the client's API key.
