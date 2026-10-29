import { safeFetch } from '../../../shared/ssrf.js';

const WANTED = {
  'strict-transport-security': 'HSTS forces HTTPS',
  'content-security-policy': 'CSP mitigates XSS',
  'x-content-type-options': 'Prevents MIME sniffing',
  'x-frame-options': 'Clickjacking protection (or CSP frame-ancestors)',
  'referrer-policy': 'Controls referrer leakage',
  'permissions-policy': 'Restricts browser features',
};

export async function runHeaders(url) {
  const res = await safeFetch(url);
  const present = {};
  const missing = [];
  for (const [h, why] of Object.entries(WANTED)) {
    const v = res.headers.get(h);
    if (v) present[h] = v.slice(0, 200);
    else missing.push({ header: h, why });
  }
  return {
    finalUrl: res.finalUrl,
    status: res.status,
    usesHttps: res.finalUrl.startsWith('https://'),
    server: res.headers.get('server') || null,
    present,
    missing,
  };
}
