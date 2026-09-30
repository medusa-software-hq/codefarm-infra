import * as gcp from '@pulumi/gcp';
import * as pulumi from '@pulumi/pulumi';

/** The GitHub organization owning Codefarm's repositories. */
const githubOrganization = {
  name: 'medusa-software-hq',
  id: '243778050',
};

/** A GitHub repository, identified by its immutable ID as well as its name. */
export interface GithubRepository {
  readonly name: string;
  readonly id: string;
}

/** The repository of Codefarm's infrastructure. */
export const codefarmInfraRepository: GithubRepository = {
  name: 'codefarm-infra',
  id: '1389872325',
};

/** The repository of Codefarm's application code. */
export const codefarmRepository: GithubRepository = { name: 'codefarm', id: '1389872450' };

const stsApi = new gcp.projects.Service('sts-api', {
  service: 'sts.googleapis.com',
  disableOnDestroy: false,
});

/** The trust domain for tokens GitHub issues to Codefarm's workflows. */
const githubPool = new gcp.iam.WorkloadIdentityPool(
  'github',
  { workloadIdentityPoolId: 'github', displayName: 'GitHub' },
  { dependsOn: [stsApi] },
);

/** Accepts OIDC tokens that GitHub Actions issues for Codefarm's repositories only. */
export const githubActionsProvider = new gcp.iam.WorkloadIdentityPoolProvider('github-actions', {
  workloadIdentityPoolId: githubPool.workloadIdentityPoolId,
  workloadIdentityPoolProviderId: 'github-actions',
  displayName: 'GitHub Actions',
  oidc: { issuerUri: 'https://token.actions.githubusercontent.com' },
  // The subject is what principals match, so it must stay in sync with `repositorySubject()`
  attributeMapping: { 'google.subject': 'assertion.sub' },
  attributeCondition: `assertion.repository_owner_id == "${githubOrganization.id}" && assertion.repository_id in ["${codefarmInfraRepository.id}", "${codefarmRepository.id}"]`,
});

/** GitHub's OIDC subject prefix for a repository's runs, whose IDs a re-registered name can't match. */
function repositorySubject(repository: GithubRepository): string {
  return `repo:${githubOrganization.name}@${githubOrganization.id}/${repository.name}@${repository.id}`;
}

function allow(
  name: string,
  serviceAccount: gcp.serviceaccount.Account,
  subject: string,
  opts?: pulumi.CustomResourceOptions,
): gcp.serviceaccount.IAMMember {
  return new gcp.serviceaccount.IAMMember(
    name,
    {
      serviceAccountId: serviceAccount.name,
      role: 'roles/iam.workloadIdentityUser',
      member: pulumi.interpolate`principal://iam.googleapis.com/${githubPool.name}/subject/${subject}`,
    },
    opts,
  );
}

/** Lets the repository's runs on the branch act as the service account. */
export function allowRunsOnBranch(
  name: string,
  serviceAccount: gcp.serviceaccount.Account,
  repository: GithubRepository,
  branch: string,
  opts?: pulumi.CustomResourceOptions,
): gcp.serviceaccount.IAMMember {
  return allow(
    name,
    serviceAccount,
    `${repositorySubject(repository)}:ref:refs/heads/${branch}`,
    opts,
  );
}

/**
 * Lets the repository's runs in a GitHub environment act as the service account.
 * Which branches may use the environment is up to its settings in GitHub.
 */
export function allowRunsInEnvironment(
  name: string,
  serviceAccount: gcp.serviceaccount.Account,
  repository: GithubRepository,
  environment: string,
  opts?: pulumi.CustomResourceOptions,
): gcp.serviceaccount.IAMMember {
  return allow(
    name,
    serviceAccount,
    `${repositorySubject(repository)}:environment:${environment}`,
    opts,
  );
}
