import {Component, DestroyRef, EnvironmentInjector, PLATFORM_ID, createEnvironmentInjector, inject} from '@angular/core';
import {TestBed} from '@angular/core/testing';
import {afterEach, beforeEach, describe, expect, test, vi, type Mock} from 'vitest';
import {ImagineBrowser, ImagineError} from '@bloomscorp/imagine.js';

import {FakeImagine} from '../testing/fake-imagine';
import {JobWatch, ImagineService} from './imagine.service';
import {provideImagine} from './provide-imagine';

type TokenFn = () => Promise<{token: string; expiresAt: string}>;
let fake: FakeImagine;
let getSessionToken: Mock<TokenFn>;

function setup(platform = 'browser'): ImagineService {
	TestBed.configureTestingModule({
		providers: [
			provideImagine({getSessionToken, baseUrl: 'https://z.test', fetch: fake.fetch}),
			{provide: PLATFORM_ID, useValue: platform},
		],
	});
	return TestBed.inject(ImagineService);
}

const tick = (ms = 0) => vi.advanceTimersByTimeAsync(ms);
const polls = () => fake.seen.filter(s => s.method === 'GET').length;

beforeEach(() => {
	vi.useFakeTimers({toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date']});
	fake = new FakeImagine();
	getSessionToken = vi.fn<TokenFn>(async () => fake.token());
});
afterEach(() => {
	vi.useRealTimers();
	vi.restoreAllMocks();
});

describe('the client', () => {
	test('is made on first use from provideImagine(), once, without asking for a token', () => {
		const imagine = setup();
		const client = imagine.client;
		expect(client).toBeInstanceOf(ImagineBrowser);
		expect(imagine.client).toBe(client);
		expect(getSessionToken).not.toHaveBeenCalled();
	});

	test('without provideImagine() it says what to add', () => {
		const imagine = TestBed.inject(ImagineService);
		expect(() => imagine.client).toThrow(/provideImagine/);
	});

	test('the calls go through to the core', async () => {
		const imagine = setup();
		const created = await imagine.createJob({mode: 'prompt', prompt: 'A mug', count: 2});
		expect(created.counts.total).toBe(2);
		const post = fake.seen[0]!;
		expect(post.body).toEqual({mode: 'prompt', prompt: 'A mug', count: 2});
		expect(post.headers['idempotency-key']).toMatch(/^[0-9a-f-]{36}$/);
		expect(post.headers['authorization']).toMatch(/^Bearer ims_/);
		expect((await imagine.getJob(created._id))._id).toBe(created._id);

		const client = imagine.client;
		const session = vi.spyOn(client, 'session').mockResolvedValue({maxImages: 3} as never);
		const upload = vi.spyOn(client, 'uploadReferences').mockResolvedValue([]);
		const cancel = vi.spyOn(client, 'cancelJob').mockResolvedValue(created);
		const file = new Blob(['x'], {type: 'image/png'});
		await imagine.session();
		await imagine.uploadReferences([file]);
		await imagine.cancelJob('j1');
		expect(session).toHaveBeenCalled();
		expect(upload).toHaveBeenCalledWith([file]);
		expect(cancel).toHaveBeenCalledWith('j1');
	});
});

describe('watch()', () => {
	test('signals follow the job: each image once, then done, then polling stops', async () => {
		const imagine = setup();
		const job = fake.addJob(2);
		const watch = TestBed.runInInjectionContext(() => imagine.watch(job._id));
		expect(watch.job()).toBeNull();
		expect(watch.images()).toEqual([]);
		expect(watch.done()).toBe(false);

		await tick();
		expect(watch.job()?.status).toBe('queued');

		fake.addImage(job._id);
		await tick(2_000);
		expect(watch.images().map(i => i.seq)).toEqual([0]);
		await tick(2_000);
		expect(watch.images()).toHaveLength(1);

		fake.addImage(job._id);
		await tick(10_000);
		expect(watch.images().map(i => i.seq)).toEqual([0, 1]);
		expect(watch.job()?.status).toBe('completed');
		expect(watch.done()).toBe(true);
		expect(watch.error()).toBeNull();

		const after = polls();
		await tick(60_000);
		expect(polls()).toBe(after);
	});

	test('the signals are read-only', () => {
		const imagine = setup();
		const watch = imagine.watch(fake.addJob()._id);
		expect((watch.job as unknown as {set?: unknown}).set).toBeUndefined();
		watch.stop();
	});

	test('stop() stops polling, and can be called twice', async () => {
		const imagine = setup();
		const watch = imagine.watch(fake.addJob()._id);
		await tick(2_000);
		const before = polls();
		watch.stop();
		watch.stop();
		await tick(60_000);
		expect(polls()).toBe(before);
	});

	test('an error is set, and polling stops', async () => {
		const imagine = setup();
		const watch = imagine.watch('missing');
		await tick(30_000);
		expect(watch.error()).toBeInstanceOf(ImagineError);
		expect(watch.error()?.code).toBe('NOT_FOUND');
		expect(watch.done()).toBe(false);
		expect(polls()).toBe(1);
	});

	test('in a component: destroying the component stops polling', async () => {
		@Component({selector: 'lib-gallery', template: '{{ watch.images().length }} images'})
		class GalleryComponent {
			readonly watch: JobWatch = inject(ImagineService).watch(jobId);
		}
		setup();
		const jobId = fake.addJob()._id;
		const fixture = TestBed.createComponent(GalleryComponent);
		await tick(2_000);
		const before = polls();
		expect(before).toBeGreaterThan(0);
		fixture.destroy();
		await tick(60_000);
		expect(polls()).toBe(before);
	});

	test('an explicit destroyRef is used', async () => {
		const imagine = setup();
		const child = createEnvironmentInjector([], TestBed.inject(EnvironmentInjector));
		imagine.watch(fake.addJob()._id, {destroyRef: child.get(DestroyRef)});
		await tick(2_000);
		const before = polls();
		child.destroy();
		await tick(60_000);
		expect(polls()).toBe(before);
	});

	test('outside an injection context it stops with the application', async () => {
		const imagine = setup();
		imagine.watch(fake.addJob()._id);   // a click handler, say
		await tick(2_000);
		const before = polls();
		TestBed.resetTestingModule();
		await tick(60_000);
		expect(polls()).toBe(before);
	});

	test('a finished watch lets go of its destroy hook', async () => {
		const imagine = setup();
		const child = createEnvironmentInjector([], TestBed.inject(EnvironmentInjector));
		const ref = child.get(DestroyRef);
		const hooks: Array<() => void> = [];
		const forget = vi.fn();
		vi.spyOn(ref, 'onDestroy').mockImplementation(fn => { hooks.push(fn); return forget; });
		const job = fake.addJob(1);
		fake.addImage(job._id);
		imagine.watch(job._id, {destroyRef: ref});
		await tick();
		expect(forget).toHaveBeenCalled();

		const failing = imagine.watch('missing', {destroyRef: ref});
		await tick();
		expect(failing.error()?.code).toBe('NOT_FOUND');
		expect(forget).toHaveBeenCalledTimes(2);
	});

	test('during server rendering: idle signals, nothing polled, no token asked for', async () => {
		const imagine = setup('server');
		const watch = imagine.watch(fake.addJob()._id);
		await tick(30_000);
		expect(watch.job()).toBeNull();
		expect(watch.done()).toBe(false);
		expect(fake.seen).toHaveLength(0);
		expect(getSessionToken).not.toHaveBeenCalled();
		watch.stop();
	});
});
