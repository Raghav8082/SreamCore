import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { json, raw } from 'express';
import cookieParser from 'cookie-parser';



async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useGlobalPipes(new ValidationPipe());

app.enableCors({
  origin: 'http://localhost:3001',
  credentials: true,
});

  app.use('/uploads/:sessionId/chunks/:index', raw({ type: '*/*', limit: '100mb' }));
  app.use(json());
  app.use(cookieParser());
  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
