import * as cloudflare from '@pulumi/cloudflare';
import * as gcp from '@pulumi/gcp';
import * as pulumi from '@pulumi/pulumi';
import artifacts from '../artifacts.json' with { type: 'json' };
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

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

/** The organization's OAuth client, in its Platform project; the same in every solution. */
const googleSignInClientId =
  '841776326242-ck9jaudbgasel060a339gv1gn1o8gngk.apps.googleusercontent.com';

/**
 * Signs people in with their organization's Google account. Its client secret stays out of
 * Pulumi: "Apply app" sets it right after each apply.
 */
const googleWorkspace = new cloudflare.ZeroTrustAccessIdentityProvider(
  'google-workspace',
  {
    accountId: cloudflareAccountId,
    name: 'Google Workspace',
    type: 'google-apps',
    config: {
      appsDomain: 'medusa.software',
      clientId: googleSignInClientId,
      clientSecret: 'set-after-apply',
    },
  },
  { ignoreChanges: ['config.clientSecret'] },
);

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
  allowedIdps: [googleWorkspace.id],
  // There is one way to sign in, so there is nothing to choose between
  autoRedirectToIdentity: true,
  policies: [{ id: organizationMembers.id, precedence: 1 }],
});

/**
 * The app Worker's bundle, as `codefarm` built and uploaded it to the base project's registry.
 * Pinned by its SHA-256, which is also its version there.
 */
const { sha256: appBundleSha256 } = artifacts.edgeApp;

const appBundle = gcp.artifactregistry
  .getFileOutput({
    project: 'codefarm-x-07da3c',
    location: 'europe-central2',
    repositoryId: 'bundles',
    fileId: `edge-app:${appBundleSha256}:worker.js`,
    outputPath: join(tmpdir(), `edge-app-${appBundleSha256}.js`),
  })
  .apply(({ outputPath, outputSha256 }) => {
    if (outputSha256 !== appBundleSha256) {
      throw new Error(`The app bundle's SHA-256 is ${outputSha256}, not ${appBundleSha256}`);
    }
    return readFileSync(outputPath, 'utf8');
  });

/** Serves a placeholder page to those Access signed in, until Codefarm itself is deployed. */
const worker = new cloudflare.WorkersScript('worker', {
  accountId: cloudflareAccountId,
  // The account and the domain already name the environment
  scriptName: 'app',
  mainModule: 'worker.js',
  content: appBundle,
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
