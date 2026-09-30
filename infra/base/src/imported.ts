import type * as pulumi from '@pulumi/pulumi';

/** Adopts a resource that the foundation stack created and handed over. */
// TODO: Remove, once the resources are adopted
export function imported(id: string): pulumi.CustomResourceOptions {
  return { import: id };
}
