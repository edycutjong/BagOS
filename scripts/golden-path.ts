#!/usr/bin/env npx tsx
/**
 * Golden Path Demo Script for BagOS
 *
 * Starts a mock FHIR server from ALL synthetic data bundles, then calls the
 * BagOS MCP server through all 3 tools for each scenario end-to-end.
 *
 * Scenarios:
 *   1. Sarah Chen    — Rheumatoid Arthritis → Humira denied (step therapy)
 *   2. James Martinez — Type 2 Diabetes     → Ozempic denied (formulary preference)
 *   3. Emily Johnson  — Multiple Sclerosis  → Ocrevus denied (injectable DMT required)
 *
 * Usage:
 *   npm run demo             # Run against localhost:3050
 *   npm run demo:ngrok       # Run against ngrok URL
 *
 * Prerequisites:
 *   1. BagOS server running: npm run start
 *   2. GEMINI_API_KEY configured in .env
 */

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const AUTHARMOR_URL = process.argv[2] || "http://localhost:3050";
const MOCK_FHIR_PORT = 9876;

// ─── Scenarios ───────────────────────────────────────────────────────────────
type Scenario = {
  name: string;
  bundle: string;
  patientId: string;
  medicationName: string;
  denialReason: string;
};

const SCENARIOS: Scenario[] = [
  {
    name: "🦴 Rheumatoid Arthritis — Humira",
    bundle: "patient-ra-bundle.json",
    patientId: "patient-sarah-chen",
    medicationName: "Humira",
    denialReason: "Step therapy requirement not met",
  },
  {
    name: "💉 Type 2 Diabetes — Ozempic",
    bundle: "patient-t2d-bundle.json",
    patientId: "patient-james-martinez",
    medicationName: "Ozempic",
    denialReason: "Preferred alternative not tried",
  },
  {
    name: "🧠 Multiple Sclerosis — Ocrevus",
    bundle: "patient-ms-bundle.json",
    patientId: "patient-emily-johnson",
    medicationName: "Ocrevus",
    denialReason: "Injectable DMT step therapy required",
  },
];

// ─── Colors ──────────────────────────────────────────────────────────────────
const green = (s: string) => `\x1b[32m${s}\x1b[0m`;
const red = (s: string) => `\x1b[31m${s}\x1b[0m`;
const cyan = (s: string) => `\x1b[36m${s}\x1b[0m`;
const yellow = (s: string) => `\x1b[33m${s}\x1b[0m`;
const bold = (s: string) => `\x1b[1m${s}\x1b[0m`;
const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;
const magenta = (s: string) => `\x1b[35m${s}\x1b[0m`;

// ─── Mock FHIR Server ───────────────────────────────────────────────────────
function loadAllResources(): Array<{ resourceType: string; id: string }> {
  const dataDir = path.join(__dirname, "..", "data");
  const resources: Array<{ resourceType: string; id: string }> = [];

  for (const file of fs.readdirSync(dataDir)) {
    if (!file.endsWith("-bundle.json")) continue;
    const bundle = JSON.parse(fs.readFileSync(path.join(dataDir, file), "utf-8"));
    for (const entry of bundle.entry) {
      resources.push(entry.resource);
    }
  }

  return resources;
}

function startMockFhirServer(): Promise<http.Server> {
  const resources = loadAllResources();
  console.log(dim(`  Loaded ${resources.length} FHIR resources from ${SCENARIOS.length} bundles`));

  const server = http.createServer((req, res) => {
    const url = req.url || "";
    res.setHeader("Content-Type", "application/fhir+json");

    // GET /Patient/{id}
    const patientMatch = url.match(/^\/Patient\/(.+?)(\?|$)/);
    if (patientMatch) {
      const patient = resources.find(
        (r) => r.resourceType === "Patient" && r.id === patientMatch[1],
      );
      if (patient) {
        res.writeHead(200);
        res.end(JSON.stringify(patient));
        return;
      }
      res.writeHead(404);
      res.end(JSON.stringify({ issue: [{ severity: "error", code: "not-found" }] }));
      return;
    }

    // GET /{ResourceType}?patient=Patient/{id}&...
    const searchMatch = url.match(/^\/(\w+)\?(.+)$/);
    if (searchMatch) {
      const resourceType = searchMatch[1];
      const params = new URLSearchParams(searchMatch[2]);
      const patientParam = params.get("patient");

      // Filter by resource type AND patient if specified
      const matching = resources.filter((r) => {
        if (r.resourceType !== resourceType) return false;
        if (patientParam) {
          const rAny = r as Record<string, unknown>;
          const subject = rAny.subject as { reference?: string } | undefined;
          const patient = rAny.patient as { reference?: string } | undefined;
          const ref = subject?.reference || patient?.reference;
          if (ref && ref !== patientParam) return false;
        }
        return true;
      });

      const responseBundle = {
        resourceType: "Bundle",
        type: "searchset",
        total: matching.length,
        entry: matching.map((r) => ({ resource: r })),
      };
      res.writeHead(200);
      res.end(JSON.stringify(responseBundle));
      return;
    }

    res.writeHead(404);
    res.end(JSON.stringify({ issue: [{ severity: "error", code: "not-found" }] }));
  });

  return new Promise((resolve) => {
    server.listen(MOCK_FHIR_PORT, () => {
      console.log(dim(`  Mock FHIR server on http://localhost:${MOCK_FHIR_PORT}`));
      resolve(server);
    });
  });
}

// ─── MCP Call Helper ─────────────────────────────────────────────────────────
let mcpRequestId = 0;

function parseSseResponse(text: string): unknown {
  const lines = text.split("\n");
  for (const line of lines) {
    if (line.startsWith("data: ")) {
      try { return JSON.parse(line.substring(6)); } catch { /* skip */ }
    }
  }
  try { return JSON.parse(text); } catch { return null; }
}

async function mcpInitialize(patientId: string): Promise<void> {
  const response = await fetch(`${AUTHARMOR_URL}/mcp`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Accept": "application/json, text/event-stream",
      "x-fhir-server-url": `http://localhost:${MOCK_FHIR_PORT}`,
      "x-patient-id": patientId,
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      method: "initialize",
      params: {
        protocolVersion: "2025-03-26",
        capabilities: {},
        clientInfo: { name: "golden-path-demo", version: "1.0.0" },
      },
      id: ++mcpRequestId,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Initialize failed: ${response.status} ${body}`);
  }
}

async function mcpCallTool(
  toolName: string,
  args: Record<string, unknown>,
  patientId: string,
): Promise<string> {
  const response = await fetch(`${AUTHARMOR_URL}/mcp`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Accept": "application/json, text/event-stream",
      "x-fhir-server-url": `http://localhost:${MOCK_FHIR_PORT}`,
      "x-patient-id": patientId,
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      method: "tools/call",
      params: { name: toolName, arguments: args },
      id: ++mcpRequestId,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Tool call failed: ${response.status} ${body}`);
  }

  const text = await response.text();
  const json = parseSseResponse(text) as Record<string, unknown> | null;
  if (!json) return text;

  const result = json.result as { content?: Array<{ text?: string }> } | undefined;
  if (result?.content) {
    return result.content.map((c) => c.text || "").join("\n");
  }

  return JSON.stringify(json, null, 2);
}

// ─── Step Runner ─────────────────────────────────────────────────────────────
let globalStep = 0;

async function step(title: string, fn: () => Promise<string>): Promise<string> {
  globalStep++;
  const stepLabel = cyan(`[Step ${globalStep}]`);
  console.log(`\n${stepLabel} ${bold(title)}`);

  const start = Date.now();
  try {
    const result = await fn();
    const elapsed = Date.now() - start;
    console.log(green(`  ✅ Pass`) + dim(` (${elapsed}ms)`));

    const preview = result.length > 300 ? result.substring(0, 300) + "..." : result;
    for (const line of preview.split("\n")) {
      console.log(dim(`  │ ${line}`));
    }

    return result;
  } catch (error) {
    const elapsed = Date.now() - start;
    console.log(red(`  ❌ FAIL`) + dim(` (${elapsed}ms)`));
    console.error(red(`  ${error instanceof Error ? error.message : String(error)}`));
    throw error;
  }
}

// ─── Run Scenario ────────────────────────────────────────────────────────────
async function runScenario(scenario: Scenario): Promise<boolean> {
  console.log(`\n${magenta(`═══ ${scenario.name} ═══`)}`);

  try {
    await step("MCP Initialize", () => {
      return mcpInitialize(scenario.patientId).then(() => "OK");
    });

    await step(`CheckAuthStatus — ${scenario.medicationName}`, () =>
      mcpCallTool("CheckAuthStatus", {
        patientId: scenario.patientId,
        medicationName: scenario.medicationName,
      }, scenario.patientId),
    );

    const appealText = await step(
      `GenerateAppeal — ${scenario.denialReason}`,
      () => mcpCallTool("GenerateAppeal", {
        patientId: scenario.patientId,
        medicationName: scenario.medicationName,
        denialReason: scenario.denialReason,
      }, scenario.patientId),
    );

    await step("GetAppealPdf — Format document", () =>
      mcpCallTool("GetAppealPdf", {
        patientId: scenario.patientId,
        appealText: appealText.substring(0, 2000),
      }, scenario.patientId),
    );

    return true;
  } catch {
    return false;
  }
}

// ─── Main ────────────────────────────────────────────────────────────────────
async function main() {
  console.log(bold("\n🛡️  BagOS — Golden Path Demo\n"));
  console.log(`  Target:    ${cyan(AUTHARMOR_URL)}`);
  console.log(`  Scenarios: ${SCENARIOS.length}`);

  // Health check first
  const fhirServer = await startMockFhirServer();

  let scenariosPassed = 0;
  let scenariosFailed = 0;

  try {
    // Global health check
    await step("Health Check", async () => {
      const res = await fetch(`${AUTHARMOR_URL}/health`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (data.status !== "ok") throw new Error("non-ok");
      return `${data.tools.length} tools registered`;
    });

    // Run each scenario
    for (const scenario of SCENARIOS) {
      const ok = await runScenario(scenario);
      if (ok) scenariosPassed++;
      else scenariosFailed++;
    }

    // Summary
    console.log(`\n${bold("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")}`);
    console.log(`  ${bold("Scenarios")}: ${green(`${scenariosPassed} passed`)}${scenariosFailed ? " " + red(`${scenariosFailed} failed`) : ""}`);
    console.log(`  ${bold("Steps")}:     ${green(`${globalStep} total`)}`);

    if (scenariosFailed === 0) {
      console.log(bold(`\n🎬 All ${scenariosPassed} scenarios verified — safe to record demo!\n`));
    } else {
      console.log(yellow(`\n⚠️  ${scenariosFailed} scenario(s) failed — fix before recording!\n`));
      process.exitCode = 1;
    }
  } catch {
    console.log(red(`\n❌ Fatal error during golden path\n`));
    process.exitCode = 1;
  } finally {
    fhirServer.close();
  }
}

main();
