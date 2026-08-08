import { Module } from '@nestjs/common';
import { VideoController } from './video.controller';
import e from 'express';


@Module({
  controllers: [VideoController],
})
export class VideoModule { }
