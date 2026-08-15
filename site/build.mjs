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

// Stamp the version from package.json into the built HTML.
//
// The pages name the current release in ~15 places — the release link, the npm
// attestation URL, the install line. Hard-coding those was fine while releases were
// manual and rare. Now that release-please bumps the version automatically, a
// hard-coded site goes stale on the very first automated release and starts linking a
// GitHub release and an attestation that describe the previous version.
//
// Substitution at build time rather than a fetch at runtime: the site makes zero
// external requests by design, and a version that changes only when the package
// changes is a build input, not live data.
const VERSION = JSON.parse(readFileSync(join(site, '..', 'package.json'), 'utf8')).version;
const PAGES = ['index.html', join('deck', 'index.html')];
let stamped = 0;
for (const page of PAGES) {
  const p = join(dist, page);
  const before = readFileSync(p, 'utf8');
  // Only version-shaped strings, so a semver appearing inside prose is untouched.
  const after = before
    .replace(/\bv\d+\.\d+\.\d+\b/g, `v${VERSION}`)
    .replace(/bagos-mcp-server@\d+\.\d+\.\d+/g, `bagos-mcp-server@${VERSION}`)
    // JSON-LD carries a bare semver with no `v`, so the pattern above never
    // matched it and softwareVersion sat at 2.0.0 while npm served 2.2.0 —
    // stale structured data, which is the copy search engines actually read.
    // Anchored to the key so a bare semver in prose is still untouched.
    .replace(/("softwareVersion":\s*")\d+\.\d+\.\d+(")/g, `$1${VERSION}$2`)
    // The explicit marker. Preferred over the shape-matching patterns above for
    // any new site copy: it says "a version goes here" instead of hoping a
    // literal semver keeps matching, and an unsubstituted one fails the build
    // below rather than shipping a stale-but-plausible number.
    .replace(/__V__/g, VERSION);
  if (after !== before) stamped++;
  writeFileSync(p, after);
}

// A page that mentions no version at all means the markers were renamed and this
// substitution silently stopped working — which is exactly the failure it exists to
// prevent, so fail loudly instead.
if (stamped === 0 && !readFileSync(join(dist, 'index.html'), 'utf8').includes(`v${VERSION}`)) {
  console.error(`no version markers found — expected v<semver>, bagos-mcp-server@<semver>, or "softwareVersion": "<semver>"`);
  process.exit(1);
}

// Assert every version-shaped string agrees with package.json. The guard above
// only proves SOMETHING was stamped; this proves nothing was missed — which is
// how softwareVersion drifted two minor versions behind without anyone noticing.
for (const page of PAGES) {
  const html = readFileSync(join(dist, page), 'utf8');
  // A surviving marker means the substitution above never ran over this page.
  // Checked separately because __V__ is not semver-shaped, so the staleness
  // scan below cannot see it — it would ship as visible copy reading "v__V__".
  if (html.includes('__V__')) {
    console.error(`${page}: unsubstituted __V__ marker survived the build`);
    process.exit(1);
  }
  const stale = [
    ...html.matchAll(/\bv(\d+\.\d+\.\d+)\b/g),
    ...html.matchAll(/"softwareVersion":\s*"(\d+\.\d+\.\d+)"/g),
    ...html.matchAll(/bagos-mcp-server@(\d+\.\d+\.\d+)/g),
  ].filter((m) => m[1] !== VERSION);
  if (stale.length) {
    console.error(`${page}: version strings disagree with package.json (${VERSION}): ` +
      [...new Set(stale.map((m) => m[0]))].join(', '));
    process.exit(1);
  }
}
console.log(`stamped version ${VERSION} into ${PAGES.length} pages`);

// Fail the build (and therefore the Pages deploy) if the domain file is wrong —
// a missing or mangled CNAME silently drops the custom domain on next deploy.
const cname = readFileSync(join(dist, 'CNAME'), 'utf8').trim();
if (cname !== 'bagos.edycu.dev') {
  console.error(`CNAME must contain exactly "bagos.edycu.dev", got "${cname}"`);
  process.exit(1);
}

console.log('site built → site/dist/');
