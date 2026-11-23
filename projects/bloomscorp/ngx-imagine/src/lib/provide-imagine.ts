import {EnvironmentProviders, makeEnvironmentProviders} from '@angular/core';
import {IMAGINE_CONFIG, ImagineConfig} from './imagine-config';

/**
 * Set up Imagine for an application. Call it once, in the root providers:
 *
 * ```ts
 * export const appConfig: ApplicationConfig = {
 *   providers: [
 *     provideImagine({
 *       getSessionToken: () => firstValueFrom(inject(HttpClient).post<{token: string; expiresAt: string}>('/imagine-session', {})),
 *     }),
 *   ],
 * };
 * ```
 *
 * Nothing runs at start-up: the client is made the first time `ImagineService`
 * uses it, and the session token is asked for on the first call.
 */
export function provideImagine(config: ImagineConfig): EnvironmentProviders {
	return makeEnvironmentProviders([{provide: IMAGINE_CONFIG, useValue: config}]);
}
