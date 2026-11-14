export function readAuthConfig(env) {
  const required = ['GITHUB_CLIENT_ID', 'GITHUB_CLIENT_SECRET', 'JWT_SECRET', 'PUBLIC_APP_URL', 'GITHUB_CALLBACK_URL'];
  const missing = required.filter((name) => !env[name]?.trim());
  if (missing.length) throw new Error(`Authentication configuration missing: ${missing.join(', ')}`);
  if (Buffer.byteLength(env.JWT_SECRET) < 32) {
    throw new Error('JWT_SECRET must contain at least 32 bytes of random secret data.');
  }

  const appUrl = new URL(env.PUBLIC_APP_URL);
  const callbackUrl = new URL(env.GITHUB_CALLBACK_URL);
  if (appUrl.protocol !== 'https:' || appUrl.username || appUrl.password ||
      appUrl.pathname !== '/' || appUrl.search || appUrl.hash) {
    throw new Error('PUBLIC_APP_URL must be an HTTPS origin without a path, query or credentials.');
  }
  if (callbackUrl.href !== `${appUrl.origin}/api/auth/github/callback`) {
    throw new Error('GITHUB_CALLBACK_URL must be PUBLIC_APP_URL plus /api/auth/github/callback.');
  }

  return {
    clientId: env.GITHUB_CLIENT_ID,
    clientSecret: env.GITHUB_CLIENT_SECRET,
    jwtSecret: env.JWT_SECRET,
    appOrigin: appUrl.origin,
    callbackUrl: callbackUrl.href,
  };
}
