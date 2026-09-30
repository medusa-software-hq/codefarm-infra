import { production, staging } from './environments.ts';
import { githubActionsProvider } from './githubPool.ts';
import { imageBuilder } from './project.ts';
import { secretsRotator } from './secrets.ts';

export const githubActionsProviderName = githubActionsProvider.name;

export const serviceAccounts = {
  imageBuilder: imageBuilder.email,
  secretsRotator: secretsRotator.email,
  staging: { appProvisioner: staging.appProvisioner.email },
  production: { appProvisioner: production.appProvisioner.email },
};
