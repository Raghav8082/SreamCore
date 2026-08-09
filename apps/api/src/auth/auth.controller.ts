import { Body, Controller, Post, UseGuards, Req, Get, UnauthorizedException } from '@nestjs/common';
import RegisterDto from './auth.dto/auth.register.dto';
import { AuthService } from './auth.services';
import LoginDto from './auth.dto/auth.login.dto';
 import { JwtAuthGuard } from './guards/auth-guard';
import { RolesGuard } from './guards/roles-guard';
import { Roles } from './decorators/roles.decorator';
import { Throttle } from '@nestjs/throttler';
import { Res } from '@nestjs/common';
import type { Request, Response } from 'express';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}
 @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }
  @Throttle({ default: { limit: 5, ttl: 60000 } }) 
  @Post('login')
async login(@Body() dto: LoginDto, @Res({ passthrough: true }) res: Response) {
  const result = await this.authService.login(dto);

  res.cookie('refreshToken', result.refreshtoken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production', // only over HTTPS in prod; allow HTTP locally for dev testing
    sameSite: 'strict',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days, matching your refresh token's actual expiry
    path: '/auth', // only sent on requests to /auth/* routes, not every request
  });

  return { user: result.user, accesstoken: result.accesstoken }; // refresh token no longer in the body
}
  @UseGuards(JwtAuthGuard)
  @Get('me')
  getProfile(@Req() req) {
    return req.user;
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
@Get('admin-only')
adminOnly(@Req() req) {
  return { message: 'You are an admin', user: req.user };
}

 @Throttle({ default: { limit: 20, ttl: 60000 } })
@Post('refresh')
async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
  const refreshtoken = req.cookies['refreshToken'];
  if (!refreshtoken) throw new UnauthorizedException('No refresh token provided');

  const result = await this.authService.refresh(refreshtoken);

  res.cookie('refreshToken', result.refreshtoken, { /* same options as above */ });
  return { accesstoken: result.accesstoken };
}
}