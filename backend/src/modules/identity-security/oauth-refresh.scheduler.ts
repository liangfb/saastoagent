import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';

@Injectable()
export class OAuthRefreshScheduler implements OnModuleInit {
  constructor(@InjectQueue('oauth-refresh') private readonly queue: Queue) {}

  async onModuleInit() {
    await this.queue.add(
      'scan',
      {},
      {
        repeat: { every: 5 * 60 * 1000 },
        jobId: 'oauth-refresh-scan',
        removeOnComplete: true,
      },
    );
  }
}
