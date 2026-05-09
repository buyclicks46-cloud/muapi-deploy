# MuAPI MCP Server — Claude Desktop Auto-Setup & Repair

## Purpose
This project contains everything needed to install, configure, and troubleshoot the **MuAPI local MCP server** on any Windows client machine running Claude Desktop. When a client reports issues, paste this project into Claude Code and it will handle everything automatically.

## Known Issues & Fixes (Critical Knowledge)

### Issue 1: Protocol Version Mismatch
- **Symptom**: Tools connect in logs but don't appear in Claude chat. Claude says "I don't have access to that tool."
- **Root Cause**: `muapi-cli` responds with `protocolVersion: "2025-06-18"` but Claude Desktop requires `"2025-11-25"`.
- **Fix**: Use `proxy-mcp.js` as a middleware that rewrites the protocol version on-the-fly.

### Issue 2: Non-Standard Tool Fields
- **Symptom**: Server connects, protocol version matches, tools/list succeeds in logs, but tools still don't inject into chat.
- **Root Cause**: `muapi-cli` includes non-standard fields (`outputSchema`, `annotations`) in tool definitions. Claude Desktop's strict validator silently rejects the entire tool list.
- **Fix**: The proxy strips `outputSchema` and `annotations` from every tool before forwarding to Claude Desktop.

### Issue 3: Large Payload Chunking
- **Symptom**: Intermittent failures — sometimes tools load, sometimes they don't.
- **Root Cause**: `muapi-cli` returns 25 tools (~15KB JSON). Node.js `stdout` may split this across multiple `data` events, corrupting JSON if naively forwarded.
- **Fix**: The proxy buffers by newline, only forwarding complete JSON lines.

### Issue 4: Missing `serve` Subcommand
- **Symptom**: Server exits immediately with "Missing command" error.
- **Root Cause**: The correct command is `muapi mcp serve`, not `muapi mcp`.
- **Fix**: Always include `"serve"` in the args array.

### Issue 5: Stale npx Cache
- **Symptom**: Old version of muapi-cli is used even after updates are published.
- **Root Cause**: npx caches packages locally.
- **Fix**: Always use `muapi-cli@latest` in args to force latest version.

## File Inventory

| File | Purpose |
|------|---------|
| `CLAUDE.md` | This file — instructions for Claude Code |
| `proxy-mcp.js` | Middleware proxy that fixes protocol version + strips invalid fields |
| `setup-muapi.js` | Automated setup script — run this to install everything |

## Setup Instructions (for Claude Code to execute)

### Step 1: Get the client's MuAPI API key
Ask the client for their MuAPI API key. It looks like a 64-character hex string.

### Step 2: Run the automated setup
```bash
node setup-muapi.js --api-key <CLIENT_API_KEY>
```

### Step 3: If running manually instead
1. Copy `proxy-mcp.js` to the client's Claude config directory.
2. Update `claude_desktop_config.json` to add/replace the `muapi` server entry.
3. Restart Claude Desktop.
4. Run `node setup-muapi.js --test-only` to verify.

## Claude Desktop Config Locations

| OS | Path |
|----|------|
| Windows (Store) | `%LOCALAPPDATA%\Packages\Claude_*\LocalCache\Roaming\Claude\` |
| Windows (Direct Install) | `%APPDATA%\Claude\` |
| macOS | `~/Library/Application Support/Claude/` |
| Linux | `~/.config/Claude/` |

## Expected Config Format
```json
{
  "mcpServers": {
    "muapi": {
      "command": "node",
      "args": ["<path-to-proxy-mcp.js>"],
      "env": {
        "MUAPI_API_KEY": "<client-api-key>"
      }
    }
  }
}
```

## Verification Checklist
After setup, verify ALL of these in the MCP server log:
1. ✅ `Server started and connected successfully`
2. ✅ `protocolVersion` in server response is `"2025-11-25"` (NOT `"2025-06-18"`)
3. ✅ `tools/list` response contains 25 tools
4. ✅ No `outputSchema` or `annotations` fields in forwarded tool definitions
5. ✅ In Claude Desktop: click `+` → Connectors → `muapi` tools are visible, OR tools are auto-active in new chats

## Troubleshooting Commands

### Check if Node.js is installed
```bash
node --version
```

### Check if muapi-cli works
```bash
npx -y muapi-cli@latest --version
```
On Windows PowerShell, use `npx.cmd` instead of `npx`.

### Check MCP server logs
- Windows Store: `%LOCALAPPDATA%\Packages\Claude_*\LocalCache\Roaming\Claude\logs\mcp-server-muapi.log`
- Windows Direct: `%APPDATA%\Claude\logs\mcp-server-muapi.log`

### Test the proxy directly
```bash
node setup-muapi.js --test-only
```

## Important Notes
- The proxy script MUST be in a permanent location (not temp directories).
- The client MUST have Node.js installed (v18+ recommended).
- `npx.cmd` must be used on Windows (not `npx`) due to PowerShell execution policies.
- After ANY config change, Claude Desktop must be fully restarted (not just new chat).
- Local MCP servers defined in `claude_desktop_config.json` are auto-active in all chats — they do NOT appear as toggleable "Connectors" in the UI. They appear under Settings > Extensions or the Developer tools section.
