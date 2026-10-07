import * as gcp from '@pulumi/gcp';
import * as pulumi from '@pulumi/pulumi';
import { allowRunsOnBranch, codefarmInfraRepository } from './githubPool.ts';
import { projectId } from './project.ts';

/**
 * Rotates the app provisioners' tokens, minting them with the minter tokens, and the edge
 * invokers' keys, and gives the accounts' Google login methods their client secret.
 * Not trusted in the GitHub environments, whose app jobs mustn't reach the minters.
 */
export const secretsRotator = new gcp.serviceaccount.Account('secrets-rotator', {
  accountId: 'secrets-rotator',
  displayName: 'Secrets rotator',
});

allowRunsOnBranch('secrets-rotator-github', secretsRotator, codefarmInfraRepository, 'main');

export const secretsRotatorMember = pulumi.interpolate`serviceAccount:${secretsRotator.email}`;

// The foundation keeps the Google sign-in client's secret in this project
new gcp.secretmanager.SecretIamMember('google-sign-in-client-secret-rotator', {
  secretId: `projects/${projectId}/secrets/google-sign-in-client-secret`,
  role: 'roles/secretmanager.secretAccessor',
  member: secretsRotatorMember,
});
