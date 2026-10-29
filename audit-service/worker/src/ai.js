const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const REQUEST_TIMEOUT = Number(process.env.AI_REQUEST_TIMEOUT_MS || 60000);

const SYSTEM = `
You are an expert website auditor specializing in
performance, SEO, accessibility, and security.

Analyze the provided website audit data and create
an actionable report for a non-technical website owner.

Important rules:
- Use only facts present in the audit data.
- Never invent scores, metrics, or vulnerabilities.
- Missing checks must be reported as unavailable.
- Prioritize issues based on measured evidence.
- Return ONLY valid JSON.

Return this structure:

{
  "grade": "B",
  "headline": "Brief overall assessment",
  "summary": "A concise explanation of findings",
  "topIssues": [
    {
      "title": "Issue title",
      "area": "performance",
      "impact": "Why this issue matters",
      "fix": "Specific recommended action",
      "effort": "low",
      "priority": 1
    }
  ],
  "quickWins": ["Easy improvement"],
  "whatsGoingWell": ["Positive finding"]
}

Allowed grades: A, B, C, D, F.
Allowed areas: performance, seo, accessibility,
security, best-practices.
Allowed efforts: low, medium, high.

Return a maximum of five top issues.
`;

// Limit payload size to improve API reliability.
function compactChecks(checks = {}) {
  const psi = checks.psi || {};
  const seo = checks.seo || {};

  const compact = {
    psi: psi.error
      ? { error: psi.error }
      : {
          scores: psi.scores,
          metrics: psi.metrics,
          failedAudits: (psi.failedAudits || []).slice(0, 8).map((issue) => ({
            title: issue.title,
            category: issue.category,
            score: issue.score,
            detail: issue.detail,
          })),
        },

    seo: seo.error
      ? { error: seo.error }
      : {
          title: seo.title,
          description: seo.description,
          imageCount: seo.imageCount,
          imagesMissingAlt: seo.imagesMissingAlt,
          issues: (seo.issues || []).slice(0, 10),
        },

    headers: checks.headers,
    ssl: checks.ssl,
  };

  // Guard against unusually large nested data.
  const json = JSON.stringify(compact);

  if (json.length > 16000) {
    return {
      psi: compact.psi?.scores ? { scores: compact.psi.scores } : compact.psi,
      seo: compact.seo?.error
        ? compact.seo
        : {
            title: compact.seo?.title,
            issues: compact.seo?.issues?.slice(0, 5),
          },
      headers: compact.headers?.error
        ? compact.headers
        : {
            summary: JSON.stringify(compact.headers).slice(0, 1800),
          },
      ssl: compact.ssl?.error
        ? compact.ssl
        : {
            summary: JSON.stringify(compact.ssl).slice(0, 1200),
          },
    };
  }

  return compact;
}

function parseAIResponse(text) {
  if (!text || typeof text !== "string") {
    throw new Error("AI returned an empty response");
  }

  let cleaned = text.trim();

  // Remove Markdown code fences.
  cleaned = cleaned
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();

  let result;

  try {
    result = JSON.parse(cleaned);
  } catch {
    // Handle explanatory text surrounding a JSON object.
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");

    if (start === -1 || end <= start) {
      throw new Error(
        "AI response contains no JSON object. Preview: " +
          cleaned.slice(0, 160),
      );
    }

    const extracted = cleaned.slice(start, end + 1);

    try {
      result = JSON.parse(extracted);
    } catch {
      throw new Error(
        "AI returned malformed JSON. Preview: " + cleaned.slice(0, 160),
      );
    }
  }

  if (
    !result ||
    typeof result !== "object" ||
    Array.isArray(result) ||
    !["A", "B", "C", "D", "F"].includes(result.grade) ||
    typeof result.headline !== "string" ||
    typeof result.summary !== "string" ||
    !Array.isArray(result.topIssues) ||
    !Array.isArray(result.quickWins) ||
    !Array.isArray(result.whatsGoingWell)
  ) {
    throw new Error("AI returned JSON with an invalid report structure");
  }

  return result;
}

function createAPIError(provider, response, body) {
  const error = new Error(`${provider} API ${response.status}: ${body}`);

  error.status = response.status;

  return error;
}

// ---------------- GEMINI / GEMMA 4 ----------------

async function callGemini(url, checks) {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is missing");
  }

  const model = process.env.GEMINI_MODEL || "gemma-4-26b-a4b-it";

  const endpoint =
    "https://generativelanguage.googleapis.com/v1beta/models/" +
    encodeURIComponent(model) +
    ":generateContent";

  const auditData = JSON.stringify({
    url,
    checks: compactChecks(checks),
  });

  let previousError = null;

  for (let attempt = 1; attempt <= 2; attempt++) {
    const prompt =
      SYSTEM +
      "\n\nIMPORTANT: Output ONLY a valid JSON object." +
      "\nDo not include an introduction, explanations outside JSON, or Markdown." +
      "\nStart your response with { and finish with }." +
      "\nDo not copy the instructions into the response." +
      (previousError
        ? "\nYour previous response was invalid: " +
          previousError +
          "\nGenerate a corrected JSON report."
        : "") +
      "\n\nWEBSITE AUDIT DATA:\n" +
      auditData;

    console.log(`[AI] Gemma request ${attempt}/2 using ${model}`);

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [{ text: prompt }],
          },
        ],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 4096,
        },
      }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT),
    });

    if (!response.ok) {
      const body = (await response.text()).slice(0, 500);

      const error = new Error(`Gemini API ${response.status}: ${body}`);
      error.status = response.status;

      throw error;
    }

    const data = await response.json();

    const candidate = data.candidates?.[0];

    const text =
      candidate?.content?.parts?.map((part) => part.text || "").join("") || "";

    if (!text) {
      throw new Error(
        "Gemma returned no text. Finish reason: " +
          (candidate?.finishReason || "unknown"),
      );
    }

    try {
      const result = parseAIResponse(text);

      console.log("[AI] Valid JSON summary generated");

      return result;
    } catch (error) {
      previousError = error.message;

      console.warn(
        `[AI] Invalid JSON response on attempt ${attempt}:`,
        error.message,
      );
    }
  }

  throw new Error(
    "Gemma failed to generate valid JSON after 2 attempts: " + previousError,
  );
}

// ---------------- GROQ FALLBACK ----------------

async function callGroq(url, checks) {
  const apiKey = process.env.GROQ_API_KEY;

  if (!apiKey) {
    throw new Error("GROQ_API_KEY is missing");
  }

  const model = process.env.GROQ_MODEL || "llama-3.1-8b-instant";

  const response = await fetch(
    "https://api.groq.com/openai/v1/chat/completions",
    {
      method: "POST",

      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },

      body: JSON.stringify({
        model,
        temperature: 0.2,
        max_tokens: 2048,
        response_format: {
          type: "json_object",
        },

        messages: [
          {
            role: "system",
            content: SYSTEM,
          },
          {
            role: "user",
            content: JSON.stringify({
              url,
              checks: compactChecks(checks),
            }),
          },
        ],
      }),

      signal: AbortSignal.timeout(REQUEST_TIMEOUT),
    },
  );

  if (!response.ok) {
    const body = (await response.text()).slice(0, 500);

    throw createAPIError("Groq", response, body);
  }

  const data = await response.json();

  const text = data.choices?.[0]?.message?.content;

  return parseAIResponse(text);
}

// ---------------- RETRY LOGIC ----------------

const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);

async function callWithRetry(fn, url, checks, maxRetries = 2) {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn(url, checks);
    } catch (error) {
      const networkFailure =
        error.name === "TimeoutError" ||
        error.name === "AbortError" ||
        error.name === "TypeError" ||
        error.cause?.code === "UND_ERR_CONNECT_TIMEOUT";

      const retryable = RETRYABLE_STATUS.has(error.status) || networkFailure;

      if (!retryable || attempt === maxRetries) {
        throw error;
      }

      const delay = 1500 * 2 ** attempt + Math.floor(Math.random() * 500);

      console.warn(`[AI] Attempt ${attempt + 1} failed: ` + error.message);

      console.log(`[AI] Retrying after ${delay}ms`);

      await sleep(delay);
    }
  }
}

// ---------------- MAIN EXPORT ----------------

export async function summarize(url, checks) {
  const providers = (process.env.AI_PROVIDERS || "gemini")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  const functions = {
    gemini: callGemini,
    groq: callGroq,
  };

  const errors = [];

  for (const provider of providers) {
    const fn = functions[provider];

    if (!fn) {
      errors.push(`Unknown provider: ${provider}`);
      continue;
    }

    try {
      console.log(`[AI] Using provider: ${provider}`);

      const result = await callWithRetry(fn, url, checks);

      console.log(`[AI] ${provider} summary successful`);

      return result;
    } catch (error) {
      console.error(`[AI] ${provider} failed:`, error.message);

      errors.push(`${provider}: ${error.message}`);
    }
  }

  throw new Error("All AI providers failed — " + errors.join(" | "));
}
