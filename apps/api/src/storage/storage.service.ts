import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { Readable } from 'stream';


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
   async getObjectStream(bucket: string, key: string) {
    const response = await this.client.send(
      new GetObjectCommand({
        Bucket: bucket,
        Key: key,
      }),
    );
    return response.Body;
  }
  async uploadstream(bucket:string ,key: string , body: Readable ){
     return await this.client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: body,
      }),
    );
  }
  async deleteObject(bucket:string , key:string){
    return await this.client.send(
      new DeleteObjectCommand({
        Bucket:bucket,
        Key:key
      })
    )
  }
}