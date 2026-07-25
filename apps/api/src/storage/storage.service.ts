import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';

@Injectable()
export class StorageService {
  private readonly client: S3Client;
  private readonly rawBucket: string;

  constructor(private readonly config: ConfigService) {
    this.client = new S3Client({
      endpoint: this.config.get<string>('MINIO_ENDPOINT'),
      region: 'us-east-1', // required by the SDK, unused by MinIO itself
      credentials: {
        accessKeyId: this.config.get<string>('MINIO_ACCESS_KEY')!,
        secretAccessKey: this.config.get<string>('MINIO_SECRET_KEY')!,
      },
      forcePathStyle: true, // required for MinIO — explained below
    });

    this.rawBucket = this.config.get<string>('MINIO_RAW_BUCKET')!;
  }

  async uploadObject(bucket: string, key: string, body: Buffer) {
    return this.client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: body,
      }),
    );
  }
}