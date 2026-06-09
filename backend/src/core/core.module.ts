import { Module, MiddlewareConsumer, NestModule, Global } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { JwtModule } from '@nestjs/jwt';
import { PrometheusModule } from '@willsoto/nestjs-prometheus';
import { LoggerModule } from 'nestjs-pino';
import configuration from './config/configuration';
import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './redis/redis.module';
import { TraceIdMiddleware } from './middleware/trace-id.middleware';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

@Global()
@Module({
  imports: [
    // Config: Zod-validated environment variables
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
    }),

    // JWT (shared by auth login + JwtAuthGuard across modules)
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET_KEY'),
        signOptions: { expiresIn: '7d' },
      }),
    }),

    // Structured logging with pino
    LoggerModule.forRoot({
      pinoHttp: {
        transport: process.env.NODE_ENV !== 'production' ? { target: 'pino-pretty' } : undefined,
        level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
        autoLogging: true,
        redact: {
          paths: [
            'req.headers.authorization',
            'req.body.config',
            'req.body.credentials',
            'req.body.apiKey',
          ],
          censor: '***REDACTED***',
        },
      },
    }),

    // Database
    PrismaModule,

    // Redis
    RedisModule,

    // BullMQ queues
    BullModule.forRoot({
      connection: {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379'),
      },
    }),
    BullModule.registerQueue(
      { name: 'openapi-parse' },
      { name: 'semantic-enhance' },
      { name: 'mcp-generate' },
    ),

    // Prometheus metrics
    PrometheusModule.register({
      path: '/metrics',
      defaultMetrics: { enabled: true },
    }),
  ],
  providers: [JwtAuthGuard],
  exports: [PrismaModule, RedisModule, JwtModule, JwtAuthGuard],
})
export class CoreModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(TraceIdMiddleware).forRoutes('*');
  }
}
