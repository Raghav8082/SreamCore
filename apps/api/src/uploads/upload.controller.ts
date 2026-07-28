import { Controller, Put, Param, Req, UseGuards, BadRequestException, Get, Body, Post } from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from 'src/auth/guards/auth-guard';
import { UploadsService } from './upload.service';
import { CreateUploadSessionDto } from './dto/upload-session.-dto';

interface RequestWithUser extends Request {
  user: {
    userId: string;
    email: string;
  };
}

@Controller('uploads')
export class UploadController {
  constructor(private readonly uploadsService: UploadsService) {}

  @UseGuards(JwtAuthGuard)
  @Post('sessions')
  async createSession(
    @Req() req: RequestWithUser,
    @Body() dto: CreateUploadSessionDto,
  ) {
    return this.uploadsService.createSession(req.user.userId, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Put(':sessionId/chunks/:index')
  async uploadchunk(
    @Param('sessionId') sessionId: string,
    @Param('index') index: string,
    
    @Req() req: RequestWithUser,
  ) {
    const checksum = req.headers['x-chunk-checksum'] as string;
    if (!checksum) {
      throw new BadRequestException('Missing X-Chunk-Checksum header');
    }

    const chunkBuffer = req.body as Buffer; // raw() middleware gives us a Buffer here

    return this.uploadsService.uploadchunk(req.user.userId, sessionId, parseInt(index, 10), chunkBuffer, checksum);
  }
  @UseGuards(JwtAuthGuard)
  @Get(':sessionId')
  getStatus(@Req() req: RequestWithUser, @Param('sessionId') sessionId: string) {
    return this.uploadsService.sessionstatus(sessionId, req.user.userId);
  }

  @UseGuards(JwtAuthGuard)
@Post(':sessionId/merge')
merge(@Req() req, @Param('sessionId') sessionId: string) {
  return this.uploadsService.mergesession(req.user.userId, sessionId);
}
}