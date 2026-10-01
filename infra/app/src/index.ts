import * as cloudflare from '@pulumi/cloudflare';
import * as gcp from '@pulumi/gcp';
import * as pulumi from '@pulumi/pulumi';

/** The project this stack manages, as configured for the stack. */
const project = gcp.organizations.getProjectOutput({});

export const projectNumber = project.number;

/** The environment's Cloudflare account. */
const cloudflareAccountId = new pulumi.Config().require('cloudflareAccountId');

const environment = pulumi.getStack();

const page = `<!doctype html><title>Codefarm</title><h1>Hello from Codefarm's ${environment}</h1>`;

/** Serves a placeholder page, until Codefarm itself is deployed. */
const worker = new cloudflare.WorkersScript('worker', {
  accountId: cloudflareAccountId,
  // Named after the environment, so the two accounts' dashboards can't be mistaken for each other
  scriptName: `codefarm-${environment}`,
  mainModule: 'worker.js',
  content: `export default {
  fetch: () => new Response(${JSON.stringify(page)}, {
    headers: { 'content-type': 'text/html; charset=utf-8' },
  }),
};
`,
  compatibilityDate: '2026-10-01',
});

// Serves it at <script>.<account's subdomain>.workers.dev, until Codefarm has a domain
new cloudflare.WorkersScriptSubdomain('worker', {
  accountId: cloudflareAccountId,
  scriptName: worker.scriptName,
  enabled: true,
  previewsEnabled: false,
});

export const workerName = worker.scriptName;
