import type { AuthEnv } from './types.js';

export interface PreparedRequest {
  url: URL;
  headers: Record<string, string>;
}

export function injectAuth(req: PreparedRequest, env: AuthEnv): PreparedRequest {
  if (env.API_KEY_VALUE && env.API_KEY_NAME) {
    if (env.API_KEY_LOCATION === 'query') {
      req.url.searchParams.set(env.API_KEY_NAME, env.API_KEY_VALUE);
    } else {
      req.headers[env.API_KEY_NAME] = env.API_KEY_VALUE;
    }
  }
  if (env.BEARER_TOKEN) {
    req.headers['Authorization'] = `Bearer ${env.BEARER_TOKEN}`;
  }
  if (env.OAUTH_ACCESS_TOKEN) {
    req.headers['Authorization'] = `Bearer ${env.OAUTH_ACCESS_TOKEN}`;
  }
  return req;
}
