import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';
import { StorageService } from './storage/storage.service';

@Controller()
export class AppController {
  constructor(
    private readonly appService: AppService,
    private readonly storageService: StorageService,
  ) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }
  @Get('test-storage')
async testStorage() {
  await this.storageService.uploadObject(
    'streamcore-raw',
    'test/hello.txt',
    Buffer.from('Hello MinIO, this is a connectivity test'),
  );
  return { message: 'Upload attempted — check MinIO console' };
}
}
