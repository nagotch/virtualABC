import { Hono } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import db from '../db';
import {
  TRAQ_AUTH_URL,
  exchangeCodeForToken,
  generateCodeChallenge,
  generateCodeVerifier,
  generateState,
  getTraqMe,
} from '../auth';
import { isAdmin } from '../admin';

const CLIENT_ID     = process.env.TRAQ_CLIENT_ID ?? '';
const CLIENT_SECRET = process.env.TRAQ_CLIENT_SECRET ?? '';
const REDIRECT_URI  = process.env.TRAQ_REDIRECT_URI ?? 'http://localhost:3000/api/auth/callback';

// In-memory store for PKCE state (code_verifier + state)
// Keyed by state value; entries are short-lived
const pkceStore = new Map<string, { codeVerifier: string }>();

const app = new Hono();

// GET /api/auth/login → redirect to traQ OAuth2
app.get('/login', async (c) => {
  const codeVerifier  = generateCodeVerifier();
  const codeChallenge = await generateCodeChallenge(codeVerifier);
  const state         = generateState();

  pkceStore.set(state, { codeVerifier });
  // Clean up after 10 minutes
  setTimeout(() => pkceStore.delete(state), 10 * 60 * 1000);

  const url = new URL(TRAQ_AUTH_URL);
  url.searchParams.set('response_type',          'code');
  url.searchParams.set('client_id',              CLIENT_ID);
  url.searchParams.set('redirect_uri',           REDIRECT_URI);
  url.searchParams.set('state',                  state);
  url.searchParams.set('scope',                  'openid profile');
  url.searchParams.set('code_challenge',         codeChallenge);
  url.searchParams.set('code_challenge_method',  'S256');

  return c.redirect(url.toString());
});

// GET /api/auth/callback → exchange code → create session
app.get('/callback', async (c) => {
  const { code, state } = c.req.query();

  const entry = pkceStore.get(state);
  if (!entry) return c.json({ error: 'invalid state' }, 400);
  pkceStore.delete(state);

  let token: Awaited<ReturnType<typeof exchangeCodeForToken>>;
  try {
    token = await exchangeCodeForToken(
      code, entry.codeVerifier, REDIRECT_URI, CLIENT_ID, CLIENT_SECRET,
    );
  } catch (e) {
    console.error('[auth] token exchange failed:', e);
    return c.json({ error: 'token exchange failed' }, 500);
  }

  console.log('[auth] token scope:', token.scope, 'has id_token:', !!token.id_token);

  let me: { name: string };
  try {
    me = await getTraqMe(token);
  } catch (e) {
    console.error('[auth] failed to get user info:', e);
    return c.json({ error: 'failed to get user info' }, 500);
  }

  // Create session
  const sessionId = generateState(); // reuse random generator
  db.run(
    'INSERT OR REPLACE INTO sessions (id, traq_id) VALUES (?, ?)',
    [sessionId, me.name],
  );

  setCookie(c, 'session', sessionId, {
    httpOnly: true,
    sameSite: 'Lax',
    maxAge: 60 * 60 * 24 * 7, // 1 week
  });

  return c.redirect('http://localhost:5173/');
});

// GET /api/auth/me → return current user
app.get('/me', (c) => {
  const sessionId = getCookie(c, 'session');
  if (!sessionId) return c.json({ user: null });

  const row = db.query<{ traq_id: string }, [string]>(
    'SELECT traq_id FROM sessions WHERE id = ?',
  ).get(sessionId);

  if (!row) return c.json({ user: null });

  const userRow = db.query<{ atcoder_id: string }, [string]>(
    'SELECT atcoder_id FROM users WHERE traq_id = ?',
  ).get(row.traq_id);

  return c.json({
    user: {
      traqId:    row.traq_id,
      atcoderId: userRow?.atcoder_id ?? null,
      isAdmin:   isAdmin(row.traq_id),
    },
  });
});

// POST /api/auth/logout
app.post('/logout', (c) => {
  const sessionId = getCookie(c, 'session');
  if (sessionId) {
    db.run('DELETE FROM sessions WHERE id = ?', [sessionId]);
    deleteCookie(c, 'session');
  }
  return c.json({ ok: true });
});

export default app;
