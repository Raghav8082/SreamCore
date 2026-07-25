import { Injectable, Inject, NotFoundException, BadRequestException } from '@nestjs/common';

import { CreateUploadSessionDto } from './dto/upload-session.-dto';
import { PrismaService } from 'prisma/prisma.services';
import { createHash } from 'crypto';
import { StorageService } from 'src/storage/storage.service';

const CHUNK_SIZE = 5 * 1024 * 1024; // 5MB
const SESSION_TTL_HOURS = 24;

@Injectable()
export class UploadsService {
  constructor(private readonly prisma: PrismaService,
              private readonly storageservice: StorageService
  ) {}

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
      },
    });

    return {
      sessionId: session.id,
      chunkSize: session.chunkSize,
      totalChunks: session.totalChunks,
      expiresAt: session.expiresAt,
    };
  }

  async uploadchunk(sessionId:string , index :number ,chunk:Buffer, expectedchecksum:string){
      const session  = await this.prisma.uploadSession.findUnique({
         where:{id:sessionId}
      })
      if(!session){
        throw new NotFoundException("Upload session not found ")
      }
      const actualchecksum = createHash('sha256').update(chunk).digest('hex');
      if (actualchecksum !== expectedchecksum) {
        throw new BadRequestException('Checksum mismatch — chunk may be corrupted.');
      }
      
      const key = `${session.userId}/${sessionId}/chunks/${index}`; 
      await this.storageservice.uploadObject('streamcore-raw',key,chunk)

      return {recieved : true ,index,checksum:actualchecksum }
  }
}