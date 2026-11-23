#!/usr/bin/env node
/**
 * Prove the published package works on every Angular major its peer range
 * claims, by linking and type-checking it with each major's real compiler.
 *
 * A partially compiled library records its declarations for the consumer's
 * linker. A newer Angular can write something an older linker rejects, and the
 * bundle's `minVersion` does not catch it. So, per major in the peer range,
 * this installs the packed tarball into a clean consumer project alongside that
 * major's compiler, then:
 *
 *   1. links the FESM bundle with that major's own linker (what the consumer's
 *      build does), and
 *   2. type-checks a file using every public symbol with `skipLibCheck: false`,
 *      so the library's `.d.ts` is checked against that major's types.
 *
 * The majors come from the library's own peerDependencies, so the claim and the
 * proof cannot drift apart. The core is installed from npm, or packed from the
 * local copy while the dev dependency is `file:../imagine.js`.
 * Requires `npm run build` first, and network.
 *
 * Usage: node scripts/verify-angular-compat.mjs [major ...]
 */
import {execFileSync} from 'node:child_process';
import {mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'dist', 'bloomscorp', 'ngx-imagine');
const LIB = JSON.parse(readFileSync(join(ROOT, 'projects/bloomscorp/ngx-imagine/package.json'), 'utf8'));
const PEER = LIB.peerDependencies['@angular/core'];
const CORE = '@bloomscorp/imagine.js';
const CORE_DEV = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).devDependencies[CORE];
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';

function majorsFromPeer(range) {
	const m = /^>=(\d+)\.\d+\.\d+ <(\d+)\.0\.0$/.exec(range);
	if (!m) throw new Error(`cannot read a major range from peerDependencies "${range}" — pass majors explicitly`);
	const out = [];
	for (let v = Number(m[1]); v < Number(m[2]); v++) out.push(v);
	return out;
}

const run = (cmd, args, cwd) => execFileSync(cmd, args, {cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']});
const firstLine = (e) => String(e.stderr || e.stdout || e.message).split('\n').find(Boolean) ?? String(e);

const LINK = `
import {readFileSync, readdirSync} from 'node:fs';
import {transformSync} from '@babel/core';
import linkerPlugin from '@angular/compiler-cli/linker/babel';
const dir = 'node_modules/@bloomscorp/ngx-imagine/fesm2022';
for (const f of readdirSync(dir).filter((n) => n.endsWith('.mjs'))) {
	let out;
	try {
		out = transformSync(readFileSync(dir + '/' + f, 'utf8'), {filename: f, plugins: [linkerPlugin], babelrc: false, configFile: false});
	} catch (e) {
		// Babel prefixes the linker's message with the file path; keep the reason.
		const reason = String(e && e.message || e).split('\\n')[0].replace(/^.*?:\\s(?=[A-Z])/, '');
		console.error('linker rejected ' + f + ': ' + reason);
		process.exit(1);
	}
	const left = (out.code.match(/ɵɵngDeclare\\w+/g) || []).length;
	if (left) { console.error(f + ': ' + left + ' declarations left unlinked'); process.exit(1); }
}
`;

const CONSUMER = `
import {DestroyRef, inject, Signal} from '@angular/core';
import {
	IMAGINE_CONFIG, ImagineBrowser, ImagineConfig, ImagineError, ImagineService, JobWatch, WatchOptions,
	CreateJobRequest, Image, Job, Session, Presets, isImagineError, provideImagine
} from '@bloomscorp/ngx-imagine';
const config: ImagineConfig = {getSessionToken: async () => ({token: 'ims_x', expiresAt: null}), baseUrl: 'https://z.example'};
export const providers = [provideImagine(config)];
export async function useImagine(): Promise<void> {
	const imagine: ImagineService = inject(ImagineService);
	const client: ImagineBrowser = imagine.client;
	const recipe: CreateJobRequest = {mode: 'product', productName: 'Shirt', shots: ['white'], referenceIds: ['r']};
	const job: Job = await imagine.createJob(recipe, {idempotencyKey: 'k'});
	const options: WatchOptions = {intervalMs: 2000, destroyRef: inject(DestroyRef)};
	const watch: JobWatch = imagine.watch(job._id, options);
	const images: Signal<Image[]> = watch.images;
	const error: ImagineError | null = watch.error();
	const session: Session = await client.session();
	const presets: Presets = session.presets;
	void [images, error, presets, isImagineError(error), inject(IMAGINE_CONFIG).baseUrl, watch.done(), watch.stop()];
}
`;

const majors = process.argv.slice(2).map(Number).filter(Boolean);
const targets = majors.length ? majors : majorsFromPeer(PEER);
const work = mkdtempSync(join(tmpdir(), 'ngx-compat-'));
let failed = false;

try {
	const pack = run(npm, ['pack', DIST, '--json', '--ignore-scripts', '--pack-destination', work], ROOT);
	const tarball = join(work, JSON.parse(pack.slice(pack.indexOf('[')))[0].filename);
	let core = `${CORE}@${LIB.peerDependencies[CORE]}`;
	if (String(CORE_DEV).startsWith('file:')) {
		const local = join(ROOT, CORE_DEV.slice('file:'.length));
		const packed = run(npm, ['pack', local, '--json', '--ignore-scripts', '--pack-destination', work], ROOT);
		core = join(work, JSON.parse(packed.slice(packed.indexOf('[')))[0].filename);
	}
	console.log(`verify-angular-compat: peer range ${PEER} -> checking Angular ${targets.join(', ')}`);

	for (const major of targets) {
		const dir = join(work, `angular-${major}`);
		mkdirSync(dir);
		writeFileSync(join(dir, 'package.json'), JSON.stringify({name: `consumer-${major}`, private: true, type: 'module'}));
		try {
			// TypeScript must suit this major's compiler, so read its own peer range.
			const ts = JSON.parse(run(npm, ['view', `@angular/compiler-cli@${major}`, 'peerDependencies.typescript', '--json'], dir));
			const tsRange = Array.isArray(ts) ? ts[ts.length - 1] : ts;
			const ng = ['compiler-cli', 'compiler', 'core'].map((p) => `@angular/${p}@${major}`);
			run(npm, ['install', ...ng, 'rxjs@7', '@babel/core', `typescript@${tsRange}`, core, tarball,
				'--no-audit', '--no-fund', '--ignore-scripts', '--prefer-online'], dir);
			const version = JSON.parse(readFileSync(join(dir, 'node_modules/@angular/compiler-cli/package.json'), 'utf8')).version;

			writeFileSync(join(dir, 'link.mjs'), LINK);
			run(process.execPath, ['link.mjs'], dir);

			writeFileSync(join(dir, 'consumer.ts'), CONSUMER);
			run(process.execPath, [join(dir, 'node_modules/typescript/bin/tsc'), '--noEmit', '--strict', '--skipLibCheck', 'false',
				'--target', 'es2022', '--module', 'esnext', '--moduleResolution', 'bundler', '--experimentalDecorators', 'consumer.ts'], dir);

			console.log(`verify-angular-compat: Angular ${version} — links ✓, types check ✓`);
		} catch (error) {
			failed = true;
			console.error(`verify-angular-compat: Angular ${major} FAILED — ${firstLine(error)}`);
		}
	}
} finally {
	rmSync(work, {recursive: true, force: true});
}

if (failed) {
	console.error(`verify-angular-compat: the peer range ${PEER} is not true for this build. Do not publish it.`);
	process.exit(1);
}
console.log(`verify-angular-compat: every Angular major in ${PEER} links and type-checks this build`);
