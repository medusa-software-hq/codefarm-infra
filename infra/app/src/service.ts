import * as gcp from '@pulumi/gcp';
import service from '../artifacts/service.json' with { type: 'json' };

/** What the service runs as; it needs nothing yet. */
const runtime = new gcp.serviceaccount.Account('service-runtime', {
  accountId: 'service-runtime',
  displayName: 'Service runtime',
});

/**
 * The origin behind the edge, running the image `codefarm` built, as pinned by digest. Nobody may
 * invoke it yet.
 */
const cloudRunService = new gcp.cloudrunv2.Service('service', {
  name: 'service',
  location: 'europe-central2',
  // Reached from the edge, over the internet; IAM decides who may invoke it
  ingress: 'INGRESS_TRAFFIC_ALL',
  deletionProtection: false,
  template: {
    serviceAccount: runtime.email,
    scaling: { minInstanceCount: 0, maxInstanceCount: 1 },
    containers: [
      {
        image: service.image,
        resources: { limits: { cpu: '1', memory: '512Mi' }, startupCpuBoost: true },
      },
    ],
  },
});

export const serviceUrl = cloudRunService.uri;
