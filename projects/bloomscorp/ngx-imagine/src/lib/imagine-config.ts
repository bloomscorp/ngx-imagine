import {InjectionToken} from '@angular/core';
import type {ImagineBrowserOptions} from '@bloomscorp/imagine.js';

/**
 * What `provideImagine()` takes: the core client's options. `getSessionToken` is
 * required; everything else has a default (`baseUrl`: `https://z.bloomscorp.com`).
 */
export type ImagineConfig = ImagineBrowserOptions;

/** The configuration given to `provideImagine()`. */
export const IMAGINE_CONFIG: InjectionToken<ImagineConfig> = new InjectionToken<ImagineConfig>('IMAGINE_CONFIG');
