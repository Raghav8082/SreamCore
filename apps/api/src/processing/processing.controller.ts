import { Controller, Get, Param, UseGuards, NotFoundException } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/auth-guard';
import { PrismaService } from '../../prisma/prisma.services';

@Controller('processing')
export class ProcessingController {
  constructor(private readonly prisma: PrismaService) {}

  @UseGuards(JwtAuthGuard)
  @Get('videos/:videoId/status')
  async getStatus(@Param('videoId') videoId: string) {
    const job = await this.prisma.processingJob.findFirst({
      where: { videoId },
      orderBy: { createdAt: 'desc' },
    });
    if (!job) throw new NotFoundException('No processing job found for this video');
    return job;
  }
}
