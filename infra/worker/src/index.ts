import { createRemoteJWKSet, errors, jwtVerify } from 'jose';

/** What the app stack binds to the Worker. */
interface Env {
  /** Who signs the Access tokens: the account's team domain. */
  readonly ACCESS_ISSUER: string;
  /** The audience of the Access application in front of the Worker. */
  readonly ACCESS_AUDIENCE: string;
  readonly ENVIRONMENT: string;
}

/** The issuer's published keys, kept between requests so they aren't fetched for each one. */
let keys:
  | { readonly issuer: string; readonly keySet: ReturnType<typeof createRemoteJWKSet> }
  | undefined;

function keySetOf(issuer: string): ReturnType<typeof createRemoteJWKSet> {
  if (keys?.issuer !== issuer) {
    keys = { issuer, keySet: createRemoteJWKSet(new URL(`${issuer}/cdn-cgi/access/certs`)) };
  }

  return keys.keySet;
}

/**
 * Whether Access signed the request in for this application. Cloudflare recommends checking,
 * since a request may reach the Worker without passing Access, e.g. through a misconfiguration.
 */
async function isSignedIn(request: Request, env: Env): Promise<boolean> {
  const token = request.headers.get('cf-access-jwt-assertion');
  if (token === null) {
    return false;
  }

  try {
    await jwtVerify(token, keySetOf(env.ACCESS_ISSUER), {
      issuer: env.ACCESS_ISSUER,
      audience: env.ACCESS_AUDIENCE,
      algorithms: ['RS256'],
    });
    return true;
  } catch (error) {
    // Other errors, like the keys being unreachable, are an outage rather than a bad token
    if (error instanceof errors.JOSEError) {
      return false;
    }
    throw error;
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (!(await isSignedIn(request, env))) {
      return new Response('Forbidden', { status: 403 });
    }

    return new Response(
      `<!doctype html><title>Codefarm</title><h1>Hello from Codefarm's ${env.ENVIRONMENT}</h1>`,
      { headers: { 'content-type': 'text/html; charset=utf-8' } },
    );
  },
};
