import * as k8s from '@kubernetes/client-node';
import { appsV1Api } from './k8sClient.js';

export async function deployProject(name, image, replicas) {
  const deployment = {
    apiVersion: "apps/v1",
    kind: "Deployment",
    metadata: { name: name },
    spec: {
      replicas: replicas,
      selector: { matchLabels: { app: name } },
      template: {
        metadata: { labels: { app: name } },
        spec: {
          containers: [{
            name: name,
            image: image,
            ports: [{ containerPort: 80 }]
          }]
        }
      }
    }
  };

  await appsV1Api.createNamespacedDeployment({
    namespace: "default",
    body: deployment
  });
}