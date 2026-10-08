import * as gcp from '@pulumi/gcp';
import * as pulumi from '@pulumi/pulumi';
import service from '../artifacts/service.json' with { type: 'json' };

const project = new pulumi.Config('gcp').require('project');

/** What the service runs as; it needs nothing yet. */
const runtime = new gcp.serviceaccount.Account('service-runtime', {
  accountId: 'service-runtime',
  displayName: 'Service runtime',
});

/** The origin behind the edge, running the image `codefarm` built, as pinned by digest. */
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
        // Which its logs name their traces by
        envs: [{ name: 'GOOGLE_CLOUD_PROJECT', value: project }],
      },
    ],
  },
});

// The edge, whose identity the base stack created in this project
new gcp.cloudrunv2.ServiceIamMember('edge-invoker', {
  name: cloudRunService.name,
  location: cloudRunService.location,
  role: 'roles/run.invoker',
  member: `serviceAccount:edge-invoker@${project}.iam.gserviceaccount.com`,
});

export const serviceUrl = cloudRunService.uri;
