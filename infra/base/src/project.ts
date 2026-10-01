import * as gcp from '@pulumi/gcp';
import * as pulumi from '@pulumi/pulumi';
import { allowRunsOnBranch, codefarmRepository } from './githubPool.ts';

/** The base project, which this stack manages. */
export const projectId = new pulumi.Config('gcp').require('project');

/** The default location for regional resources. */
export const primaryLocation = 'europe-central2';

/** The foundation's read-only identity, which previews Codefarm's stacks. */
export const reader = `serviceAccount:reader@${projectId}.iam.gserviceaccount.com`;

/** Uploads what `codefarm` builds from the application code: images and Worker bundles. */
export const artifactBuilder = new gcp.serviceaccount.Account('artifact-builder', {
  accountId: 'artifact-builder',
  displayName: 'Artifact builder',
});

allowRunsOnBranch('artifact-builder-github', artifactBuilder, codefarmRepository, 'main');
