// traQ OAuth2 Authorization Code Flow with PKCE

export const TRAQ_AUTH_URL   = 'https://q.trap.jp/api/v3/oauth2/authorize';
export const TRAQ_TOKEN_URL  = 'https://q.trap.jp/api/v3/oauth2/token';
export const TRAQ_ME_URL     = 'https://q.trap.jp/api/v3/users/me/oidc';

export const generateCodeVerifier = (): string => {
  const buf = new Uint8Array(32);
  crypto.getRandomValues(buf);
  return btoa(String.fromCharCode(...buf))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
};

export const generateCodeChallenge = async (verifier: string): Promise<string> => {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(verifier),
  );
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
};

export const generateState = (): string => {
  const buf = new Uint8Array(16);
  crypto.getRandomValues(buf);
  return btoa(String.fromCharCode(...buf))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
};

export type TokenResponse = {
  access_token: string;
  id_token?: string;
  token_type?: string;
  scope?: string;
};

export const exchangeCodeForToken = async (
  code: string,
  codeVerifier: string,
  redirectUri: string,
  clientId: string,
  clientSecret: string,
): Promise<TokenResponse> => {
  const params: Record<string, string> = {
    grant_type:    'authorization_code',
    client_id:     clientId,
    redirect_uri:  redirectUri,
    code,
    code_verifier: codeVerifier,
  };
  if (clientSecret) params.client_secret = clientSecret;

  const res = await fetch(TRAQ_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Token exchange failed: ${res.status} ${body}`);
  }
  return res.json() as Promise<TokenResponse>;
};

// Decode a JWT payload (no signature verification — we trust the token
// because it came directly from traQ's token endpoint over TLS).
const decodeJwtPayload = (jwt: string): Record<string, unknown> => {
  const payload = jwt.split('.')[1];
  if (!payload) throw new Error('Invalid JWT');
  const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
  const json = new TextDecoder().decode(
    Uint8Array.from(atob(base64), (ch) => ch.charCodeAt(0)),
  );
  return JSON.parse(json);
};

// Resolve the traQ username from an OIDC token response.
// Prefer the id_token claims; fall back to the userinfo endpoint.
export const getTraqMe = async (token: TokenResponse): Promise<{ name: string }> => {
  if (token.id_token) {
    const claims = decodeJwtPayload(token.id_token);
    const name =
      (claims.preferred_username as string | undefined) ??
      (claims.name as string | undefined);
    if (name) return { name };
  }

  const res = await fetch(TRAQ_ME_URL, {
    headers: { Authorization: `Bearer ${token.access_token}` },
  });
  if (!res.ok) throw new Error(`Failed to get user info: ${res.status}`);
  const data = await res.json() as Record<string, string>;
  const name = data.preferred_username ?? data.name ?? data.sub;
  if (!name) throw new Error('Could not determine traQ username from userinfo');
  return { name };
};
