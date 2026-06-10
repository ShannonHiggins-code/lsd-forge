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
    'User navigates to /forgot-password and submits their email address.',
    'System validates the email, generates a signed one-time reset token, and stores it with a 15-minute expiry.',
    'System sends a password reset email containing the token link via the email service.',
    'User clicks the link and is directed to the reset form with the token pre-filled.',
    'User submits a new password; system validates the token, updates credentials, and invalidates the token.',
  ],
  'auth/registration': [
    'User navigates to /register and submits their name, email, and password.',
    'System validates uniqueness of the email and strength of the password.',
    'System creates the user record and sends a verification email.',
    'User clicks the verification link; system marks the account as verified.',
    'System redirects the user to the onboarding flow.',
  ],
  'auth/session': [
    'User navigates to /login and submits credentials.',
    'System validates credentials against the auth provider.',
    'System creates a session token and sets the auth cookie.',
    'System redirects the user to the protected destination.',
  ],
  'payments/checkout': [
    'User reviews their cart and clicks Proceed to Checkout.',
    'System renders the payment form with Stripe Elements.',
    'User enters card details and submits the form.',
    'System creates a PaymentIntent via the Stripe API.',
    'On success, system records the order and redirects to the confirmation page.',
  ],
  'payments/billing': [
    'User navigates to /billing and selects a subscription plan.',
    'System creates a Stripe Checkout session and redirects the user.',
    'User completes payment; Stripe fires a checkout.session.completed webhook.',
    'System activates the subscription and updates the user record.',
    'System sends a confirmation email with the invoice.',
  ],
  'webhooks/inbound': [
    'External service sends a POST request to the webhook endpoint.',
    'System validates the request signature against the shared secret.',
    'System parses the event payload and identifies the event type.',
    'System dispatches the event to the appropriate handler.',
    'Handler completes processing and returns 200 to acknowledge delivery.',
  ],
  'notifications/email': [
    'Triggering event occurs (user action or system event).',
    'System constructs the email payload from the event data.',
    'System calls the email service API with the recipient and template.',
    'Email service queues and delivers the message.',
    'System records the delivery attempt in the database.',
  ],
  'documents/generation': [
    'User submits the form with the required data fields.',
    'System validates all required fields are present and correctly formatted.',
    'System passes the data to the PDF generator with the correct template.',
    'Generator produces the document and stores it in object storage.',
    'System returns a signed URL for the user to download the document.',
  ],
  'marketing/page': [
    'Visitor navigates to the page URL.',
    'System serves the statically rendered page from the CDN.',
    'Visitor reads the hero and value proposition.',
    'Visitor interacts with a CTA (copy command, sign up, learn more).',
    'System records the interaction for analytics.',
  ],
  'user/profile': [
    'User navigates to /profile/settings and views their current data.',
    'User edits one or more fields and submits the form.',
    'System validates the updated fields.',
    'System writes the changes to the database.',
    'System returns the updated profile and shows a success message.',
  ],
};

// ── Regression fence templates ────────────────────────────────────────────────

const FENCE_TEMPLATES = {
  auth:        ['Existing authenticated sessions must remain valid after this change.',
                'The /api/auth/logout endpoint must continue to clear cookies correctly.'],
  payments:    ['Existing subscription records must not be affected by this change.',
                'The Stripe webhook endpoint must continue to receive and acknowledge events.'],
  webhooks:    ['All existing event handlers must continue to process their event types correctly.'],
  documents:   ['Previously generated documents must remain accessible via their stored URLs.'],
  default:     ['All existing routes must continue to resolve correctly.',
                'No existing database schema must be altered without a migration.'],
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
      const what = m ? m[1].replace(/\.$/, '').trim() : 'submitted data';
      return `${cap(what)} is missing, invalid, or malformed — return field-level validation errors, do not proceed.`;
    },
  },
  {
    id: 'token-session',
    test: /\b(token|session|otp|one.time|magic.link)\b/i,
    derive: () => 'Token or session is expired or has already been used — reject with a specific error message and prompt the user to re-initiate the flow.',
  },
  {
    id: 'email-send',
    test: /\b(sends?|delivers?|dispatches?)\b.+\b(email|notification|message)\b/i,
    derive: () => 'Email or notification service is unavailable — return an explicit error, do not silently drop the message or mark the operation as complete.',
  },
  {
    id: 'payment',
    test: /\b(stripe|paymentintent|checkout|charge|payment)\b/i,
    derive: () => 'Payment provider returns a decline or error code — display a user-facing error message, do not create an order or subscription record.',
  },
  {
    id: 'external-api',
    test: /\b(calls?|requests?|invokes?|queries?)\b.+\b(api|service|endpoint|provider)\b/i,
    derive: () => 'External service is unavailable or returns a non-2xx response — return a graceful error to the caller, do not partially complete the operation.',
  },
  {
    id: 'db-write',
    test: /\b(stores?|writes?|creates?|saves?|persists?|records?|inserts?|updates?)\b/i,
    derive: () => 'Database write fails or times out — return a 500 error, do not leave the system in a partial or inconsistent state.',
  },
  {
    id: 'storage-write',
    test: /\b(uploads?|stores?\s+in|writes?\s+to)\b.+\b(storage|s3|r2|blob|object)\b/i,
    derive: () => 'Storage write fails or quota is exceeded — return a 503, do not return a broken or partial URL to the caller.',
  },
  {
    id: 'redirect',
    test: /\bredirects?\b/i,
    derive: () => 'Redirect target requires authorization the user does not have — fall back to a safe default route, do not expose the original destination.',
  },
  {
    id: 'validation',
    test: /\bvalidates?\b/i,
    derive: (step) => {
      const m = step.match(/validates?\s+(?:the\s+|a\s+)?(.+?)(?=\s+(?:and|against|;|,)|[;,.]|$)/i);
      const what = m ? m[1].replace(/\.$/, '').trim() : 'the input';
      return `${cap(what)} validation fails — return a specific failure reason, do not proceed to the next step.`;
    },
  },
];

const EDGE_FALLBACKS = [
  'Concurrent duplicate request is received — process idempotently, do not create duplicate records.',
  'Request arrives with a missing or malformed auth header — return 401, do not process the payload.',
  'Downstream dependency exceeds response timeout — return 503, log the timeout, surface to monitoring.',
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
    suggest:  'Email or notification service is unavailable — return an explicit error, do not silently drop.',
  },
  {
    keyword: /\bstripe\b|\bpayment\b/i,
    edgeWord: 'payment',
    label:    'payment failure',
    suggest:  'Payment provider returns a decline — display a user-facing error, do not create an order record.',
  },
  {
    keyword: /\bdatabase\b|\bdb\b|\bpostgres\b|\bdrizzle\b/i,
    edgeWord: 'database',
    label:    'database write failure',
    suggest:  'Database write fails — return a 500 error, do not leave the system in a partial state.',
  },
  {
    keyword: /\bstorage\b|\bs3\b|\br2\b|\bblob\b/i,
    edgeWord: 'storage',
    label:    'storage write failure',
    suggest:  'Storage write fails — return a 503, do not return a broken URL to the caller.',
  },
  {
    keyword: /\btoken\b|\bsession\b/i,
    edgeWord: 'expir',
    label:    'token or session expiry',
    suggest:  'Token or session is expired or already used — reject with a clear message, prompt re-initiation.',
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
        suggestion: `Replace with a specific, observable outcome — e.g. "return HTTP 503 and log to telemetry".`,
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
    `User initiates the ${verb} flow.`,
    'System validates the request and checks authorisation.',
    'System processes the operation and persists the result.',
    'System returns a success response to the user.',
  ];
}

module.exports = { interpret, deriveEdgesFromHappyPath, runAdversarialCheck };
