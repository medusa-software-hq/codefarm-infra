import * as gcp from '@pulumi/gcp';
import * as pulumi from '@pulumi/pulumi';
import { allowRunsInEnvironment, codefarmInfraRepository } from './githubPool.ts';
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
    },
  );

  const appProvisionerMember = `serviceAccount:app-provisioner@${projectId}.iam.gserviceaccount.com`;

  new gcp.projects.IAMMember(
    `${name}-app-provisioner-owner`,
    { project: projectId, role: 'roles/owner', member: appProvisionerMember },
    { provider },
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
    { provider },
  );

  new gcp.storage.BucketIAMMember(
    `${name}-reader-app-state`,
    { bucket: appStateBucketResource.name, role: 'roles/storage.objectViewer', member: reader },
    { provider },
  );

  new gcp.projects.IAMMember(
    `${name}-reader-viewer`,
    { project: projectId, role: 'roles/viewer', member: reader },
    { provider },
  );

  const kmsApi = new gcp.projects.Service(
    `${name}-kms-api`,
    { project: projectId, service: 'cloudkms.googleapis.com', disableOnDestroy: false },
    { provider },
  );

  // TODO: Remove; that destroys the key's versions and only forgets the ring
  const keyRing = new gcp.kms.KeyRing(
    `${name}-pulumi-key-ring`,
    { project: projectId, name: 'pulumi', location: primaryLocation },
    { provider, dependsOn: [kmsApi] },
  );

  new gcp.kms.CryptoKey(
    `${name}-pulumi-secrets-key`,
    { keyRing: keyRing.id, name: 'secrets' },
    { provider },
  );

  return { appProvisioner };
}

const environments = new pulumi.Config().requireObject<{
  staging: EnvironmentConfig;
  production: EnvironmentConfig;
}>('environments');

export const staging = codefarmEnvironment('staging', environments.staging);

export const production = codefarmEnvironment('production', environments.production);
