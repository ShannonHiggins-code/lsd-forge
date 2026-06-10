'use strict';

const AMBIGUOUS_PHRASES = [
  'handle appropriately',
  'handle accordingly',
  'as needed',
  'as appropriate',
  'process the request',
  'deal with',
  'manage the error',
  'validate input',
  'ensure security',
  'handle the error',
  'if necessary',
  'when applicable',
  'in some cases',
  'etc.',
  'and so on',
  'various',
  'somehow',
];

const CHECKED_SECTIONS = [
  'INTENT_HAPPY_PATH',
  'EDGE_CRITICAL_UNHAPPY_PATH',
];

/**
 * Hard block: flag phrases that an AI agent cannot act on deterministically.
 */
function check(parsed) {
  const { sections } = parsed;
  const errors = [];

  for (const sectionName of CHECKED_SECTIONS) {
    const text = (sections[sectionName] || '').toLowerCase();
    if (!text) continue;

    for (const phrase of AMBIGUOUS_PHRASES) {
      if (text.includes(phrase.toLowerCase())) {
        errors.push({
          rule: 'ambiguous-language',
          severity: 'error',
          section: sectionName,
          message: `Ambiguous phrase found: "${phrase}". AI agents cannot act on vague instructions.`,
          fix: `Replace "${phrase}" with a specific, observable outcome. Example: instead of "handle appropriately", write "redirect to /error?code=503 and log a warning to telemetry".`,
        });
      }
    }
  }

  return errors;
}

module.exports = { check, AMBIGUOUS_PHRASES };
