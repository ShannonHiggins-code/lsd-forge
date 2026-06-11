'use strict';

const fs   = require('fs');
const path = require('path');
const { detectStack, detectTestCommand, detectPostureFiles, detectProjectName } = require('./detect');
const { writeLsdDir, upgradeLsdDir, upgradeHook, scaffoldSpecs, patchPackageJson, installPreCommitHook } = require('./scaffold');
const { augmentPostureFiles } = require('./augment');
const pkg = require('../package.json');

/**
 * Bootstrap or upgrade LSD FORGE in a project directory.
 * opts.upgrade = true  → refresh skills/onboarding/shortcuts/hook, preserve config + registry
 * opts.upgrade = false → full bootstrap (default)
 */
function init(projectRoot, opts = {}) {
  const log = msg => process.stdout.write(msg + '\n');

  if (opts.upgrade) return runUpgrade(projectRoot, log);

  log('\nforge init — bootstrapping LSD FORGE\n');

  // ── Detect ──────────────────────────────────────────────────────────────────

  log('  Detecting project...');

  const projectName   = detectProjectName(projectRoot);
  const stack         = detectStack(projectRoot);
  const verifyCommand = detectTestCommand(projectRoot, stack);
  const postureFiles  = detectPostureFiles(projectRoot);

  const stackLabel = stack.language === 'unknown'
    ? 'unknown stack'
    : `${stack.language} / ${stack.framework}`;

  log(`  ✓ Project : ${projectName}`);
  log(`  ✓ Stack   : ${stackLabel}`);
  log(`  ✓ Oracle  : ${verifyCommand}`);

  if (postureFiles.length > 0) {
    log(`  ✓ Posture : ${postureFiles.join(', ')}`);
  } else {
    log('  ✓ Posture : none detected');
  }

  // ── Build config ────────────────────────────────────────────────────────────

  const config = {
    lsd_version:    pkg.version,
    project_name:   projectName,
    stack,
    verify_command: verifyCommand,
    authorized:     ['src/', 'lib/', 'specs/'],
    forbidden:      ['node_modules/', '.env', '.git/'],
    authorized_deps: [],
    posture:        postureFiles,
    skills_dir:     '.lsd/skills/',
    specs_dir:      'specs/',
  };

  // ── Scaffold .lsd/ ──────────────────────────────────────────────────────────

  log('\n  Scaffolding .lsd/...');

  let shortcuts = [];
  try {
    shortcuts = writeLsdDir(projectRoot, config, postureFiles);
  } catch (err) {
    return { ok: false, error: `Failed to write .lsd/: ${err.message}` };
  }

  log('  ✓ .lsd/onboarding.md      — AI automation trigger');
  log('  ✓ .lsd/config.json        — authorization map and oracle');
  log('  ✓ .lsd/registry.json      — resource registry (AI populates on first session)');
  log('  ✓ .lsd/skills/            — universal skill kit');
  if (shortcuts.length > 0) {
    log('\n  forge-new shortcuts installed:');
    for (const s of shortcuts) log(`  ✓ ${s}`);
  }

  // ── Scaffold specs/ ─────────────────────────────────────────────────────────

  try {
    const created = scaffoldSpecs(projectRoot);
    if (created) {
      log('  ✓ specs/examples/LS-YYYY-001-example.logic  — starter spec');
    }
  } catch (err) {
    log(`  ⚠ Could not scaffold specs/: ${err.message}`);
  }

  // ── Augment posture files ───────────────────────────────────────────────────

  if (postureFiles.length > 0) {
    log('\n  Augmenting AI posture files...');
    let modified;
    try {
      modified = augmentPostureFiles(projectRoot, postureFiles);
    } catch (err) {
      log(`  ⚠ Posture augmentation error: ${err.message}`);
      modified = [];
    }
    for (const f of modified) log(`  ✓ ${f}`);
    if (modified.length === 0) log('  ✓ All posture files already contain LSD block');
  }

  // ── Patch package.json ──────────────────────────────────────────────────────

  try {
    const patched = patchPackageJson(projectRoot);
    if (patched) log('\n  ✓ Added "lint:specs" script to package.json');
  } catch (err) {
    log(`\n  ⚠ Could not patch package.json: ${err.message}`);
  }

  // ── Pre-commit hook ─────────────────────────────────────────────────────────

  const hookResult = installPreCommitHook(projectRoot);
  if (hookResult === 'installed') {
    log('\n  ✓ Pre-commit hook installed (.git/hooks/pre-commit)');
    log('    Staged .logic files will be linted before every commit.');
  } else if (hookResult === 'already-present') {
    log('\n  ✓ Pre-commit hook already present');
  }

  // ── Done ────────────────────────────────────────────────────────────────────

  log('\n  Done.\n');
  log('  Any AI model working in this project will now auto-onboard via .lsd/onboarding.md');
  log('  Next: open .lsd/config.json and verify the authorized/forbidden paths for your project.\n');

  return { ok: true, config };
}

// ── Upgrade mode ──────────────────────────────────────────────────────────────

function runUpgrade(projectRoot, log) {
  log('\nforge init --upgrade — refreshing LSD FORGE skill kit\n');

  const lsdPath = path.join(projectRoot, '.lsd', 'config.json');
  if (!fs.existsSync(lsdPath)) {
    return {
      ok: false,
      error: 'No .lsd/config.json found. Run forge init (without --upgrade) for a first install.',
    };
  }

  // Read existing config — preserve all project-specific values
  let existingConfig;
  try {
    existingConfig = JSON.parse(fs.readFileSync(lsdPath, 'utf8'));
  } catch (err) {
    return { ok: false, error: `Could not read .lsd/config.json: ${err.message}` };
  }

  const postureFiles = detectPostureFiles(projectRoot);
  const config = { ...existingConfig, lsd_version: pkg.version };

  // ── Refresh skills, onboarding, shortcuts ──────────────────────────────────

  log('  Refreshing...');
  let updated;
  try {
    updated = upgradeLsdDir(projectRoot, config, postureFiles);
  } catch (err) {
    return { ok: false, error: `Upgrade failed: ${err.message}` };
  }
  for (const u of updated) log(`  ✓ ${u}`);

  // ── Upgrade pre-commit hook ────────────────────────────────────────────────

  const hookResult = upgradeHook(projectRoot);
  if (hookResult === 'updated')   log('  ✓ Pre-commit hook updated');
  if (hookResult === 'no-hook')   log('  ⚠ No pre-commit hook found — run forge init to install');
  if (hookResult === 'no-marker') log('  ⚠ Pre-commit hook exists but has no LSD FORGE section');

  // ── Stamp new version in config.json ──────────────────────────────────────

  try {
    existingConfig.lsd_version = pkg.version;
    fs.writeFileSync(lsdPath, JSON.stringify(existingConfig, null, 2) + '\n', 'utf8');
    log(`  ✓ .lsd/config.json  lsd_version → ${pkg.version}`);
  } catch (_) {}

  // ── Done ──────────────────────────────────────────────────────────────────

  log('\n  Upgrade complete.\n');
  log('  Review changes:  git diff .lsd/');
  log('  Validate specs:  forge lint specs/ --strict --plain');
  log('  Check health:    forge status && forge validate\n');

  return { ok: true, config };
}

module.exports = { init };
