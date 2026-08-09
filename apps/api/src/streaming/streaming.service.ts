import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { StorageService } from 'src/storage/storage.service';
import { Readable } from 'stream';
import { PrismaService } from 'prisma/prisma.services';
import Redis from 'ioredis';
import { ConfigService } from '@nestjs/config';
import { json } from 'zod';


@Injectable()
export class StreamingService {
    private redis: Redis; 
    constructor(
        private readonly storage: StorageService,
        private readonly prisma: PrismaService,
        private readonly config:ConfigService
    ){{
        this.redis = new Redis({
            host: this.config.get<string>('REDIS_HOST'),
            port: this.config.get<number>('REDIS_PORT'),
        });
    }}
    async getObjectAsText(bucket: string, key: string):Promise<string>{
    const response = await this.storage.getObjectStream(bucket,key); 

    if(!response) throw new Error(`Stream is undefined for key: ${key} in bucket: ${bucket}`);

    const readableStream = response as Readable;
    const chunks:Uint8Array[] = [];
    for await (const chunk of readableStream) {
        chunks.push(chunk as Uint8Array);
    }
    const buffer = Buffer.concat(chunks);
    return buffer.toString('utf-8');

  }
async getSignedMasterPlaylist(userId: string, videoId: string): Promise<string> {
  const session = await this.prisma.uploadSession.findUnique({ where: { id: videoId } });
  if (!session) throw new NotFoundException('Video not found');
  if (session.userId !== userId) throw new ForbiddenException('You do not own this video');

  const job = await this.prisma.processingJob.findFirst({
    where: { videoId },
    orderBy: { createdAt: 'desc' },
  });

  if (job && job.status !== 'COMPLETED') {
    throw new NotFoundException(`Video is currently ${job.status.toLowerCase()} transcoding. Please wait a few seconds...`);
  }

  const bucket = 'streamcore-processed';
  const prefix = `${session.userId}/${videoId}/hls`;
  const masterKey = `${prefix}/master.m3u8`;

  try {
    const lines = await this.getCachedOrFetchPlaylistLines(bucket, masterKey);

    const rewritten = lines.map((line) => {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        return `/streaming/videos/${videoId}/rendition/${trimmed}`;
      }
      return line;
    });

    return rewritten.join('\n');
  } catch (err: any) {
    throw new NotFoundException('HLS playlist is still being processed. Please wait a few seconds and try again.');
  }
}

async getSignedRenditionPlaylist(userId: string, videoId: string, renditionPath: string): Promise<string> {
  const session = await this.prisma.uploadSession.findUnique({ where: { id: videoId } });
  if (!session) throw new NotFoundException('Video not found');
  if (session.userId !== userId) throw new ForbiddenException('You do not own this video');

  const bucket = 'streamcore-processed';
  const prefix = `${session.userId}/${videoId}/hls`;
  const renditionKey = `${prefix}/${renditionPath}`;
  const renditionDir = renditionPath.substring(0, renditionPath.lastIndexOf('/'));

  const lines = await this.getCachedOrFetchPlaylistLines(bucket, renditionKey);

  const rewritten = await Promise.all(
    lines.map(async (line) => {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        const segmentKey = `${prefix}/${renditionDir}/${trimmed}`;
        return this.storage .getSignedUrl(bucket, segmentKey, 3600);
      }
      return line;
    }),
  );

  return rewritten.join('\n');
}
  private async getCachedOrFetchPlaylistLines(bucket: string, key: string): Promise<string[]> {
    const cached = await this.redis.get(key);

    if (cached) return JSON.parse(cached);

    const content = await this.getObjectAsText(bucket, key);
    const lines = content.split('\n');

    await this.redis.set(key, JSON.stringify(lines), 'EX', 3600);

    return lines;
  }
}
