import * as gcp from '@pulumi/gcp';
import * as pulumi from '@pulumi/pulumi';
import { allowRunsOnBranch, codefarmInfraRepository } from './githubPool.ts';

/**
 * Rotates the app provisioners' tokens, minting them with the minter tokens.
 * Not trusted in the GitHub environments, whose app jobs mustn't reach the minters.
 */
export const secretsRotator = new gcp.serviceaccount.Account('secrets-rotator', {
  accountId: 'secrets-rotator',
  displayName: 'Secrets rotator',
});

allowRunsOnBranch('secrets-rotator-github', secretsRotator, codefarmInfraRepository, 'main');

export const secretsRotatorMember = pulumi.interpolate`serviceAccount:${secretsRotator.email}`;
