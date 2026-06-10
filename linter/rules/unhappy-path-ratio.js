'use strict';

const { countNumberedSteps } = require('../parser');

/**
 * Hard block: unhappy path entries must be >= ceil(happy steps / 2).
 * Only runs if both sections are present (required-sections catches missing ones).
 */
function check(parsed) {
  const { sections } = parsed;

  const happyText   = sections['INTENT_HAPPY_PATH'] || '';
  const unhappyText = sections['EDGE_CRITICAL_UNHAPPY_PATH'] || '';

  if (!happyText || !unhappyText) return [];

  const happyCount   = countNumberedSteps(happyText);
  const unhappyCount = countNumberedSteps(unhappyText);
  const minimum      = Math.ceil(happyCount / 2);

  if (happyCount === 0) return [];

  if (unhappyCount < minimum) {
    return [{
      rule: 'unhappy-path-ratio',
      severity: 'error',
      section: 'EDGE_CRITICAL_UNHAPPY_PATH',
      message: `Found ${unhappyCount} unhappy path entry/entries but need at least ${minimum} (happy path has ${happyCount} steps — minimum is ceil(${happyCount} ÷ 2) = ${minimum}).`,
      fix: `Add ${minimum - unhappyCount} more failure case(s). For each happy path step ask: what can go wrong here? Format: "If [condition], then [response]. Do not [assumption]."`,
    }];
  }

  return [];
}

module.exports = { check };
