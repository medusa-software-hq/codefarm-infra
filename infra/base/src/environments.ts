import * as gcp from '@pulumi/gcp';
import * as pulumi from '@pulumi/pulumi';
import { allowRunsInEnvironment, codefarmInfraRepository } from './githubPool.ts';
import { imported } from './imported.ts';
import { primaryLocation, reader } from './project.ts';
import { pulumiStateBucket } from './utils/pulumiStateBucket.ts';

/** One of Codefarm's environments, as configured for this stack. */
interface EnvironmentConfig {
  readonly projectId: string;
  readonly appStateBucket: string;
}

/** Declares what an environment's project holds besides the app itself. */
function codefarmEnvironment(name: string, { projectId, appStateBucket }: EnvironmentConfig) {
  // Counts requests against the environment's project, rather than the base project
  const provider = new gcp.Provider(name, {
    project: projectId,
    billingProject: projectId,
    userProjectOverride: true,
  });

  /** Applies the environment's app stacks. */
  const appProvisioner = new gcp.serviceaccount.Account(
    `${name}-app-provisioner`,
    { project: projectId, accountId: 'app-provisioner', displayName: 'App provisioner' },
    {
      provider,
      ...imported(
        `projects/${projectId}/serviceAccounts/app-provisioner@${projectId}.iam.gserviceaccount.com`,
      ),
    },
  );

  const appProvisionerMember = `serviceAccount:app-provisioner@${projectId}.iam.gserviceaccount.com`;

  new gcp.projects.IAMMember(
    `${name}-app-provisioner-owner`,
    { project: projectId, role: 'roles/owner', member: appProvisionerMember },
    { provider, ...imported(`${projectId} roles/owner ${appProvisionerMember}`) },
  );

  allowRunsInEnvironment(
    `${name}-app-provisioner-github`,
    appProvisioner,
    codefarmInfraRepository,
    name,
    { provider },
  );

  const appStateBucketResource = pulumiStateBucket(
    `${name}-app-state`,
    projectId,
    appStateBucket,
    primaryLocation,
    { provider, ...imported(`${projectId}/${appStateBucket}`) },
  );

  new gcp.storage.BucketIAMMember(
    `${name}-reader-app-state`,
    { bucket: appStateBucketResource.name, role: 'roles/storage.objectViewer', member: reader },
    { provider, ...imported(`b/${appStateBucket} roles/storage.objectViewer ${reader}`) },
  );

  new gcp.projects.IAMMember(
    `${name}-reader-viewer`,
    { project: projectId, role: 'roles/viewer', member: reader },
    { provider, ...imported(`${projectId} roles/viewer ${reader}`) },
  );

  const kmsApi = new gcp.projects.Service(
    `${name}-kms-api`,
    { project: projectId, service: 'cloudkms.googleapis.com', disableOnDestroy: false },
    { provider, ...imported(`${projectId}/cloudkms.googleapis.com`) },
  );

  const keyRingId = `projects/${projectId}/locations/${primaryLocation}/keyRings/pulumi`;

  // Key rings and keys can't be deleted; losing the key would make the secrets unreadable
  const keyRing = new gcp.kms.KeyRing(
    `${name}-pulumi-key-ring`,
    { project: projectId, name: 'pulumi', location: primaryLocation },
    { provider, dependsOn: [kmsApi], protect: true, ...imported(keyRingId) },
  );

  /** Encrypts the data keys of the stacks that keep secrets, like the app's credentials. */
  const secretsKey = new gcp.kms.CryptoKey(
    `${name}-pulumi-secrets-key`,
    { keyRing: keyRing.id, name: 'secrets' },
    { provider, protect: true, ...imported(`${keyRingId}/cryptoKeys/secrets`) },
  );

  new gcp.kms.CryptoKeyIAMMember(
    `${name}-app-provisioner-secrets-key`,
    {
      cryptoKeyId: secretsKey.id,
      role: 'roles/cloudkms.cryptoKeyEncrypterDecrypter',
      member: appProvisionerMember,
    },
    {
      provider,
      ...imported(
        `${keyRingId}/cryptoKeys/secrets roles/cloudkms.cryptoKeyEncrypterDecrypter ${appProvisionerMember}`,
      ),
    },
  );

  /** Generates the data keys that the secrets key encrypts; can't decrypt anything. */
  const dataKeyGenerator = new gcp.serviceaccount.Account(
    `${name}-data-key-generator`,
    { project: projectId, accountId: 'data-key-generator', displayName: 'Data key generator' },
    { provider },
  );

  new gcp.kms.CryptoKeyIAMMember(
    `${name}-data-key-generator-secrets-key`,
    {
      cryptoKeyId: secretsKey.id,
      role: 'roles/cloudkms.cryptoKeyEncrypter',
      member: pulumi.interpolate`serviceAccount:${dataKeyGenerator.email}`,
    },
    { provider },
  );

  allowRunsInEnvironment(
    `${name}-data-key-generator-github`,
    dataKeyGenerator,
    codefarmInfraRepository,
    name,
    { provider },
  );

  return { appProvisioner, dataKeyGenerator };
}

const environments = new pulumi.Config().requireObject<{
  staging: EnvironmentConfig;
  production: EnvironmentConfig;
}>('environments');

export const staging = codefarmEnvironment('staging', environments.staging);

export const production = codefarmEnvironment('production', environments.production);
