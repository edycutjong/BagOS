#!/usr/bin/env node
// Write the manifest's `tools` array from the server's own tools/list.
//
// A stdio bundle is never executed by a registry — there is nothing for it to
// run — so the only capability metadata a registry can read is what the manifest
// declares. Without it, Smithery indexed BagOS with zero tools and scored its
// capability section 0/40 while the server itself advertised all 14 correctly.
//
// Generated rather than hand-written, and checked in CI with --check, because a
// hand-maintained copy of the tool list is a second source of truth that goes
// stale the first time a tool is renamed.
//
//   node scripts/sync-manifest-tools.mjs          # rewrite manifest.json
//   node scripts/sync-manifest-tools.mjs --check  # exit 1 if it would change
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const manifestPath = join(root, 'manifest.json');
const check = process.argv.includes('--check');

/** Ask the built server what it exposes, in a cwd with no .env to leak in. */
function listTools() {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [join(root, 'build', 'index.js')], {
      // tmpdir, so a .env sitting next to the source cannot change the answer.
      cwd: process.env['TMPDIR'] || '/tmp',
      env: { PATH: process.env['PATH'] || '', HOME: process.env['TMPDIR'] || '/tmp' },
      stdio: ['pipe', 'pipe', 'ignore'],
    });
    let buf = '';
    const timer = setTimeout(() => { child.kill(); reject(new Error('timed out waiting for tools/list')); }, 20000);
    child.stdout.on('data', (d) => {
      buf += d;
      for (const line of buf.split('\n')) {
        if (!line.trim()) continue;
        let msg;
        try { msg = JSON.parse(line); } catch { continue; }
        if (msg.id === 2 && msg.result?.tools) {
          clearTimeout(timer); child.kill(); resolve(msg.result.tools);
        }
      }
    });
    child.on('error', reject);
    for (const m of [
      { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'sync', version: '1' } } },
      { jsonrpc: '2.0', method: 'notifications/initialized' },
      { jsonrpc: '2.0', id: 2, method: 'tools/list' },
    ]) child.stdin.write(JSON.stringify(m) + '\n');
  });
}

const tools = await listTools();
if (!tools.length) {
  console.error('server returned no tools — refusing to write an empty list');
  process.exit(1);
}

// Sorted by name so the diff is stable across runs and reviewable.
const declared = tools
  .map((t) => ({ name: t.name, description: t.description }))
  .sort((a, b) => a.name.localeCompare(b.name));

const missing = declared.filter((t) => !t.description);
if (missing.length) {
  console.error(`tools without a description: ${missing.map((t) => t.name).join(', ')}`);
  process.exit(1);
}

const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const before = JSON.stringify(manifest.tools ?? null);
manifest.tools = declared;
// false = these describe a real, fixed tool set rather than one a host generates.
manifest.tools_generated = false;

if (check) {
  if (before !== JSON.stringify(declared)) {
    console.error(`manifest.json tools are stale (${declared.length} tools live). Run: node scripts/sync-manifest-tools.mjs`);
    process.exit(1);
  }
  console.log(`manifest tools match the server (${declared.length})`);
  process.exit(0);
}

writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
console.log(`wrote ${declared.length} tools into manifest.json`);
