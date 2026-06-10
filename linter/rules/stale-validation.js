'use strict';

const STALE_DAYS = 30;

/**
 * Soft warning: validated_against date is more than STALE_DAYS old.
 * This is advisory — does not block compilation.
 */
function check(parsed) {
  const { meta } = parsed;

  if (!meta.validated_against) {
    return [{
      rule: 'stale-validation',
      severity: 'warning',
      section: 'front-matter',
      message: 'No validated_against date set.',
      fix: 'Add validated_against: YYYY-MM-DD to the front matter. Set it to today after confirming this spec matches the current codebase.',
    }];
  }

  const dateStr = String(meta.validated_against);
  const validated = new Date(dateStr);

  if (isNaN(validated.getTime())) {
    return [{
      rule: 'stale-validation',
      severity: 'warning',
      section: 'front-matter',
      message: `validated_against value "${dateStr}" is not a valid date.`,
      fix: 'Use ISO format: validated_against: YYYY-MM-DD',
    }];
  }

  const now = new Date();
  const diffDays = Math.floor((now - validated) / (1000 * 60 * 60 * 24));

  if (diffDays > STALE_DAYS) {
    return [{
      rule: 'stale-validation',
      severity: 'warning',
      section: 'front-matter',
      message: `Spec was last validated ${diffDays} day(s) ago (${dateStr}). Threshold is ${STALE_DAYS} days.`,
      fix: `Review this spec against the current codebase. If it is still accurate, update validated_against to today's date.`,
    }];
  }

  return [];
}

module.exports = { check, STALE_DAYS };
