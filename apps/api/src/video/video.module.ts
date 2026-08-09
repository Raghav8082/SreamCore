import { Module } from '@nestjs/common';
import { VideoController } from './video.controller';
import e from 'express';
import { VideoService } from './video.service';
import { PrismaService } from 'prisma/prisma.services';


@Module({
  controllers: [VideoController],
  providers:[VideoService,PrismaService],
  exports:[VideoService,PrismaService]
})
export class VideoModule { }
