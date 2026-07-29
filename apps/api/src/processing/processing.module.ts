import { Module } from '@nestjs/common';
import { ProcessingController } from './processing.controller';

@Module({
  controllers: [ProcessingController]
})
export class ProcessingModule { }
