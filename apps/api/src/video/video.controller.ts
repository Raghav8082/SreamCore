import { Controller , Get , Param , UseGuards , Request, Body, Post } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/guards/auth-guard";
import { PrismaService } from "prisma/prisma.services";
import { StorageService } from "src/storage/storage.service";


@Controller('videos')
@UseGuards(JwtAuthGuard) 
export class VideoController{
    constructor(
        private readonly prisma: PrismaService,
        private readonly storage: StorageService
    ){} 
    @Get(':id/manifest.m3u8')
    async getManifest(@Param('id') id: string , @Request() req: any){
        const video = await this.prisma.uploadSession.findUnique({ where:{id}});
        if(!video) throw new Error("video not found ");
        
    }

@Post(':videoId/progress')
async saveProgress(
  @Request() req,
  @Param('videoId') videoId: string,
  @Body() dto: { positionSeconds: number; durationSeconds?: number },
) {
  const completed = dto.durationSeconds
    ? dto.positionSeconds / dto.durationSeconds > 0.95 // treat 95%+ as "finished"
    : false;

  return this.prisma.playbackProgress.upsert({
    where: { userId_videoId: { userId: req.user.userId, videoId } },
    update: { positionSeconds: dto.positionSeconds, durationSeconds: dto.durationSeconds, completed },
    create: {
      userId: req.user.userId,
      videoId,
      positionSeconds: dto.positionSeconds,
      durationSeconds: dto.durationSeconds,
      completed,
    },
  });
}

@Get(':videoId/progress')
async getProgress(@Request() req, @Param('videoId') videoId: string) {
  const progress = await this.prisma.playbackProgress.findUnique({
    where: { userId_videoId: { userId: req.user.userId, videoId } },
  });
  return progress ?? { positionSeconds: 0, completed: false };
}
@UseGuards(JwtAuthGuard)
@Get('videos/continue-watching')
async getContinueWatching(@Request() req) {
  return this.prisma.playbackProgress.findMany({
    where: {
      userId: req.user.userId,
      completed: false,
      positionSeconds: { gt: 0 },
    },
    orderBy: { updatedAt: 'desc' },
    take: 10,
  });
}
}
