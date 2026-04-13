-- CreateTable
CREATE TABLE "banned_chats" (
    "id" SERIAL NOT NULL,
    "chatId" BIGINT NOT NULL,
    "title" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "banned_chats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bot_state" (
    "id" SERIAL NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bot_state_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "banned_chats_chatId_key" ON "banned_chats"("chatId");

-- CreateIndex
CREATE UNIQUE INDEX "bot_state_key_key" ON "bot_state"("key");
