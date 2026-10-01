import { production, staging } from './environments.ts';
import { githubActionsProvider } from './githubPool.ts';
import { artifactBuilder } from './project.ts';
import { secretsRotator } from './secrets.ts';

export const githubActionsProviderName = githubActionsProvider.name;

export const serviceAccounts = {
  artifactBuilder: artifactBuilder.email,
  secretsRotator: secretsRotator.email,
  staging: { appProvisioner: staging.appProvisioner.email },
  production: { appProvisioner: production.appProvisioner.email },
};
