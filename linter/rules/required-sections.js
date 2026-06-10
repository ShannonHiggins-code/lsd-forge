'use strict';

const { REQUIRED_SECTIONS } = require('../parser');

/**
 * Hard block: every required section must exist and be non-empty.
 */
function check(parsed) {
  const errors = [];
  const { sections } = parsed;

  for (const section of REQUIRED_SECTIONS) {
    if (!sections[section] || sections[section].trim().length === 0) {
      errors.push({
        rule: 'required-sections',
        severity: 'error',
        section,
        message: `Section "${section}" is missing or empty.`,
        fix: `Add a ## ${section} heading with at least one line of content.`,
      });
    }
  }

  return errors;
}

module.exports = { check };
