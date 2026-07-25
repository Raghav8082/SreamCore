import { Body, Controller, Post,UseGuards,Request, Get } from '@nestjs/common';
import RegisterDto from './auth.dto/auth.register.dto';
import { AuthService } from './auth.services';
import LoginDto from './auth.dto/auth.login.dto';
 import { JwtAuthGuard } from './guards/auth-guard';
import { RolesGuard } from './guards/roles-guard';
import { Roles } from './decorators/roles.decorator';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }
  @Post('login')
  login(@Body() dto:LoginDto){
    return this.authService.login(dto);
  }
  @UseGuards(JwtAuthGuard)
  @Get('me')
  getProfile(@Request() req) {
    return req.user;
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
@Get('admin-only')
adminOnly(@Request() req) {
  return { message: 'You are an admin', user: req.user };
}
@Post('refresh')
refresh(@Body('refreshToken') rawToken: string) {
  return this.authService.refresh(rawToken);
}
}