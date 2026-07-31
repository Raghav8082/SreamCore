import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { StorageService } from '../src/storage/storage.service';
import { createWriteStream } from 'fs';
import { mkdir, mkdtemp, rm } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { spawn } from 'child_process';

import { Readable } from 'stream';

import { writeFile } from 'fs/promises';

function runFfmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const ffmpeg = spawn('ffmpeg', args);
    ffmpeg.stderr.on('data', (data) => console.log(`[ffmpeg] ${data}`));
    ffmpeg.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${code}`))));
    ffmpeg.on('error', reject);
  });
}


function getVideoResolution(inputPath: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const ffprobe = spawn('ffprobe', [
      '-v', 'error',
      '-select_streams', 'v:0',
      '-show_entries', 'stream=width,height',
      '-of', 'csv=s=x:p=0',
      inputPath,
    ]);

    let output = '';
    ffprobe.stdout.on('data', (data) => (output += data));
    ffprobe.on('close', (code) => {
      if (code !== 0) return reject(new Error('ffprobe failed'));
      const [width, height] = output.trim().split('x').map(Number);
      resolve({ width, height });
    });
    ffprobe.on('error', reject);
  });
}

const RENDITIONS = [
  { name: '1080p', width: 1920, height: 1080, videoBitrate: '5000k', audioBitrate: '192k' },
  { name: '720p',  width: 1280, height: 720,  videoBitrate: '2800k', audioBitrate: '128k' },
  { name: '480p',  width: 854,  height: 480,  videoBitrate: '1400k', audioBitrate: '128k' },
  { name: '240p',  width: 426,  height: 240,  videoBitrate: '400k',  audioBitrate: '96k'  },
];

export async function transcodeRenditions(inputPath: string, workDir: string) {
  const source = await getVideoResolution(inputPath);
  console.log('Source resolution:', source);

  const applicableRenditions = RENDITIONS.filter((r) => r.width <= source.width);
  const results: typeof RENDITIONS = [];

  for (const rendition of applicableRenditions) {
    const renditionDir = join(workDir, rendition.name);
    await mkdir(renditionDir, { recursive: true });

    await runFfmpeg([
      '-i', inputPath,
      '-vf', `scale=${rendition.width}:${rendition.height}`,
      '-c:v', 'libx264', '-b:v', rendition.videoBitrate,
      '-g', '120', '-keyint_min', '120',
      '-c:a', 'aac', '-b:a', rendition.audioBitrate,
      '-hls_time', '4', '-hls_playlist_type', 'vod',
      '-hls_segment_filename', join(renditionDir, 'segment_%03d.ts'),
      join(renditionDir, 'output.m3u8'),
    ]);

    results.push(rendition);
    console.log(`Finished rendition: ${rendition.name}`);
  }

  return results;
}
export async function writeMasterPlaylist(workDir: string, renditions: typeof RENDITIONS) {
  const lines = ['#EXTM3U', '#EXT-X-VERSION:3'];

  for (const r of renditions) {
    const bandwidth = parseInt(r.videoBitrate) * 1000; // rough estimate in bits/sec
    lines.push(`#EXT-X-STREAM-INF:BANDWIDTH=${bandwidth},RESOLUTION=${r.width}x${r.height}`);
    lines.push(`${r.name}/output.m3u8`);
  }

  await writeFile(join(workDir, 'master.m3u8'), lines.join('\n'));
}
