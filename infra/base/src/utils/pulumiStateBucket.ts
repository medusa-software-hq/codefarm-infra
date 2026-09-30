import * as gcp from '@pulumi/gcp';
import * as pulumi from '@pulumi/pulumi';

/** Declares a protected, versioned bucket for a stack's Pulumi state. */
export function pulumiStateBucket(
  name: string,
  project: pulumi.Input<string>,
  bucketName: pulumi.Input<string>,
  location: string,
  opts?: pulumi.CustomResourceOptions,
): gcp.storage.Bucket {
  return new gcp.storage.Bucket(
    name,
    {
      project,
      name: bucketName,
      location,
      uniformBucketLevelAccess: true,
      publicAccessPrevention: 'enforced',
      versioning: { enabled: true },
      lifecycleRules: [
        {
          action: { type: 'Delete' },
          condition: { daysSinceNoncurrentTime: 90 },
        },
      ],
      // Must never be zero; together with versioning, it allows recovering overwritten state
      softDeletePolicy: { retentionDurationSeconds: 7 * 24 * 60 * 60 },
    },
    { protect: true, retainOnDelete: true, ...opts },
  );
}
