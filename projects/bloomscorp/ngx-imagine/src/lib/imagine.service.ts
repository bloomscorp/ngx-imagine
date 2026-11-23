import {DestroyRef, inject, Injectable, NgZone, PLATFORM_ID, Signal, signal} from '@angular/core';
import {ImagineBrowser} from '@bloomscorp/imagine.js';
import type {
	CreatedJob, CreateJobOptions, CreateJobRequest, Image, ImagineError, Job, JobWithImages, Reference, Session,
} from '@bloomscorp/imagine.js';
import {IMAGINE_CONFIG} from './imagine-config';

export interface WatchOptions {
	/** The first wait between polls. Default 2 000 ms. */
	intervalMs?: number;
	/** The longest wait between polls. Default 10 000 ms. */
	maxIntervalMs?: number;
	/**
	 * Stop when this is destroyed. Defaults to the caller's `DestroyRef` when `watch()`
	 * is called in an injection context (a constructor or field initializer), else
	 * the application's.
	 */
	destroyRef?: DestroyRef;
}

/** A job being watched. Every field is a read-only signal. */
export interface JobWatch {
	/** The job as last seen, or null before the first answer. */
	job: Signal<Job | null>;
	/** Every image so far, in `seq` order, each once. */
	images: Signal<Image[]>;
	/** The error that stopped watching, if any. */
	error: Signal<ImagineError | null>;
	/** True once the job is completed, failed or cancelled. */
	done: Signal<boolean>;
	/** Stop polling now. Safe to call more than once. */
	stop: () => void;
}

/**
 * Imagine for Angular: the core client's calls, and `watch()` with signals.
 *
 * Injecting it has no side effects. During server-side rendering `watch()` returns
 * idle signals and polls nothing, so rendering is never held open by a timer.
 */
@Injectable({providedIn: 'root'})
export class ImagineService {
	private readonly config = inject(IMAGINE_CONFIG, {optional: true});
	private readonly isBrowser = inject(PLATFORM_ID) === 'browser';
	private readonly zone = inject(NgZone);
	private readonly appDestroyRef = inject(DestroyRef);
	private instance: ImagineBrowser | null = null;

	/** The core client (`ImagineBrowser` from `@bloomscorp/imagine.js`), made on first use. */
	get client(): ImagineBrowser {
		if (!this.instance) {
			if (!this.config) {
				throw new Error('ngx-imagine: add provideImagine({ getSessionToken }) to your application providers.');
			}
			this.instance = new ImagineBrowser(this.config);
		}
		return this.instance;
	}

	/** What this session may do: expiry, modes, image allowance, models and presets. */
	session(): Promise<Session> {
		return this.client.session();
	}

	/** Upload 1–5 product photos or images to edit (PNG, JPEG or WebP, up to 10 MB each). */
	uploadReferences(files: ArrayLike<Blob> | Iterable<Blob>): Promise<Reference[]> {
		return this.client.uploadReferences(files);
	}

	/** Ask for images. Answers at once with the queued job; follow it with `watch()`. */
	createJob(request: CreateJobRequest, options?: CreateJobOptions): Promise<CreatedJob> {
		return this.client.createJob(request, options);
	}

	/** The job, with the images made so far. */
	getJob(jobId: string): Promise<JobWithImages> {
		return this.client.getJob(jobId);
	}

	/** Stop the job: waiting images are cancelled. */
	cancelJob(jobId: string): Promise<Job> {
		return this.client.cancelJob(jobId);
	}

	/**
	 * Watch a job until it ends, as signals. Polling stops when the job ends, when
	 * `stop()` is called, or when the component (or `destroyRef`) is destroyed.
	 */
	watch(jobId: string, options: WatchOptions = {}): JobWatch {
		const job = signal<Job | null>(null);
		const images = signal<Image[]>([]);
		const error = signal<ImagineError | null>(null);
		const done = signal(false);
		let stopped = false;
		let stopPolling: () => void = () => undefined;
		let forget: () => void = () => undefined;

		const stop = (): void => {
			if (stopped) return;
			stopped = true;
			stopPolling();
			forget();
		};

		if (this.isBrowser) {
			const destroyRef = options.destroyRef ?? callerDestroyRef() ?? this.appDestroyRef;
			forget = destroyRef.onDestroy(stop);
			// Outside the zone, so polling never keeps the app "unstable"; signals
			// schedule change detection on their own.
			stopPolling = this.zone.runOutsideAngular(() => this.client.watchJob(jobId, {
				intervalMs: options.intervalMs,
				maxIntervalMs: options.maxIntervalMs,
				onProgress: value => job.set(value),
				onImage: image => images.update(list => [...list, image]),
				onDone: value => {
					job.set(value);
					done.set(true);
					forget();
				},
				onError: value => {
					error.set(value);
					forget();
				},
			}));
		}

		return {job: job.asReadonly(), images: images.asReadonly(), error: error.asReadonly(), done: done.asReadonly(), stop};
	}
}

/** The caller's DestroyRef when `watch()` runs in an injection context, else null. */
function callerDestroyRef(): DestroyRef | null {
	try {
		return inject(DestroyRef);
	} catch {
		return null;
	}
}
