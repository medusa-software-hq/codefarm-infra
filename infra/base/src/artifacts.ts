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

/** Both repositories, by the names their access is declared under. */
const repositories = { images: imagesRepository, bundles: bundlesRepository };

function allow(
  namePrefix: string,
  role: string,
  member: pulumi.Input<string>,
  opts?: pulumi.CustomResourceOptions,
): void {
  for (const [key, repository] of Object.entries(repositories)) {
    new gcp.artifactregistry.RepositoryIamMember(
      `${namePrefix}-${key}`,
      { location: repository.location, repository: repository.name, role, member },
      opts,
    );
  }
}

/** Lets the member download any of the artifacts. */
export function allowArtifactReads(
  namePrefix: string,
  member: pulumi.Input<string>,
  opts?: pulumi.CustomResourceOptions,
): void {
  allow(namePrefix, 'roles/artifactregistry.reader', member, opts);
}

allow(
  'artifact-builder',
  'roles/artifactregistry.writer',
  pulumi.interpolate`serviceAccount:${artifactBuilder.email}`,
);

allowArtifactReads('reader', reader);
