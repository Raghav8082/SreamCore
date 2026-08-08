import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  PutBucketCorsCommand,
} from '@aws-sdk/client-s3';
import { Readable } from 'stream';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';


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
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED',
    });

    this.rawBucket = this.config.get<string>('MINIO_RAW_BUCKET')!;
    
    // Asynchronously configure CORS for both buckets
    this.setupCors();
  }

  private async setupCors() {
    await this.configureCors(this.rawBucket);
    await this.configureCors('streamcore-processed');
  }

  private async configureCors(bucket: string) {
    try {
      await this.client.send(
        new PutBucketCorsCommand({
          Bucket: bucket,
          CORSConfiguration: {
            CORSRules: [
              {
                AllowedHeaders: ['*'],
                AllowedMethods: ['GET', 'POST', 'PUT', 'DELETE', 'HEAD'],
                AllowedOrigins: ['*'],
                ExposeHeaders: ['ETag'],
                MaxAgeSeconds: 3000,
              },
            ],
          },
        }),
      );
      console.log(`CORS configured successfully for bucket: ${bucket}`);
    } catch (err) {
      console.warn(`Failed to configure CORS for bucket: ${bucket}`, err);
    }
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


  async getObjectAsText(bucket: string, key: string): Promise<string> {
    const response = await this.getObjectStream(bucket, key);
    if (!response) throw new Error(`Stream is undefined for key: ${key} in bucket: ${bucket}`);
    const readableStream = response as Readable;
    const chunks: Uint8Array[] = [];
    for await (const chunk of readableStream) {
      chunks.push(chunk as Uint8Array);
    }
    const buffer = Buffer.concat(chunks);
    return buffer.toString('utf-8');
  }

  async getSignedUrl(bucket: string, key: string, expiresInSeconds = 3600): Promise<string> {
    const command = new GetObjectCommand({ Bucket: bucket, Key: key });
    return getSignedUrl(this.client as any, command, { expiresIn: expiresInSeconds });
  }
  
  // storage.service.ts
  async getSignedManifest(videoId: string): Promise<string> {
    const rawKey = `videos/${videoId}/master.m3u8`;
    const raw = await this.getObjectAsText(this.rawBucket, rawKey); // fetch playlist text from MinIO

    const lines = raw.split('\n');
    const signedLines = await Promise.all(
      lines.map(async (line) => {
        const trimmed = line.trim();
        // Segment lines (.ts/.m4s) or variant playlists (.m3u8) — sign both,
        // skip tags (#EXTINF etc.) and blank lines
        if (trimmed && !trimmed.startsWith('#')) {
          const segmentKey = `videos/${videoId}/${trimmed}`;
          return this.getSignedUrl(this.rawBucket, segmentKey, 3600);
        }
        return line;
      }),
    );

    return signedLines.join('\n');
  }
}