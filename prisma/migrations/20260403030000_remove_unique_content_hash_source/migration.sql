-- DropIndex
DROP INDEX IF EXISTS "content_hash_sources_contentHashId_chatId_key";

-- CreateIndex
CREATE INDEX "content_hash_sources_contentHashId_idx" ON "content_hash_sources"("contentHashId");
