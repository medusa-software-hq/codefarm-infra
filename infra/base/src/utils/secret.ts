import * as gcp from '@pulumi/gcp';
import * as pulumi from '@pulumi/pulumi';

/** Declares a secret kept in one location; its values are added outside Pulumi. */
export function secret(
  name: string,
  project: pulumi.Input<string>,
  secretId: string,
  location: string,
  opts?: pulumi.CustomResourceOptions,
): gcp.secretmanager.Secret {
  return new gcp.secretmanager.Secret(
    name,
    { project, secretId, replication: { userManaged: { replicas: [{ location }] } } },
    opts,
  );
}
