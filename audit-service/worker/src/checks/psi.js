// Lighthouse via Google's PageSpeed Insights API (swap for self-hosted Lighthouse later)
const CATS = ['performance', 'seo', 'accessibility', 'best-practices'];

export async function runPsi(url) {
  const qs = new URLSearchParams({ url, strategy: 'mobile' });
  CATS.forEach((c) => qs.append('category', c));
  if (process.env.PSI_API_KEY) qs.set('key', process.env.PSI_API_KEY);

  const res = await fetch(`https://www.googleapis.com/pagespeedonline/v5/runPagespeed?${qs}`, {
    signal: AbortSignal.timeout(50_000),
  });
  if (!res.ok) throw new Error(`PageSpeed API ${res.status}`);
  const { lighthouseResult: lh } = await res.json();

  const scores = Object.fromEntries(
    Object.entries(lh.categories).map(([k, v]) => [k, Math.round((v.score ?? 0) * 100)])
  );

  const metric = (id) => lh.audits[id]?.displayValue;
  const metrics = {
    fcp: metric('first-contentful-paint'),
    lcp: metric('largest-contentful-paint'),
    tbt: metric('total-blocking-time'),
    cls: metric('cumulative-layout-shift'),
    speedIndex: metric('speed-index'),
  };

  // Failed audits, mapped back to their category, worst first
  const failed = [];
  for (const [catId, cat] of Object.entries(lh.categories)) {
    for (const ref of cat.auditRefs) {
      const a = lh.audits[ref.id];
      if (a.score === null || a.score >= 0.9) continue;
      if (['informative', 'notApplicable', 'manual'].includes(a.scoreDisplayMode)) continue;
      failed.push({
        category: catId,
        id: a.id,
        title: a.title,
        score: a.score,
        detail: a.displayValue || undefined,
        weight: ref.weight,
      });
    }
  }
  failed.sort((x, y) => y.weight - x.weight || x.score - y.score);

  return { scores, metrics, failedAudits: failed.slice(0, 20) };
}
