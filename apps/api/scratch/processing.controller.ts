import { Controller, Get, NotFoundException, Param, UseGuards } from '@nestjs/common';
import { PrismaService } from 'prisma/prisma.services';
import { JwtAuthGuard } from 'src/auth/guards/auth-guard';

@Controller('processing')
export class ProcessingController {

    constructor(private readonly prisma: PrismaService) { }

    @UseGuards(JwtAuthGuard)
@Get('videos/:videoId/processing-status')
async getProcessingStatus(@Param('videoId') videoId: string) {
  const job = await this.prisma.processingJob.findFirst({
    where: { videoId },
    orderBy: { createdAt: 'desc' },
  });
  if (!job) throw new NotFoundException('No processing job found for this video');
  return job;
}
}
