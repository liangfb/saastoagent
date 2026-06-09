import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { ResponseTransformInterceptor } from './core/interceptors/response-transform.interceptor';
import { LoggingInterceptor } from './core/interceptors/logging.interceptor';
import { HttpExceptionFilter } from './core/filters/http-exception.filter';
import { PrismaExceptionFilter } from './core/filters/prisma-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });

  // Pino logger
  app.useLogger(app.get(Logger));

  // Global prefix
  app.setGlobalPrefix('api/v1');

  // Global interceptors
  app.useGlobalInterceptors(new ResponseTransformInterceptor(), new LoggingInterceptor());

  // Global exception filters
  app.useGlobalFilters(new HttpExceptionFilter(), new PrismaExceptionFilter());

  // CORS: defaults to allowing ALL origins when CORS_ORIGINS is unset/empty
  // (origin: true reflects the request origin — equivalent to allow-all, and
  // unlike a literal "*" it stays compatible with credentials: true). Set
  // CORS_ORIGINS to a comma-separated allowlist to lock it down in production.
  const corsOrigins = (process.env.CORS_ORIGINS ?? '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  app.enableCors({
    origin: corsOrigins.length > 0 ? corsOrigins : true,
    credentials: true,
  });

  // Swagger
  const config = new DocumentBuilder()
    .setTitle('Agentic Service Mesh')
    .setDescription('SaaS to Agentic transformation platform API')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  // Health check (outside global prefix)
  const httpAdapter = app.getHttpAdapter();
  httpAdapter.get('/health', (_req: any, res: any) => {
    res.json({ code: 0, message: 'success', data: { status: 'ok' } });
  });

  const port = process.env.PORT || 8000;
  await app.listen(port);
}
bootstrap();
