'use strict';

const fs    = require('fs');
const path  = require('path');
const https = require('https');
const pkg   = require('../package.json');

const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

// ── Cache helpers ─────────────────────────────────────────────────────────────

function cacheFilePath(projectRoot) {
  return path.join(projectRoot, '.lsd', 'version-check.json');
}

function readCache(projectRoot) {
  try {
    const p = cacheFilePath(projectRoot);
    if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch (_) {}
  return null;
}

function writeCache(projectRoot, data) {
  try {
    const p = cacheFilePath(projectRoot);
    if (fs.existsSync(path.dirname(p))) {
      fs.writeFileSync(p, JSON.stringify(data, null, 2), 'utf8');
    }
  } catch (_) {}
}

function isCacheStale(projectRoot) {
  const cache = readCache(projectRoot);
  if (!cache || !cache.checked_at) return true;
  return (Date.now() - cache.checked_at) > CACHE_TTL;
}

// Simple semver comparison: true if a > b
function isNewer(a, b) {
  const parse = v => String(v || '0').split('.').map(n => parseInt(n, 10) || 0);
  const [am, ai, ap] = parse(a);
  const [bm, bi, bp] = parse(b);
  if (am !== bm) return am > bm;
  if (ai !== bi) return ai > bi;
  return ap > bp;
}

// ── Network check ─────────────────────────────────────────────────────────────

/**
 * Fetch latest lsd-forge version from npm registry and update the local cache.
 * Resolves with the cache object, or null on any error (offline, timeout, etc.).
 */
function refreshVersionCache(projectRoot) {
  return new Promise((resolve) => {
    const req = https.get(
      'https://registry.npmjs.org/lsd-forge/latest',
      { timeout: 3000 },
      (res) => {
        let data = '';
        res.on('data', d => { data += d; });
        res.on('end', () => {
          try {
            const latest  = JSON.parse(data).version;
            const current = pkg.version;
            const cache   = {
              current,
              latest,
              updateAvailable: isNewer(latest, current),
              checked_at: Date.now(),
            };
            writeCache(projectRoot, cache);
            resolve(cache);
          } catch (_) { resolve(null); }
        });
      }
    );
    req.on('error',   () => resolve(null));
    req.on('timeout', () => { req.destroy(); resolve(null); });
  });
}

// ── Output ────────────────────────────────────────────────────────────────────

/**
 * Return a formatted update notice from cache, or null if up to date or no cache.
 */
function getUpdateNotice(projectRoot, flags) {
  const cache = readCache(projectRoot);
  if (!cache || !cache.updateAvailable) return null;

  const plain = !!(flags && flags.plain);
  const C = plain
    ? { w:'', b:'', x:'', d:'' }
    : { w:'\x1b[33m', b:'\x1b[1m', x:'\x1b[0m', d:'\x1b[2m' };

  return (
    `${C.w}⚠${C.x}  ${C.b}lsd-forge ${cache.latest} available${C.x}  ` +
    `${C.d}(installed: ${cache.current})${C.x}\n` +
    `   Update: npm update lsd-forge  →  npx forge init --upgrade`
  );
}

module.exports = { refreshVersionCache, getUpdateNotice, readCache, isCacheStale };
