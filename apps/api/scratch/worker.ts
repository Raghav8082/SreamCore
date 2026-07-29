import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { Worker, Job } from 'bullmq';
import { PrismaService } from '../prisma/prisma.services';
import { ConfigService } from '@nestjs/config';

async function bootstrap() {
  const appContext = await NestFactory.createApplicationContext(AppModule);
  const prisma = appContext.get(PrismaService);
  const config = appContext.get(ConfigService) as any;

  const worker = new Worker(
    'test-queue', // will become 'video-processing' in Week 4
    async (job) => {
      console.log(`Processing job ${job.id}`, job.data);
      // real processing logic goes here in Week 4
    },
    {
      connection: {
        host: config.get('REDIS_HOST'),
        port: config.get('REDIS_PORT'),
      },
      concurrency: 2,
      lockDuration: 30000,
    },
  );

  worker.on('active', async (job) => {
    await prisma.processingJob.updateMany({
      where: { bullJobId: job.id },
      data: { status: 'ACTIVE', attemptsMade: job.attemptsMade },
    });
  });

  worker.on('completed', async (job) => {
    await prisma.processingJob.updateMany({
      where: { bullJobId: job.id },
      data: { status: 'COMPLETED' },
    });
  });

  worker.on('failed', async (job, err) => {
    const isFinalAttempt = job ? job.attemptsMade >= (job.opts?.attempts ?? 1) : false;
    await prisma.processingJob.updateMany({
      where: { bullJobId: job?.id },
      data: {
        status: isFinalAttempt ? 'DEAD_LETTERED' : 'FAILED',
        attemptsMade: job?.attemptsMade ?? 0,
        lastError: err.message,
        deadLetteredAt: isFinalAttempt ? new Date() : undefined,
      },
    });
  });

  console.log('Worker started, listening for jobs...');
}

bootstrap();