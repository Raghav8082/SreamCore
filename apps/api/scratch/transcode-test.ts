import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { StorageService } from '../src/storage/storage.service';
import { createWriteStream, mkdir } from 'fs';
import { mkdtemp, rm } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { spawn } from 'child_process';

import { Readable } from 'stream';
import { transcodeRenditions, writeMasterPlaylist } from './transcode';

import { writeFile } from 'fs/promises';
import { readdir, readFile } from 'fs/promises';

export async function uploadTranscodedOutput(
  storageService: StorageService,
  bucket: string,
  localWorkDir: string,
  destPrefix: string, // e.g. `${userId}/${videoId}/hls`
) {
  const entries = await readdir(localWorkDir, { withFileTypes: true, recursive: true });

  for (const entry of entries) {
    if (entry.isDirectory()) continue;
    const relativePath = join(entry.parentPath ?? localWorkDir, entry.name).replace(localWorkDir, '').replace(/^[/\\]/, '');
    const fileBuffer = await readFile(join(entry.parentPath ?? localWorkDir, entry.name));
    const destKey = `${destPrefix}/${relativePath.split('\\').join('/')}`; // normalize Windows paths
    await storageService.uploadObject(bucket, destKey, fileBuffer);
  }
}


function runFfmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const ffmpeg = spawn('ffmpeg', args);
    ffmpeg.stderr.on('data', (data) => console.log(`[ffmpeg] ${data}`));
    ffmpeg.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${code}`))));
    ffmpeg.on('error', reject);
  });
}

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

async function main() {
  const MERGED_KEY = 'b39b6dab-e3c5-4264-8b87-16db05007640/8875c61a-985a-4d5e-8c8c-8b0b65937a32/merged/test-resume.bin'; // <-- replace this

  const appContext = await NestFactory.createApplicationContext(AppModule);
  const storageService = appContext.get(StorageService);

  const workDir = await mkdtemp(join(tmpdir(), 'transcode-test-'));
  const inputPath = join(workDir, 'input.mp4');
  console.log('Work dir:', workDir);

  try {
    console.log('Downloading from MinIO...');
    await downloadToTemp(storageService, 'streamcore-raw', MERGED_KEY, inputPath);
    console.log('Downloaded to', inputPath);

    console.log('Running ffmpeg...');
    await runFfmpeg([
      '-i', inputPath,
      '-c:v', 'libx264', '-b:v', '1000k', '-g', '120', '-keyint_min', '120',
      '-c:a', 'aac', '-b:a', '128k',
      '-hls_time', '4', '-hls_playlist_type', 'vod',
      '-hls_segment_filename', join(workDir, 'segment_%03d.ts'),
      join(workDir, 'output.m3u8'),
    ]);
    const renditions = await transcodeRenditions(inputPath, workDir);
    await writeMasterPlaylist(workDir, renditions);
    console.log('Master playlist + all renditions written to', workDir);
  } catch (err) {
    console.error('Failed:', err);
  } finally {
    await appContext.close();
    // deliberately skipping rm(workDir) for this test so you can inspect output
  }
}

main();