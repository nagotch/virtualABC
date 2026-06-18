// traQ OAuth2 Authorization Code Flow with PKCE

export const TRAQ_AUTH_URL   = 'https://q.trap.jp/api/v3/oauth2/authorize';
export const TRAQ_TOKEN_URL  = 'https://q.trap.jp/api/v3/oauth2/token';
export const TRAQ_ME_URL     = 'https://q.trap.jp/api/v3/users/me';

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

export const exchangeCodeForToken = async (
  code: string,
  codeVerifier: string,
  redirectUri: string,
  clientId: string,
  clientSecret: string,
): Promise<string> => {
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
  const { access_token } = await res.json() as { access_token: string };
  return access_token;
};

export const getTraqMe = async (accessToken: string): Promise<{ name: string }> => {
  const res = await fetch(TRAQ_ME_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`Failed to get user info: ${res.status}`);
  return res.json() as Promise<{ name: string }>;
};
