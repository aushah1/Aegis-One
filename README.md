# Aegis One

**Privacy intelligence and website auditing in one Chrome extension.**

Aegis One combines browser-side privacy monitoring with a website-health audit workspace. Inspect tracking behavior and cookies, review site privacy information, and launch technical audits covering performance, accessibility, SEO, security headers, and TLS from one extension dashboard.

> **Project status:** Hackathon prototype / local-development build. The privacy features run in the browser, while website audits require a separately running local Node.js service. The merged build has not been verified end-to-end on every Chrome/OS combination. Results are informative, not legal, security-certification, or accessibility-compliance guarantees.

## Features

### Privacy workspace 

- Site-level tracking and cookie intelligence, with privacy grades and a browser dashboard.
- Cookie-consent assistance and privacy-policy reading tools.
- A local Gemma-powered privacy assistant through LiteRT-LM/WebGPU; see the original model setup documentation under `docs/`.
- Browser-side privacy data processing in the original extension components.

### Website audit 

- A **Website audit** tab inside the extension dashboard, and a popup shortcut to reach it.
- URL-based checks for performance, accessibility, SEO, security headers, and TLS, subject to service configuration and external availability.
- Optional AI-written audit explanations using the configured backend provider.
- Audit history/results managed by a Node API and background worker.

**Not a standalone offline auditor:** Starting the audit requires MongoDB, Redis, the Node API, and the worker. Privacy assistant and audit AI are separate paths.

## Architecture

```text
Chrome extension (Manifest V3)
  ├─ Popup + dashboard
  ├─ Background service worker + content scripts
  ├─ Privacy monitor / policy reader / local Gemma
  └─ Website audit tab ── HTTP ──> localhost:4000/api/audits
                                          │
                                   Express API
                                          │
                                 MongoDB + Redis
                                          │
                                      Audit worker
                                          │
                           Website checks / optional AI APIs
```

## Requirements

- **Google Chrome** with support for Manifest V3 extensions.
- **Node.js 20.6+** and npm for the website audit service.
- **Docker Desktop / Docker Engine with Compose**, or independently configured MongoDB and Redis instances.
- Internet access for external website checks and optional API providers.
- For the original in-browser Gemma assistant: compatible WebGPU hardware and the separately downloaded model; see [`docs/IN-BROWSER-AI.md`](docs/IN-BROWSER-AI.md).

## Quick start

### 1. Load the extension

1. Clone or download this repository and extract it.
2. Open `chrome://extensions` in Chrome.
3. Turn on **Developer mode**.
4. Choose **Load unpacked** and select the **repository root** (the folder containing `manifest.json`).
5. Pin **Aegis One** and open its dashboard.

You can inspect privacy-related UI before starting the audit service. Local Gemma features require model setup and initialization documented in `docs/`.

### 2. Configure the audit backend

Open a terminal at the repository root:

```bash
cd audit-service
npm install
```

Create a configuration file from the supplied template:

```bash
# macOS / Linux / Git Bash
cp .env.example .env
```

Windows PowerShell:

```powershell
Copy-Item .env.example .env
```

Edit `audit-service/.env`. The relevant fields are:

```dotenv
PORT=4000
CLIENT_ORIGIN=http://localhost:5173
MONGO_URL=mongodb://localhost:27017/audit
REDIS_URL=redis://localhost:6379

# Optional: Google PageSpeed Insights API key
PSI_API_KEY=

# Optional: AI-generated audit explanations
GEMINI_API_KEY=
GEMINI_MODEL=gemma-4-26b-a4b-it
AI_PROVIDERS=gemini

# Optional alternate AI provider
GROQ_API_KEY=
GROQ_MODEL=llama-3.1-8b-instant
```

**Important:** The model identifier is a configurable default, not a guarantee that your Gemini account has access to it. Verify the model's availability before relying on AI summaries. Without an AI key, supported non-AI checks may still work.

Never commit `.env` or put API secrets in extension HTML, JavaScript, or `manifest.json`: extension source code is inspectable by users.

### 3. Start MongoDB and Redis

From `audit-service/`:

```bash
docker compose up -d
docker compose ps
```

### 4. Start the API and worker

Open **two terminals**, both in `audit-service/`:

Terminal 1:

```bash
npm run dev -w server
```

Terminal 2:

```bash
npm run dev -w worker
```

You **do not** need to run the audit tool's separate `client` workspace; its interface is integrated into the Chrome extension.

### 5. Run a sample audit

1. Open the Aegis One extension dashboard.
2. Select **Website audit**.
3. Enter `https://example.com` and start the audit.
4. Review the results. If a report is missing, check the server and worker terminals for errors.

The extension is currently configured to call **`http://localhost:4000/api/audits`**. If you change the server port or deploy it remotely, adjust `dashboard/audit.js`, extension host permissions and the backend's allowed origins accordingly.

## Repository layout

```text
AegisOne/
├── manifest.json              # Chrome extension metadata and permissions
├── background.js              # Extension service-worker entry point
├── background/                # Tracking, privacy events, policy logic
├── content/                   # Scripts injected into visited websites
├── popup/                     # Toolbar popup
├── dashboard/                 # Extension dashboard, including audit.js
├── shared/                    # Shared data, AI and feature utilities
├── offscreen/                 # Local model inference integration
├── vendor/                    # Bundled third-party runtime components
├── icons/                     # Extension artwork: logo.svg and logo.png only
├── audit-service/
│   ├── server/                # API
│   ├── worker/                # Asynchronous audit execution
│   ├── client/                # Original audit frontend (not required)
│   ├── .env.example           # Configuration template
│   └── docker-compose.yml     # MongoDB and Redis
├── tests/                     # Original extension tests
├── docs/                      # Architecture and original AI setup guides
├── SETUP.md                   # Concise install instructions
├── LICENSE                    # Original Aegis One MIT notice
├── THIRD_PARTY_LICENSES.md    # Additional third-party terms
└── AUDIT_SOURCE_LICENSE_NOTICE.md
```

## Configuration and secrets

| Variable | Needed for | Required? |
|---|---|---|
| `PORT` | Audit API port | Yes; default `4000` |
| `MONGO_URL` | Audit database | Yes for audit service |
| `REDIS_URL` | Audit job queue | Yes for audit service |
| `CLIENT_ORIGIN` | Original audit client's CORS origin | Has a default; extension origins are separately allowed |
| `PSI_API_KEY` | PageSpeed API access / quotas | Optional; some checks may be limited |
| `GEMINI_API_KEY` | AI audit summaries through Gemini | Optional |
| `GEMINI_MODEL` | Gemini model selection | Configure based on account availability |
| `AI_PROVIDERS` | Preferred AI provider order | Optional configuration |
| `GROQ_API_KEY` | Alternate AI summaries through Groq | Optional |
| `GROQ_MODEL` | Groq model selection | Optional |

The **local Chrome Gemma privacy assistant** does **not** use `GEMINI_API_KEY` by default. It has its own model download and setup requirements.

## Testing and verification

From the **repository root**:

```bash
node --test
```

This runs the repository's existing Node tests. A passing suite does not prove the audit backend, browser permissions, external APIs, or downloaded model work end-to-end. Test all of those manually before a demo or release.

Suggested manual smoke test:

1. Verify the extension loads without a Manifest error.
2. Visit a test website and inspect privacy insights.
3. Open the Website audit tab.
4. Confirm the API and worker are running and an example audit completes.
5. Try the audit without an AI key and verify graceful fallback.
6. Inspect Chrome extension errors and backend logs.

## Troubleshooting

| Symptom | What to check |
|---|---|
| Chrome rejects the extension | Select the folder containing `manifest.json`; inspect `chrome://extensions` errors |
| Website audit says connection failed | API running on port 4000; `dashboard/audit.js` address; firewall/CORS settings |
| Mongo connection refused | `docker compose ps`, `MONGO_URL`, port 27017 |
| Redis connection refused | `docker compose ps`, `REDIS_URL`, port 6379 |
| Audit remains queued | Worker running; Redis connected; worker logs |
| AI summary missing | Key, configured model, provider quota and worker output |
| Local Gemma cannot initialize | Chrome/WebGPU support, model download, memory limits; see `docs/IN-BROWSER-AI.md` |

## Security and privacy considerations

- The extension requests broad browser permissions to inspect site activity. Review `manifest.json` before installing.
- The original privacy assistant uses local inference. **Website audit requests are not exclusively local**: the backend contacts target sites and may use configured third-party providers.
- Never audit systems without authorization. Respect provider terms, target-server load, and applicable rules.
- Do not submit private credentials, tokens, or unredacted customer data as audit input.
- This development configuration uses localhost services. Production distribution requires separate deployment, origin restrictions, secure transport, secrets management, and abuse prevention.

## Origins, attribution, and licensing

Aegis One combines **existing open-source code and user-supplied audit source**. It should be represented as a derivative integration, not as a wholly original project.

- **Aegis One**: original privacy-extension foundation, by the original Aegis One contributors; source: [gormandyp/Aegis One](https://github.com/gormandyp/Aegis One). Preserve the original MIT copyright and license notice in [`LICENSE`](LICENSE).
- **Website audit tool**: integrated from the supplied `audit-tool.zip`. **No license grant was included with that archive.** Confirm ownership or obtain redistribution permission before publishing its source or distributing the combined extension. See [`AUDIT_SOURCE_LICENSE_NOTICE.md`](AUDIT_SOURCE_LICENSE_NOTICE.md).
- **Third-party assets and datasets**: review [`THIRD_PARTY_LICENSES.md`](THIRD_PARTY_LICENSES.md) before commercial use or redistribution; some data may have non-commercial restrictions.

For hackathon submissions, explicitly describe the **new integration, redesign, and any original features** you built, and comply with event rules on pre-existing code.

## Roadmap

- [ ] End-to-end audit integration tests
- [ ] Configurable remote audit API with production authentication
- [ ] Better audit progress and error recovery
- [ ] Per-site privacy and website-health report in one view
- [ ] Exportable combined privacy/audit report
- [ ] Verify all third-party redistribution and commercial-use rights

---

**Aegis One:** understand how a website handles your privacy, and inspect how well it is built, from one workspace.
