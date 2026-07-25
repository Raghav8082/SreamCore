import { Module } from '@nestjs/common';

import { AuthControllerController } from './auth.controller'; 
import { UsersModule } from 'src/user/user.module';
import { AuthService } from './auth.services';

@Module({
  imports:[UsersModule],
  controllers: [AuthControllerController],
  providers: [AuthService]
})
export class AuthModule {}
