import * as cloudflare from '@pulumi/cloudflare';
import * as gcp from '@pulumi/gcp';
import * as pulumi from '@pulumi/pulumi';

/** The project this stack manages, as configured for the stack. */
const project = gcp.organizations.getProjectOutput({});

export const projectNumber = project.number;

const config = new pulumi.Config();

/** The environment's Cloudflare account. */
const cloudflareAccountId = config.require('cloudflareAccountId');

/** The environment's domain, whose zone is created by hand in the account. */
const domain = config.require('domain');

const cloudflareZoneId = config.require('cloudflareZoneId');

const hostname = `app.${domain}`;

const environment = pulumi.getStack();

const page = `<!doctype html><title>Codefarm</title><h1>Hello from Codefarm's ${environment}</h1>`;

/** Serves a placeholder page, until Codefarm itself is deployed. */
const worker = new cloudflare.WorkersScript('worker', {
  accountId: cloudflareAccountId,
  // The account and the domain already name the environment
  scriptName: 'app',
  mainModule: 'worker.js',
  content: `export default {
  fetch: () => new Response(${JSON.stringify(page)}, {
    headers: { 'content-type': 'text/html; charset=utf-8' },
  }),
};
`,
  compatibilityDate: '2026-10-01',
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

/** Anyone in the organization, the same in every solution's accounts. */
const organizationMembers = new cloudflare.ZeroTrustAccessPolicy('organization-members', {
  accountId: cloudflareAccountId,
  name: 'Organization members',
  decision: 'allow',
  includes: [{ emailDomain: { domain: 'medusa.software' } }],
});

/** Signs people in before a request reaches the Worker, through any of the account's login methods. */
new cloudflare.ZeroTrustAccessApplication('app', {
  accountId: cloudflareAccountId,
  name: 'app',
  type: 'self_hosted',
  destinations: [{ type: 'public', uri: hostname }],
  policies: [{ id: organizationMembers.id, precedence: 1 }],
});

export const workerName = worker.scriptName;
