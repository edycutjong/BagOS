# 🛡️ BagOS

[![CI](https://github.com/edycutjong/bagos/actions/workflows/ci.yml/badge.svg)](https://github.com/edycutjong/bagos/actions/workflows/ci.yml)
[![Coverage](https://img.shields.io/badge/coverage-100%25-brightgreen)](https://github.com/edycutjong/bagos)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-22%2B-green)](https://nodejs.org)

**Citation-driven prior authorization appeals MCP server for healthcare AI agents.**

BagOS is a [SHARP-on-MCP](https://www.sharponmcp.com/) server that helps clinicians and care coordinators fight denied prior authorizations. It reads patient FHIR records, searches payer policies, and generates appeal letters backed by citations to specific clinical data — no hallucinations, no guesswork.

## 🎯 What It Does

| Tool | Description |
|---|---|
| `CheckAuthStatus` | Reads FHIR MedicationRequest + ClaimResponse to find denial details |
| `GenerateAppeal` | Drafts a citation-driven appeal letter using Gemini AI |
| `GetAppealPdf` | Returns the appeal text for download/export |

## 🏗️ Architecture

```
Prompt Opinion Platform
  ↓ POST /mcp (with SHARP headers)
BagOS MCP Server
  ├── FHIR Client → reads patient data from workspace FHIR server
  ├── Gemini AI → generates appeal with inline FHIR citations
  └── Returns structured appeal text to agent
```

## 🚀 Quick Start

### Prerequisites
- Node.js 22+
- [Gemini API key](https://aistudio.google.com/apikey) (free tier)
- [ngrok](https://ngrok.com/) account (free)

### Setup
```bash
# Install dependencies
npm install

# Configure environment
cp .env.example .env
# Edit .env and add your GEMINI_API_KEY

# Start the server
npm run start
```

The server runs on `http://localhost:3050/mcp`.

### Connect to Prompt Opinion
```bash
# 1. Install ngrok
brew install ngrok

# 2. Add your authtoken (one-time setup — get it from https://dashboard.ngrok.com/get-started/your-authtoken)
ngrok config add-authtoken YOUR_TOKEN_HERE

# 3. Expose your server
ngrok http 3050
```

4. In Prompt Opinion → Workspace Hub → Add MCP Server
5. Paste `{ngrok_url}/mcp` → check "Streamable HTTP" → check "FHIR context"
6. Click Test → verify 3 tools appear → Save

## 💬 Example Prompts

Try these prompts in Prompt Opinion (select a patient first, e.g. Morgan564 Larson43):

**Step 1: Check authorization status**
```
Check the prior auth status for adalimumab
```

**Step 2: Generate appeal letter**
```
Generate an appeal letter for adalimumab — it was denied for "step therapy requirement not met"
```

**Step 3: Format as document**
```
Format this as an appeal document: This letter serves as a formal appeal for the prior authorization denial of adalimumab. The denial reason was step therapy requirement not met. We request reconsideration based on clinical evidence.
```

## ☁️ Deployment

BagOS is deployed on Fly.io:

| Endpoint | URL |
|---|---|
| Health | `https://bagos-mcp.fly.dev/health` |
| MCP | `https://bagos-mcp.fly.dev/mcp` |

## 🔬 SHARP-on-MCP Context

BagOS receives FHIR context via [SHARP](https://www.sharponmcp.com/) HTTP headers:

| Header | Purpose |
|---|---|
| `x-fhir-server-url` | FHIR server base URL |
| `x-fhir-access-token` | Bearer token for FHIR API calls |
| `x-patient-id` | Patient ID (fallback) |

## 📋 Hackathon

Built for [Agents Assemble — The Healthcare AI Endgame](https://agents-assemble.devpost.com/) (Track 1: MCP Superpower).

## 📄 License

MIT

