#!/usr/bin/env node
// Build the product site: copy site/src/ into site/dist/, verbatim.
//
// Deliberately zero-dependency — no bundler, no npm install. The pages are
// hand-written static HTML with inline CSS, so "building" is a clean copy plus
// the two files GitHub Pages needs at the artifact root:
//   - CNAME      (custom domain; shipped from src/ so it survives every deploy)
//   - .nojekyll  (Pages must serve the files as-is, no Jekyll pass)
//
// Output goes to site/dist/ — NOT site/build/, because build/ already means
// "TypeScript compile output" at the repo root and reusing the name here would
// invite exactly the confusion it caused once already.

import { cpSync, mkdirSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const site = dirname(fileURLToPath(import.meta.url));
const src = join(site, 'src');
const dist = join(site, 'dist');

rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });
cpSync(src, dist, { recursive: true });

// .nojekyll is generated rather than committed so it can never be lost to a
// tool that prunes "empty" dotfiles from src/.
writeFileSync(join(dist, '.nojekyll'), '');

// Fail the build (and therefore the Pages deploy) if the domain file is wrong —
// a missing or mangled CNAME silently drops the custom domain on next deploy.
const cname = readFileSync(join(dist, 'CNAME'), 'utf8').trim();
if (cname !== 'bagos.edycu.dev') {
  console.error(`CNAME must contain exactly "bagos.edycu.dev", got "${cname}"`);
  process.exit(1);
}

console.log('site built → site/dist/');
