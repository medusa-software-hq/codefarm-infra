import * as cloudflare from '@pulumi/cloudflare';
import * as gcp from '@pulumi/gcp';
import * as pulumi from '@pulumi/pulumi';

const config = new pulumi.Config();

/** The Cloudflare account of the environment. */
const cloudflareAccountId = config.require('cloudflareAccountId');

const secretManagerApi = new gcp.projects.Service('secret-manager-api', {
  service: 'secretmanager.googleapis.com',
  disableOnDestroy: false,
});

/** Cloudflare's "Workers Scripts Write" permission group ("Workers Scripts Edit" in the dashboard), the same in every account. */
const workersScriptsWrite = 'e086da7e2179491d91ee5f35b3ca210a';

/** Lets the app stack manage the environment's Workers. */
const appApplyToken = new cloudflare.AccountToken('app-apply-token', {
  accountId: cloudflareAccountId,
  name: 'app-apply',
  policies: [
    {
      effect: 'allow',
      permissionGroups: [{ id: workersScriptsWrite }],
      resources: JSON.stringify({ [`com.cloudflare.api.account.${cloudflareAccountId}`]: '*' }),
    },
  ],
});

/** Where the app stack's apply job reads its Cloudflare token from. */
const appApplyTokenSecret = new gcp.secretmanager.Secret(
  'app-apply-token',
  { secretId: 'cloudflare-app-apply-token', replication: { auto: {} } },
  { dependsOn: [secretManagerApi] },
);

new gcp.secretmanager.SecretVersion('app-apply-token', {
  secret: appApplyTokenSecret.id,
  secretData: appApplyToken.value,
});

export const appApplyTokenSecretId = appApplyTokenSecret.secretId;
