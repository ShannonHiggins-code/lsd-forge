'use strict';

const { AMBIGUOUS_PHRASES } = require('../linter/rules/ambiguous-language');

// ── Domain hints ──────────────────────────────────────────────────────────────

const DOMAIN_HINTS = [
  { words: ['password', 'reset', 'forgot'],                                 domain: 'auth/password-reset' },
  { words: ['register', 'signup', 'sign up', 'onboard', 'registration'],   domain: 'auth/registration' },
  { words: ['auth', 'login', 'logout', 'session', 'oauth', 'sso', 'clerk'],domain: 'auth/session' },
  { words: ['checkout', 'cart', 'purchase', 'order'],                       domain: 'payments/checkout' },
  { words: ['payment', 'stripe', 'billing', 'subscription', 'invoice'],    domain: 'payments/billing' },
  { words: ['webhook'],                                                      domain: 'webhooks/inbound' },
  { words: ['email', 'notify', 'notification', 'resend', 'sendgrid'],       domain: 'notifications/email' },
  { words: ['pdf', 'document', 'generate', 'export', 'letter'],             domain: 'documents/generation' },
  { words: ['upload', 'file', 'storage', 'blob', 's3', 'r2', 'vault'],      domain: 'storage/upload' },
  { words: ['dashboard', 'admin', 'panel'],                                  domain: 'admin/dashboard' },
  { words: ['profile', 'account', 'settings', 'preferences'],               domain: 'user/profile' },
  { words: ['search', 'filter', 'query', 'find'],                           domain: 'search/query' },
  { words: ['map', 'location', 'spatial', 'geo', 'trail', 'claim'],         domain: 'maps/spatial' },
  { words: ['api', 'endpoint', 'route', 'rest', 'graphql'],                 domain: 'api/endpoints' },
  { words: ['landing', 'page', 'marketing', 'hero', 'website'],             domain: 'marketing/page' },
  { words: ['wizard', 'form', 'multi-step', 'multistep', 'stepper'],        domain: 'ui/wizard' },
];

const STORE_HINTS = [
  { words: ['postgres', 'database', 'db', 'drizzle', 'neon', 'supabase', 'prisma'], store: 'Postgres (read-write)' },
  { words: ['redis', 'cache', 'session store'],                                       store: 'Redis (read-write)' },
  { words: ['stripe'],                                                                  store: 'Stripe API (write)' },
  { words: ['resend', 'sendgrid', 'email', 'notify', 'notification'],                 store: 'Email service (write-only)' },
  { words: ['s3', 'r2', 'blob', 'vault', 'upload', 'storage'],                        store: 'Object storage (write)' },
  { words: ['clerk', 'auth0', 'cognito', 'supabase auth'],                             store: 'Auth provider API (read-write)' },
  { words: ['pdf', 'pdfmake', 'puppeteer'],                                             store: 'PDF generator (write)' },
];

// ── Happy path templates ──────────────────────────────────────────────────────

const HAPPY_PATH_TEMPLATES = {
  'auth/password-reset': [
    'The customer navigates to the forgot-password page and submits their email address.',
    'The system checks the email address exists, creates a time-limited reset link (valid for 15 minutes), and saves it.',
    'The system sends a password reset email containing the link via the email service.',
    'The customer clicks the link and is taken to the reset form.',
    'The customer submits a new password; the system checks the link is still valid, updates the password, and marks the link as used.',
  ],
  'auth/registration': [
    'The customer navigates to the registration page and submits their name, email address, and password.',
    'The system checks that the email address is not already in use and the password meets the minimum requirements.',
    'The system saves the new account and sends a verification email.',
    'The customer clicks the verification link; the system marks the account as verified.',
    'The system takes the customer to the onboarding flow.',
  ],
  'auth/session': [
    'The customer navigates to the sign-in page and submits their credentials.',
    'The system checks the credentials are correct.',
    'The system marks the customer as signed in and keeps them signed in across page visits.',
    'The system takes the customer to their intended destination.',
  ],
  'payments/checkout': [
    'The customer reviews their order and proceeds to checkout.',
    'The system shows the customer the payment form.',
    'The customer enters their card details and submits the form.',
    'The system processes the payment through the payment provider.',
    'On success, the system saves the order and takes the customer to the confirmation page.',
  ],
  'payments/billing': [
    'The customer navigates to the billing page and selects a subscription plan.',
    'The system redirects the customer to the payment provider to complete payment.',
    'The customer completes payment; the payment provider confirms and notifies the system.',
    'The system activates the subscription and updates the customer record.',
    'The system sends a confirmation email with the invoice.',
  ],
  'webhooks/inbound': [
    'An external service sends an event notification to the webhook address.',
    'The system confirms the notification genuinely came from the expected service by verifying the shared secret.',
    'The system reads the incoming event and determines what type it is.',
    'The system routes the event to the correct processing step.',
    'The system completes processing and confirms receipt to the sending service.',
  ],
  'notifications/email': [
    'A triggering event occurs (customer action or internal system event).',
    'The system builds the email content from the event information.',
    'The system sends the email through the email service to the intended recipient.',
    'The email service queues and delivers the message.',
    'The system records that the email was sent.',
  ],
  'documents/generation': [
    'The customer submits the form with all required information.',
    'The system checks that all required fields are present and correctly formatted.',
    'The system generates the document using the correct template.',
    'The system saves the finished document.',
    'The system gives the customer a secure download link for the document.',
  ],
  'marketing/page': [
    'The visitor navigates to the page.',
    'The system serves the pre-built page.',
    'The visitor reads the main content and value proposition.',
    'The visitor interacts with a call to action (copy a command, sign up, learn more).',
    'The system records the interaction for analytics.',
  ],
  'user/profile': [
    'The customer navigates to their profile settings and views their current information.',
    'The customer edits one or more fields and submits the form.',
    'The system checks the updated fields are correctly formatted.',
    'The system saves the updated information.',
    'The system shows the customer their updated profile with a confirmation message.',
  ],
};

// ── Regression fence templates ────────────────────────────────────────────────

const FENCE_TEMPLATES = {
  auth:        ['Customers who are already signed in must remain signed in after this change.',
                'Signing out must continue to work correctly.'],
  payments:    ['Existing subscription records must not be affected by this change.',
                'Payment confirmations from the payment provider must continue to be processed correctly.'],
  webhooks:    ['All existing event types must continue to be processed correctly by their current handlers.'],
  documents:   ['Previously generated documents must remain accessible to customers via their download links.'],
  default:     ['All existing pages and features must continue to work correctly.',
                'No existing saved data must be changed or deleted by this change.'],
};

// ── Step transformers — derive edges from happy path ─────────────────────────
// Each transformer maps a pattern in a step to the failure case for that step.
// `id` deduplicates — only one edge per failure type regardless of how many
// steps trigger the same transformer.

const STEP_TRANSFORMERS = [
  {
    id: 'user-input',
    test: /\buser\b.+\b(submits?|enters?|provides?|uploads?|fills?|types?)\b/i,
    derive: (step) => {
      const m = step.match(/\b(?:submits?|enters?|provides?|uploads?)\s+(?:a |an |their |the )?(.+?)(?=\s+(?:via|to|and|;|,|\.)|[;,.]|$)/i);
      const what = m ? m[1].replace(/\.$/, '').trim() : 'submitted information';
      return `${cap(what)} is missing, invalid, or incorrectly formatted — the system highlights each problem field and tells the customer what to correct; nothing is saved or sent.`;
    },
  },
  {
    id: 'token-session',
    test: /\b(token|session|otp|one.time|magic.link)\b/i,
    derive: () => 'The link or code is expired or has already been used — the system tells the customer it is no longer valid and directs them to start the process again.',
  },
  {
    id: 'email-send',
    test: /\b(sends?|delivers?|dispatches?)\b.+\b(email|notification|message)\b/i,
    derive: () => 'The email or notification service is unavailable — the system signals failure explicitly and does not mark the action as complete; the customer is not told it succeeded.',
  },
  {
    id: 'payment',
    test: /\b(stripe|paymentintent|checkout|charge|payment)\b/i,
    derive: () => 'The payment provider declines the payment — the customer sees a clear error message; no order or subscription is created.',
  },
  {
    id: 'external-api',
    test: /\b(calls?|requests?|invokes?|queries?)\b.+\b(api|service|endpoint|provider)\b/i,
    derive: () => 'The external service is unavailable or returns an error — the system signals failure without completing any part of the action; nothing is saved or sent.',
  },
  {
    id: 'db-write',
    test: /\b(stores?|writes?|creates?|saves?|persists?|records?|inserts?|updates?)\b/i,
    derive: () => 'The save fails or times out — the system signals failure and leaves nothing partially saved; the customer is asked to try again.',
  },
  {
    id: 'storage-write',
    test: /\b(uploads?|stores?\s+in|writes?\s+to)\b.+\b(storage|s3|r2|blob|object)\b/i,
    derive: () => 'Saving the file fails or storage is full — the system signals failure and does not return a broken link; the customer is informed the file was not saved.',
  },
  {
    id: 'redirect',
    test: /\bredirects?\b/i,
    derive: () => 'The destination requires access the customer does not have — the system redirects to a safe fallback page and does not reveal the intended destination.',
  },
  {
    id: 'validation',
    test: /\bvalidates?\b/i,
    derive: (step) => {
      const m = step.match(/validates?\s+(?:the\s+|a\s+)?(.+?)(?=\s+(?:and|against|;|,)|[;,.]|$)/i);
      const what = m ? m[1].replace(/\.$/, '').trim() : 'the information provided';
      return `${cap(what)} is not valid — the system tells the customer the specific reason and does not continue to the next step.`;
    },
  },
];

const EDGE_FALLBACKS = [
  'A duplicate request is received while the first is still being processed — the system handles it once and does not create duplicate records.',
  'A request arrives without valid authentication — the system turns it away without processing any part of the request.',
  'A downstream service takes too long to respond — the system signals a timeout to the caller and records the failure internally.',
];

function cap(s) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

// ── Derive edge steps from the confirmed happy path ───────────────────────────

function deriveEdgesFromHappyPath(steps) {
  const used  = new Set();
  const edges = [];

  for (const step of steps) {
    for (const t of STEP_TRANSFORMERS) {
      if (!used.has(t.id) && t.test.test(step)) {
        edges.push(t.derive(step));
        used.add(t.id);
        break;
      }
    }
  }

  const minimum = Math.ceil(steps.length / 2);
  let fi = 0;
  while (edges.length < Math.max(minimum, 1) && fi < EDGE_FALLBACKS.length) {
    if (!edges.includes(EDGE_FALLBACKS[fi])) edges.push(EDGE_FALLBACKS[fi]);
    fi++;
  }

  return edges;
}

// ── Adversarial coherence check ───────────────────────────────────────────────
// Runs after all sections are filled in, before the file is written.
// Returns findings: { severity, message, suggestion, apply }
// `apply(answers)` mutates the answers object to auto-fix; null if not auto-fixable.

const COVERAGE_CHECKS = [
  {
    keyword: /\bemail\b/i,
    edgeWord: 'email',
    label:    'email delivery failure',
    suggest:  'The email or notification service is unavailable — the system signals failure explicitly and does not mark the action as complete.',
  },
  {
    keyword: /\bstripe\b|\bpayment\b/i,
    edgeWord: 'payment',
    label:    'payment failure',
    suggest:  'The payment provider declines the payment — the customer sees a clear error message; no order or subscription is created.',
  },
  {
    keyword: /\bdatabase\b|\bdb\b|\bpostgres\b|\bdrizzle\b/i,
    edgeWord: 'database',
    label:    'database write failure',
    suggest:  'The save fails — the system signals failure and leaves nothing partially saved; the customer is asked to try again.',
  },
  {
    keyword: /\bstorage\b|\bs3\b|\br2\b|\bblob\b/i,
    edgeWord: 'storage',
    label:    'storage write failure',
    suggest:  'Saving the file fails — the system signals failure and does not return a broken link; the customer is informed the file was not saved.',
  },
  {
    keyword: /\btoken\b|\bsession\b/i,
    edgeWord: 'expir',
    label:    'token or session expiry',
    suggest:  'The link or code is expired or already used — the system tells the customer it is no longer valid and directs them to start the process again.',
  },
];

const PATH_PATTERN = /(?:^|\s)((?:src|app|lib|packages?|apps?)\/[\w\-\/\.]+)/gm;

function runAdversarialCheck(answers) {
  const findings = [];
  const allSteps = answers.happy_path_steps.concat(answers.edge_steps);
  const allText  = allSteps.join(' ').toLowerCase();

  // 1. Ambiguous language final sweep across all step text
  for (const phrase of AMBIGUOUS_PHRASES) {
    const inHappy = answers.happy_path_steps.some(s => s.toLowerCase().includes(phrase));
    const inEdge  = answers.edge_steps.some(s => s.toLowerCase().includes(phrase));
    if (inHappy || inEdge) {
      const section = inHappy ? 'INTENT_HAPPY_PATH' : 'EDGE_CRITICAL_UNHAPPY_PATH';
      findings.push({
        severity: 'critical',
        message:  `Ambiguous phrase "${phrase}" in ${section} will fail lint`,
        suggestion: `Replace with a specific, observable outcome — e.g. "the system signals failure and tells the customer to try again".`,
        apply: null,
      });
    }
  }

  // 2. File path coherence — paths mentioned in steps but not in authorized_files
  const mentionedPaths = new Set();
  for (const step of answers.happy_path_steps) {
    let m;
    const re = new RegExp(PATH_PATTERN.source, 'gm');
    while ((m = re.exec(step)) !== null) mentionedPaths.add(m[1].trim());
  }
  for (const p of mentionedPaths) {
    const covered = answers.authorized_files.some(f => f.includes(p) || p.includes(f.replace(/\/$/, '')));
    if (!covered) {
      findings.push({
        severity: 'warning',
        message:  `Path "${p}" appears in happy path but is not in authorized_files`,
        suggestion: `Add "${p}" to authorized files, or remove the reference from the step.`,
        apply: (ans) => { if (!ans.authorized_files.includes(p)) ans.authorized_files.push(p); },
      });
    }
  }

  // 3. Forbidden file references in step text
  for (const forbidden of answers.forbidden_files) {
    if (allText.includes(forbidden.toLowerCase())) {
      findings.push({
        severity: 'critical',
        message:  `Forbidden file "${forbidden}" is referenced in a step — agents must never touch this file`,
        suggestion: `Remove the reference to "${forbidden}" from the step text.`,
        apply: null,
      });
    }
  }

  // 4. Uncovered failure modes — happy path mentions X, no edge covers the failure of X
  const edgeText = answers.edge_steps.join(' ').toLowerCase();
  for (const check of COVERAGE_CHECKS) {
    const happyMention = answers.happy_path_steps.some(s => check.keyword.test(s));
    const edgeCovered  = edgeText.includes(check.edgeWord);
    if (happyMention && !edgeCovered) {
      const suggestion = check.suggest;
      findings.push({
        severity: 'warning',
        message:  `Happy path mentions ${check.label} but no edge case covers what happens when it fails`,
        suggestion,
        apply: (ans) => { ans.edge_steps.push(suggestion); },
      });
    }
  }

  // 5. Security domain with empty context_debt
  const isSensitive = answers.domain.startsWith('auth') || answers.domain.startsWith('payments');
  if (isSensitive && !answers.context_debt.trim()) {
    findings.push({
      severity: 'warning',
      message:  `Domain "${answers.domain}" is security-sensitive but CONTEXT_DEBT_NOTE is empty`,
      suggestion: `Document the rationale for key security decisions (token expiry duration, retry limits, enumeration prevention).`,
      apply: null,
    });
  }

  return findings;
}

// ── File suggestions ──────────────────────────────────────────────────────────

function suggestAuthorizedFiles(domain, config) {
  const suggestions = [];
  const base = resolveBase(config);

  if (domain) {
    const top = domain.split('/')[0];
    const sub = domain.split('/')[1] || '';
    suggestions.push(`${base}/${top}/${sub}/`.replace(/\/+/g, '/'));
    suggestions.push(`${base}/lib/${top}/${sub}.ts`.replace(/\/+/g, '/').replace(/\/$/, ''));
  }
  return [...new Set(suggestions)];
}

function suggestForbiddenFiles(config) {
  const base = ['.env', '.env.local', '.env.production'];
  if (config && config.forbidden) {
    for (const f of config.forbidden) {
      if (!base.includes(f)) base.push(f);
    }
  }
  return base;
}

function resolveBase(config) {
  if (config && config.authorized && config.authorized.length > 0) {
    return config.authorized[0].replace(/\/?\*.*$/, '').replace(/\/$/, '');
  }
  return 'src';
}

// ── Core interpret ────────────────────────────────────────────────────────────

function interpret(description, config) {
  const lower = description.toLowerCase();

  let domain = '';
  for (const hint of DOMAIN_HINTS) {
    if (hint.words.some(w => lower.includes(w))) { domain = hint.domain; break; }
  }

  const runtime = config && config.stack && config.stack.framework !== 'unknown'
    ? `${config.stack.language || 'Node.js'} / ${config.stack.framework}`
    : 'Node.js';

  const storeMatches = STORE_HINTS.filter(h => h.words.some(w => lower.includes(w)));
  const data_stores  = storeMatches.map(h => h.store).join(', ') || 'none';

  const templateKey      = Object.keys(HAPPY_PATH_TEMPLATES).find(k => domain.startsWith(k)) || null;
  const happy_path_steps = templateKey ? HAPPY_PATH_TEMPLATES[templateKey] : generateGenericSteps(description);

  // Initial edge suggestions derived from the template happy path
  const edge_steps = deriveEdgesFromHappyPath(happy_path_steps);

  const fenceKey         = Object.keys(FENCE_TEMPLATES).find(k => domain.startsWith(k)) || 'default';
  const regression_fence = FENCE_TEMPLATES[fenceKey] || FENCE_TEMPLATES.default;

  const authorized_files = suggestAuthorizedFiles(domain, config);
  const forbidden_files  = suggestForbiddenFiles(config);
  const owner            = (config && config.owner) || '';

  return {
    domain, owner, runtime, data_stores,
    authorized_files, forbidden_files,
    happy_path_steps, edge_steps,
    regression_fence, context_debt: '',
  };
}

function generateGenericSteps(description) {
  const verb = description.split(' ').slice(2, 5).join(' ');
  return [
    `The customer initiates the ${verb} flow.`,
    'The system checks that all required information is present and correct.',
    'The system completes the operation and saves the result.',
    'The system confirms success and shows the customer what happened.',
  ];
}

module.exports = { interpret, deriveEdgesFromHappyPath, runAdversarialCheck };
