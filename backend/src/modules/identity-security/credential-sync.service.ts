import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';

@Injectable()
export class CredentialSyncService {
  constructor(@InjectQueue('credential-sync') private readonly queue: Queue) {}

  async enqueueSync(credentialId: string): Promise<void> {
    await this.queue.add('sync', { credentialId }, { removeOnComplete: true, removeOnFail: 100 });
  }
}
