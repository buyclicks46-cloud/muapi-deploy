#!/usr/bin/env node

/**
 * MuAPI MCP Server — Automated Setup & Diagnostic Tool
 * =====================================================
 * 
 * This script automatically:
 * 1. Detects the client's OS and Claude Desktop installation type
 * 2. Locates the claude_desktop_config.json
 * 3. Installs the proxy-mcp.js to the correct location
 * 4. Configures the MuAPI server entry in the config
 * 5. Runs a full diagnostic test of the MCP connection
 * 
 * Usage:
 *   node setup-muapi.js --api-key <YOUR_MUAPI_API_KEY>
 *   node setup-muapi.js --test-only
 *   node setup-muapi.js --uninstall
 * 
 * @version 1.0.0
 */

const { spawn, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

// ─── ANSI Colors ─────────────────────────────────────────────────────────────
const C = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  dim: '\x1b[2m',
};

const PASS = `${C.green}✅${C.reset}`;
const FAIL = `${C.red}❌${C.reset}`;
const WARN = `${C.yellow}⚠️${C.reset}`;
const INFO = `${C.blue}ℹ️${C.reset}`;
const ARROW = `${C.cyan}→${C.reset}`;

// ─── Parse CLI Arguments ─────────────────────────────────────────────────────
const args = process.argv.slice(2);
let apiKey = null;
let testOnly = false;
let uninstall = false;

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--api-key' && args[i + 1]) {
    apiKey = args[++i];
  } else if (args[i] === '--test-only') {
    testOnly = true;
  } else if (args[i] === '--uninstall') {
    uninstall = true;
  } else if (args[i] === '--help' || args[i] === '-h') {
    printHelp();
    process.exit(0);
  }
}

function printHelp() {
  console.log(`
${C.bold}${C.cyan}MuAPI MCP Server — Setup & Diagnostic Tool${C.reset}

${C.bold}Usage:${C.reset}
  node setup-muapi.js --api-key <KEY>   Install and configure MuAPI MCP server
  node setup-muapi.js --test-only       Run diagnostics without making changes
  node setup-muapi.js --uninstall       Remove MuAPI MCP server configuration

${C.bold}Options:${C.reset}
  --api-key <KEY>   Your MuAPI API key (64-char hex string)
  --test-only       Only run diagnostics, don't modify config
  --uninstall       Remove muapi entry from Claude Desktop config
  --help, -h        Show this help message

${C.bold}Examples:${C.reset}
  node setup-muapi.js --api-key abc123def456...
  node setup-muapi.js --test-only
`);
}

// ─── Main ────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\n${C.bold}${C.cyan}╔══════════════════════════════════════════════════════╗${C.reset}`);
  console.log(`${C.bold}${C.cyan}║   MuAPI MCP Server — Setup & Diagnostic Tool v1.0   ║${C.reset}`);
  console.log(`${C.bold}${C.cyan}╚══════════════════════════════════════════════════════╝${C.reset}\n`);

  // Step 1: Detect environment
  console.log(`${C.bold}[1/6] Detecting environment...${C.reset}`);
  const env = detectEnvironment();
  console.log(`  ${PASS} OS: ${env.platform} (${os.arch()})`);
  console.log(`  ${PASS} Node.js: ${process.version}`);

  // Step 2: Check Node.js & npx
  console.log(`\n${C.bold}[2/6] Checking prerequisites...${C.reset}`);
  checkPrerequisites(env);

  // Step 3: Find Claude Desktop config
  console.log(`\n${C.bold}[3/6] Locating Claude Desktop config...${C.reset}`);
  const configInfo = findClaudeConfig(env);
  console.log(`  ${PASS} Config: ${configInfo.configPath}`);
  console.log(`  ${PASS} Install type: ${configInfo.installType}`);

  if (uninstall) {
    return performUninstall(configInfo);
  }

  // Step 4: Install proxy script
  console.log(`\n${C.bold}[4/6] Installing proxy script...${C.reset}`);
  const proxyPath = installProxy(configInfo, testOnly);

  // Step 5: Update Claude Desktop config
  console.log(`\n${C.bold}[5/6] Configuring Claude Desktop...${C.reset}`);
  updateConfig(configInfo, proxyPath, apiKey, testOnly);

  // Step 6: Run diagnostic test
  console.log(`\n${C.bold}[6/6] Running diagnostic test...${C.reset}`);
  await runDiagnostic(env, proxyPath, apiKey || getExistingApiKey(configInfo));

  console.log(`\n${C.bold}${C.green}╔══════════════════════════════════════════════════════╗${C.reset}`);
  console.log(`${C.bold}${C.green}║               Setup Complete! 🎉                     ║${C.reset}`);
  console.log(`${C.bold}${C.green}╚══════════════════════════════════════════════════════╝${C.reset}`);
  console.log(`\n${ARROW} Please ${C.bold}fully restart Claude Desktop${C.reset} for changes to take effect.`);
  console.log(`${ARROW} Then open a ${C.bold}new chat${C.reset} and ask Claude to use a muapi tool.\n`);
}

// ─── Environment Detection ──────────────────────────────────────────────────
function detectEnvironment() {
  const platform = os.platform();
  const isWindows = platform === 'win32';
  const isMac = platform === 'darwin';
  const isLinux = platform === 'linux';
  const npxCmd = isWindows ? 'npx.cmd' : 'npx';
  const npmCmd = isWindows ? 'npm.cmd' : 'npm';

  return { platform, isWindows, isMac, isLinux, npxCmd, npmCmd };
}

// ─── Prerequisites Check ────────────────────────────────────────────────────
function checkPrerequisites(env) {
  // Check Node.js version
  const nodeVersion = parseInt(process.version.slice(1));
  if (nodeVersion < 18) {
    console.log(`  ${WARN} Node.js ${process.version} detected. v18+ recommended.`);
  } else {
    console.log(`  ${PASS} Node.js version OK`);
  }

  // Check npx availability
  try {
    const npxVersion = execSync(`${env.npxCmd} --version`, { encoding: 'utf8', timeout: 5000 }).trim();
    console.log(`  ${PASS} npx available (${npxVersion})`);
  } catch (e) {
    console.log(`  ${FAIL} npx not found! Install Node.js from https://nodejs.org`);
    process.exit(1);
  }

  // Check muapi-cli
  try {
    const muapiVersion = execSync(`${env.npxCmd} -y muapi-cli@latest --version`, { encoding: 'utf8', timeout: 30000 }).trim();
    console.log(`  ${PASS} muapi-cli: ${muapiVersion}`);
  } catch (e) {
    console.log(`  ${WARN} Could not verify muapi-cli (will be auto-installed on first use)`);
  }
}

// ─── Find Claude Desktop Config ─────────────────────────────────────────────
function findClaudeConfig(env) {
  const candidates = [];

  if (env.isWindows) {
    // Windows Store install
    const localAppData = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
    const packagesDir = path.join(localAppData, 'Packages');
    
    if (fs.existsSync(packagesDir)) {
      try {
        const dirs = fs.readdirSync(packagesDir).filter(d => d.startsWith('Claude_'));
        for (const dir of dirs) {
          const configPath = path.join(packagesDir, dir, 'LocalCache', 'Roaming', 'Claude', 'claude_desktop_config.json');
          candidates.push({ path: configPath, type: 'Windows Store' });
        }
      } catch (e) { /* ignore */ }
    }

    // Windows direct install
    const appData = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
    candidates.push({ path: path.join(appData, 'Claude', 'claude_desktop_config.json'), type: 'Windows Direct' });

  } else if (env.isMac) {
    candidates.push({ 
      path: path.join(os.homedir(), 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json'),
      type: 'macOS'
    });
  } else if (env.isLinux) {
    candidates.push({
      path: path.join(os.homedir(), '.config', 'Claude', 'claude_desktop_config.json'),
      type: 'Linux'
    });
  }

  // Find the first existing config
  for (const candidate of candidates) {
    if (fs.existsSync(candidate.path)) {
      return {
        configPath: candidate.path,
        configDir: path.dirname(candidate.path),
        installType: candidate.type,
      };
    }
  }

  // If no config exists, use the first candidate and create the directory
  if (candidates.length > 0) {
    const chosen = candidates[0];
    const dir = path.dirname(chosen.path);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    console.log(`  ${WARN} No existing config found. Will create at: ${chosen.path}`);
    return {
      configPath: chosen.path,
      configDir: dir,
      installType: chosen.type,
    };
  }

  console.log(`  ${FAIL} Could not determine Claude Desktop config location!`);
  process.exit(1);
}

// ─── Install Proxy Script ───────────────────────────────────────────────────
function installProxy(configInfo, dryRun) {
  const proxySource = path.join(__dirname, 'proxy-mcp.js');
  const proxyDest = path.join(configInfo.configDir, 'proxy-mcp.js');

  if (!fs.existsSync(proxySource)) {
    console.log(`  ${FAIL} proxy-mcp.js not found in ${__dirname}`);
    console.log(`  ${ARROW} Make sure proxy-mcp.js is in the same directory as this script.`);
    process.exit(1);
  }

  if (dryRun) {
    console.log(`  ${INFO} [DRY RUN] Would copy proxy-mcp.js to: ${proxyDest}`);
  } else {
    fs.copyFileSync(proxySource, proxyDest);
    console.log(`  ${PASS} Installed proxy-mcp.js to: ${proxyDest}`);
  }

  return proxyDest;
}

// ─── Get Existing API Key ───────────────────────────────────────────────────
function getExistingApiKey(configInfo) {
  try {
    if (fs.existsSync(configInfo.configPath)) {
      const config = JSON.parse(fs.readFileSync(configInfo.configPath, 'utf8'));
      return config?.mcpServers?.muapi?.env?.MUAPI_API_KEY || null;
    }
  } catch (e) { /* ignore */ }
  return null;
}

// ─── Update Claude Desktop Config ───────────────────────────────────────────
function updateConfig(configInfo, proxyPath, newApiKey, dryRun) {
  let config = {};

  // Load existing config if present
  if (fs.existsSync(configInfo.configPath)) {
    try {
      const raw = fs.readFileSync(configInfo.configPath, 'utf8');
      config = JSON.parse(raw);
      console.log(`  ${PASS} Loaded existing config`);
    } catch (e) {
      console.log(`  ${WARN} Existing config is corrupted, creating fresh config`);
      config = {};
    }
  }

  // Ensure mcpServers exists
  if (!config.mcpServers) {
    config.mcpServers = {};
  }

  // Determine API key to use
  const existingKey = config.mcpServers?.muapi?.env?.MUAPI_API_KEY;
  const finalKey = newApiKey || existingKey;

  if (!finalKey && !testOnly) {
    console.log(`  ${FAIL} No API key provided and none found in existing config.`);
    console.log(`  ${ARROW} Run again with: node setup-muapi.js --api-key <YOUR_KEY>`);
    process.exit(1);
  }

  // Normalize the proxy path for JSON (use forward slashes)
  const normalizedProxyPath = proxyPath.replace(/\\/g, '\\\\');

  // Set the muapi server config
  config.mcpServers.muapi = {
    command: 'node',
    args: [proxyPath],
    env: {
      MUAPI_API_KEY: finalKey || 'REPLACE_WITH_YOUR_API_KEY'
    }
  };

  if (dryRun) {
    console.log(`  ${INFO} [DRY RUN] Would write config:`);
    console.log(`  ${C.dim}${JSON.stringify(config.mcpServers.muapi, null, 2).split('\n').join('\n  ')}${C.reset}`);
  } else {
    // Write with backup
    if (fs.existsSync(configInfo.configPath)) {
      const backupPath = configInfo.configPath + '.backup.' + Date.now();
      fs.copyFileSync(configInfo.configPath, backupPath);
      console.log(`  ${PASS} Backed up existing config to: ${path.basename(backupPath)}`);
    }

    fs.writeFileSync(configInfo.configPath, JSON.stringify(config, null, 2), 'utf8');
    console.log(`  ${PASS} Config updated successfully`);
  }
}

// ─── Run Diagnostic Test ─────────────────────────────────────────────────────
function runDiagnostic(env, proxyPath, testApiKey) {
  return new Promise((resolve) => {
    console.log(`  ${ARROW} Starting MCP handshake test...\n`);

    const testKey = testApiKey || 'test-diagnostic-key';
    const testEnv = { ...process.env, MUAPI_API_KEY: testKey };

    const mcpProcess = spawn('node', [proxyPath], {
      env: testEnv,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let allOutput = '';
    let testsPassed = 0;
    let totalTests = 4;
    let finished = false;

    const timeout = setTimeout(() => {
      if (!finished) {
        finished = true;
        console.log(`  ${FAIL} Test timed out after 15 seconds`);
        mcpProcess.kill();
        resolve();
      }
    }, 15000);

    mcpProcess.stderr.on('data', (data) => {
      const text = data.toString();
      // Only show errors, not deprecation warnings
      if (!text.includes('DEP0190') && !text.includes('DeprecationWarning')) {
        process.stderr.write(`  ${C.dim}[stderr] ${text}${C.reset}`);
      }
    });

    mcpProcess.stdout.on('data', (data) => {
      allOutput += data.toString('utf8');
      const lines = allOutput.split('\n');

      for (const line of lines) {
        if (!line.trim()) continue;

        // Check for status message
        if (line.includes('"status"') && line.includes('MCP server ready')) {
          console.log(`  ${PASS} Test 1/4: MuAPI server started successfully`);
          testsPassed++;
        }

        // Check initialize response
        try {
          const obj = JSON.parse(line);

          if (obj.result && obj.result.protocolVersion) {
            if (obj.result.protocolVersion === '2025-11-25') {
              console.log(`  ${PASS} Test 2/4: Protocol version correctly rewritten to 2025-11-25`);
              testsPassed++;
            } else {
              console.log(`  ${FAIL} Test 2/4: Protocol version is "${obj.result.protocolVersion}" (expected "2025-11-25")`);
            }

            // Send tools/list request
            const toolsReq = { method: 'tools/list', params: {}, jsonrpc: '2.0', id: 1 };
            mcpProcess.stdin.write(JSON.stringify(toolsReq) + '\n');
          }

          if (obj.result && Array.isArray(obj.result.tools)) {
            const toolCount = obj.result.tools.length;
            if (toolCount > 0) {
              console.log(`  ${PASS} Test 3/4: Received ${toolCount} tools`);
              testsPassed++;
            } else {
              console.log(`  ${FAIL} Test 3/4: Received 0 tools`);
            }

            // Check for stripped fields
            const hasOutputSchema = obj.result.tools.some(t => t.outputSchema);
            const hasAnnotations = obj.result.tools.some(t => t.annotations);

            if (!hasOutputSchema && !hasAnnotations) {
              console.log(`  ${PASS} Test 4/4: Non-standard fields correctly stripped`);
              testsPassed++;
            } else {
              console.log(`  ${FAIL} Test 4/4: Non-standard fields still present (outputSchema: ${hasOutputSchema}, annotations: ${hasAnnotations})`);
            }

            // Done!
            finished = true;
            clearTimeout(timeout);
            mcpProcess.kill();

            console.log(`\n  ${C.bold}Results: ${testsPassed}/${totalTests} tests passed${C.reset}`);
            if (testsPassed === totalTests) {
              console.log(`  ${PASS} ${C.green}${C.bold}All tests passed! MuAPI MCP server is working correctly.${C.reset}`);
            } else {
              console.log(`  ${WARN} Some tests failed. Review the output above for details.`);
            }
            resolve();
          }
        } catch (e) { /* not JSON, skip */ }
      }
    });

    mcpProcess.on('error', (err) => {
      if (!finished) {
        finished = true;
        clearTimeout(timeout);
        console.log(`  ${FAIL} Failed to start proxy: ${err.message}`);
        resolve();
      }
    });

    mcpProcess.on('exit', (code) => {
      if (!finished) {
        finished = true;
        clearTimeout(timeout);
        if (code !== null && code !== 0) {
          console.log(`  ${FAIL} Proxy exited with code ${code}`);
        }
        resolve();
      }
    });

    // Send initialize request
    const initReq = {
      method: 'initialize',
      params: {
        protocolVersion: '2025-11-25',
        capabilities: {},
        clientInfo: { name: 'muapi-setup-diagnostic', version: '1.0.0' }
      },
      jsonrpc: '2.0',
      id: 0
    };
    mcpProcess.stdin.write(JSON.stringify(initReq) + '\n');
  });
}

// ─── Uninstall ──────────────────────────────────────────────────────────────
function performUninstall(configInfo) {
  console.log(`\n${C.bold}[4/4] Removing MuAPI configuration...${C.reset}`);

  if (!fs.existsSync(configInfo.configPath)) {
    console.log(`  ${INFO} No config file found, nothing to remove.`);
    return;
  }

  try {
    const config = JSON.parse(fs.readFileSync(configInfo.configPath, 'utf8'));
    
    if (config.mcpServers && config.mcpServers.muapi) {
      // Backup first
      const backupPath = configInfo.configPath + '.backup.' + Date.now();
      fs.copyFileSync(configInfo.configPath, backupPath);
      console.log(`  ${PASS} Backed up config to: ${path.basename(backupPath)}`);

      delete config.mcpServers.muapi;
      fs.writeFileSync(configInfo.configPath, JSON.stringify(config, null, 2), 'utf8');
      console.log(`  ${PASS} Removed "muapi" from mcpServers`);
    } else {
      console.log(`  ${INFO} No "muapi" entry found in config.`);
    }

    // Remove proxy script
    const proxyPath = path.join(configInfo.configDir, 'proxy-mcp.js');
    if (fs.existsSync(proxyPath)) {
      fs.unlinkSync(proxyPath);
      console.log(`  ${PASS} Removed proxy-mcp.js`);
    }

    console.log(`\n${PASS} MuAPI MCP server uninstalled. Restart Claude Desktop to apply.`);
  } catch (e) {
    console.log(`  ${FAIL} Error during uninstall: ${e.message}`);
  }
}

// ─── Run ─────────────────────────────────────────────────────────────────────
main().catch((err) => {
  console.error(`\n${FAIL} Fatal error: ${err.message}`);
  process.exit(1);
});
