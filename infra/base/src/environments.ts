import * as gcp from '@pulumi/gcp';
import * as pulumi from '@pulumi/pulumi';
import { allowRunsInEnvironment, codefarmInfraRepository } from './githubPool.ts';
import { primaryLocation, projectId as baseProjectId, reader } from './project.ts';
import { secretsRotatorMember } from './secrets.ts';
import { pulumiStateBucket } from './utils/pulumiStateBucket.ts';
import { secret } from './utils/secret.ts';

/** One of Codefarm's environments, as configured for this stack. */
interface EnvironmentConfig {
  readonly projectId: string;
  readonly appStateBucket: string;
}

/** Declares what an environment needs besides the app itself. */
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

  // The foundation keeps the environment's Cloudflare minter token in the base project
  new gcp.secretmanager.SecretIamMember(`cloudflare-${name}-minter-token-rotator`, {
    secretId: `projects/${baseProjectId}/secrets/cloudflare-${name}-minter-token`,
    role: 'roles/secretmanager.secretAccessor',
    member: secretsRotatorMember,
  });

  const secretManagerApi = new gcp.projects.Service(
    `${name}-secret-manager-api`,
    { project: projectId, service: 'secretmanager.googleapis.com', disableOnDestroy: false },
    { provider },
  );

  /** Lets the app stack manage the environment's Workers; kept here, like the app's other inputs. */
  const appProvisionerToken = secret(
    `${name}-cloudflare-app-provisioner-token`,
    projectId,
    'cloudflare-app-provisioner-token',
    primaryLocation,
    { provider, dependsOn: [secretManagerApi] },
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

  return { appProvisioner };
}

const environments = new pulumi.Config().requireObject<{
  staging: EnvironmentConfig;
  production: EnvironmentConfig;
}>('environments');

export const staging = codefarmEnvironment('staging', environments.staging);

export const production = codefarmEnvironment('production', environments.production);
