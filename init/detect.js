'use strict';

const fs   = require('fs');
const path = require('path');

// Known AI posture file locations — checked in priority order
const POSTURE_FILES = [
  'CLAUDE.md',
  'AGENTS.md',
  'GEMINI.md',
  '.cursor/rules',
  '.cursorrules',
  '.github/copilot-instructions.md',
  '.continuerules',
  '.aider.conf.yml',
  '.windsurf/rules',
];

/**
 * Detect the project stack from manifest files.
 * @param {string} projectRoot
 * @returns {{ runtime, language, framework, testRunner, e2e }}
 */
function detectStack(projectRoot) {
  const pkgPath = path.join(projectRoot, 'package.json');

  if (fs.existsSync(pkgPath)) {
    let pkg = {};
    try { pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8')); } catch (_) {}

    const deps = { ...pkg.dependencies, ...pkg.devDependencies };

    const isTs = !!deps['typescript'] || fs.existsSync(path.join(projectRoot, 'tsconfig.json'));
    const language = isTs ? 'typescript' : 'javascript';

    let framework = 'node';
    if (deps['next'])           framework = 'nextjs';
    else if (deps['@nestjs/core']) framework = 'nestjs';
    else if (deps['express'])   framework = 'express';
    else if (deps['fastify'])   framework = 'fastify';
    else if (deps['svelte'])    framework = 'svelte';
    else if (deps['vue'])       framework = 'vue';
    else if (deps['react'])     framework = 'react';

    let testRunner = 'unknown';
    if (deps['vitest'])     testRunner = 'vitest';
    else if (deps['jest'])  testRunner = 'jest';
    else if (deps['mocha']) testRunner = 'mocha';
    else if (deps['tap'])   testRunner = 'tap';
    else if (deps['ava'])   testRunner = 'ava';

    let e2e = null;
    if (deps['@playwright/test'] || deps['playwright']) e2e = 'playwright';
    else if (deps['cypress'])   e2e = 'cypress';
    else if (deps['puppeteer']) e2e = 'puppeteer';

    return { runtime: 'node', language, framework, testRunner, e2e };
  }

  if (
    fs.existsSync(path.join(projectRoot, 'pyproject.toml')) ||
    fs.existsSync(path.join(projectRoot, 'setup.py')) ||
    fs.existsSync(path.join(projectRoot, 'requirements.txt'))
  ) {
    return { runtime: 'python', language: 'python', framework: 'unknown', testRunner: 'pytest', e2e: null };
  }

  if (fs.existsSync(path.join(projectRoot, 'go.mod'))) {
    return { runtime: 'go', language: 'go', framework: 'unknown', testRunner: 'go test', e2e: null };
  }

  if (fs.existsSync(path.join(projectRoot, 'Cargo.toml'))) {
    return { runtime: 'rust', language: 'rust', framework: 'unknown', testRunner: 'cargo test', e2e: null };
  }

  return { runtime: 'unknown', language: 'unknown', framework: 'unknown', testRunner: 'unknown', e2e: null };
}

/**
 * Detect the verification command from package.json scripts or known patterns.
 * @param {string} projectRoot
 * @param {{ runtime }} stack
 * @returns {string}
 */
function detectTestCommand(projectRoot, stack) {
  if (stack.runtime === 'node') {
    const pkgPath = path.join(projectRoot, 'package.json');
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
      if (pkg.scripts && pkg.scripts.test) return pkg.scripts.test;
    } catch (_) {}
    return 'npm test';
  }
  if (stack.runtime === 'python') return 'pytest';
  if (stack.runtime === 'go')     return 'go test ./...';
  if (stack.runtime === 'rust')   return 'cargo test';
  return 'npm test';
}

/**
 * Detect existing AI posture files present in the project root.
 * @param {string} projectRoot
 * @returns {string[]} relative paths
 */
function detectPostureFiles(projectRoot) {
  return POSTURE_FILES.filter(f => fs.existsSync(path.join(projectRoot, f)));
}

/**
 * Detect the project name from package.json or directory name.
 * @param {string} projectRoot
 * @returns {string}
 */
function detectProjectName(projectRoot) {
  const pkgPath = path.join(projectRoot, 'package.json');
  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
      if (pkg.name) return pkg.name;
    } catch (_) {}
  }
  return path.basename(projectRoot);
}

module.exports = { detectStack, detectTestCommand, detectPostureFiles, detectProjectName };
