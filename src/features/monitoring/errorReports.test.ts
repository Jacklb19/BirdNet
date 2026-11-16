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

  it('never carry the tokens of a sign-in or recovery link', () => {
    const link = 'https://birdnet-nu.vercel.app/#access_token=eyJhbGciOiJIUzI1NiJ9.e30.c2ln&refresh_token=abc123&type=recovery';
    expect(cleanUrl(link)).toBe('https://birdnet-nu.vercel.app/');
  });

  it('never carry a token quoted in an error message', () => {
    const event = {
      type: undefined, message: 'Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ4In0.c2lnbmF0dXJl rejected',
      exception: { values: [{ type: 'Error', value: 'Failed on /#access_token=abc.def&refresh_token=r3fr3sh&type=recovery' }] },
    } as unknown as ErrorEvent;
    const cleaned = withoutPersonalData(event);
    expect(cleaned.message).toBe('[redacted]');
    expect(cleaned.exception?.values?.[0]?.value).toBe('[redacted]');
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
    expect(cleaned.exception?.values?.[0]?.value).toBe('[redacted]');
  });

  it('drops arbitrary private text and unknown metadata while retaining the error location', () => {
    const privateText = 'A private note, question and person@example.invalid';
    const cleaned = withoutPersonalData({
      type: undefined, event_id: 'event', level: 'error', message: privateText,
      extra: { note: privateText }, contexts: { question: { text: privateText } }, tags: { owner: privateText },
      logentry: { message: privateText, params: [privateText] },
      exception: { values: [{ type: 'TypeError', value: privateText, mechanism: { type: privateText },
        stacktrace: { frames: [{ filename: 'screen.tsx', function: 'render', lineno: 12, in_app: true,
          vars: { note: privateText }, pre_context: [privateText], context_line: privateText, post_context: [privateText] }] } }] },
    });
    expect(JSON.stringify(cleaned)).not.toContain(privateText);
    expect(cleaned).toEqual({
      type: undefined, event_id: 'event', level: 'error', message: '[redacted]',
      exception: { values: [{ type: 'TypeError', value: '[redacted]', stacktrace: {
        frames: [{ filename: 'screen.tsx', function: 'render', lineno: 12, in_app: true }],
      } }] },
    });
  });
});
