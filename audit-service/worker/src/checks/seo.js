import * as cheerio from 'cheerio';
import { safeFetch } from '../../../shared/ssrf.js';

async function exists(base, path) {
  try {
    const r = await safeFetch(new URL(path, base).toString(), { timeoutMs: 5000 });
    return r.status === 200;
  } catch {
    return false;
  }
}

export async function runSeo(url) {
  const res = await safeFetch(url);
  const html = (await res.text()).slice(0, 1_000_000);
  const $ = cheerio.load(html);

  const title = $('title').first().text().trim();
  const description = $('meta[name="description"]').attr('content')?.trim() || '';
  const imgs = $('img');
  const noAlt = imgs.filter((_, el) => $(el).attr('alt') === undefined).length;

  const [robots, sitemap] = await Promise.all([
    exists(res.finalUrl, '/robots.txt'),
    exists(res.finalUrl, '/sitemap.xml'),
  ]);

  const issues = [];
  if (!title) issues.push('Missing <title>');
  else if (title.length > 60) issues.push(`Title too long (${title.length} chars)`);
  if (!description) issues.push('Missing meta description');
  else if (description.length > 160) issues.push(`Meta description too long (${description.length} chars)`);
  if ($('h1').length === 0) issues.push('No <h1> found');
  if ($('h1').length > 1) issues.push(`Multiple <h1> tags (${$('h1').length})`);
  if (!$('link[rel="canonical"]').attr('href')) issues.push('Missing canonical link');
  if (!$('meta[name="viewport"]').length) issues.push('Missing viewport meta tag');
  if (!$('html').attr('lang')) issues.push('Missing lang attribute on <html>');
  if (!$('meta[property="og:title"]').length) issues.push('Missing Open Graph tags');
  if (!$('script[type="application/ld+json"]').length) issues.push('No structured data (JSON-LD)');
  if (noAlt > 0) issues.push(`${noAlt} of ${imgs.length} images missing alt attribute`);
  if (!robots) issues.push('robots.txt not found');
  if (!sitemap) issues.push('sitemap.xml not found');
  if ($('meta[name="robots"]').attr('content')?.includes('noindex')) issues.push('Page is set to noindex');

  return {
    title, titleLength: title.length, description, descriptionLength: description.length,
    h1Count: $('h1').length, imageCount: imgs.length, imagesMissingAlt: noAlt,
    hasRobotsTxt: robots, hasSitemap: sitemap, issues,
  };
}
