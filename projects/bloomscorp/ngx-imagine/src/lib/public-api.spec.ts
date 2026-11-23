import {describe, expect, test} from 'vitest';
import * as core from '@bloomscorp/imagine.js';

import * as api from '../public-api';

describe('the public API', () => {
	test('exports exactly what an app needs, and the core\'s own client and error', () => {
		expect(Object.keys(api).sort()).toEqual(
			['IMAGINE_CONFIG', 'ImagineBrowser', 'ImagineError', 'ImagineService', 'isImagineError', 'provideImagine']);
		expect(api.ImagineBrowser).toBe(core.ImagineBrowser);
		expect(api.ImagineError).toBe(core.ImagineError);
	});

	test('provideImagine() provides the configuration', async () => {
		const {TestBed} = await import('@angular/core/testing');
		const config = {getSessionToken: () => 'ims_x'};
		TestBed.configureTestingModule({providers: [api.provideImagine(config)]});
		expect(TestBed.inject(api.IMAGINE_CONFIG)).toBe(config);
	});
});
