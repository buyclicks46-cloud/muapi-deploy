/**
 * MuAPI MCP Proxy Server for Claude Desktop
 * ==========================================
 * 
 * This script acts as a middleware between Claude Desktop and muapi-cli.
 * It fixes two critical incompatibilities:
 * 
 * 1. PROTOCOL VERSION MISMATCH
 *    muapi-cli responds with protocolVersion "2025-06-18" but Claude Desktop
 *    requires "2025-11-25". This proxy rewrites it on the fly.
 * 
 * 2. NON-STANDARD TOOL FIELDS
 *    muapi-cli includes "outputSchema" and "annotations" fields in tool
 *    definitions. Claude Desktop's strict validator silently rejects the
 *    entire tool list when these are present. This proxy strips them.
 * 
 * 3. CHUNKED DATA HANDLING
 *    muapi-cli returns 25 tools (~15KB JSON). Node.js stdout may split this
 *    across multiple data events. This proxy buffers by newline to prevent
 *    JSON corruption.
 * 
 * Usage in claude_desktop_config.json:
 * {
 *   "mcpServers": {
 *     "muapi": {
 *       "command": "node",
 *       "args": ["<absolute-path-to-this-file>"],
 *       "env": { "MUAPI_API_KEY": "<your-api-key>" }
 *     }
 *   }
 * }
 * 
 * @version 1.0.0
 * @author MuAPI Deployment Kit
 */

const { spawn } = require('child_process');
const path = require('path');
const os = require('os');

// ─── Configuration ───────────────────────────────────────────────────────────
const TARGET_PROTOCOL_VERSION = '2025-11-25';
const FIELDS_TO_STRIP = ['outputSchema', 'annotations'];
// ─────────────────────────────────────────────────────────────────────────────

// Determine the correct npx command based on OS
const isWindows = os.platform() === 'win32';
const npxCommand = isWindows ? 'npx.cmd' : 'npx';

// Spawn the actual muapi-cli MCP server
const mcpProcess = spawn(npxCommand, ['-y', 'muapi-cli@latest', 'mcp', 'serve'], {
  env: process.env,
  shell: isWindows  // Required on Windows for .cmd files
});

// Pipe client (Claude Desktop) stdin directly to muapi-cli
process.stdin.pipe(mcpProcess.stdin);

// Buffer stdout by newline to handle chunked JSON safely
let buffer = '';
mcpProcess.stdout.on('data', (data) => {
  buffer += data.toString('utf8');
  const lines = buffer.split('\n');
  // Keep the last (potentially incomplete) line in the buffer
  buffer = lines.pop();

  for (const line of lines) {
    if (!line.trim()) continue;

    try {
      const obj = JSON.parse(line);

      // ── Fix 1: Rewrite protocol version ──────────────────────────────
      if (obj.result && obj.result.protocolVersion) {
        obj.result.protocolVersion = TARGET_PROTOCOL_VERSION;
      }

      // ── Fix 2: Strip non-standard fields from tool definitions ───────
      if (obj.result && Array.isArray(obj.result.tools)) {
        for (const tool of obj.result.tools) {
          for (const field of FIELDS_TO_STRIP) {
            delete tool[field];
          }
          // Normalize schema field name if needed
          if (tool.schema && !tool.inputSchema) {
            tool.inputSchema = tool.schema;
            delete tool.schema;
          }
        }
      }

      process.stdout.write(JSON.stringify(obj) + '\n');
    } catch (e) {
      // Non-JSON line (e.g. status messages from muapi-cli) — forward as-is
      process.stdout.write(line + '\n');
    }
  }
});

// Pipe stderr through for debugging
mcpProcess.stderr.pipe(process.stderr);

// Exit when the child process exits
mcpProcess.on('exit', (code) => {
  process.exit(code !== null ? code : 1);
});

// Handle parent process termination gracefully
process.on('SIGTERM', () => mcpProcess.kill('SIGTERM'));
process.on('SIGINT', () => mcpProcess.kill('SIGINT'));
