# Aegis One — install and run

## Extension
1. Chrome → `chrome://extensions` → Developer mode → **Load unpacked** → select the `AegisOne` directory.
2. Click the extension and open **Website audit** to use the added audit tab.
3. The original privacy-monitoring functions and local Gemma flow still use the original extension scripts.

## Website audit companion service
The original uploaded audit tool requires Node.js 20.6+, MongoDB, Redis, and optional third-party API keys. It is **not a fully offline feature**. A single extension exposes both tools, but website audits rely on this separate backend.

```bash
cd audit-service
cp .env.example .env
# Put any required keys in .env; NEVER put them in extension scripts
npm install
docker compose up -d
npm run dev -w server     # terminal 1
npm run dev -w worker     # terminal 2
```

Open the Aegis One dashboard → Website audit → enter `https://example.com`.

For the backend AI summary set `GEMINI_API_KEY` in `.env` and configure a working `GEMINI_MODEL`; `PSI_API_KEY` improves PageSpeed access/quotas. Provider-specific rate limits and supported models vary. You may set `AI_PROVIDERS=gemini`, or configure GROQ_API_KEY for Groq. Missing AI configuration means raw check data may still be reported without an AI summary.

**Privacy:** Audit requests are sent to localhost backend, which then contacts external sites and PageSpeed/Gemini providers if configured; the original local Gemma privacy features remain separate.

## Distribution / attribution
- Original Aegis One code originates from the user-provided Aegis One-main.zip. Its MIT license and notices remain in this distribution.
- The user-provided audit-tool.zip **did not include a license**. Obtain permission or verify ownership before public redistribution. See `AUDIT_SOURCE_LICENSE_NOTICE.md`.
- The combined project is a derivative, not an original greenfield build. Attribute previous authors and identify your contributions in a hackathon submission.
- Third-party data dependencies may have separate noncommercial restrictions; read THIRD_PARTY_LICENSES.md.
