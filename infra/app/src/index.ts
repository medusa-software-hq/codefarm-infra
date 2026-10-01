import * as cloudflare from '@pulumi/cloudflare';
import * as gcp from '@pulumi/gcp';
import * as pulumi from '@pulumi/pulumi';
import { buildSync } from 'esbuild';
import { fileURLToPath } from 'node:url';

/** The project this stack manages, as configured for the stack. */
const project = gcp.organizations.getProjectOutput({});

export const projectNumber = project.number;

const config = new pulumi.Config();

/** The environment's Cloudflare account. */
const cloudflareAccountId = config.require('cloudflareAccountId');

/** The environment's domain, whose zone is created by hand in the account. */
const domain = config.require('domain');

const cloudflareZoneId = config.require('cloudflareZoneId');

/** The account's Zero Trust team domain, set by hand; it signs the Access tokens. */
const accessIssuer = `https://${config.require('accessTeamDomain')}`;

const hostname = `app.${domain}`;

/** Emails a code to the address being signed in, until the organization's Google sign-in. */
const oneTimePin = new cloudflare.ZeroTrustAccessIdentityProvider('one-time-pin', {
  accountId: cloudflareAccountId,
  name: 'One-time PIN',
  type: 'onetimepin',
  config: {},
});

/** Anyone in the organization, the same in every solution's accounts. */
const organizationMembers = new cloudflare.ZeroTrustAccessPolicy('organization-members', {
  accountId: cloudflareAccountId,
  name: 'Organization members',
  decision: 'allow',
  includes: [{ emailDomain: { domain: 'medusa.software' } }],
});

/** Signs people in before a request reaches the Worker. */
const accessApplication = new cloudflare.ZeroTrustAccessApplication('app', {
  accountId: cloudflareAccountId,
  name: 'app',
  type: 'self_hosted',
  destinations: [{ type: 'public', uri: hostname }],
  allowedIdps: [oneTimePin.id],
  // There is one way to sign in, so there is nothing to choose between
  autoRedirectToIdentity: true,
  policies: [{ id: organizationMembers.id, precedence: 1 }],
});

/** The Worker's code, bundled here so that what's uploaded is what was just built. */
function bundleWorker(): string {
  const { outputFiles } = buildSync({
    entryPoints: [fileURLToPath(new URL('../../worker/src/index.ts', import.meta.url))],
    bundle: true,
    format: 'esm',
    platform: 'neutral',
    target: 'es2022',
    write: false,
  });

  const [output] = outputFiles;
  if (output === undefined) {
    throw new Error('Bundling the Worker produced no output');
  }

  return output.text;
}

/** Serves a placeholder page to those Access signed in, until Codefarm itself is deployed. */
const worker = new cloudflare.WorkersScript('worker', {
  accountId: cloudflareAccountId,
  // The account and the domain already name the environment
  scriptName: 'app',
  mainModule: 'worker.js',
  content: bundleWorker(),
  compatibilityDate: '2026-10-01',
  bindings: [
    { name: 'ACCESS_ISSUER', type: 'plain_text', text: accessIssuer },
    // Also orders the two: the application exists before the Worker serves anything
    { name: 'ACCESS_AUDIENCE', type: 'plain_text', text: accessApplication.aud },
    { name: 'ENVIRONMENT', type: 'plain_text', text: pulumi.getStack() },
  ],
});

// Access guards only hostnames it knows, so the Worker's other addresses stay off
new cloudflare.WorkersScriptSubdomain('worker', {
  accountId: cloudflareAccountId,
  scriptName: worker.scriptName,
  enabled: false,
  previewsEnabled: false,
});

// Serves it at app.<domain>; Cloudflare adds the DNS record and the certificate
new cloudflare.WorkersCustomDomain('worker', {
  accountId: cloudflareAccountId,
  zoneId: cloudflareZoneId,
  hostname,
  service: worker.scriptName,
});

export const workerName = worker.scriptName;
