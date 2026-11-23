# @bloomscorp/ngx-imagine

Angular wrapper for [Imagine](https://bloomscorp.com), the AI image generator of
blooms.ai. Built on [`@bloomscorp/imagine.js`](https://github.com/bloomscorp/imagine.js).

- `provideImagine()` in your app config, `ImagineService` anywhere.
- `watch(jobId)` gives you the job and its images as **signals**, and stops when
  the component is destroyed.
- Standalone, Angular 19 to 22. Safe during server-side rendering.
- **No API key in the browser.** The page uses a short-lived session token that your
  backend mints.

## Install

```bash
npm install @bloomscorp/ngx-imagine @bloomscorp/imagine.js
```

## Quick start

### 1. Your backend mints a session token

With the Node library and an API key that has the **`imagine`** scope (Project
Settings → API keys). The key stays on your server.

```ts
import express from 'express';
import {Imagine} from '@bloomscorp/imagine-node';

const imagine = new Imagine({apiKey: process.env.BLOOMS_API_KEY!});
const app = express();

app.post('/imagine-session', requireLogin, async (req, res) => {
	const session = await imagine.sessions.create({
		ttlSeconds: 900,
		maxImages: 10,
		modes: ['prompt', 'product', 'edit'],
		origins: ['https://shop.example.com'],
		externalUser: req.user.id,
	});
	res.json({token: session.token, expiresAt: session.expiresAt});
});
```

### 2. Provide it

```ts
// app.config.ts
import {ApplicationConfig} from '@angular/core';
import {provideImagine} from '@bloomscorp/ngx-imagine';

export const appConfig: ApplicationConfig = {
	providers: [
		provideImagine({
			getSessionToken: () => fetch('/imagine-session', {method: 'POST'}).then(r => r.json()),
		}),
	],
};
```

`getSessionToken` may return the token alone, or `{ token, expiresAt }`. It is
called on the first request, 30 seconds before the token expires, and once more if
blooms.ai says it has expired.

### 3. Ask for images and show them

```ts
import {Component, DestroyRef, inject, signal} from '@angular/core';
import {ImagineError, ImagineService, JobWatch} from '@bloomscorp/ngx-imagine';

@Component({
	selector: 'app-mug-maker',
	template: `
		<button (click)="make()" [disabled]="busy()">Make 4 images</button>
		@if (failure(); as e) { <p>{{ e.message }}</p> }
		@if (watch(); as w) {
			@if (w.job(); as job) { <p>{{ job.counts.done }} of {{ job.counts.total }}</p> }
			@for (image of w.images(); track image._id) { <img [src]="image.url" [alt]="image.prompt"> }
		}
	`,
})
export class MugMakerComponent {
	private readonly imagine = inject(ImagineService);
	private readonly destroyRef = inject(DestroyRef);
	readonly watch = signal<JobWatch | null>(null);
	readonly busy = signal(false);
	readonly failure = signal<ImagineError | null>(null);

	async make(): Promise<void> {
		this.busy.set(true);
		try {
			const job = await this.imagine.createJob({mode: 'prompt', prompt: 'A mug on a desk', count: 4});
			this.watch()?.stop();
			// Called from a click handler, so name what ends it.
			this.watch.set(this.imagine.watch(job._id, {destroyRef: this.destroyRef}));
		} catch (e) {
			this.failure.set(e as ImagineError);
		} finally {
			this.busy.set(false);
		}
	}
}
```

## API

### `provideImagine(config)`

`config` is the core client's options:

| Option | Default | |
|---|---|---|
| `getSessionToken` | required | `() => string \| { token, expiresAt? }`, or a Promise of either |
| `baseUrl` | `https://z.bloomscorp.com` | |
| `timeoutMs` | `30000` | Per attempt |
| `uploadTimeoutMs` | `120000` | Per attempt, for uploads |
| `maxRetries` | `3` | For 429, 5xx and network errors |
| `maxRetryWaitMs` | `60000` | A longer `Retry-After` is thrown, not waited out |
| `fetch` | the global `fetch` | |

### `ImagineService`

| Member | |
|---|---|
| `client` | The core `ImagineBrowser`, made on first use |
| `session()` | What this session may do: `expiresAt`, `modes`, `maxImages`, `imagesUsed`, `models`, `presets` |
| `uploadReferences(files)` | 1–5 PNG/JPEG/WebP files, ≤ 10 MB each → `Reference[]` |
| `createJob(recipe, { idempotencyKey? })` | The queued job, with `pacePerMinute` and `schedule` |
| `getJob(jobId)` | The job and its images so far |
| `cancelJob(jobId)` | Waiting images are cancelled |
| `watch(jobId, options?)` | A `JobWatch` (below) |

All calls return Promises and fail with an `ImagineError`.

### `watch(jobId, { intervalMs?, maxIntervalMs?, destroyRef? })`

Returns a `JobWatch`:

| Field | |
|---|---|
| `job` | `Signal<Job \| null>`: the job as last seen |
| `images` | `Signal<Image[]>`: every image so far, in `seq` order, each once |
| `error` | `Signal<ImagineError \| null>`: the error that stopped watching |
| `done` | `Signal<boolean>`: `true` once the job is completed, failed or cancelled |
| `stop()` | Stop now. Safe to call twice |

Polling stops when the job ends, on an error, on `stop()`, or when its `DestroyRef`
is destroyed. That is:

- `options.destroyRef`, when given
- otherwise the caller's, when `watch()` is called in an injection context (a
  constructor or a field initializer of a component)
- otherwise the application's: call `stop()` yourself, or pass `destroyRef`, when
  you call `watch()` from an event handler

Polls start every 2 s and slow to every 10 s while nothing changes. They run outside
the Angular zone; signals update the view on their own.

During server-side rendering `watch()` returns idle signals and polls nothing.

### Types and errors

Everything from the core is re-exported: `ImagineBrowser`, `ImagineError`,
`isImagineError`, and the types (`Job`, `Image`, `Session`, `Presets`,
`CreateJobRequest`, `PromptRecipe`, `ProductRecipe`, `EditRecipe`, `BatchRecipe`, …).
Import them from here, never from `@bloomscorp/imagine.js`.

`error.code` is stable; branch on it. Common ones: `SESSION_LIMIT` (the session has
used its images), `SESSION_SCOPE` (mode not allowed), `ORIGIN_NOT_ALLOWED`,
`TOO_MANY_JOBS`, `PROMPT_REQUIRED`, `RATE_LIMITED`, `SESSION_TOKEN_FAILED` (your
`getSessionToken` failed), `NETWORK_FAILURE`. The full list is in the core's README.

## Security

- **Never put an API key in an Angular app.** It ships to every browser. API keys
  stay on your server; pages get session tokens.
- Mint tokens only for signed-in users, with small `maxImages` and `ttlSeconds`, and
  always set `origins`.

## License

MIT
