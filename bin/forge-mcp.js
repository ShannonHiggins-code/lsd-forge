#!/usr/bin/env node
'use strict';

/**
 * LSD FORGE — MCP stdio server
 *
 * Implements the Model Context Protocol over stdin/stdout (Content-Length framing,
 * JSON-RPC 2.0). No external dependencies — the protocol is implemented directly.
 *
 * Launch via MCP client config:
 *   { "command": "npx", "args": ["forge-mcp"], "cwd": "/path/to/your/project" }
 *
 * The server uses process.cwd() as the project root, so cwd must point to a
 * directory that has been initialised with `forge init`.
 */

const { TOOLS, callTool, SERVER_INFO } = require('../forge/mcp');

const PROJECT_ROOT = process.cwd();
const PROTOCOL_VERSION = '2024-11-05';

// ── stdio framing ─────────────────────────────────────────────────────────────
// MCP uses Content-Length framing identical to LSP.
// Messages arrive as:  Content-Length: N\r\n\r\n<N bytes of JSON>

let buf = Buffer.alloc(0);

process.stdin.on('data', chunk => {
  buf = Buffer.concat([buf, chunk]);
  drain();
});

process.stdin.on('end', () => process.exit(0));
process.stdin.resume();

function drain() {
  while (true) {
    const sep = buf.indexOf('\r\n\r\n');
    if (sep === -1) break;

    const headerStr = buf.slice(0, sep).toString('utf8');
    const clMatch   = headerStr.match(/Content-Length:\s*(\d+)/i);
    if (!clMatch) { buf = buf.slice(sep + 4); continue; }

    const len       = parseInt(clMatch[1], 10);
    const bodyStart = sep + 4;
    if (buf.length < bodyStart + len) break;

    const body = buf.slice(bodyStart, bodyStart + len).toString('utf8');
    buf = buf.slice(bodyStart + len);

    handleMessage(body);
  }
}

function send(obj) {
  const body   = JSON.stringify(obj);
  const header = `Content-Length: ${Buffer.byteLength(body, 'utf8')}\r\n\r\n`;
  process.stdout.write(header + body);
}

function sendError(id, code, message) {
  send({ jsonrpc: '2.0', id, error: { code, message } });
}

// ── JSON-RPC dispatch ─────────────────────────────────────────────────────────

function handleMessage(body) {
  let msg;
  try { msg = JSON.parse(body); } catch (_) { return; }

  // Notifications (no id) — no response needed
  if (msg.id === undefined || msg.id === null) return;

  switch (msg.method) {

    case 'initialize':
      send({
        jsonrpc: '2.0',
        id: msg.id,
        result: {
          protocolVersion: PROTOCOL_VERSION,
          capabilities:    { tools: {} },
          serverInfo:      SERVER_INFO,
        },
      });
      // Emit initialized notification
      send({ jsonrpc: '2.0', method: 'notifications/initialized' });
      break;

    case 'tools/list':
      send({ jsonrpc: '2.0', id: msg.id, result: { tools: TOOLS } });
      break;

    case 'tools/call': {
      const { name, arguments: args = {} } = msg.params || {};
      if (!name) { sendError(msg.id, -32602, 'Missing tool name'); break; }
      const result = callTool(name, args, PROJECT_ROOT);
      send({ jsonrpc: '2.0', id: msg.id, result });
      break;
    }

    case 'ping':
      send({ jsonrpc: '2.0', id: msg.id, result: {} });
      break;

    default:
      sendError(msg.id, -32601, `Method not found: ${msg.method}`);
  }
}
