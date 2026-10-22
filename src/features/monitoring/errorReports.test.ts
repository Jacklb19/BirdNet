import { describe, expect, it } from 'vitest';
import type { ErrorEvent } from '@sentry/browser';
import { cleanUrl, withoutPersonalData } from './errorReports';

describe('error reports', () => {
  it('keep only the screen of an address', () => {
    expect(cleanUrl('https://birdnet-nu.vercel.app/#/log/0a1b2c3d-0000-4000-8000-000000000001')).toBe('https://birdnet-nu.vercel.app/#/log');
    expect(cleanUrl('https://birdnet-nu.vercel.app/#/map?species=Vultur%20gryphus')).toBe('https://birdnet-nu.vercel.app/#/map');
    expect(cleanUrl('https://birdnet-nu.vercel.app/?error=x#/species/Vultur%20gryphus')).toBe('https://birdnet-nu.vercel.app/#/species');
    expect(cleanUrl('not an address')).toBe('');
  });

  it('carry no user, breadcrumbs, headers or identifiers', () => {
    const event = {
      type: undefined, user: { id: 'u', ip_address: '1.2.3.4' }, breadcrumbs: [{ message: 'click' }],
      request: { url: 'https://birdnet-nu.vercel.app/#/walks/0a1b2c3d-0000-4000-8000-000000000001', headers: { Cookie: 'x' } },
      exception: { values: [{ type: 'Error', value: 'Failed on /v1/walks/0a1b2c3d-0000-4000-8000-000000000001' }] },
    } as unknown as ErrorEvent;
    const cleaned = withoutPersonalData(event);
    expect(cleaned.user).toBeUndefined();
    expect(cleaned.breadcrumbs).toBeUndefined();
    expect(cleaned.request).toEqual({ url: 'https://birdnet-nu.vercel.app/#/walks' });
    expect(cleaned.exception?.values?.[0]?.value).toBe('Failed on /v1/walks/{id}');
  });
});
