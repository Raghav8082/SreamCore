/*
  Warnings:

  - You are about to drop the column `thumbnailKey` on the `UploadSession` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "UploadSession" DROP COLUMN "thumbnailKey";
ALTER TABLE "UploadSession" ADD COLUMN "searchVector" tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce("title", "fileName", '')), 'A') ||
    setweight(to_tsvector('english', coalesce("description", '')), 'B')
  ) STORED;

CREATE INDEX "UploadSession_searchVector_idx" ON "UploadSession" USING GIN ("searchVector");