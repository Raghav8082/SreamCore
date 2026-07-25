import { IsEmail, IsString, MinLength } from "class-validator"


export default class RegisterDto{
@IsEmail()
email:string 

// @IsString()
@MinLength(8)
password: string

@IsString()
role?:string
}