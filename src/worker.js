import { handleAuth } from './api/auth.js';
import { handleCallback } from './api/callback.js';

export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);

    if (pathname === '/api/auth') return handleAuth(request, env);
    if (pathname === '/api/callback') return handleCallback(request, env);

    return env.ASSETS.fetch(request);
  },
};
