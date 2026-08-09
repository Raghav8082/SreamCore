import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import * as dotenv from 'dotenv';

dotenv.config();

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });

  try {
    const userId = "b39b6dab-e3c5-4264-8b87-16db05007640";
    const query = "testv";
    const result = await prisma.$queryRaw`
      SELECT id, title, "fileName", description,
             ts_rank("searchVector", plainto_tsquery('english', ${query})) AS rank
      FROM "UploadSession"
      WHERE "userId" = ${userId}
        AND status = 'COMPLETED'
        AND "searchVector" @@ plainto_tsquery('english', ${query})
      ORDER BY rank DESC
      LIMIT 20
    `;
    console.log("Success:", result);
  } catch (err: any) {
    console.error("Error message:", err.message);
    console.error("Full Error:", err);
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main();
