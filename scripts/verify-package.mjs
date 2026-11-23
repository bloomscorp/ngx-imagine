#!/usr/bin/env node
/**
 * The packaging gate: pack `dist/bloomscorp/ngx-imagine` exactly as
 * `npm publish` will, and check the tarball itself, not the source.
 *
 * - **Files.** The bundle, the types, the manifest, the README and the licence
 *   are present, and no specs, sources or test helpers are.
 * - **Manifest pointers.** `module`, `typings` and every `exports` target
 *   resolve to a file in the tarball.
 * - **Versions.** The tarball's version is the workspace's, and its peer
 *   ranges are the source's. The core peer is a version range, never `file:`.
 * - **Provenance.** `repository.url` names this GitHub repository. npm rejects a
 *   `--provenance` publish whose manifest points anywhere else, or nowhere.
 * - **Published types** reach the core only through its package root: no
 *   subpath, no `dist/` path, and no inline `import("…")` type.
 * - **Declared dependencies.** Every package the bundle imports is a peer or a
 *   dependency.
 *
 * Whether the tarball links and compiles in each Angular major is
 * `npm run verify:compat`'s job. Requires `npm run build` first.
 */
import {execFileSync} from 'node:child_process';
import {existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, relative} from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const DIST = join(ROOT, 'dist', 'bloomscorp', 'ngx-imagine');
const SOURCE_MANIFEST = join(ROOT, 'projects', 'bloomscorp', 'ngx-imagine', 'package.json');
const CORE = '@bloomscorp/imagine.js';
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';

const problems = [];
const fail = (message) => problems.push(message);
const readJson = (file) => JSON.parse(readFileSync(file, 'utf8'));

if (!existsSync(join(DIST, 'package.json'))) {
	console.error('verify-package: dist/bloomscorp/ngx-imagine is missing. Run `npm run build` first.');
	process.exit(1);
}

const work = mkdtempSync(join(tmpdir(), 'ngx-package-'));
try {
	// --ignore-scripts: husky's `prepare` writes to stdout and would corrupt --json.
	const out = execFileSync(npm, ['pack', DIST, '--json', '--ignore-scripts', '--pack-destination', work], {cwd: ROOT, encoding: 'utf8'});
	const tarball = join(work, JSON.parse(out.slice(out.indexOf('[')))[0].filename);
	execFileSync('tar', ['-xzf', tarball, '-C', work]);
	const pkg = join(work, 'package');

	const files = [];
	(function walk(dir) {
		for (const name of readdirSync(dir)) {
			const path = join(dir, name);
			if (statSync(path).isDirectory()) walk(path);
			else files.push(relative(pkg, path).split('\\').join('/'));
		}
	})(pkg);

	// Files
	const required = [
		'package.json', 'README.md', 'LICENSE.md',
		'fesm2022/bloomscorp-ngx-imagine.mjs', 'types/bloomscorp-ngx-imagine.d.ts'
	];
	for (const file of required) if (!files.includes(file)) fail(`missing from the tarball: ${file}`);
	for (const file of files) {
		if (/\.spec\.|(^|\/)src\/|(^|\/)testing\//.test(file) || (/\.ts$/.test(file) && !/\.d\.ts$/.test(file))) {
			fail(`should not be published: ${file}`);
		}
	}

	// Manifest pointers
	const manifest = readJson(join(pkg, 'package.json'));
	const pointers = [];
	if (manifest.module) pointers.push(['module', manifest.module]);
	if (manifest.typings) pointers.push(['typings', manifest.typings]);
	(function collect(node, path) {
		if (typeof node === 'string') pointers.push([path, node]);
		else if (node && typeof node === 'object') for (const [key, value] of Object.entries(node)) collect(value, `${path}[${JSON.stringify(key)}]`);
	})(manifest.exports, 'exports');
	if (!pointers.some(([name]) => name === 'module')) fail('manifest has no "module"');
	if (!pointers.some(([name]) => name === 'typings')) fail('manifest has no "typings"');
	for (const [name, target] of pointers) {
		if (target.includes('*')) continue;
		if (!files.includes(target.replace(/^\.\//, ''))) fail(`manifest ${name} points at ${target}, which is not in the tarball`);
	}

	// Versions and peers
	const workspace = readJson(join(ROOT, 'package.json'));
	const source = readJson(SOURCE_MANIFEST);
	if (manifest.version !== workspace.version) fail(`tarball version ${manifest.version} is not the workspace version ${workspace.version} (run npm run sync-version)`);
	if (JSON.stringify(manifest.peerDependencies) !== JSON.stringify(source.peerDependencies)) fail('tarball peerDependencies differ from the library source package.json');
	if (manifest.sideEffects !== false) fail('manifest should declare "sideEffects": false');
	if (!manifest.peerDependencies?.[CORE] || String(manifest.peerDependencies[CORE]).startsWith('file:')) fail(`the ${CORE} peer must be a version range`);
	if (manifest.dependencies?.[CORE]) fail(`${CORE} must be a peer, not a dependency`);

	// Provenance
	const repo = (url) => String(url ?? '').replace(/^git\+/, '').replace(/\.git$/, '').replace(/\/+$/, '').toLowerCase();
	if (!manifest.repository?.url) fail('manifest has no repository.url — npm rejects a --provenance publish without it');
	else if (repo(manifest.repository.url) !== repo(workspace.repository?.url)) fail(`repository.url ${manifest.repository.url} is not this repository (${workspace.repository?.url})`);
	if (manifest.license !== 'MIT') fail(`license is ${manifest.license}, expected MIT`);
	// ng-packagr cannot copy files from outside the library folder, so the
	// licence there is a copy of the repository's. It must not drift.
	if (files.includes('LICENSE.md') && readFileSync(join(pkg, 'LICENSE.md'), 'utf8') !== readFileSync(join(ROOT, 'LICENSE.md'), 'utf8')) {
		fail('the published LICENSE.md differs from the repository LICENSE.md');
	}

	// Published types
	// Comments stripped first: the doc comments explain these very rules, quoting
	// the forms they forbid.
	const types = readFileSync(join(pkg, 'types/bloomscorp-ngx-imagine.d.ts'), 'utf8')
		.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
	const specifiers = [...types.matchAll(/(?:from\s*|import\s*\(\s*)["']([^"']+)["']/g)].map((m) => m[1]);
	for (const specifier of specifiers) {
		if (specifier.startsWith(CORE + '/')) fail(`types deep-import the core: ${specifier}`);
		if (/(^|\/)dist\//.test(specifier)) fail(`types reference a dist/ path: ${specifier}`);
	}
	const inline = types.match(/import\(\s*["'][^"']+["']\s*\)\.\w+/g) ?? [];
	for (const leak of inline) fail(`types name a dependency's type inline: ${leak} — annotate the public symbol with a named type`);

	// Declared dependencies
	const bundle = readFileSync(join(pkg, 'fesm2022/bloomscorp-ngx-imagine.mjs'), 'utf8');
	const declared = new Set([...Object.keys(manifest.peerDependencies ?? {}), ...Object.keys(manifest.dependencies ?? {})]);
	const imported = new Set([...bundle.matchAll(/(?:from\s*|import\s*)["']([^"'.][^"']*)["']/g)].map((m) => m[1]));
	for (const specifier of imported) {
		const name = specifier.startsWith('@') ? specifier.split('/').slice(0, 2).join('/') : specifier.split('/')[0];
		if (!declared.has(name)) fail(`the bundle imports ${specifier}, but ${name} is neither a peer nor a dependency`);
	}

	if (problems.length) {
		console.error(`verify-package: ${problems.length} problem(s) with ${manifest.name}@${manifest.version}:`);
		for (const problem of problems) console.error('  ✗ ' + problem);
		process.exit(1);
	}
	console.log(`verify-package: ${manifest.name}@${manifest.version} — ${files.length} files, ${pointers.length} manifest pointers resolve, ` +
		`types reach the core by its root only, all ${imported.size} imported packages declared`);
} finally {
	rmSync(work, {recursive: true, force: true});
}
