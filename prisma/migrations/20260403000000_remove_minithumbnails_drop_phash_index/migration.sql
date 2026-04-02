-- DropIndex
DROP INDEX IF EXISTS "content_hashes_phash_idx";

-- DropForeignKey
ALTER TABLE "minithumbnail_sources" DROP CONSTRAINT IF EXISTS "minithumbnail_sources_minithumbnailId_fkey";
ALTER TABLE "minithumbnail_sources" DROP CONSTRAINT IF EXISTS "minithumbnail_sources_chatId_fkey";

-- DropTable
DROP TABLE IF EXISTS "minithumbnail_sources";
DROP TABLE IF EXISTS "minithumbnails";
