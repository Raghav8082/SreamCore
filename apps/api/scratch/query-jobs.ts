import * as dotenv from 'dotenv';
dotenv.config();

import { PrismaService } from '../prisma/prisma.services';

async function main() {
  const prisma = new PrismaService();
  await prisma.$connect();
  const jobs = await prisma.processingJob.findMany();
  console.log('All Processing Jobs:', JSON.stringify(jobs, (_, v) => typeof v === 'bigint' ? v.toString() : v, 2));
  await prisma.$disconnect();
}

main().catch(console.error);
