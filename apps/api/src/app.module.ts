import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { RequestIdMiddleware } from './common/request-id.middleware';
import { LoggerModule } from 'nestjs-pino';
import { APP_FILTER } from '@nestjs/core';
import { GlobalExceptionFilter } from './exception-filter';
import { AuthModule } from './auth/auth.module';
import { PrismaModule } from 'prisma/prisma.module';
import { validateEnv } from './config/env.validation';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { StorageModule } from './storage/storage.module';
import { UploadModule } from './uploads/upload.module';
import { BullModule } from '@nestjs/bullmq';
import { ProcessingModule } from './processing/processing.module';

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
  }),LoggerModule.forRoot(), AuthModule,PrismaModule,StorageModule,UploadModule,ProcessingModule],
  controllers: [AppController],
  providers: [AppService , 
    {
      provide:APP_FILTER,
      useClass:GlobalExceptionFilter
    }
  ],
  
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(RequestIdMiddleware)
      .forRoutes('*');
  }
}
