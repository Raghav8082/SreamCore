import { Injectable } from '@nestjs/common';
import { PrismaService } from 'prisma/prisma.services';


@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async findByEmail(email: string) {
    return this.prisma.user.findUnique({ where: { email } });
  }

  async findById(id: string) {
    return this.prisma.user.findUnique({ where: { id } });
  }

  async create(data: { email: string; password: string }) {
    return this.prisma.user.create({ data });
  }
}