import * as dotenv from 'dotenv';
dotenv.config();
import { PrismaService } from '../prisma/prisma.services';

async function main() {
  const prisma = new PrismaService();
  await prisma.$connect();
  const session = await prisma.uploadSession.findUnique({
    where: { id: '3cd80de2-eccb-4fe2-9ea2-99d728f10dec' }
  });
  console.log('Upload Session:', JSON.stringify(session, (_, v) => typeof v === 'bigint' ? v.toString() : v, 2));
  await prisma.$disconnect();
}

main().catch(console.error);
