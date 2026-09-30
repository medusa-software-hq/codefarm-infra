import * as gcp from '@pulumi/gcp';
import * as pulumi from '@pulumi/pulumi';
import { production, staging } from './environments.ts';
import { allowRunsOnBranch, codefarmInfraRepository } from './githubPool.ts';
import { primaryLocation } from './project.ts';

// The secrets' values stay out of Pulumi; humans and the rotation workflow add them as versions

/** The organization's admins, who add the minter tokens they create in Cloudflare. */
const organizationAdmins = 'group:gcp-organization-admins@medusa.software';

/**
 * Rotates the app's tokens, minting them with the minter tokens.
 * Not trusted in the GitHub environments, whose app jobs mustn't reach the minters.
 */
const secretsRotator = new gcp.serviceaccount.Account('secrets-rotator', {
  accountId: 'secrets-rotator',
  displayName: 'Secrets rotator',
});

allowRunsOnBranch('secrets-rotator-github', secretsRotator, codefarmInfraRepository, 'main');

const secretsRotatorMember = pulumi.interpolate`serviceAccount:${secretsRotator.email}`;

function secretManagerApi(name: string, opts?: pulumi.CustomResourceOptions) {
  return new gcp.projects.Service(
    name,
    { service: 'secretmanager.googleapis.com', disableOnDestroy: false },
    opts,
  );
}

function secret(name: string, secretId: string, opts: pulumi.CustomResourceOptions) {
  return new gcp.secretmanager.Secret(
    name,
    { secretId, replication: { userManaged: { replicas: [{ location: primaryLocation }] } } },
    opts,
  );
}

const baseSecretManagerApi = secretManagerApi('secret-manager-api');

/**
 * Declares the Cloudflare tokens of an environment's account: the minter is this stack's,
 * the app's token is kept in the environment's project, like the app's other inputs.
 */
function cloudflareSecrets(name: string, { provider, appProvisioner }: typeof staging) {
  /** Mints the app's tokens; it can manage the account's tokens only. */
  const minterToken = secret(`cloudflare-${name}-minter-token`, `cloudflare-${name}-minter-token`, {
    dependsOn: [baseSecretManagerApi],
  });

  new gcp.secretmanager.SecretIamMember(`cloudflare-${name}-minter-token-admins`, {
    secretId: minterToken.id,
    role: 'roles/secretmanager.secretVersionAdder',
    member: organizationAdmins,
  });

  new gcp.secretmanager.SecretIamMember(`cloudflare-${name}-minter-token-rotator`, {
    secretId: minterToken.id,
    role: 'roles/secretmanager.secretAccessor',
    member: secretsRotatorMember,
  });

  const api = secretManagerApi(`${name}-secret-manager-api`, { provider });

  /** Lets the app stack manage the account's Workers. */
  const appProvisionerToken = secret(
    `${name}-cloudflare-app-provisioner-token`,
    'cloudflare-app-provisioner-token',
    {
      provider,
      dependsOn: [api],
    },
  );

  new gcp.secretmanager.SecretIamMember(
    `${name}-cloudflare-app-provisioner-token-rotator`,
    {
      secretId: appProvisionerToken.id,
      role: 'roles/secretmanager.secretVersionManager',
      member: secretsRotatorMember,
    },
    { provider },
  );

  new gcp.secretmanager.SecretIamMember(
    `${name}-cloudflare-app-provisioner-token-app-provisioner`,
    {
      secretId: appProvisionerToken.id,
      role: 'roles/secretmanager.secretAccessor',
      member: pulumi.interpolate`serviceAccount:${appProvisioner.email}`,
    },
    { provider },
  );
}

cloudflareSecrets('staging', staging);

cloudflareSecrets('production', production);

export { secretsRotator };
