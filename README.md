# ngx-imagine

The Angular wrapper for [`@bloomscorp/imagine.js`](https://github.com/bloomscorp/imagine.js),
published as [`@bloomscorp/ngx-imagine`](https://www.npmjs.com/package/@bloomscorp/ngx-imagine).

[![CI](https://github.com/bloomscorp/ngx-imagine/actions/workflows/ci.yml/badge.svg)](https://github.com/bloomscorp/ngx-imagine/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](./LICENSE.md)

**Using the library?** Everything an app needs is in the
[package README](./projects/bloomscorp/ngx-imagine/README.md).

This page is for working on the library itself.

## What is here

| Path | |
|---|---|
| `projects/bloomscorp/ngx-imagine/` | **The library**: the source, its own `package.json` (the one npm publishes) and the package README |
| `projects/bloomscorp/ngx-imagine/src/testing/` | A fake of the blooms.ai browser API, for the tests only (never published) |
| `scripts/` | The checks CI and releases run (see below) |
| `RELEASING.md` | How a release is cut and published |

The root `package.json` is the private workspace. What npm publishes is
`dist/bloomscorp/ngx-imagine/`, built from the library folder.

## Setup

Node from `.node-version` (24). Angular 22's CLI refuses anything older than
22.22.3 or 24.15.0.

Until `@bloomscorp/imagine.js` is on npm, the core comes from the folder beside this
one (`file:../imagine.js`). Build it first:

```bash
(cd ../imagine.js && npm ci && npm run build)
npm ci
```

## Everyday commands

| Command | |
|---|---|
| `npm run build` | Builds the library into `dist/bloomscorp/ngx-imagine/` |
| `npm run lint` | Type-checks the library and its tests |
| `npm test` | Runs the tests (Vitest, jsdom) |
| `npm run test:coverage` | The same with coverage, and the **100% per file** threshold enforced |

## Checks

Each runs in CI on every push, and again before a release is published.

| Command | Fails when |
|---|---|
| `npm run test:coverage` | a test fails, or a library file drops below 100% coverage |
| `npm run check-version` | the library's version differs from the workspace's |
| `npm run verify:package` | the packed tarball is wrong: missing files, broken manifest pointers, missing provenance metadata, the core's types reached by a deep path, an undeclared dependency |
| `npm run verify:compat` | any Angular major in the peer range (19–22) cannot link or type-check the packed library. Needs network |

## Rules worth knowing

- **The facade rule.** An Angular app never imports `@bloomscorp/imagine.js`. If an
  app needs something from the core, re-export it from `public-api.ts`.
- **The library may only use Angular 19 APIs.** The peer range starts at 19.
  `verify:compat` proves it.
- **No browser globals at import time**, and no polling on the server.

## License

[MIT](./LICENSE.md)
