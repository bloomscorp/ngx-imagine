# Changelog

## 0.1.0 (unreleased)

First release.

- `provideImagine({ getSessionToken, baseUrl? })` in the application providers.
- `ImagineService`: the core client (`client`), `session()`, `uploadReferences()`,
  `createJob()`, `getJob()`, `cancelJob()`, and `watch(jobId)` returning
  `{ job, images, error, done, stop }` as signals. Watching stops on its own when
  the component (or a given `DestroyRef`) is destroyed.
- Safe during server-side rendering: `watch()` polls nothing on the server.
- Standalone, Angular 19 to 22. Re-exports the core's client, `ImagineError` and
  every type.
