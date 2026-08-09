import { IsEmail, IsOptional, IsString, MinLength } from "class-validator";

export default class RegisterDto {
  @IsEmail()
  email: string;

  @MinLength(8)
  password: string;

  @IsOptional()
  @IsString()
  role: string = 'USER';
}