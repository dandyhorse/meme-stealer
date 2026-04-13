-- CreateIndex
CREATE UNIQUE INDEX "content_hash_sources_chatId_messageId_sourceChatId_key"
  ON "content_hash_sources"("chatId", "messageId", "sourceChatId");
