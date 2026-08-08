// scratch/load-test.ts
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { getQueueToken } from '@nestjs/bullmq';
import { Queue } from 'bullmq';

async function main() {
  const appContext = await NestFactory.createApplicationContext(AppModule);
  const queue = appContext.get<Queue>(getQueueToken('video-processing'));

  const MERGED_KEY = 'b39b6dab-e3c5-4264-8b87-16db05007640/8875c61a-985a-4d5e-8c8c-8b0b65937a32/merged/test-resume.bin';
  const USER_ID = 'b39b6dab-e3c5-4264-8b87-16db05007640';
  const VIDEO_ID = '8875c61a-985a-4d5e-8c8c-8b0b65937a32';

  for (let i = 0; i < 5; i++) {
    await queue.add('transcode-video', {
        
      videoId: VIDEO_ID,
      userId: USER_ID,
      mergedKey: MERGED_KEY, 
    });
    console.log(`Enqueued load-test-${i}`);
  }

  await appContext.close();
}

main();