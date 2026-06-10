'use strict';

const path = require('path');
const { lintFile } = require('../linter/index');
const { formatFile } = require('../linter/reporter');
const { compile }   = require('../compiler/index');
const { status,   formatStatus   } = require('./status');
const { coverage, formatCoverage } = require('./coverage');
const { validate, formatValidate } = require('./validate');

const pkg = require('../package.json');

// ── Tool definitions ──────────────────────────────────────────────────────────

const TOOLS = [
  {
    name: 'forge_lint',
    description: 'Lint a .logic spec file and return findings. Use before compile or before starting implementation work.',
    inputSchema: {
      type: 'object',
      properties: {
        file_path: { type: 'string', description: 'Path to the .logic file (relative to project root or absolute)' },
        strict:    { type: 'boolean', description: 'Treat warnings as errors (default false)' },
      },
      required: ['file_path'],
    },
  },
  {
    name: 'forge_compile',
    description: 'Compile a validated .logic spec into an agent payload string. The payload contains all the context an AI agent needs to execute the spec. Lint must pass first.',
    inputSchema: {
      type: 'object',
      properties: {
        file_path: { type: 'string', description: 'Path to the .logic file' },
      },
      required: ['file_path'],
    },
  },
  {
    name: 'forge_status',
    description: 'Show LSD FORGE project integration health: registry discovery state, spec count, stale specs, and unspecced services.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'forge_coverage',
    description: 'Show spec coverage gap report: which registered services have no .logic spec. Use to prioritise which specs to author next.',
    inputSchema: {
      type: 'object',
      properties: {
        threshold: { type: 'number', description: 'Minimum coverage % required. Returns is_below_threshold: true if not met.' },
      },
    },
  },
  {
    name: 'forge_validate',
    description: 'Run cross-spec collision detection across all .logic files. Finds forbidden-exposure conflicts, domain overlaps, and shared-authorization warnings.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'forge_new',
    description: 'Create a new .logic spec file from structured answers. Before calling this tool, collect the required answers from the user through conversation: ask each question, wait for their response, then call this tool with all answers. Returns the file path and lint result.',
    inputSchema: {
      type: 'object',
      properties: {
        domain:           { type: 'string',  description: 'Feature domain path (e.g. auth/password-reset)' },
        owner:            { type: 'string',  description: 'Spec owner — name and role (e.g. "J. Rivera (PA)")' },
        runtime:          { type: 'string',  description: 'Runtime and framework (e.g. "TypeScript 5.4 / Next.js 15")' },
        data_stores:      { type: 'string',  description: 'Data stores the feature reads or writes (e.g. "Postgres read-only, Redis")' },
        authorized_files: { type: 'array',   items: { type: 'string' }, description: 'File paths the agent is authorized to modify' },
        forbidden_files:  { type: 'array',   items: { type: 'string' }, description: 'File paths the agent must never touch' },
        happy_path_steps: { type: 'array',   items: { type: 'string' }, description: 'Primary success flow steps — plain sentences, no numbering' },
        edge_steps:       { type: 'array',   items: { type: 'string' }, description: 'Failure cases to handle — must be ≥ ceil(happy_path_steps.length / 2)' },
        regression_fence: { type: 'array',   items: { type: 'string' }, description: 'Behaviors that must not break' },
        context_debt:     { type: 'string',  description: 'Rationale for non-obvious decisions, security choices, deferred work' },
        requires:         { type: 'array',   items: { type: 'string' }, description: 'IDs of specs this spec depends on (e.g. ["LS-2026-001"]). Use [] if none.' },
        output_path:      { type: 'string',  description: 'Optional output path. Auto-generated from domain and ID if omitted.' },
      },
      required: ['domain', 'owner', 'runtime', 'data_stores', 'authorized_files', 'forbidden_files', 'happy_path_steps', 'edge_steps', 'regression_fence', 'context_debt'],
    },
  },
  {
    name: 'forge_spec_list',
    description: 'List all .logic spec files in the project with their ID, domain, lint pass/fail status, and authorized_files. Use at the start of any session to understand the spec landscape and detect potential file conflicts.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'forge_touched',
    description: 'Given a list of file paths, return every spec that authorizes any of them. Call this before modifying files to discover which specs are affected and which regression fences apply. Essential for safe refactoring.',
    inputSchema: {
      type: 'object',
      properties: {
        files: {
          type: 'array',
          items: { type: 'string' },
          description: 'File paths to check (relative to project root)',
        },
      },
      required: ['files'],
    },
  },
];

// ── Tool call handler ─────────────────────────────────────────────────────────

function callTool(name, args, projectRoot) {
  try {
    switch (name) {

      case 'forge_lint': {
        const filePath = resolvePath(args.file_path, projectRoot);
        const result   = lintFile(filePath);
        const text     = formatFile(result, { plain: true });
        const passed   = result.passed && !result.parseError;
        return textResult(text, !passed);
      }

      case 'forge_compile': {
        const filePath = resolvePath(args.file_path, projectRoot);
        const result   = compile(filePath, {});
        if (!result.ok) {
          return textResult(`Compile failed: ${result.error}`, true);
        }
        const warnings = result.lintWarnings.length > 0
          ? `\n[${result.lintWarnings.length} warning(s) — see forge lint for details]\n\n`
          : '';
        return textResult(warnings + result.payload, false);
      }

      case 'forge_status': {
        const result = status(projectRoot, { plain: true });
        if (!result.ok) return textResult(`Error: ${result.error}`, true);
        return textResult(formatStatus(result.data, { plain: true }), false);
      }

      case 'forge_coverage': {
        const result = coverage(projectRoot, { plain: true, threshold: args.threshold || 0 });
        if (!result.ok) return textResult(`Error: ${result.error}`, true);
        const text = formatCoverage(result.data, { plain: true });
        return {
          content: [{ type: 'text', text }],
          isError: false,
          _meta: { is_below_threshold: result.belowThreshold, coverage_pct: result.data.coverage_pct },
        };
      }

      case 'forge_validate': {
        const result = validate(projectRoot, { plain: true });
        if (!result.ok && result.error) return textResult(`Error: ${result.error}`, true);
        return textResult(formatValidate(result, { plain: true }), !result.ok);
      }

      case 'forge_new': {
        const { newSpec, formatNew } = require('./new');
        const result = newSpec(projectRoot, args);
        const text   = formatNew(result, { plain: true });
        return textResult(text, !result.ok);
      }

      case 'forge_spec_list': {
        return textResult(specList(projectRoot), false);
      }

      case 'forge_touched': {
        const { touched, formatTouched } = require('./touched');
        const results = touched(projectRoot, args.files || []);
        if (results.length === 0) {
          return textResult('No specs are affected by these files.', false);
        }
        return textResult(formatTouched(results, { plain: true }), false);
      }

      default:
        return textResult(`Unknown tool: ${name}`, true);
    }
  } catch (err) {
    return textResult(`Internal error: ${err.message}`, true);
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function textResult(text, isError = false) {
  return { content: [{ type: 'text', text: String(text) }], isError };
}

function resolvePath(filePath, projectRoot) {
  return path.isAbsolute(filePath) ? filePath : path.join(projectRoot, filePath);
}

function specList(projectRoot) {
  const fs              = require('fs');
  const { lintDir }     = require('../linter/index');
  const { parse }       = require('../linter/parser');
  const lsdPath         = path.join(projectRoot, '.lsd', 'config.json');
  let specsDir          = path.join(projectRoot, 'specs');

  if (fs.existsSync(lsdPath)) {
    try {
      const cfg = JSON.parse(fs.readFileSync(lsdPath, 'utf8'));
      if (cfg.specs_dir) specsDir = path.join(projectRoot, cfg.specs_dir);
    } catch (_) {}
  }

  if (!fs.existsSync(specsDir)) return 'No specs directory found.';

  let results;
  try { results = lintDir(specsDir, { recursive: true }); } catch (_) { return 'Could not read specs directory.'; }

  if (results.length === 0) return 'No .logic files found.';

  const lines = [`${results.length} spec(s) found:\n`];
  for (const r of results) {
    const rel    = path.relative(projectRoot, r.filePath);
    const id     = r.meta && r.meta.id     ? r.meta.id     : '(no id)';
    const domain = r.meta && r.meta.domain ? r.meta.domain : '(no domain)';
    const status = r.parseError ? '[parse error]' : r.passed ? '[pass]' : '[fail]';
    lines.push(`  ${status}  ${id}  ${domain}  ${rel}`);

    // Parse the spec to expose authorized_files for cross-spec conflict detection
    try {
      const parsed = parse(r.filePath);
      const boundaries = (parsed.sections && parsed.sections.TARGET_BOUNDARIES) || '';
      const authBlock  = boundaries.match(/authorized_files:([\s\S]*?)(?=forbidden_files:|$)/)?.[1] || '';
      const authFiles  = authBlock.split('\n')
        .map(l => l.replace(/^\s*-\s*/, '').trim())
        .filter(Boolean);
      if (authFiles.length > 0) {
        lines.push(`    authorized_files: ${authFiles.join(', ')}`);
      }
    } catch (_) {}
  }
  return lines.join('\n');
}

// ── Server info ───────────────────────────────────────────────────────────────

const SERVER_INFO = {
  name:    'lsd-forge',
  version: pkg.version,
};

module.exports = { TOOLS, callTool, SERVER_INFO };
