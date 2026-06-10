#!/usr/bin/env node
'use strict';

const path = require('path');
const { lintFile, lintDir } = require('../linter/index');
const { formatFile, formatSummary, formatJSON } = require('../linter/reporter');

// ── Argument parsing ──────────────────────────────────────────────────────────

const args    = process.argv.slice(2);
const command = args[0];

const thresholdIdx = args.indexOf('--threshold');
const flags = {
  plain:     args.includes('--plain'),
  strict:    args.includes('--strict'),
  json:      args.includes('--json'),
  help:      args.includes('--help') || args.includes('-h'),
  version:   args.includes('--version') || args.includes('-v'),
  threshold: thresholdIdx !== -1 ? parseInt(args[thresholdIdx + 1], 10) : 0,
};

// Positional args (non-flag tokens after the command)
const targets = args.slice(1).filter(a => !a.startsWith('--') && !a.startsWith('-'));

// ── Help & version ────────────────────────────────────────────────────────────

// ── forge new — async readline wizard ────────────────────────────────────────

if (command === 'new') {
  const readline = require('readline');
  const { newSpec, formatNew, generateId } = require('../forge/new');
  const path2 = require('path');
  const fs2   = require('fs');

  const rl  = readline.createInterface({ input: process.stdin, output: process.stdout });
  const ask = q => new Promise(res => rl.question(q, res));

  const askRequired = async (label) => {
    let val = '';
    while (!val.trim()) val = await ask(`  ${label}: `);
    return val.trim();
  };

  const askList = async (label, hint) => {
    const items = [];
    process.stdout.write(`\n  ${label}\n`);
    if (hint) process.stdout.write(`  ${hint}\n`);
    process.stdout.write('  One per line, blank line when done:\n');
    while (true) {
      const line = await ask('  > ');
      if (!line.trim()) break;
      items.push(line.trim());
    }
    return items;
  };

  const askMultiline = async (label) => {
    const lines = [];
    process.stdout.write(`\n  ${label}\n`);
    process.stdout.write('  Free text, blank line when done:\n');
    while (true) {
      const line = await ask('  > ');
      if (!line.trim()) break;
      lines.push(line.trim());
    }
    return lines.join(' ');
  };

  (async () => {
    const CLR = flags.plain ? { bold:'', reset:'', dim:'' } : { bold:'\x1b[1m', reset:'\x1b[0m', dim:'\x1b[2m' };
    process.stdout.write(`\n${CLR.bold}forge new${CLR.reset} — create a new .logic spec\n\n`);

    const domain  = await askRequired('Domain (e.g. auth/login-redirect)');
    const owner   = await askRequired('Owner (e.g. J. Rivera (PA))');
    const runtime = await askRequired('Runtime / framework (e.g. TypeScript 5.4 / Next.js 15)');
    const stores  = await askRequired('Data stores (e.g. Postgres read-only, Redis)');

    const authFiles    = await askList('Authorized files — files the agent may modify');
    const forbidFiles  = await askList('Forbidden files — files the agent must never touch');
    const happySteps   = await askList('Happy path steps — primary success flow (no numbering)', 'Each step is one sentence describing a discrete action.');

    const minimum = Math.ceil(happySteps.length / 2) || 1;
    const edgeSteps = await askList('Edge / unhappy path steps — failure cases', `Need at least ${minimum} step${minimum > 1 ? 's' : ''} (≥ 50% of ${happySteps.length} happy steps).`);

    const fence   = await askList('Regression fence — behavior that must not break');
    const debt    = await askMultiline('Context / debt note — rationale for non-obvious decisions');

    rl.close();

    // Resolve ID for display before writing
    const specsDir = (() => {
      const cfgPath = path2.join(process.cwd(), '.lsd', 'config.json');
      if (fs2.existsSync(cfgPath)) {
        try { const c = JSON.parse(fs2.readFileSync(cfgPath,'utf8')); if (c.specs_dir) return path2.join(process.cwd(), c.specs_dir); } catch(_){}
      }
      return path2.join(process.cwd(), 'specs');
    })();
    const id = generateId(specsDir);

    process.stdout.write(`\n  ${CLR.dim}───────────────────────────────────────────${CLR.reset}\n`);
    process.stdout.write(`  ID: ${CLR.bold}${id}${CLR.reset}\n`);

    const answers = {
      domain, owner, runtime, data_stores: stores,
      authorized_files: authFiles, forbidden_files: forbidFiles,
      happy_path_steps: happySteps, edge_steps: edgeSteps,
      regression_fence: fence, context_debt: debt,
    };

    const result = newSpec(process.cwd(), answers);

    if (flags.json) {
      console.log(JSON.stringify({
        ok: result.ok, id: result.id, filePath: result.filePath,
        errors:   result.lintResult ? result.lintResult.errors   : [],
        warnings: result.lintResult ? result.lintResult.warnings : [],
      }, null, 2));
    } else {
      console.log(formatNew(result, flags));
    }

    process.exit(result.ok ? 0 : 1);
  })().catch(err => {
    rl.close();
    console.error(`Error: ${err.message}`);
    process.exit(2);
  });

  // Prevent fall-through — return prevents executing the rest of the file
  return;
}

// ─────────────────────────────────────────────────────────────────────────────

if (flags.version) {
  const pkg = require('../package.json');
  console.log(`lsd-forge v${pkg.version}`);
  process.exit(0);
}

if (flags.help || !command) {
  console.log(`
lsd-forge — Logic-Spec Development hardening engine

Usage:
  forge init                  Bootstrap LSD FORGE into the current project
  forge new                   Interactive wizard — author a new .logic spec
  forge lint [path]           Lint a .logic file or directory
  forge compile <file>        Compile a validated .logic file into an agent payload
  forge status                Show registry health, spec count, and unspecced services
  forge coverage              Gap report — which services have no spec
  forge validate              Cross-spec collision detection
  forge mcp                   Print MCP server setup instructions

Flags:
  --plain                     Plain text output (no colour, no icons) — for CI logs
  --strict                    Treat warnings as errors — exit code 1 on any warning
  --json                      Output results as JSON — overrides --plain
  --threshold <n>             coverage: fail if coverage % is below n (default 0)
  --skip-lint                 Skip lint gate when compiling (advanced use only)
  --out <file>                Write compiler output to a file instead of stdout
  --help, -h                  Show this help
  --version, -v               Show version

Examples:
  forge init                                    Bootstrap FORGE (run once per project)
  forge status                                  Show project integration health
  forge coverage                                Show spec coverage gap report
  forge coverage --threshold 80                 Fail if coverage < 80%
  forge validate                                Check for cross-spec collisions
  forge lint                                    Lint all specs in ./specs/
  forge lint --strict                           Fail on warnings (CI/CD gate)
  forge compile specs/LS-2026-001.logic         Compile to stdout (paste into agent)
  forge compile specs/LS-2026-001.logic --json

Exit codes:
  0  Success
  1  Lint / compile error, or coverage below threshold
  2  Usage error (bad command, path not found)
`);
  process.exit(0);
}

// ── Commands ──────────────────────────────────────────────────────────────────

if (command === 'init') {
  const { init } = require('../init/index');
  const result = init(process.cwd());
  process.exit(result.ok ? 0 : 1);

} else if (command === 'status') {
  const { status, formatStatus } = require('../forge/status');
  const result = status(process.cwd(), flags);
  if (!result.ok) { console.error(`Error: ${result.error}`); process.exit(2); }
  if (flags.json) { console.log(JSON.stringify(result.data, null, 2)); }
  else            { console.log(formatStatus(result.data, flags)); }
  process.exit(0);

} else if (command === 'coverage') {
  const { coverage, formatCoverage } = require('../forge/coverage');
  const result = coverage(process.cwd(), flags);
  if (!result.ok) { console.error(`Error: ${result.error}`); process.exit(2); }
  if (flags.json) { console.log(JSON.stringify(result.data, null, 2)); }
  else            { console.log(formatCoverage(result.data, flags)); }
  process.exit(result.belowThreshold ? 1 : 0);

} else if (command === 'validate') {
  const { validate, formatValidate } = require('../forge/validate');
  const result = validate(process.cwd(), flags);
  if (!result.ok && result.error) { console.error(`Error: ${result.error}`); process.exit(2); }
  console.log(formatValidate(result, flags));
  process.exit(result.ok ? 0 : 1);

} else if (command === 'mcp') {
  const cwd = process.cwd().replace(/\\/g, '/');
  console.log(`
LSD FORGE MCP Server — setup instructions

The MCP server (forge-mcp) exposes six tools to any connected AI model:
  forge_lint        Lint a .logic spec and return findings
  forge_compile     Compile a spec and return the agent payload
  forge_status      Project integration health
  forge_coverage    Spec coverage gap report
  forge_validate    Cross-spec collision detection
  forge_spec_list   List all specs with pass/fail status

── Claude Desktop ──────────────────────────────────────────────────────────────
Add to ~/Library/Application Support/Claude/claude_desktop_config.json (macOS)
     or %APPDATA%\\Claude\\claude_desktop_config.json (Windows):

{
  "mcpServers": {
    "lsd-forge": {
      "command": "npx",
      "args": ["forge-mcp"],
      "cwd": "${cwd}"
    }
  }
}

── VS Code (MCP extension) ──────────────────────────────────────────────────────
Add to .vscode/mcp.json in your project:

{
  "servers": {
    "lsd-forge": {
      "type": "stdio",
      "command": "npx",
      "args": ["forge-mcp"]
    }
  }
}

── Manual launch (testing) ──────────────────────────────────────────────────────
  npx forge-mcp
  (Server reads JSON-RPC from stdin, writes to stdout — Content-Length framing)
`);
  process.exit(0);

} else if (command === 'lint') {
  const targetPath = targets[0] || path.join(process.cwd(), 'specs');

  let results = [];

  try {
    const fs   = require('fs');
    const stat = fs.statSync(targetPath);

    if (stat.isDirectory()) {
      results = lintDir(targetPath);
      if (results.length === 0) {
        console.log(`No .logic files found in ${targetPath}`);
        process.exit(0);
      }
    } else if (stat.isFile()) {
      results = [lintFile(targetPath)];
    } else {
      console.error(`Error: ${targetPath} is not a file or directory`);
      process.exit(2);
    }
  } catch (err) {
    console.error(`Error: ${err.message}`);
    process.exit(2);
  }

  // ── Output ──────────────────────────────────────────────────────────────────

  if (flags.json) {
    console.log(formatJSON(results));
  } else {
    for (const result of results) {
      console.log(formatFile(result, { plain: flags.plain }));
    }
    console.log(formatSummary(results, { plain: flags.plain, strict: flags.strict }));
  }

  // ── Exit code ───────────────────────────────────────────────────────────────

  const hasErrors   = results.some(r => r.errors.length > 0 || r.parseError);
  const hasWarnings = results.some(r => r.warnings.length > 0);

  if (hasErrors || (flags.strict && hasWarnings)) {
    process.exit(1);
  }

  process.exit(0);

} else if (command === 'compile') {

  const { compile } = require('../compiler/index');
  const fs = require('fs');

  const targetFile = targets[0];
  if (!targetFile) {
    console.error('Error: compile requires a file path. Example: forge compile specs/LS-2026-001.logic');
    process.exit(2);
  }

  if (!fs.existsSync(targetFile)) {
    console.error(`Error: file not found: ${targetFile}`);
    process.exit(2);
  }

  const skipLint = args.includes('--skip-lint');
  const outFile  = (() => { const i = args.indexOf('--out'); return i !== -1 ? args[i + 1] : null; })();

  const result = compile(targetFile, { skipLint });

  if (!result.ok) {
    if (flags.plain || flags.json) {
      console.error(result.error);
    } else {
      const CLR = { red:'\x1b[31m', bold:'\x1b[1m', reset:'\x1b[0m', cyan:'\x1b[36m', gray:'\x1b[90m' };
      console.error(`${CLR.red}${CLR.bold}✗ Compile failed${CLR.reset}`);
      console.error(`  ${result.error}\n`);
      if (result.lintErrors.length > 0) {
        result.lintErrors.forEach(e => {
          console.error(`  ${CLR.red}✗${CLR.reset} ${e.message}`);
          console.error(`    ${CLR.cyan}Fix: ${e.fix}${CLR.reset}`);
        });
      }
    }
    process.exit(1);
  }

  // Emit warnings even on success
  if (result.lintWarnings.length > 0 && !flags.json) {
    const CLR = { yellow:'\x1b[33m', reset:'\x1b[0m', gray:'\x1b[90m' };
    result.lintWarnings.forEach(w => {
      process.stderr.write(
        flags.plain
          ? `⚠ [warning] ${w.message}\n`
          : `${CLR.yellow}⚠${CLR.reset} ${w.message}\n`
      );
    });
    process.stderr.write('\n');
  }

  if (flags.json) {
    const out = JSON.stringify({
      id:        result.structured.id,
      domain:    result.structured.domain,
      version:   result.structured.version,
      filePath:  result.filePath,
      warnings:  result.lintWarnings,
      structured: result.structured,
      payload:   result.payload,
    }, null, 2);

    if (outFile) {
      fs.writeFileSync(outFile, out, 'utf8');
      console.log(`JSON written to ${outFile}`);
    } else {
      console.log(out);
    }

  } else {
    if (outFile) {
      fs.writeFileSync(outFile, result.payload, 'utf8');
      if (!flags.plain) {
        const CLR = { green:'\x1b[32m', bold:'\x1b[1m', reset:'\x1b[0m', dim:'\x1b[2m' };
        console.log(`${CLR.green}${CLR.bold}✓ Compiled${CLR.reset} ${CLR.dim}→ ${outFile}${CLR.reset}`);
      } else {
        console.log(`Compiled → ${outFile}`);
      }
    } else {
      console.log(result.payload);
    }
  }

  process.exit(0);

} else {
  console.error(`Unknown command: "${command}". Run "forge --help" for usage.`);
  process.exit(2);
}
