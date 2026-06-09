import { Injectable, NotFoundException } from '@nestjs/common';
import { AsyncTaskType, AsyncTaskStatus, type Prisma } from '@prisma/client';
import { PrismaService } from '../../core/prisma/prisma.service';
import {
  type PaginationQuery,
  paginationQuerySchema,
  paginate,
  buildPrismaSkipTake,
} from '../shared/pagination';

@Injectable()
export class AsyncTasksService {
  constructor(private prisma: PrismaService) {}

  async findAllTasks(query: unknown) {
    const pq: PaginationQuery = paginationQuerySchema.parse(query);
    const where = {};
    const [items, total] = await Promise.all([
      this.prisma.asyncTask.findMany({
        ...buildPrismaSkipTake(pq),
        where,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.asyncTask.count({ where }),
    ]);
    return paginate(items, total, pq);
  }

  async findTaskById(id: string) {
    const task = await this.prisma.asyncTask.findUnique({ where: { id } });
    if (!task) throw new NotFoundException(`Task ${id} not found`);
    return task;
  }

  async cancelTask(id: string) {
    const task = await this.prisma.asyncTask.findUnique({ where: { id } });
    if (!task) throw new NotFoundException(`Task ${id} not found`);
    if (task.status === 'completed' || task.status === 'cancelled') {
      return task;
    }
    return this.prisma.asyncTask.update({
      where: { id },
      data: { status: 'cancelled' },
    });
  }

  async create(data: {
    taskType: AsyncTaskType;
    referenceId: string;
    bullmqJobId?: string | null;
  }) {
    return this.prisma.asyncTask.create({
      data: {
        taskType: data.taskType,
        referenceId: data.referenceId,
        bullmqJobId: data.bullmqJobId ?? null,
        status: AsyncTaskStatus.pending,
        progress: 0,
      },
    });
  }

  async updateProgress(
    id: string,
    data: {
      status?: AsyncTaskStatus;
      progress?: number;
      result?: Prisma.InputJsonValue;
      errorMessage?: string | null;
    },
  ) {
    return this.prisma.asyncTask.update({
      where: { id },
      data,
    });
  }
}
