import { Module } from '@nestjs/common';
import { UploadsService } from './upload.service';
import { UploadController } from './upload.controller';
import { BullModule } from '@nestjs/bullmq';
import { ConfigService } from '@nestjs/config';


@Module({
  imports: [
    BullModule.registerQueue({
      name: 'video-processing',
    }),
  ],
  providers: [UploadsService],
  controllers:[UploadController],
})


export class UploadModule {}
