import { test } from 'node:test';
import assert from 'node:assert/strict';
import { injectAuth } from '../src/auth-injector.ts';

test('injects API key into header', () => {
  const out = injectAuth(
    { url: new URL('http://x/y'), headers: {} },
    { API_KEY_NAME: 'X-API-Key', API_KEY_VALUE: 'sk-1', API_KEY_LOCATION: 'header' },
  );
  assert.equal(out.headers['X-API-Key'], 'sk-1');
  assert.equal(out.url.toString(), 'http://x/y');
});

test('injects API key into query string', () => {
  const out = injectAuth(
    { url: new URL('http://x/y'), headers: {} },
    { API_KEY_NAME: 'apiKey', API_KEY_VALUE: 'sk-1', API_KEY_LOCATION: 'query' },
  );
  assert.equal(out.url.searchParams.get('apiKey'), 'sk-1');
  assert.equal(out.headers['apiKey'], undefined);
});

test('injects bearer token into Authorization header', () => {
  const out = injectAuth(
    { url: new URL('http://x/y'), headers: {} },
    { BEARER_TOKEN: 't0' },
  );
  assert.equal(out.headers['Authorization'], 'Bearer t0');
});

test('injects OAuth access token into Authorization header', () => {
  const out = injectAuth(
    { url: new URL('http://x/y'), headers: {} },
    { OAUTH_ACCESS_TOKEN: 'a0' },
  );
  assert.equal(out.headers['Authorization'], 'Bearer a0');
});

test('does nothing when no auth env provided', () => {
  const out = injectAuth({ url: new URL('http://x/y'), headers: {} }, {});
  assert.deepEqual(out.headers, {});
});
