#!/usr/bin/env node
/**
 * Copy the workspace version into the library's own package.json.
 *
 * `npm version` bumps the **root** package.json. What npm publishes is
 * `projects/bloomscorp/ngx-imagine/package.json`, because that is the file
 * ng-packagr copies into `dist/`. This keeps the two the same.
 *
 * `--check` exits non-zero when they differ; CI and the release run it.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', 'package.json');
const LIB = path.join(__dirname, '..', 'projects', 'bloomscorp', 'ngx-imagine', 'package.json');

const CHECK = process.argv.includes('--check');

function read(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    console.error(`sync-library-version: cannot read ${file} — ${err.message}`);
    process.exit(1);
  }
}

const root = read(ROOT);
const lib = read(LIB);

if (!root.version) {
  console.error('sync-library-version: the workspace package.json has no version');
  process.exit(1);
}

if (root.version === lib.version) {
  console.log(`sync-library-version: already in sync at ${root.version}`);
  process.exit(0);
}

if (CHECK) {
  console.error(
    `sync-library-version: out of sync — workspace is ${root.version}, `
    + `library is ${lib.version}. The library's version is the one that gets `
    + `published. Run "npm run sync-version".`
  );
  process.exit(1);
}

const was = lib.version;
lib.version = root.version;

// Preserve the file's existing indentation rather than reformatting it, so the
// diff is one line.
const raw = fs.readFileSync(LIB, 'utf8');
const indent = /\n(\s+)"/.exec(raw);
fs.writeFileSync(LIB, JSON.stringify(lib, null, indent ? indent[1] : 2) + '\n');

console.log(`sync-library-version: ${was} → ${lib.version}`);
