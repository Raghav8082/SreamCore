import { Controller, Get, Param, Req, Res, UseGuards } from '@nestjs/common';
import * as express from 'express';
import { StreamingService } from './streaming.service';
import { JwtAuthGuard } from 'src/auth/guards/auth-guard';

@Controller('streaming')
export class StreamingController {
    constructor(private readonly streamingService: StreamingService) {}

    @UseGuards(JwtAuthGuard)
    @Get('videos/:videoId/manifest')
    async getManifest(@Req() req, @Param('videoId') videoId: string, @Res() res: express.Response) {
      const playlist = await this.streamingService.getSignedMasterPlaylist(req.user.userId, videoId);
      res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
      res.send(playlist);
    }

    @UseGuards(JwtAuthGuard)
    @Get('videos/:videoId/rendition/*renditionPath')
    async getRendition(
      @Req() req,
      @Param('videoId') videoId: string,
      @Param('renditionPath') renditionPath: string | string[],
      @Res() res: express.Response,
    ) {
      const pathStr = Array.isArray(renditionPath) ? renditionPath.join('/') : renditionPath;
      const playlist = await this.streamingService.getSignedRenditionPlaylist(req.user.userId, videoId, pathStr);
      res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
      res.send(playlist);
    }
}
