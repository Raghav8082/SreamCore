import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { RequestIdMiddleware } from './common/request-id.middleware';
import { LoggerModule } from 'nestjs-pino';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { GlobalExceptionFilter } from './exception-filter';
import { AuthModule } from './auth/auth.module';
import { PrismaModule } from 'prisma/prisma.module';
import { validateEnv } from './config/env.validation';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { StorageModule } from './storage/storage.module';
import { UploadModule } from './uploads/upload.module';
import { BullModule } from '@nestjs/bullmq';
import { ProcessingModule } from './processing/processing.module';
import { StreamingModule } from './streaming/streaming.module';
import { VideoModule } from './video/video.module';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { ThrottlerStorageRedisService } from '@nest-lab/throttler-storage-redis';
import { MetricsModule } from './metrics/metrics.module';
@Module({
  imports: [ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
    }),BullModule.forRootAsync({
    useFactory: (config: ConfigService) => ({
      connection: {
        host: config.get('REDIS_HOST'),
        port: config.get('REDIS_PORT'),
      },
    }),
    inject: [ConfigService],
  }),LoggerModule.forRoot(), AuthModule,PrismaModule,StorageModule,UploadModule,ProcessingModule,StreamingModule,VideoModule,MetricsModule,
  ThrottlerModule.forRootAsync({
    useFactory: (config: ConfigService) => ({
      throttlers: [{ ttl: 60000, limit: 100 }], // 100 requests per 60s, general default
      storage: new ThrottlerStorageRedisService({
        host: config.get('REDIS_HOST'),
        port: config.get('REDIS_PORT'),
      }),
    }),
    inject: [ConfigService],
  })],
  controllers: [AppController],
  providers: [AppService , 
    {
      provide:APP_FILTER,
      useClass:GlobalExceptionFilter
    }, { provide: APP_GUARD, useClass: ThrottlerGuard }
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(RequestIdMiddleware)
      .forRoutes('*');
  }}

