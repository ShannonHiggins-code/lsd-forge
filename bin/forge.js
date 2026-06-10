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

// ── forge new — intelligent guided wizard ────────────────────────────────────

if (command === 'new') {
  const readline = require('readline');
  const fs2   = require('fs');
  const path2 = require('path');
  const { newSpec, formatNew } = require('../forge/new');
  const { interpret, deriveEdgesFromHappyPath } = require('../forge/interpret');

  const rl  = readline.createInterface({ input: process.stdin, output: process.stdout });
  const ask = q => new Promise(res => rl.question(q, res));

  const C = flags.plain
    ? { bold:'', reset:'', dim:'', green:'', yellow:'', cyan:'', red:'' }
    : { bold:'\x1b[1m', reset:'\x1b[0m', dim:'\x1b[2m',
        green:'\x1b[32m', yellow:'\x1b[33m', cyan:'\x1b[36m', red:'\x1b[31m' };

  const LETTERS = 'abcdefghijklmnopqrstuvwxyz'.split('');

  const hdr = title => {
    const bar = '─'.repeat(Math.max(0, 42 - title.length));
    return `\n${C.bold}─── ${title} ${C.reset}${C.dim}${bar}${C.reset}\n`;
  };

  const loadConfig = () => {
    const p = path2.join(process.cwd(), '.lsd', 'config.json');
    try { return JSON.parse(fs2.readFileSync(p, 'utf8')); } catch (_) { return null; }
  };

  // Prompt with a labelled list — user presses Enter to accept, letters to remove, + to add, c to clear
  const promptList = async (label, items, canRefine) => {
    let current = [...items];

    const redraw = () => {
      process.stdout.write(`\n  ${C.bold}${label}${C.reset}\n`);
      if (current.length === 0) {
        process.stdout.write(`    ${C.dim}(none)${C.reset}\n`);
      } else {
        current.forEach((item, i) => {
          process.stdout.write(`    ${C.cyan}${LETTERS[i]}${C.reset}. ${item}\n`);
        });
      }
      process.stdout.write('\n');
      process.stdout.write(
        `  ${C.dim}[↵] Accept all  [letter] Remove item  [+] Add  [c] Clear & enter fresh` +
        (canRefine ? `  [r] Refine goal` : '') +
        `${C.reset}\n`
      );
    };

    redraw();

    while (true) {
      const raw = (await ask('  > ')).trim().toLowerCase();

      if (raw === '')       return { action: 'accept', items: current };
      if (raw === 'r' && canRefine) return { action: 'refine' };

      if (raw === '+') {
        const extra = (await ask('  Add item: ')).trim();
        if (extra) current.push(extra);
        redraw();
        continue;
      }

      if (raw === 'c') {
        current = [];
        process.stdout.write(`  Enter one item per line, blank line when done:\n`);
        while (true) {
          const line = (await ask('  > ')).trim();
          if (!line) break;
          current.push(line);
        }
        return { action: 'accept', items: current };
      }

      // Letters remove items by index
      const toRemove = new Set();
      for (const ch of raw) {
        const idx = LETTERS.indexOf(ch);
        if (idx >= 0 && idx < current.length) toRemove.add(idx);
      }
      if (toRemove.size > 0) current = current.filter((_, i) => !toRemove.has(i));
      redraw();
    }
  };

  // Prompt with a numbered steps list — Enter to accept, number to edit, + to add
  const promptSteps = async (label, steps, minimum, canRefine) => {
    const current = [...steps];

    const redraw = () => {
      process.stdout.write(`\n  ${C.bold}${label}${C.reset}\n`);
      current.forEach((s, i) => {
        process.stdout.write(`    ${C.cyan}${i + 1}${C.reset}. ${s}\n`);
      });
      process.stdout.write('\n');
      const minNote = minimum ? `  ${C.yellow}Minimum: ${minimum} step${minimum > 1 ? 's' : ''}${C.reset}` : '';
      process.stdout.write(
        `  ${C.dim}[↵] Accept all  [1-9] Edit step  [+] Add step` +
        (canRefine ? `  [r] Refine goal` : '') +
        `${C.reset}${minNote}\n`
      );
    };

    redraw();

    while (true) {
      const raw = (await ask('  > ')).trim().toLowerCase();

      if (raw === '') {
        if (minimum && current.length < minimum) {
          process.stdout.write(`  ${C.yellow}Need at least ${minimum} step${minimum > 1 ? 's' : ''} — add with [+].${C.reset}\n`);
          continue;
        }
        return { action: 'accept', steps: current };
      }

      if (raw === 'r' && canRefine) return { action: 'refine' };

      if (raw === '+') {
        const extra = (await ask(`  Step ${current.length + 1}: `)).trim();
        if (extra) current.push(extra);
        redraw();
        continue;
      }

      const num = parseInt(raw, 10);
      if (!isNaN(num) && num >= 1 && num <= current.length) {
        process.stdout.write(`  Current: ${C.dim}${current[num - 1]}${C.reset}\n`);
        const updated = (await ask(`  Step ${num}: `)).trim();
        if (updated) current[num - 1] = updated;
        redraw();
        continue;
      }

      process.stdout.write(`  ${C.dim}Type a step number to edit, [+] to add, or [↵] to accept.${C.reset}\n`);
    }
  };

  // Re-interpret with additional context
  const refine = async (description, config) => {
    const clarify = (await ask('\n  Clarify your goal: ')).trim();
    const newDesc = clarify ? `${description}. ${clarify}` : description;
    process.stdout.write(`${C.dim}  Re-interpreting...${C.reset}\n`);
    return { description: newDesc, hints: interpret(newDesc, config) };
  };

  (async () => {
    process.stdout.write(`\n${C.bold}forge new${C.reset} — create a new .logic spec\n`);
    process.stdout.write(`${C.dim}Describe what you want to build — the wizard interprets your goal and suggests content for each section.${C.reset}\n\n`);

    const config = loadConfig();

    // ── Step 0: intent ────────────────────────────────────────────────────────
    let description = '';
    while (!description) {
      description = (await ask(`${C.bold}What do you want to build?${C.reset} (plain language)\n> `)).trim();
    }

    process.stdout.write(`\n${C.dim}  Interpreting...${C.reset}\n`);
    let hints = interpret(description, config);

    // ── Step 1: review interpretation ─────────────────────────────────────────
    process.stdout.write(hdr('Interpretation'));
    process.stdout.write(`  Domain:      ${C.cyan}${hints.domain || '(not detected — enter below)'}${C.reset}\n`);
    process.stdout.write(`  Runtime:     ${hints.runtime}\n`);
    process.stdout.write(`  Data stores: ${hints.data_stores}\n\n`);
    process.stdout.write(`  ${C.dim}[↵] Continue   [r] Refine goal${C.reset}\n`);

    const startChoice = (await ask('  > ')).trim().toLowerCase();
    if (startChoice === 'r') {
      const updated = await refine(description, config);
      description = updated.description;
      hints       = updated.hints;
      process.stdout.write(`  Domain: ${C.cyan}${hints.domain || '(not detected)'}${C.reset}\n`);
    }

    // ── Step 2: identity ──────────────────────────────────────────────────────
    process.stdout.write(hdr('Identity'));

    let domain = '';
    while (!domain) {
      const defVal = hints.domain || '';
      const prompt = defVal ? `  Domain ${C.dim}[${defVal}]${C.reset}: ` : `  Domain (e.g. auth/login-redirect): `;
      domain = ((await ask(prompt)).trim()) || defVal;
      if (!domain) process.stdout.write(`  ${C.red}Domain is required.${C.reset}\n`);
    }

    let owner = hints.owner || '';
    while (!owner) {
      const prompt = `  Owner (name + role, e.g. J. Rivera (PA)): `;
      owner = (await ask(prompt)).trim();
      if (!owner) process.stdout.write(`  ${C.red}Owner is required.${C.reset}\n`);
    }

    // ── Step 3: TARGET_BOUNDARIES ─────────────────────────────────────────────
    process.stdout.write(hdr('TARGET_BOUNDARIES'));

    let runtime = hints.runtime;
    const runtimeRaw = (await ask(`  Runtime ${C.dim}[${runtime}]${C.reset}: `)).trim();
    if (runtimeRaw) runtime = runtimeRaw;

    let data_stores = hints.data_stores;
    const storesRaw = (await ask(`  Data stores ${C.dim}[${data_stores}]${C.reset}: `)).trim();
    if (storesRaw) data_stores = storesRaw;

    let authorized_files = [];
    while (true) {
      const res = await promptList('Authorized files — files the agent may modify', [...hints.authorized_files], true);
      if (res.action === 'refine') {
        const updated = await refine(description, config);
        description = updated.description; hints = updated.hints;
        continue;
      }
      authorized_files = res.items;
      break;
    }

    let forbidden_files = [];
    while (true) {
      const res = await promptList('Forbidden files — files the agent must never touch', [...hints.forbidden_files], true);
      if (res.action === 'refine') {
        const updated = await refine(description, config);
        description = updated.description; hints = updated.hints;
        continue;
      }
      forbidden_files = res.items;
      break;
    }

    // ── Step 4: INTENT_HAPPY_PATH ─────────────────────────────────────────────
    let happy_path_steps = [];
    while (true) {
      const res = await promptSteps('INTENT_HAPPY_PATH — primary success flow', [...hints.happy_path_steps], 1, true);
      if (res.action === 'refine') {
        const updated = await refine(description, config);
        description = updated.description; hints = updated.hints;
        continue;
      }
      happy_path_steps = res.steps;
      break;
    }

    // ── Step 5: EDGE_CRITICAL_UNHAPPY_PATH ────────────────────────────────────
    const minimum = Math.ceil(happy_path_steps.length / 2);
    let edge_steps = [];
    while (true) {
      const derivedEdges = deriveEdgesFromHappyPath(happy_path_steps);
      const res = await promptSteps('EDGE_CRITICAL_UNHAPPY_PATH — failure cases', derivedEdges, minimum, true);
      if (res.action === 'refine') {
        const updated = await refine(description, config);
        description = updated.description; hints = updated.hints;
        continue;
      }
      edge_steps = res.steps;
      break;
    }

    // ── Step 6: REGRESSION_FENCE ──────────────────────────────────────────────
    const fenceRes = await promptList('REGRESSION_FENCE — behavior that must not break', [...hints.regression_fence], false);
    const regression_fence = fenceRes.items;

    // ── Step 7: CONTEXT_DEBT_NOTE ─────────────────────────────────────────────
    process.stdout.write(hdr('CONTEXT_DEBT_NOTE'));
    process.stdout.write(`  ${C.dim}Rationale for non-obvious decisions — security choices, UX overrides, deferred work.${C.reset}\n`);
    process.stdout.write(`  ${C.dim}Free text, blank line when done. Press [↵] to skip.${C.reset}\n\n`);
    const debtLines = [];
    while (true) {
      const line = (await ask('  > ')).trim();
      if (!line) break;
      debtLines.push(line);
    }
    const context_debt = debtLines.join(' ');

    rl.close();

    // ── Write & lint ──────────────────────────────────────────────────────────
    const answers = {
      domain, owner, runtime, data_stores,
      authorized_files, forbidden_files,
      happy_path_steps, edge_steps,
      regression_fence, context_debt,
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
  forge search <description>  Find specs related to a plain-language description
  forge touched <file...>     Show specs affected by these files
  forge touched --staged      Show specs affected by staged git files
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

} else if (command === 'search') {
  const { search, formatSearch } = require('../forge/search');

  const description = targets.join(' ').trim();
  if (!description) {
    console.error('Error: forge search requires a description. Example: forge search "add rate limiting to auth"');
    process.exit(2);
  }

  const results = search(process.cwd(), description, { limit: 10 });

  if (flags.json) {
    console.log(JSON.stringify(results, null, 2));
    process.exit(0);
  }

  console.log(formatSearch(results, description, flags));
  process.exit(0);

} else if (command === 'touched') {
  const { touched, formatTouched } = require('../forge/touched');
  const { execSync } = require('child_process');

  let files = [...targets];

  if (args.includes('--staged')) {
    try {
      const raw = execSync('git diff --cached --name-only --diff-filter=ACM', { encoding: 'utf8' });
      files = raw.split('\n').map(f => f.trim()).filter(f => f && !f.endsWith('.logic'));
    } catch (_) {
      console.error('Error: could not run git diff. Is this a git repository?');
      process.exit(2);
    }
  }

  if (files.length === 0) {
    if (!flags.plain) console.log('\x1b[32m✓\x1b[0m No staged code files to check.');
    process.exit(0);
  }

  const results = touched(process.cwd(), files);

  if (flags.json) {
    console.log(JSON.stringify(results, null, 2));
    process.exit(0);
  }

  const output = formatTouched(results, flags);
  if (output) {
    console.log(output);
    process.exit(flags.strict ? 1 : 0);
  } else {
    if (!flags.plain) console.log('\x1b[32m✓\x1b[0m No specs affected by these files.');
    process.exit(0);
  }

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
