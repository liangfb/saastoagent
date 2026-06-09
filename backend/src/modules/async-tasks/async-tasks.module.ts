import { Module } from '@nestjs/common';
import { AsyncTasksController } from './async-tasks.controller';
import { AsyncTasksService } from './async-tasks.service';

@Module({
  controllers: [AsyncTasksController],
  providers: [AsyncTasksService],
  exports: [AsyncTasksService],
})
export class AsyncTasksModule {}
