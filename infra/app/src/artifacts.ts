import * as gcp from '@pulumi/gcp';
import type * as pulumi from '@pulumi/pulumi';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * Downloads a file `codefarm` uploaded to the base project's `bundles` repository, versioned by
 * its SHA-256 as pinned in `artifacts/`, and checks it against that. Resolves to its local path.
 */
export function downloadArtifact(
  packageName: string,
  sha256: string,
  fileName: string,
): pulumi.Output<string> {
  return gcp.artifactregistry
    .getFileOutput({
      project: 'codefarm-x-07da3c',
      location: 'europe-central2',
      repositoryId: 'bundles',
      fileId: `${packageName}:${sha256}:${fileName}`,
      outputPath: join(tmpdir(), `${packageName}-${sha256}-${fileName}`),
    })
    .apply(({ outputPath, outputSha256 }) => {
      if (outputSha256 !== sha256) {
        throw new Error(`${packageName}'s SHA-256 is ${outputSha256}, not the pinned ${sha256}`);
      }

      return outputPath;
    });
}
