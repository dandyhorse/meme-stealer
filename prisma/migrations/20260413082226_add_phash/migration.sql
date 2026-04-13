-- DropIndex
DROP INDEX "minithumbnails_isPostedToFilteredChat_idx";

-- DropIndex
DROP INDEX "minithumbnails_md5_key";

-- AlterTable
ALTER TABLE "minithumbnails" DROP COLUMN "isPostedToFilteredChat",
ADD COLUMN     "phash" BIGINT,
ALTER COLUMN "md5" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "minithumbnails_phash_idx" ON "minithumbnails"("phash");
