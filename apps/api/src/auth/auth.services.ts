import { Injectable, ConflictException, UnauthorizedException } from '@nestjs/common';
import * as argon2 from 'argon2';
import { JwtService } from '@nestjs/jwt';
import { UsersService } from 'src/user/user.services';
import RegisterDto from './auth.dto/auth.register.dto';
import LoginDto from './auth.dto/auth.login.dto';
import { randomBytes, createHash } from 'crypto';

import { PrismaService } from 'prisma/prisma.services';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
  ) {}
async findById(id: string) {
  return this.prisma.user.findUnique({ where: { id } });
}

private generateRawRefreshToken(): string {
  return randomBytes(64).toString('hex');
}

private hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
private async issueRefreshToken(userId: string) {
  const rawToken = this.generateRawRefreshToken();
  const tokenHash = this.hashToken(rawToken);
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

  await this.prisma.refreshToken.create({
    data: { userId, tokenHash, expiresAt },
  });

  return rawToken; // only the raw token goes to the client — never the hash
}
  async issueAccessToken(userId: string, email: string, role: string) {
    const payload = { sub: userId, email, role };
    return this.jwtService.signAsync(payload);
  }

  async register(dto: RegisterDto) {
    const existing = await this.usersService.findByEmail(dto.email);
    if (existing) {
      throw new ConflictException('Email already registered');
    }

    const hashedPassword = await argon2.hash(dto.password);

    const user = await this.usersService.create({
      email: dto.email,
      password: hashedPassword,
    });

    const accesstoken = await this.issueAccessToken(user.id, user.email, user.role);
    const refreshtoken = await this.issueRefreshToken(user.id); 
    const { password, ...safeUser } = user;
    return { user: safeUser, accesstoken,refreshtoken };
  }

  async login(dto: LoginDto) {
    const finduser = await this.usersService.findByEmail(dto.email);
    if (!finduser) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const ispasswordcorrect = await argon2.verify(finduser.password, dto.password);
    if (!ispasswordcorrect) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const accesstoken = await this.issueAccessToken(finduser.id, finduser.email, finduser.role);
    const refreshtoken = await this.issueRefreshToken(finduser.id); 
    const { password, ...safeuser } = finduser;
    return { user: safeuser, accesstoken,refreshtoken };
  }

async refresh(rawToken: string) {
  const tokenHash = this.hashToken(rawToken);

  const existingToken = await this.prisma.refreshToken.findFirst({
    where: { tokenHash },
  });

  if (!existingToken) {
    throw new UnauthorizedException('Invalid refresh token');
  }

  if (existingToken.revoked) {
    // Reuse of an already-rotated token — treat as theft, kill the whole session family
    await this.prisma.refreshToken.updateMany({
      where: { userId: existingToken.userId },
      data: { revoked: true },
    });
    throw new UnauthorizedException('Refresh token reuse detected — all sessions revoked');
  }

  if (existingToken.expiresAt < new Date()) {
    throw new UnauthorizedException('Refresh token expired');
  }

  // Rotate: kill the old one, issue new access + refresh tokens
  await this.prisma.refreshToken.update({
    where: { id: existingToken.id },
    data: { revoked: true },
  });

  const user = await this.usersService.findById(existingToken.userId);
  if (!user) {
    throw new UnauthorizedException('User no longer exists');
  }

  const newAccessToken = await this.issueAccessToken(user.id, user.email, user.role);
  const newRefreshToken = await this.issueRefreshToken(user.id);

  return { accesstoken: newAccessToken, refreshtoken: newRefreshToken };
}

}