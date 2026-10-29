import dns from 'node:dns/promises';
import net from 'node:net';

const UA = 'Mozilla/5.0 (compatible; SiteAuditBot/1.0)';

const privateV4 = (ip) => {
  const [a, b] = ip.split('.').map(Number);
  return (
    a === 0 || a === 10 || a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127) ||
    a >= 224
  );
};

const privateV6 = (ip) => {
  const l = ip.toLowerCase();
  if (l === '::1' || l === '::') return true;
  if (l.startsWith('::ffff:')) {
    const v4 = l.slice(7);
    return net.isIPv4(v4) ? privateV4(v4) : true;
  }
  return l.startsWith('fc') || l.startsWith('fd') || l.startsWith('fe80');
};

export const isPrivateIp = (ip) => (net.isIPv4(ip) ? privateV4(ip) : privateV6(ip));

export function normalizeUrl(input) {
  let raw = String(input || '').trim();
  if (!raw) throw new Error('URL is required');
  if (!/^https?:\/\//i.test(raw)) raw = 'https://' + raw;
  const u = new URL(raw); // throws on invalid
  if (!['http:', 'https:'].includes(u.protocol)) throw new Error('Only http/https URLs are allowed');
  if (u.username || u.password) throw new Error('Credentials in URL are not allowed');
  u.hash = '';
  return u;
}

export async function assertPublicUrl(input) {
  const u = normalizeUrl(input);
  const host = u.hostname.replace(/^\[|\]$/g, '');
  if (host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal')) {
    throw new Error('Private or internal addresses are not allowed');
  }
  const addrs = net.isIP(host) ? [{ address: host }] : await dns.lookup(host, { all: true });
  if (addrs.some((a) => isPrivateIp(a.address))) {
    throw new Error('Private or internal addresses are not allowed');
  }
  return u;
}

/** fetch that re-validates every redirect hop (blocks redirect-into-private-IP SSRF) */
export async function safeFetch(url, { timeoutMs = 8000, maxRedirects = 5, method = 'GET' } = {}) {
  let current = url;
  for (let i = 0; i <= maxRedirects; i++) {
    const u = await assertPublicUrl(current);
    const res = await fetch(u, {
      method,
      redirect: 'manual',
      headers: { 'user-agent': UA },
      signal: AbortSignal.timeout(timeoutMs),
    });
    const loc = res.headers.get('location');
    if (res.status >= 300 && res.status < 400 && loc) {
      current = new URL(loc, u).toString();
      continue;
    }
    res.finalUrl = u.toString();
    return res;
  }
  throw new Error('Too many redirects');
}
