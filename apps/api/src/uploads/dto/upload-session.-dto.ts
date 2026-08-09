import { IsString, IsNumber, Min, IsOptional } from 'class-validator';

export class CreateUploadSessionDto {
  @IsString()
  fileName: string;

  @IsNumber()
  @Min(1)
  fileSize: number;

  @IsOptional()
  @IsString()
  title?: string;
}