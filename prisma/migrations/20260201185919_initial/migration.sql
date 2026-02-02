-- CreateEnum
CREATE TYPE "ChatState" AS ENUM ('NONE', 'FAVORITE', 'BANNED');

-- CreateTable
CREATE TABLE "chats" (
    "id" SERIAL NOT NULL,
    "chatId" BIGINT NOT NULL,
    "title" TEXT NOT NULL,
    "state" "ChatState" NOT NULL DEFAULT 'NONE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "chats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "minithumbnails" (
    "id" SERIAL NOT NULL,
    "md5" CHAR(32) NOT NULL,
    "isPostedToFilteredChat" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "minithumbnails_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "minithumbnail_sources" (
    "id" SERIAL NOT NULL,
    "minithumbnailId" INTEGER NOT NULL,
    "chatId" INTEGER NOT NULL,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "minithumbnail_sources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stickers" (
    "id" SERIAL NOT NULL,
    "setId" BIGINT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stickers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "chats_chatId_key" ON "chats"("chatId");

-- CreateIndex
CREATE INDEX "chats_state_idx" ON "chats"("state");

-- CreateIndex
CREATE UNIQUE INDEX "minithumbnails_md5_key" ON "minithumbnails"("md5");

-- CreateIndex
CREATE INDEX "minithumbnails_isPostedToFilteredChat_idx" ON "minithumbnails"("isPostedToFilteredChat");

-- CreateIndex
CREATE INDEX "minithumbnail_sources_chatId_idx" ON "minithumbnail_sources"("chatId");

-- CreateIndex
CREATE UNIQUE INDEX "minithumbnail_sources_minithumbnailId_chatId_key" ON "minithumbnail_sources"("minithumbnailId", "chatId");

-- CreateIndex
CREATE UNIQUE INDEX "stickers_setId_key" ON "stickers"("setId");

-- AddForeignKey
ALTER TABLE "minithumbnail_sources" ADD CONSTRAINT "minithumbnail_sources_minithumbnailId_fkey" FOREIGN KEY ("minithumbnailId") REFERENCES "minithumbnails"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "minithumbnail_sources" ADD CONSTRAINT "minithumbnail_sources_chatId_fkey" FOREIGN KEY ("chatId") REFERENCES "chats"("id") ON DELETE CASCADE ON UPDATE CASCADE;
