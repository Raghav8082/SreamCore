import { Injectable, Inject, NotFoundException, BadRequestException, UnauthorizedException } from '@nestjs/common';
import { Queue } from 'bullmq';
import { InjectQueue } from '@nestjs/bullmq';

import { CreateUploadSessionDto } from './dto/upload-session.-dto';
import { PrismaService } from 'prisma/prisma.services';
import { createHash, randomUUID } from 'crypto';
import { StorageService } from 'src/storage/storage.service';
import { join, resolve } from 'path';
import { tmpdir } from 'os';
import { createReadStream, createWriteStream, unlink } from 'fs';
import { Readable } from 'stream';
import { promise } from 'zod';
import { rejects } from 'assert';
import { error } from 'console';

const CHUNK_SIZE = 5 * 1024 * 1024; // 5MB
const SESSION_TTL_HOURS = 24;

@Injectable()
export class UploadsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storageservice: StorageService,
    @InjectQueue('video-processing') private readonly videoQueue: Queue,
  ) { }

  async createSession(userId: string, dto: CreateUploadSessionDto) {
    const totalChunks = Math.ceil(dto.fileSize / CHUNK_SIZE);
    const expiresAt = new Date(Date.now() + SESSION_TTL_HOURS * 60 * 60 * 1000);

    const session = await this.prisma.uploadSession.create({
      data: {
        userId,
        fileName: dto.fileName,
        fileSize: BigInt(dto.fileSize),
        chunkSize: CHUNK_SIZE,
        totalChunks,
        expiresAt,
        title: dto.title || dto.fileName,
      },
    });

    return {
      sessionId: session.id,
      chunkSize: session.chunkSize,
      totalChunks: session.totalChunks,
      expiresAt: session.expiresAt,
    };
  }

  async uploadchunk(userid: string, sessionId: string, index: number, chunk: Buffer, expectedchecksum: string) {
    const session = await this.prisma.uploadSession.findUnique({
      where: { id: sessionId }
    })
    if (!session) {
      throw new NotFoundException("Upload session not found ")
    }
    if (session.userId != userid) {
      throw new UnauthorizedException('User not authorized to upload to this session.');
    }
    const actualchecksum = createHash('sha256').update(chunk).digest('hex');
    if (actualchecksum.toLowerCase() !== expectedchecksum.toLowerCase()) {
      throw new BadRequestException('Checksum mismatch — chunk may be corrupted.');
    }

    const key = `${session.userId}/${sessionId}/chunks/${index}`;
    await this.storageservice.uploadObject('streamcore-raw', key, chunk)

    await this.prisma.uploadedChunk.upsert({
      where: { sessionId_chunkIndex: { sessionId, chunkIndex: index } },
      update: { checksum: actualchecksum },
      create: { sessionId, chunkIndex: index, checksum: actualchecksum }
    })
    return { recieved: true, index, checksum: actualchecksum }
  }
  async sessionstatus(sessionId: string, userId: string) {
    const session = await this.prisma.uploadSession.findUnique({
      where: { id: sessionId },
      include: {
        uploadedChunk: true
      }
    })
    if (!session) {
      throw new NotFoundException('Session not found');
    }
    if (session.userId != userId) {
      throw new UnauthorizedException("Session dosnt belong to you ")
    }
    const uploadedChunks = session.uploadedChunk.map((c) => c.chunkIndex)
    const missingChunks: number[] = []
    for (let i = 0; i < session.totalChunks; i++) {
      if (!uploadedChunks.includes(i)) {
        missingChunks.push(i)
      }
    }
    return {
      sessionId: session.id,
      status: session.status,
      totalChunks: session.totalChunks,
      receivedCount: uploadedChunks.length,
      missingChunks,
    }
  }

  async mergesession(userid: string, sessionId: string) {
    const session = await this.prisma.uploadSession.findUnique({
      where: { id: sessionId },
      include: {
        uploadedChunk: true
      }
    })
    if (!session) {
      throw new NotFoundException('Session not found')
    }
    if (session.userId != userid) {
      throw new UnauthorizedException('The session doesnot belong to you')
    }

    if (session.uploadedChunk.length != session.totalChunks || session.isMerged) {
      throw new BadRequestException(`Cannot merge :${session.uploadedChunk.length}/${session.totalChunks} recieved  or file already merged  `)
    }
    const tempfile = join(tmpdir(), `merge${randomUUID()}.temp`)
    const writestream = createWriteStream(tempfile)
    const hash = createHash('SHA256');

    const sortedchunks = [...session.uploadedChunk].sort((a, b) => a.chunkIndex - b.chunkIndex)

    for (const chunk of sortedchunks) {
      const key = `${session.userId}/${sessionId}/chunks/${chunk.chunkIndex}`
      const chunkstream = await this.storageservice.getObjectStream("streamcore-raw", key)

      if (!chunkstream) {
        throw new NotFoundException(`Chunk stream not found for key: ${key}`);
      }

      const readableStream = chunkstream as Readable;

      await new Promise<void>((resolve, reject) => {
        readableStream.on('data', (data: Buffer) => {
          hash.update(data);
          writestream.write(data);
        })
        readableStream.on('end', () => resolve())
        readableStream.on('error', (err) => reject(err))
      })
    }

    writestream.end();
    await new Promise<void>((resolve) => writestream.on('finish', () => resolve()));
    const finalChecksum = hash.digest('hex');
    const mergedKey = `${session.userId}/${sessionId}/merged/${session.fileName}`;

    const fileStream = createReadStream(tempfile);
    await this.storageservice.uploadstream('streamcore-raw', mergedKey, fileStream);

    await this.prisma.uploadSession.update({
      where: { id: sessionId },
      data: { status: 'COMPLETED', finalChecksum, mergedKey, isMerged: true },
    });

    await Promise.all(
      sortedchunks.map((chunk) =>
        this.storageservice.deleteObject(
          'streamcore-raw',
          `${session.userId}/${sessionId}/chunks/${chunk.chunkIndex}`,
        ),
      ),
    );
    unlink(tempfile, (err) => {
      if (err) console.log("Error in deleting temp file ", err)
    });

    // after session status updates to COMPLETED...
    const job = await this.videoQueue.add('transcode-video', {
      videoId: sessionId,
      userId: session.userId,
      mergedKey,
    });

    const processingJob = await this.prisma.processingJob.create({
      data: {
        videoId: sessionId,
        status: 'QUEUED',
        bullJobId: job.id!,
      },
    });

    return { success: true, finalChecksum };
  }
}