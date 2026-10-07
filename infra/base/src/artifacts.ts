import * as gcp from '@pulumi/gcp';
import * as pulumi from '@pulumi/pulumi';
import { artifactBuilder, primaryLocation, reader } from './project.ts';

// What `codefarm` builds, which the app stack references by content: images by digest, bundles by
// their SHA-256 as the version

const artifactRegistryApi = new gcp.projects.Service('artifact-registry-api', {
  service: 'artifactregistry.googleapis.com',
  disableOnDestroy: false,
});

/** The container images of Codefarm's services. */
const imagesRepository = new gcp.artifactregistry.Repository(
  'images',
  {
    repositoryId: 'images',
    location: primaryLocation,
    format: 'DOCKER',
    // A tag always names the same image, though the app stack refers to digests anyway
    dockerConfig: { immutableTags: true },
  },
  { dependsOn: [artifactRegistryApi] },
);

/** The JavaScript bundles of Codefarm's Workers. */
const bundlesRepository = new gcp.artifactregistry.Repository(
  'bundles',
  { repositoryId: 'bundles', location: primaryLocation, format: 'GENERIC' },
  { dependsOn: [artifactRegistryApi] },
);

/** The repositories, by the names their access is declared under. */
const repositories = { images: imagesRepository, bundles: bundlesRepository };

/**
 * Grants the member `roles/artifactregistry.<access>` on the given repositories, all of them by
 * default.
 */
export function allowArtifactAccess(
  namePrefix: string,
  access: 'reader' | 'writer',
  member: pulumi.Input<string>,
  repositoryNames: readonly (keyof typeof repositories)[] = ['images', 'bundles'],
  opts?: pulumi.CustomResourceOptions,
): void {
  for (const repositoryName of repositoryNames) {
    const repository = repositories[repositoryName];

    new gcp.artifactregistry.RepositoryIamMember(
      `${namePrefix}-${repositoryName}`,
      {
        location: repository.location,
        repository: repository.name,
        role: `roles/artifactregistry.${access}`,
        member,
      },
      opts,
    );
  }
}

allowArtifactAccess(
  'artifact-builder',
  'writer',
  pulumi.interpolate`serviceAccount:${artifactBuilder.email}`,
);

allowArtifactAccess('reader', 'reader', reader);
