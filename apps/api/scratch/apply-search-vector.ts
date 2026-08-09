import { Pool } from 'pg';
import * as dotenv from 'dotenv';

dotenv.config();

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    console.log("Running migration queries...");
    await pool.query(`
      ALTER TABLE "UploadSession" ADD COLUMN IF NOT EXISTS "searchVector" tsvector
        GENERATED ALWAYS AS (
          setweight(to_tsvector('english', coalesce("title", "fileName", '')), 'A') ||
          setweight(to_tsvector('english', coalesce("description", '')), 'B')
        ) STORED;
    `);
    console.log("Column added successfully.");

    await pool.query(`
      CREATE INDEX IF NOT EXISTS "UploadSession_searchVector_idx" 
      ON "UploadSession" USING GIN ("searchVector");
    `);
    console.log("Index created successfully.");

  } catch (err: any) {
    console.error("Migration error:", err);
  } finally {
    await pool.end();
  }
}

main();
