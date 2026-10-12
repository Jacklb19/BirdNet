import { describe, expect, it } from 'vitest';
import { readAuthCallbackError } from './authCallback';

const SITE = 'https://trino.example';

describe('readAuthCallbackError', () => {
  it('finds nothing in a normal visit or a successful return', () => {
    expect(readAuthCallbackError(`${SITE}/`)).toBeNull();
    expect(readAuthCallbackError(`${SITE}/#/account`)).toBeNull();
    expect(readAuthCallbackError(`${SITE}/#access_token=a&refresh_token=b&expires_in=3600&token_type=bearer`)).toBeNull();
    expect(readAuthCallbackError('not an address')).toBeNull();
  });

  // The address Supabase really returns to when it cannot finish a Google sign-in.
  it('reads the failure of a return from Google, from the hash or from the query', () => {
    const failed = `${SITE}?error=server_error&error_code=unexpected_failure&error_description=Unable+to+exchange+external+code#error=server_error&error_code=unexpected_failure&error_description=Unable+to+exchange+external+code&sb=`;
    expect(readAuthCallbackError(failed)).toEqual({ failure: 'returnFailed', detail: 'Unable to exchange external code' });
    expect(readAuthCallbackError(`${SITE}/?error=access_denied&error_description=Database+error+saving+new+user`)).toEqual({ failure: 'returnFailed', detail: 'Database error saving new user' });
    expect(readAuthCallbackError(`${SITE}/#error=access_denied`)).toEqual({ failure: 'returnFailed', detail: null });
  });

  it('tells an e-mail link that expired from any other failure', () => {
    expect(readAuthCallbackError(`${SITE}/#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired`))
      .toEqual({ failure: 'linkExpired', detail: 'Email link is invalid or has expired' });
  });

  it('bounds the text taken from the address', () => {
    expect(readAuthCallbackError(`${SITE}/#error=x&error_description=${'a'.repeat(500)}`)?.detail).toHaveLength(200);
  });
});
