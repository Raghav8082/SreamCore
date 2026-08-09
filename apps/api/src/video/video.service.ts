import { Injectable } from "@nestjs/common";
import { PrismaService } from "prisma/prisma.services";

@Injectable()
export class VideoService {
 constructor(private readonly prisma:PrismaService){
 }
async searchVideos(userId: string, query?: string) {
  const whereCondition: any = {
    status: 'COMPLETED',
  };

  if (query && query.trim()) {
    whereCondition.OR = [
      { title: { contains: query.trim(), mode: 'insensitive' } },
      { fileName: { contains: query.trim(), mode: 'insensitive' } },
    ];
  }

  return this.prisma.uploadSession.findMany({
    where: whereCondition,
    select: {
      id: true,
      title: true,
      fileName: true,
      createdAt: true,
      isMerged: true,
      status: true,
    },
    orderBy: { createdAt: 'desc' },
    take: 30,
  });
}

}