import { Injectable, ConflictException } from '@nestjs/common';
import * as argon2 from 'argon2';
import { UsersService } from 'src/user/user.services';
import RegisterDto from './auth.dto/auth.register.dto';


@Injectable()
export class AuthService {
  constructor(private readonly usersService: UsersService) {}

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

    const { password, ...safeUser } = user;
    return safeUser;
  }
}