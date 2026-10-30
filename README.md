<div align="center">

# Aegis One

### Privacy intelligence meets website auditing.

**One extension. Clearer insight into every website.**

[Features](#features) · [Getting Started](#getting-started) · [Architecture](#architecture) · [Configuration](#configuration) · [Development](#development) · [Credits](#credits-and-licensing)

</div>

---

## Overview

**Aegis One** is a Chrome extension that brings together website privacy insights and technical website auditing in one dashboard. It helps people understand the trackers and cookies they encounter, explore privacy-policy information, and examine how a website performs across key technical checks.

For developers and site owners, Aegis One provides a convenient starting point for investigating performance, SEO, accessibility, and security configuration. For everyday users, it makes privacy signals easier to discover and interpret.

## Features

###  Privacy intelligence

- **Tracker visibility:** Inspect detected third-party tracking activity and the companies associated with it.
- **Site privacy grades:** Review site-level exposure scores and the factors behind them.
- **Cookie insights:** Understand tracking cookies and use supported cookie-consent assistance.
- **Privacy dashboard:** Explore browsing-related privacy signals, trends, and per-site findings.
- **Ask Aegis:** Ask questions about privacy-policy content using an on-device Gemma model, where supported.

###  Website auditing

- **Performance:** Review metrics obtained through Google PageSpeed Insights.
- **SEO:** Inspect common on-page SEO signals and issues.
- **Accessibility:** Review available accessibility audit findings.
- **Security headers:** Inspect HTTP response-header configuration.
- **TLS/SSL:** Examine certificate and connection-related signals.
- **AI-assisted summaries:** Turn audit findings into readable explanations and suggested next steps when an AI provider is configured and available.

The website audit runs through a separate Node.js service; the Chrome extension provides the integrated interface.

## Tech Stack

| Layer | Technologies |
| --- | --- |
| Chrome extension | JavaScript, HTML, CSS, Chrome Manifest V3 and Chrome APIs |
| Local AI | Gemma 4, LiteRT-LM, WebGPU |
| Backend API | Node.js, Express.js |
| Audit processing | Redis, BullMQ, Node.js worker |
| Data storage | MongoDB, Mongoose |
| Hosted AI (optional) | Gemini API; Groq fallback |
| Website checks | Google PageSpeed Insights, SEO, HTTP headers, TLS/SSL |
| Development | Git, GitHub, Node.js test runner |

## Architecture

```text
                    ┌───────────────────────────┐
                    │   Aegis One Extension     │
                    │   Popup + Dashboard       │
                    └─────────────┬─────────────┘
                                  │
                ┌─────────────────┴─────────────────┐
                │                                   │
      ┌─────────▼─────────┐              ┌──────────▼─────────┐
      │ Privacy Workspace │              │ Website Audit UI   │
      │ Trackers, cookies,│              │ Submit URL, view   │
      │ grades, policies  │              │ results            │
      └─────────┬─────────┘              └──────────┬─────────┘
                │                                   │ HTTP
      ┌─────────▼─────────┐              ┌──────────▼─────────┐
      │ Local Gemma Model │              │ Express API        │
      │ LiteRT-LM/WebGPU  │              └──────────┬─────────┘
      └───────────────────┘                         │
                                         ┌──────────▼─────────┐
                                         │ Redis + BullMQ     │
                                         │ Audit job queue    │
                                         └──────────┬─────────┘
                                                    │
                                         ┌──────────▼─────────┐
                                         │ Audit Worker       │
                                         │ PSI / SEO / TLS /  │
                                         │ Security headers   │
                                         └──────────┬─────────┘
                                                    │
                                     ┌──────────────┴──────────────┐
                                     │                             │
                               ┌─────▼─────┐                ┌──────▼──────┐
                               │ MongoDB   │                │ Gemini/Groq │
                               │ Results   │                │ (optional) │
                               └───────────┘                └─────────────┘
```

## Getting Started

### Prerequisites

- Google Chrome with Manifest V3 support
- Node.js **20.6+** and npm
- MongoDB and Redis running locally, or Docker with Compose
- Internet access for website checks and optional AI APIs
- A compatible browser/GPU setup if using local Gemma inference

### 1. Clone the repository

```bash
git clone <YOUR-REPOSITORY-URL>
cd <YOUR-REPOSITORY-DIRECTORY>
```

Replace the placeholders with the URL and directory name of your published repository.

### 2. Install the Chrome extension

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked**.
4. Select the project root containing `manifest.json`.
5. Pin **Aegis One** to your Chrome toolbar and open the dashboard.

Privacy monitoring runs in the extension. To enable the local Gemma assistant, follow [the in-browser AI setup guide](docs/IN-BROWSER-AI.md) and initialize the model in the extension.

### 3. Configure the audit service

From the repository root:

```bash
cd audit-service
npm install
```

Create your environment file:

**Windows PowerShell**

```powershell
Copy-Item .env.example .env
```

**macOS / Linux / Git Bash**

```bash
cp .env.example .env
```

Then edit `audit-service/.env`:

```dotenv
PORT=4000
CLIENT_ORIGIN=http://localhost:5173

MONGO_URL=mongodb://127.0.0.1:27017/audit
REDIS_URL=redis://127.0.0.1:6379

# Optional PageSpeed Insights configuration
PSI_API_KEY=

# AI summaries (optional)
AI_PROVIDERS=gemini
GEMINI_API_KEY=
GEMINI_MODEL=gemma-4-26b-a4b-it

# Optional fallback provider
GROQ_API_KEY=
GROQ_MODEL=llama-3.1-8b-instant

# Optional AI timeout settings, if supported by your worker version
AI_REQUEST_TIMEOUT_MS=60000
AI_TOTAL_TIMEOUT_MS=190000
```

The `CLIENT_ORIGIN` value supports the original local web-client configuration; the Chrome extension uses its own origin. You do **not** need to host a separate frontend to use the integrated dashboard.

**Keep API keys on the backend.** Never commit `.env`, include secrets in the extension, or expose keys in screenshots.

### 4. Start MongoDB and Redis

If you use Docker Compose:

```bash
docker compose up -d
docker compose ps
```

If MongoDB and Redis are already running on your machine, keep using them and ensure the connection URLs in `.env` match your local ports.

### 5. Start the API and worker

In two separate terminals, from the `audit-service` directory:

**Terminal 1 — API**

```bash
node --env-file=.env server/src/index.js
```

**Terminal 2 — Audit worker**

```bash
node --env-file=.env worker/src/index.js
```

Both services must use the same MongoDB and Redis instances. The worker consumes audit jobs using BullMQ.

### 6. Run your first audit

1. Open the Aegis One dashboard.
2. Select **Website audit**.
3. Enter `https://example.com`.
4. Start the audit and inspect its progress and results.

By default, the audit UI targets `http://localhost:4000/api/audits`. To use a deployed API, update the URL in `dashboard/audit.js` and adjust extension host permissions and backend CORS settings accordingly.

## Project Structure

```text
AegisOne/
├── manifest.json                # Chrome extension manifest
├── background.js                # Background service-worker entry
├── background/                  # Tracker and privacy logic
├── content/                     # Website content scripts
├── popup/                       # Toolbar popup
├── dashboard/                   # Dashboard and website audit interface
├── shared/                      # Shared privacy and AI utilities
├── offscreen/                   # Local model inference integration
├── vendor/                      # Bundled dependencies
├── icons/                       # Extension assets
├── audit-service/
│   ├── server/                  # Express API
│   ├── worker/                  # BullMQ worker and audit checks
│   ├── shared/                  # Shared audit data models
│   ├── .env.example             # Environment configuration template
│   └── docker-compose.yml       # Local Redis and MongoDB
├── docs/                        # Additional documentation
├── tests/                       # Extension tests
├── LICENSE
└── README.md
```

## Development

Run the extension's test suite from the repository root:

```bash
node --test
```

After changing extension code, reload Aegis One from `chrome://extensions` and refresh any affected tabs. Restart the backend processes after modifying server or worker code unless you are running them in watch mode.

### Common issues

| Issue | Suggested check |
| --- | --- |
| Extension does not load | Select the directory containing `manifest.json` and review Chrome's error details. |
| Audit cannot connect | Ensure the API is listening on port `4000` and inspect `dashboard/audit.js`. |
| Audits stay queued | Check Redis connectivity and confirm the BullMQ worker is running. |
| MongoDB connection fails | Check `MONGO_URL` and whether MongoDB is running. |
| AI summary fails | Verify model access, API key, worker logs, output formatting, and timeouts. Technical audit results can still be available. |
| Local model does not start | Check WebGPU support, available memory, and `docs/IN-BROWSER-AI.md`. |

## Privacy and Security

Aegis One includes browser-level monitoring features, so it requests permissions to inspect relevant web activity. Review `manifest.json` before installation.

- The privacy assistant can perform local inference when its model is installed and supported.
- Website audits require a running backend and contact the target website and configured third-party services.
- Audit results are informational; they do not constitute security certification, legal findings, or proof of accessibility compliance.
- Only audit websites you own or are authorized to test.
- A public deployment should add authentication, usage limits, restricted origins, secure secret storage, and protection against unsafe URL requests.

## Roadmap

- [ ] Combined per-site privacy and website-health reports
- [ ] Exportable and shareable audit reports
- [ ] Scheduled audits and change detection
- [ ] Improved AI-summary reliability and validation
- [ ] Multi-site monitoring for developers and teams
- [ ] Production-ready authentication and service deployment

## Credits and Licensing

Aegis One integrates and extends existing software. The privacy-extension foundation is based on [PrivaC by gormandyp and contributors](https://github.com/gormandyp/PrivaC). The current project adds its own branding, unified interface, and website-audit integration.

The website-audit component has a separate provenance and licensing status; consult [`AUDIT_SOURCE_LICENSE_NOTICE.md`](AUDIT_SOURCE_LICENSE_NOTICE.md) where included. Redistribution of any component requires the applicable rights or permissions. Preserve the upstream copyright and license notices in [`LICENSE`](LICENSE), and review [`THIRD_PARTY_LICENSES.md`](THIRD_PARTY_LICENSES.md) for additional asset and dataset restrictions.

---

<div align="center">

**Aegis One** — *One extension. Complete website intelligence.*

</div>
