'use strict';

const { detectStack, detectTestCommand, detectPostureFiles, detectProjectName } = require('./detect');
const { writeLsdDir, scaffoldSpecs, patchPackageJson, installPreCommitHook } = require('./scaffold');
const { augmentPostureFiles } = require('./augment');
const pkg = require('../package.json');

/**
 * Bootstrap LSD into a project directory.
 * @param {string} projectRoot  absolute path to the project root
 * @returns {{ ok: boolean, config: object, error?: string }}
 */
function init(projectRoot) {
  const log = msg => process.stdout.write(msg + '\n');

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

module.exports = { init };
