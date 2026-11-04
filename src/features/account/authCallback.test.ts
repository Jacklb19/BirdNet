import { describe, expect, it } from 'vitest';
import { readAuthCallbackError, readStrandedCode } from './authCallback';

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
    expect(readAuthCallbackError(failed)).toEqual({ failure: 'returnFailed', detail: 'unexpected_failure' });
    expect(readAuthCallbackError(`${SITE}/?error=access_denied&error_description=Database+error+saving+new+user`)).toEqual({ failure: 'returnFailed', detail: 'access_denied' });
    expect(readAuthCallbackError(`${SITE}/#error=access_denied`)).toEqual({ failure: 'returnFailed', detail: 'access_denied' });
    expect(readAuthCallbackError(`${SITE}/#error_description=x`)).toEqual({ failure: 'returnFailed', detail: null });
  });

  it('tells an e-mail link that expired from any other failure', () => {
    expect(readAuthCallbackError(`${SITE}/#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired`))
      .toEqual({ failure: 'linkExpired', detail: 'otp_expired' });
  });

  it('never shows text that a link to Trino could carry, only an error code', () => {
    const forged = `${SITE}/#error=Tu+cuenta+fue+bloqueada.+Llama+al+300...&error_description=Escribe+tu+clave+en+evil.example`;
    expect(readAuthCallbackError(forged)).toEqual({ failure: 'returnFailed', detail: null });
    expect(readAuthCallbackError(`${SITE}/#error=${'a'.repeat(61)}`)?.detail).toBeNull();
  });
});

describe('readStrandedCode', () => {
  const KEY = 'sb-project-auth-token';
  const storage = (keys: readonly string[]): Pick<Storage, 'getItem'> => ({ getItem: (key) => (keys.includes(key) ? 'verifier' : null) });

  it('leaves alone a visit without a code and a code this browser can exchange', () => {
    expect(readStrandedCode(`${SITE}/#/account`, storage([]), KEY)).toBeNull();
    expect(readStrandedCode(`${SITE}/?code=abc#/account`, storage([`${KEY}-code-verifier`]), KEY)).toBeNull();
    expect(readStrandedCode(`${SITE}/?code=abc&sb_flow_id=f1`, storage([`${KEY}-flow-f1-code-verifier`]), KEY)).toBeNull();
  });

  // A confirmation or recovery link opened on another phone or browser than the one that asked for it.
  it('reports a code no verifier of this browser can exchange', () => {
    expect(readStrandedCode(`${SITE}/?code=abc#/account`, storage([]), KEY)).toEqual({ failure: 'otherBrowser', detail: null });
    expect(readStrandedCode(`${SITE}/?code=abc&sb_flow_id=f2`, storage([`${KEY}-flow-f1-code-verifier`]), KEY)).toEqual({ failure: 'otherBrowser', detail: null });
  });
});
