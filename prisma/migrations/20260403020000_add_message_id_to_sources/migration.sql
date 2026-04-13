-- AlterTable
ALTER TABLE "content_hash_sources" ADD COLUMN "messageId" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "content_hash_sources" ADD COLUMN "sourceChatId" BIGINT NOT NULL DEFAULT 0;
