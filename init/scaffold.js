'use strict';

const fs   = require('fs');
const path = require('path');

const ASSETS_DIR = path.join(__dirname, '..', 'assets');

/**
 * Create the .lsd/ directory tree and write all generated files.
 */
function writeLsdDir(projectRoot, config) {
  const lsdDir    = path.join(projectRoot, '.lsd');
  const skillsDir = path.join(lsdDir, 'skills');

  if (!fs.existsSync(lsdDir))    fs.mkdirSync(lsdDir,    { recursive: true });
  if (!fs.existsSync(skillsDir)) fs.mkdirSync(skillsDir, { recursive: true });

  writeConfig(lsdDir, config);
  writeOnboarding(lsdDir, config);
  copySkills(skillsDir);
  writeRegistryShell(lsdDir, config);
}

function writeConfig(lsdDir, config) {
  fs.writeFileSync(
    path.join(lsdDir, 'config.json'),
    JSON.stringify(config, null, 2) + '\n',
    'utf8'
  );
}

function writeOnboarding(lsdDir, config) {
  const template = fs.readFileSync(path.join(ASSETS_DIR, 'onboarding.md'), 'utf8');
  const postureList = config.posture.length > 0 ? config.posture.join(', ') : 'none detected';

  const filled = template
    .replace(/\{\{PROJECT_NAME\}\}/g,   config.project_name)
    .replace(/\{\{LSD_VERSION\}\}/g,    config.lsd_version)
    .replace(/\{\{VERIFY_COMMAND\}\}/g, config.verify_command)
    .replace(/\{\{POSTURE_FILES\}\}/g,  postureList);

  fs.writeFileSync(path.join(lsdDir, 'onboarding.md'), filled, 'utf8');
}

function copySkills(skillsDir) {
  const srcDir = path.join(ASSETS_DIR, 'skills');
  for (const file of fs.readdirSync(srcDir)) {
    if (file.endsWith('.md')) {
      fs.copyFileSync(path.join(srcDir, file), path.join(skillsDir, file));
    }
  }
}

function writeRegistryShell(lsdDir, config) {
  const shell = {
    discovered_at:   null,
    services:        {},
    artifacts:       {},
    ai_posture:      config.posture.map(f => ({ tool: toolFromPath(f), file: f })),
    verify_command:  config.verify_command,
    spec_count:      0,
    stale_specs:     [],
  };
  fs.writeFileSync(
    path.join(lsdDir, 'registry.json'),
    JSON.stringify(shell, null, 2) + '\n',
    'utf8'
  );
}

/** Infer tool name from posture file path. */
function toolFromPath(filePath) {
  if (filePath === 'CLAUDE.md')                           return 'claude-code';
  if (filePath === 'AGENTS.md')                           return 'openai-codex';
  if (filePath === 'GEMINI.md')                           return 'gemini';
  if (filePath.includes('.cursor'))                       return 'cursor';
  if (filePath.includes('copilot-instructions'))          return 'github-copilot';
  if (filePath.includes('.continuerules'))                return 'continue';
  if (filePath.includes('.aider'))                        return 'aider';
  if (filePath.includes('.windsurf'))                     return 'windsurf';
  return 'unknown';
}

/**
 * Create specs/examples/ and drop in the starter .logic file if it doesn't exist.
 */
function scaffoldSpecs(projectRoot) {
  const specsDir = path.join(projectRoot, 'specs', 'examples');
  if (!fs.existsSync(specsDir)) {
    fs.mkdirSync(specsDir, { recursive: true });
  }

  const dest = path.join(specsDir, 'LS-YYYY-001-example.logic');
  if (!fs.existsSync(dest)) {
    fs.copyFileSync(path.join(ASSETS_DIR, 'starter.logic'), dest);
    return true;
  }
  return false;
}

/**
 * Add lint:specs script to package.json if it doesn't already exist.
 * Returns true if the file was modified.
 */
function patchPackageJson(projectRoot) {
  const pkgPath = path.join(projectRoot, 'package.json');
  if (!fs.existsSync(pkgPath)) return false;

  let pkg;
  try {
    pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  } catch (_) {
    return false;
  }

  if (!pkg.scripts) pkg.scripts = {};
  if (pkg.scripts['lint:specs']) return false;

  pkg.scripts['lint:specs'] = 'forge lint specs/ --plain --strict';
  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf8');
  return true;
}

/**
 * Install a pre-commit hook that runs `forge lint --strict` on staged .logic files.
 * Writes to .git/hooks/pre-commit. No-op if .git/ doesn't exist.
 * Returns 'installed' | 'already-present' | 'no-git'
 */
function installPreCommitHook(projectRoot) {
  const gitDir  = path.join(projectRoot, '.git');
  const hooksDir = path.join(gitDir, 'hooks');
  const hookPath = path.join(hooksDir, 'pre-commit');

  if (!fs.existsSync(gitDir)) return 'no-git';

  if (!fs.existsSync(hooksDir)) {
    fs.mkdirSync(hooksDir, { recursive: true });
  }

  const MARKER = '# lsd-forge-hook';

  if (fs.existsSync(hookPath)) {
    const existing = fs.readFileSync(hookPath, 'utf8');
    if (existing.includes(MARKER)) return 'already-present';
    // Append to existing hook
    fs.writeFileSync(hookPath, existing.trimEnd() + '\n\n' + hookScript(MARKER), 'utf8');
    return 'installed';
  }

  fs.writeFileSync(hookPath, '#!/bin/sh\n' + hookScript(MARKER), 'utf8');
  try { fs.chmodSync(hookPath, 0o755); } catch (_) {}
  return 'installed';
}

function hookScript(marker) {
  return `${marker}
# Lint staged .logic files before commit
STAGED=$(git diff --cached --name-only --diff-filter=ACM | grep '\\.logic$')
if [ -n "$STAGED" ]; then
  echo "LSD FORGE: linting staged .logic files..."
  npx forge lint $STAGED --plain --strict
  if [ $? -ne 0 ]; then
    echo "LSD FORGE: spec lint failed. Fix errors before committing."
    exit 1
  fi
fi
`;
}

module.exports = { writeLsdDir, scaffoldSpecs, patchPackageJson, installPreCommitHook };
