// AI summary with automatic fallback across free-tier providers.
// Order tried is controlled by AI_PROVIDERS (comma list), default "groq,gemini".
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const SYSTEM = `You are a senior web performance, SEO, accessibility and security consultant.
You receive JSON results from automated website checks. Write a clear audit summary for a non-technical site owner.
Rules:
- Use ONLY the numbers and facts in the input. Never invent scores or metrics.
- If a check is missing or failed, say it could not be measured; do not guess.
- Respond with a single JSON object and nothing else.
Schema:
{
  "grade": "A|B|C|D|F",
  "headline": "one-sentence verdict",
  "summary": "2-3 sentence overview in plain language",
  "topIssues": [
    { "title": "", "area": "performance|seo|accessibility|security|best-practices",
      "impact": "why it matters to visitors or the business",
      "fix": "specific, actionable steps",
      "effort": "low|medium|high", "priority": 1 }
  ],
  "quickWins": ["short, easy fixes"],
  "whatsGoingWell": ["short positives"]
}
Return at most 5 topIssues, ordered by priority (1 = most important).`;

function parseJson(text) {
  return JSON.parse(text.replace(/```json|```/g, '').trim());
}

// ---------- Groq (free, no credit card, OpenAI-compatible) ----------
async function callGroq(url, checks) {
  const key = process.env.GROQ_API_KEY;
  if (!key) throw Object.assign(new Error('GROQ_API_KEY is not set'), { status: 'no_key' });

  const model = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';

  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model,
      temperature: 0.3,
      max_tokens: 4096,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: SYSTEM },
        { role: 'user', content: JSON.stringify({ url, checks }) },
      ],
    }),
    signal: AbortSignal.timeout(25_000),
  });

  if (!res.ok) {
    const body = (await res.text()).slice(0, 300);
    throw Object.assign(new Error(`Groq API ${res.status}: ${body}`), { status: res.status });
  }
  const data = await res.json();
  const text = data.choices?.[0]?.message?.content || '';
  if (!text) throw new Error('Groq returned no content');
  return parseJson(text);
}

// ---------- Gemini (Google AI Studio, free tier) ----------
async function callGemini(url, checks) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw Object.assign(new Error('GEMINI_API_KEY is not set'), { status: 'no_key' });

  const model = process.env.GEMINI_MODEL || 'gemini-3.8-flash';
  const generationConfig = { responseMimeType: 'application/json', temperature: 0.3, maxOutputTokens: 4096 };
  if (model.includes('flash')) generationConfig.thinkingConfig = { thinkingBudget: 0 };

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM }] },
        contents: [{ role: 'user', parts: [{ text: JSON.stringify({ url, checks }) }] }],
        generationConfig,
      }),
      signal: AbortSignal.timeout(25_000),
    }
  );

  if (!res.ok) {
    const body = (await res.text()).slice(0, 300);
    throw Object.assign(new Error(`Gemini API ${res.status}: ${body}`), { status: res.status });
  }
  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('') || '';
  if (!text) throw new Error(`Gemini returned no content (${data.candidates?.[0]?.finishReason || 'unknown'})`);
  return parseJson(text);
}

const PROVIDERS = { groq: callGroq, gemini: callGemini };
const RETRYABLE = new Set([429, 503]); // rate-limited or temporarily overloaded

async function callWithRetry(fn, url, checks, retries = 2) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn(url, checks);
    } catch (err) {
      lastErr = err;
      if (!RETRYABLE.has(err.status) || attempt === retries) throw err;
      await sleep(1000 * 2 ** attempt); // 1s, then 2s
    }
  }
  throw lastErr;
}

export async function summarize(url, checks) {
  const order = (process.env.AI_PROVIDERS || 'groq,gemini')
    .split(',')
    .map((s) => s.trim())
    .filter((name) => PROVIDERS[name]);

  const errors = [];
  for (const name of order) {
    try {
      return await callWithRetry(PROVIDERS[name], url, checks);
    } catch (err) {
      errors.push(`${name}: ${err.message}`);
    }
  }
  throw new Error(`All AI providers failed — ${errors.join(' | ')}`);
}
