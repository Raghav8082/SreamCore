import { Module } from '@nestjs/common';
import { UploadsService } from './upload.service';
import { UploadController } from './upload.controller';

@Module({
  providers: [UploadsService],
  controllers:[UploadController]
})
export class UploadModule {}
