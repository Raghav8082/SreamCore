import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { Worker, Job } from 'bullmq';
import { PrismaService } from '../prisma/prisma.services';
import { ConfigService } from '@nestjs/config';
import { spawn } from 'child_process';
import { createWriteStream } from 'fs';
import { mkdtemp, rm } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { StorageService } from 'src/storage/storage.service';
import { Readable } from 'stream';
import { uploadTranscodedOutput } from './transcode-test';
import { transcodeRenditions, writeMasterPlaylist } from './transcode';

async function downloadToTemp(storageService: StorageService, bucket: string, key: string, localPath: string) {
  const stream = await storageService.getObjectStream(bucket, key);
  if (!stream) {
    throw new Error(`Stream is undefined for key: ${key} in bucket: ${bucket}`);
  }
  const readableStream = stream as Readable;
  const writeStream = createWriteStream(localPath);

  await new Promise<void>((resolve, reject) => {
    readableStream.pipe(writeStream);
    readableStream.on('error', reject);
    writeStream.on('finish', resolve);
    writeStream.on('error', reject);
  });
}




function runFfmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const ffmpeg = spawn('ffmpeg', args);

    ffmpeg.stderr.on('data', (data) => {
      // FFmpeg writes its progress/logs to stderr, not stdout — this is normal FFmpeg behavior, not an error signal
      console.log(`[ffmpeg] ${data}`);
    });

    ffmpeg.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exited with code ${code}`));
    });

    ffmpeg.on('error', reject); // e.g. ffmpeg binary not found at all
  });
}


async function bootstrap() {
  const appContext = await NestFactory.createApplicationContext(AppModule);
  const prisma = appContext.get(PrismaService);
  const config = appContext.get(ConfigService) as any;
  const storageService = appContext.get(StorageService);

  const worker = new Worker(
  'video-processing',
  async (job) => {
    const { videoId, userId, mergedKey } = job.data;
    const workDir = await mkdtemp(join(tmpdir(), 'transcode-'));
    const inputPath = join(workDir, 'input.mp4');

    try {
      await downloadToTemp(storageService, 'streamcore-raw', mergedKey, inputPath);
      const renditions = await transcodeRenditions(inputPath, workDir);
      await writeMasterPlaylist(workDir, renditions);
      await uploadTranscodedOutput(storageService, 'streamcore-processed', workDir, `${userId}/${videoId}/hls`);
    } finally {
      await rm(workDir, { recursive: true, force: true });
    }
  },
  { connection: { host: config.get('REDIS_HOST'), port: config.get('REDIS_PORT') }, concurrency: 2, lockDuration: 60000 },
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
