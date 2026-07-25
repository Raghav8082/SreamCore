import { Module } from '@nestjs/common';
import { UsersService } from './user.services';


@Module({
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}