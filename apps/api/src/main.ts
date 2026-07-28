import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { json, raw } from 'express';


async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useGlobalPipes(new ValidationPipe());

app.enableCors({
  origin: 'http://localhost:3001',
  credentials: true,
});

  app.use('/uploads/:sessionId/chunks/:index', raw({ type: '*/*', limit: '10mb' }));
  app.use(json());
  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
