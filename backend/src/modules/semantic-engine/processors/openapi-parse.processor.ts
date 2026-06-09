import { Processor, WorkerHost, InjectQueue } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job, Queue } from 'bullmq';
import SwaggerParser from '@apidevtools/swagger-parser';
import { AsyncTaskStatus, type Prisma } from '@prisma/client';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { AsyncTasksService } from '../../async-tasks/async-tasks.service';

interface ParseJobData {
  sourceId: string;
  taskId: string;
}

/**
 * Parses an OpenAPI/Swagger spec fetched from OpenapiSource.sourceUrl,
 * extracts endpoints + parameters into DB, then enqueues semantic enhancement.
 */
@Processor('openapi-parse')
export class OpenapiParseProcessor extends WorkerHost {
  private readonly logger = new Logger(OpenapiParseProcessor.name);

  constructor(
    private prisma: PrismaService,
    private asyncTasks: AsyncTasksService,
    @InjectQueue('semantic-enhance') private enhanceQueue: Queue,
  ) {
    super();
  }

  async process(job: Job<ParseJobData>): Promise<void> {
    const { sourceId, taskId } = job.data;
    this.logger.log(`Parsing OpenAPI source ${sourceId}`);

    try {
      await this.asyncTasks.updateProgress(taskId, {
        status: AsyncTaskStatus.running,
        progress: 5,
      });

      const source = await this.prisma.openapiSource.findUnique({ where: { id: sourceId } });
      if (!source) throw new Error(`OpenAPI source ${sourceId} not found`);

      // Manual sources carry the spec inline (no fetch — production specs are
      // often auth-gated or disabled). URL/file sources always re-fetch so an
      // edited URL is picked up rather than reusing a previously stored spec.
      let rawApi: any;
      let api: any;
      if (source.sourceType === 'manual' && source.rawSpec) {
        rawApi = JSON.parse(JSON.stringify(source.rawSpec));
        api = (await SwaggerParser.bundle(JSON.parse(JSON.stringify(source.rawSpec)))) as any;
      } else if (source.sourceUrl) {
        rawApi = (await SwaggerParser.parse(source.sourceUrl)) as any;
        api = (await SwaggerParser.bundle(source.sourceUrl)) as any;
      } else if (source.rawSpec) {
        rawApi = JSON.parse(JSON.stringify(source.rawSpec));
        api = (await SwaggerParser.bundle(JSON.parse(JSON.stringify(source.rawSpec)))) as any;
      } else {
        throw new Error('Source has neither stored spec nor sourceUrl');
      }
      await this.asyncTasks.updateProgress(taskId, { progress: 30 });

      await this.prisma.endpoint.deleteMany({ where: { openapiSourceId: sourceId } });

      const paths = api.paths ?? {};
      const methods = ['get', 'post', 'put', 'patch', 'delete', 'options', 'head'];
      let created = 0;

      for (const [path, pathItem] of Object.entries<any>(paths)) {
        for (const method of methods) {
          const op = pathItem?.[method];
          if (!op) continue;

          const requestBody = op.requestBody?.content?.['application/json']?.schema ?? null;
          const responseBody =
            op.responses?.['200']?.content?.['application/json']?.schema ??
            op.responses?.['201']?.content?.['application/json']?.schema ??
            null;

          const endpoint = await this.prisma.endpoint.create({
            data: {
              openapiSourceId: sourceId,
              path,
              httpMethod: method.toUpperCase(),
              operationId: op.operationId ?? null,
              summary: op.summary ?? null,
              originalDescription: op.description ?? null,
              requestSchema: (requestBody ?? null) as Prisma.InputJsonValue,
              responseSchema: (responseBody ?? null) as Prisma.InputJsonValue,
            },
          });

          const parameters = Array.isArray(op.parameters) ? op.parameters : [];
          for (const param of parameters) {
            await this.prisma.endpointParameter.create({
              data: {
                endpointId: endpoint.id,
                name: param.name,
                location: param.in,
                dataType: param.schema?.type ?? null,
                required: Boolean(param.required),
                originalDescription: param.description ?? null,
                schemaDetail: (param.schema ?? null) as Prisma.InputJsonValue,
              },
            });
          }

          created++;
        }
      }

      await this.prisma.openapiSource.update({
        where: { id: sourceId },
        data: {
          parseStatus: 'parsed',
          specVersion: api.openapi ?? api.swagger ?? null,
          rawSpec: rawApi as Prisma.InputJsonValue,
        },
      });

      await this.asyncTasks.updateProgress(taskId, {
        status: AsyncTaskStatus.completed,
        progress: 100,
        result: { endpointsCreated: created } as Prisma.InputJsonValue,
      });

      this.logger.log(`Parsed ${created} endpoints for source ${sourceId}; enqueuing enhancement`);

      const enhanceTask = await this.asyncTasks.create({
        taskType: 'semantic_enhance' as any,
        referenceId: sourceId,
      });
      const job2 = await this.enhanceQueue.add('enhance', {
        sourceId,
        taskId: enhanceTask.id,
      });
      await this.prisma.asyncTask.update({
        where: { id: enhanceTask.id },
        data: { bullmqJobId: String(job2.id) },
      });
    } catch (err: any) {
      this.logger.error(`Parse failed for ${sourceId}: ${err.message}`, err.stack);
      await this.prisma.openapiSource.update({
        where: { id: sourceId },
        data: { parseStatus: 'failed' },
      });
      await this.asyncTasks.updateProgress(taskId, {
        status: AsyncTaskStatus.failed,
        errorMessage: err.message,
      });
      throw err;
    }
  }
}
