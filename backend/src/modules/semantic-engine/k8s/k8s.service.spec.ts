jest.mock('@kubernetes/client-node', () => {
  const mockKubeConfig = jest.fn().mockImplementation(() => ({
    loadFromCluster: jest.fn(),
    loadFromDefault: jest.fn(),
    makeApiClient: jest.fn().mockReturnValue({}),
  }));

  return {
    KubeConfig: mockKubeConfig,
    CoreV1Api: jest.fn(),
    AppsV1Api: jest.fn(),
    V1ConfigMap: jest.fn(),
    V1Deployment: jest.fn(),
    V1Secret: jest.fn(),
    V1Service: jest.fn(),
    V1Pod: jest.fn(),
  };
});

import { K8sService } from './k8s.service';

describe('K8sService', () => {
  it('constructs without throwing when KUBECONFIG env is absent and KUBERNETES_SERVICE_HOST unset', () => {
    // KubeConfig.loadFromDefault() returns an empty config silently; service construction must not throw.
    const original = process.env.KUBERNETES_SERVICE_HOST;
    delete process.env.KUBERNETES_SERVICE_HOST;
    try {
      const s = new K8sService();
      expect(s).toBeDefined();
    } finally {
      if (original !== undefined) process.env.KUBERNETES_SERVICE_HOST = original;
    }
  });
});
