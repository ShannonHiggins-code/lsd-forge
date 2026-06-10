'use strict';

const fs   = require('fs');
const path = require('path');

const BLOCK_START = '<!-- lsd-block-start -->';
const BLOCK_END   = '<!-- lsd-block-end -->';

function buildLsdBlock() {
  return `${BLOCK_START}
## LSD — Logic-Spec Development

This project uses LSD for spec-first AI-assisted development.
Before starting any task, read \`.lsd/onboarding.md\` — it contains the discovery protocol,
authorization boundaries, and skill entry points for this project.

Quick start:
1. \`lsd lint specs/\` — check current spec health
2. Read \`.lsd/skills/rsc-ar.md\` — the spec authoring loop
3. Read \`.lsd/config.json\` — what you are authorized to touch
${BLOCK_END}`;
}

/**
 * Prepend the LSD block to a single posture file.
 * No-op if the file already contains the block.
 * @returns {boolean} true if file was modified
 */
function augmentFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  if (content.includes(BLOCK_START)) return false;

  fs.writeFileSync(filePath, buildLsdBlock() + '\n\n' + content, 'utf8');
  return true;
}

/**
 * Augment all detected posture files in the project.
 * Silently skips files that cannot be read or written.
 * @param {string} projectRoot
 * @param {string[]} postureFiles  relative paths
 * @returns {string[]} files that were actually modified
 */
function augmentPostureFiles(projectRoot, postureFiles) {
  const modified = [];
  for (const rel of postureFiles) {
    const full = path.join(projectRoot, rel);
    try {
      if (augmentFile(full)) modified.push(rel);
    } catch (_) {
      // skip unwritable files
    }
  }
  return modified;
}

module.exports = { augmentPostureFiles };
