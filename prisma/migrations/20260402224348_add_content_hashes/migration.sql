-- CreateTable
CREATE TABLE "content_hashes" (
    "id" SERIAL NOT NULL,
    "phash" BIGINT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "content_hashes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "content_hash_sources" (
    "id" SERIAL NOT NULL,
    "contentHashId" INTEGER NOT NULL,
    "chatId" INTEGER NOT NULL,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "content_hash_sources_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "content_hashes_phash_idx" ON "content_hashes"("phash");

-- CreateIndex
CREATE INDEX "content_hash_sources_chatId_idx" ON "content_hash_sources"("chatId");

-- CreateIndex
CREATE UNIQUE INDEX "content_hash_sources_contentHashId_chatId_key" ON "content_hash_sources"("contentHashId", "chatId");

-- AddForeignKey
ALTER TABLE "content_hash_sources" ADD CONSTRAINT "content_hash_sources_contentHashId_fkey" FOREIGN KEY ("contentHashId") REFERENCES "content_hashes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_hash_sources" ADD CONSTRAINT "content_hash_sources_chatId_fkey" FOREIGN KEY ("chatId") REFERENCES "chats"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Custom: Hamming distance function for perceptual hash comparison
CREATE OR REPLACE FUNCTION hamming_distance(a BIGINT, b BIGINT)
RETURNS INTEGER AS $$
  SELECT bit_count((a # b)::bit(64))::integer;
$$ LANGUAGE SQL IMMUTABLE STRICT PARALLEL SAFE;
