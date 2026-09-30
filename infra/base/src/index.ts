import { production, staging } from './environments.ts';
import { githubActionsProvider } from './githubPool.ts';
import { imageBuilder } from './project.ts';

export const githubActionsProviderName = githubActionsProvider.name;

export const serviceAccounts = {
  imageBuilder: imageBuilder.email,
  staging: { appProvisioner: staging.appProvisioner.email },
  production: { appProvisioner: production.appProvisioner.email },
};
