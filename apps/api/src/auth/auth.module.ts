import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';

import { AuthController} from './auth.controller'; 
import { UsersModule } from 'src/user/user.module';
import { AuthService } from './auth.services';
import { JwtModuleOptions } from '@nestjs/jwt';
import { JwtStrategy } from './strategies/jwt.strategy';

@Module({
  imports: [
    UsersModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
     useFactory: (config: ConfigService): JwtModuleOptions => ({
  secret: config.get<string>('JWT_ACCESS_SECRET')!,
  signOptions: {
    expiresIn: config.get<string>('JWT_ACCESS_EXPIRES_IN') as any,
  },
}),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy],
})
export class AuthModule {}
