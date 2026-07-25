import { IsString, IsNumber, Min } from 'class-validator';

export class CreateUploadSessionDto {
  @IsString()
  fileName: string;

  @IsNumber()
  @Min(1)
  fileSize: number;
}