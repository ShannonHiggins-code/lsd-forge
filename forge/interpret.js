'use strict';

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

// ── Edge case templates ───────────────────────────────────────────────────────

const EDGE_TEMPLATES = {
  'auth/password-reset': [
    'Email does not exist in the system — return a generic success message to prevent user enumeration.',
    'Token has expired — show an expiry message and offer to resend the reset email.',
    'Token has already been used — reject silently and redirect to /forgot-password.',
  ],
  'payments/checkout': [
    'Stripe returns card_declined — display a user-facing error, do not create an order record.',
    'Stripe API times out — display a generic error, do not retry automatically, log the failure.',
    'User submits the form twice in rapid succession — debounce submission, process only the first.',
  ],
  'webhooks/inbound': [
    'Signature validation fails — return 401, log the attempt, do not process the payload.',
    'Event type is unrecognised — return 200 to acknowledge receipt, log and discard silently.',
    'Handler throws during processing — return 500, log the full error, allow Stripe to retry.',
  ],
  'documents/generation': [
    'Required field is missing or malformed — return 422 with field-level error messages.',
    'PDF generator times out — return 503, do not store a partial document.',
    'Object storage write fails — return 500, do not return a broken URL to the user.',
  ],
  default: [
    'Input validation fails — return a descriptive error with field-level details, do not proceed.',
    'External service is unavailable — return a graceful error, do not partially complete the operation.',
    'Duplicate or concurrent request detected — handle idempotently, do not create duplicate records.',
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
  const words  = lower.replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean);

  // Domain
  let domain = '';
  for (const hint of DOMAIN_HINTS) {
    if (hint.words.some(w => lower.includes(w))) { domain = hint.domain; break; }
  }

  // Runtime
  const runtime = config && config.stack && config.stack.framework !== 'unknown'
    ? `${config.stack.language || 'Node.js'} / ${config.stack.framework}`
    : 'Node.js';

  // Data stores
  const storeMatches = STORE_HINTS.filter(h => h.words.some(w => lower.includes(w)));
  const data_stores  = storeMatches.map(h => h.store).join(', ') || 'none';

  // Happy path
  const templateKey  = Object.keys(HAPPY_PATH_TEMPLATES).find(k => domain.startsWith(k)) || 'default';
  const happy_path_steps = HAPPY_PATH_TEMPLATES[templateKey] || generateGenericSteps(description);

  // Edge steps
  const edgeKey  = Object.keys(EDGE_TEMPLATES).find(k => domain.startsWith(k)) || 'default';
  const minimum  = Math.ceil(happy_path_steps.length / 2);
  const edge_steps = (EDGE_TEMPLATES[edgeKey] || EDGE_TEMPLATES.default).slice(0, Math.max(minimum, 3));

  // Regression fence
  const fenceKey = Object.keys(FENCE_TEMPLATES).find(k => domain.startsWith(k)) || 'default';
  const regression_fence = FENCE_TEMPLATES[fenceKey] || FENCE_TEMPLATES.default;

  // Files
  const authorized_files = suggestAuthorizedFiles(domain, config);
  const forbidden_files  = suggestForbiddenFiles(config);

  // Owner from config
  const owner = (config && config.owner) || '';

  return {
    domain,
    owner,
    runtime,
    data_stores,
    authorized_files,
    forbidden_files,
    happy_path_steps,
    edge_steps,
    regression_fence,
    context_debt: '',
  };
}

module.exports = { interpret };
