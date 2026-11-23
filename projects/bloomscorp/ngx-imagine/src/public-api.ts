/*
 * Public API Surface of ngx-imagine
 *
 * Everything an Angular app needs comes from here. An app should never have to
 * import `@bloomscorp/imagine.js` itself; the client, the error and every type
 * are re-exported below.
 */

export * from './lib/provide-imagine';
export * from './lib/imagine-config';
export * from './lib/imagine.service';

export {ImagineBrowser, ImagineError, isImagineError} from '@bloomscorp/imagine.js';
export type {
	SessionTokenResult, ImagineBrowserOptions, CreateJobOptions, WatchJobOptions,
	JobMode, JobSource, JobStatus, PauseReason, JobCounts, JobSchedule, JobEstimate, JobNotify,
	Job, JobWithImages, CreatedJob, ImageDestination, Image, Reference,
	RecipeCommon, PromptRecipe, ProductRecipe, EditRecipe, BatchRecipe, CreateJobRequest,
	AspectRatioPreset, StylePreset, ProductShotPreset, PresetLimits, Presets, ImagineModel, Session,
} from '@bloomscorp/imagine.js';
