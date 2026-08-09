/*
  Warnings:

  - You are about to drop the column `searchVector` on the `UploadSession` table. All the data in the column will be lost.

*/
-- DropIndex
DROP INDEX "UploadSession_searchVector_idx";

-- AlterTable
ALTER TABLE "UploadSession" DROP COLUMN "searchVector";
