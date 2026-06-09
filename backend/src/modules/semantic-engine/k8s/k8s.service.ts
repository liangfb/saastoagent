import { Injectable, Logger } from '@nestjs/common';
import {
  AppsV1Api,
  CoreV1Api,
  KubeConfig,
  V1ConfigMap,
  V1Deployment,
  V1Secret,
  V1Service,
  V1Pod,
} from '@kubernetes/client-node';

@Injectable()
export class K8sService {
  private readonly logger = new Logger(K8sService.name);
  private readonly kc: KubeConfig;
  private readonly core: CoreV1Api;
  private readonly apps: AppsV1Api;

  constructor() {
    this.kc = new KubeConfig();
    if (process.env.KUBERNETES_SERVICE_HOST) {
      this.kc.loadFromCluster();
    } else {
      this.kc.loadFromDefault();
    }
    this.core = this.kc.makeApiClient(CoreV1Api);
    this.apps = this.kc.makeApiClient(AppsV1Api);
  }

  async applyConfigMap(ns: string, cm: V1ConfigMap): Promise<void> {
    const name = cm.metadata?.name;
    if (!name) throw new Error('ConfigMap missing metadata.name');
    try {
      await this.core.replaceNamespacedConfigMap({ name, namespace: ns, body: cm });
    } catch (err: any) {
      if (err?.code === 404) {
        await this.core.createNamespacedConfigMap({ namespace: ns, body: cm });
      } else {
        throw err;
      }
    }
  }

  async applySecret(ns: string, secret: V1Secret): Promise<void> {
    const name = secret.metadata?.name;
    if (!name) throw new Error('Secret missing metadata.name');
    try {
      await this.core.replaceNamespacedSecret({ name, namespace: ns, body: secret });
    } catch (err: any) {
      if (err?.code === 404) {
        await this.core.createNamespacedSecret({ namespace: ns, body: secret });
      } else {
        throw err;
      }
    }
  }

  async applyService(ns: string, svc: V1Service): Promise<void> {
    const name = svc.metadata?.name;
    if (!name) throw new Error('Service missing metadata.name');
    try {
      await this.core.replaceNamespacedService({ name, namespace: ns, body: svc });
    } catch (err: any) {
      if (err?.code === 404) {
        await this.core.createNamespacedService({ namespace: ns, body: svc });
      } else {
        throw err;
      }
    }
  }

  async applyDeployment(ns: string, dep: V1Deployment): Promise<void> {
    const name = dep.metadata?.name;
    if (!name) throw new Error('Deployment missing metadata.name');
    try {
      await this.apps.replaceNamespacedDeployment({ name, namespace: ns, body: dep });
    } catch (err: any) {
      if (err?.code === 404) {
        await this.apps.createNamespacedDeployment({ namespace: ns, body: dep });
      } else {
        throw err;
      }
    }
  }

  async deleteByLabel(ns: string, labelSelector: string): Promise<void> {
    await Promise.allSettled([
      this.apps.deleteCollectionNamespacedDeployment({ namespace: ns, labelSelector }),
      this.core.deleteCollectionNamespacedConfigMap({ namespace: ns, labelSelector }),
      this.core.deleteCollectionNamespacedSecret({ namespace: ns, labelSelector }),
    ]);
    const services = await this.core.listNamespacedService({ namespace: ns, labelSelector });
    for (const svc of services.items) {
      const name = svc.metadata?.name;
      if (name)
        await this.core.deleteNamespacedService({ name, namespace: ns }).catch(() => undefined);
    }
  }

  async scaleDeployment(ns: string, name: string, replicas: number): Promise<void> {
    // Read the current Scale subresource and replace it. This avoids the
    // content-type ambiguity that breaks patchNamespacedDeploymentScale on
    // @kubernetes/client-node 1.x — the API server otherwise tries to decode
    // the body as a JSONPatch operation list and 400s.
    const current: any = await this.apps.readNamespacedDeploymentScale({
      name,
      namespace: ns,
    });
    const next: any = {
      apiVersion: current?.apiVersion ?? 'autoscaling/v1',
      kind: current?.kind ?? 'Scale',
      metadata: {
        name: current?.metadata?.name ?? name,
        namespace: current?.metadata?.namespace ?? ns,
        resourceVersion: current?.metadata?.resourceVersion,
      },
      spec: { replicas },
    };
    await this.apps.replaceNamespacedDeploymentScale({
      name,
      namespace: ns,
      body: next,
    });
  }

  async deploymentExists(ns: string, name: string): Promise<boolean> {
    try {
      await this.apps.readNamespacedDeployment({ name, namespace: ns });
      return true;
    } catch (err: any) {
      if (err?.code === 404) return false;
      throw err;
    }
  }

  async waitForDeploymentReady(
    ns: string,
    name: string,
    timeoutMs = 90_000,
    intervalMs = 5_000,
  ): Promise<{ ready: boolean; message?: string }> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const dep = await this.apps.readNamespacedDeployment({ name, namespace: ns });
      const status = dep.status;
      if (status?.availableReplicas && status.availableReplicas >= (dep.spec?.replicas ?? 1)) {
        return { ready: true };
      }
      await new Promise((r) => setTimeout(r, intervalMs));
    }
    return { ready: false, message: `Deployment ${name} not ready within ${timeoutMs}ms` };
  }

  /**
   * Poll until readyReplicas converges to `expected`. Used by stop (expected=0)
   * and start (expected>=1) so we don't return success while pods are still
   * mid-transition.
   */
  async waitForDeploymentScaled(
    ns: string,
    name: string,
    expected: number,
    timeoutMs = 90_000,
    intervalMs = 3_000,
  ): Promise<{ ok: boolean; message?: string }> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const dep = await this.apps.readNamespacedDeployment({ name, namespace: ns });
      const ready = dep.status?.readyReplicas ?? 0;
      if (expected === 0 && ready === 0) return { ok: true };
      if (expected > 0 && ready >= expected) return { ok: true };
      await new Promise((r) => setTimeout(r, intervalMs));
    }
    return {
      ok: false,
      message: `Deployment ${name} did not converge to ${expected} ready replicas within ${timeoutMs}ms`,
    };
  }

  async getPodLogs(ns: string, labelSelector: string, tailLines = 200): Promise<string> {
    const pods = await this.core.listNamespacedPod({ namespace: ns, labelSelector });
    const pod: V1Pod | undefined = pods.items[0];
    const podName = pod?.metadata?.name;
    if (!podName) return '';
    const { body } = (await this.core.readNamespacedPodLog({
      name: podName,
      namespace: ns,
      tailLines,
    } as any)) as any;
    return typeof body === 'string' ? body : String(body ?? '');
  }
}
