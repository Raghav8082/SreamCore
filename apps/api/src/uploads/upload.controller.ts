import { Controller, Put, Param, Req, UseGuards, BadRequestException } from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from 'src/auth/guards/auth-guard';
import { UploadsService } from './upload.service';

@Controller('uploads')
export class UploadController {
  constructor(private readonly uploadsService: UploadsService) {}

  @UseGuards(JwtAuthGuard)
  @Put(':sessionId/chunks/:index')
  async uploadchunk(
    @Param('sessionId') sessionId: string,
    @Param('index') index: string,
    @Req() req: Request,
  ) {
    const checksum = req.headers['x-chunk-checksum'] as string;
    if (!checksum) {
      throw new BadRequestException('Missing X-Chunk-Checksum header');
    }

    const chunkBuffer = req.body as Buffer; // raw() middleware gives us a Buffer here

    return this.uploadsService.uploadchunk(sessionId, parseInt(index, 10), chunkBuffer, checksum);
  }
}