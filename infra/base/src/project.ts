import * as gcp from '@pulumi/gcp';
import * as pulumi from '@pulumi/pulumi';
import { allowRunsOnBranch, codefarmRepository } from './githubPool.ts';
import { imported } from './imported.ts';

/** The base project, which this stack manages. */
export const projectId = new pulumi.Config('gcp').require('project');

/** The default location for regional resources. */
export const primaryLocation = 'europe-central2';

/** The foundation's read-only identity, which previews Codefarm's stacks. */
export const reader = `serviceAccount:reader@${projectId}.iam.gserviceaccount.com`;

/** Pushes the images built from the application code. */
export const imageBuilder = new gcp.serviceaccount.Account(
  'image-builder',
  { accountId: 'image-builder', displayName: 'Image builder' },
  imported(
    `projects/${projectId}/serviceAccounts/image-builder@${projectId}.iam.gserviceaccount.com`,
  ),
);

allowRunsOnBranch('image-builder-github', imageBuilder, codefarmRepository, 'main');
