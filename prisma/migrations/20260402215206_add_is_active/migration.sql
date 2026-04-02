/*
  Warnings:

  - You are about to drop the column `state` on the `chats` table. All the data in the column will be lost.

*/
-- CreateEnum
CREATE TYPE "AdminRole" AS ENUM ('admin', 'full_access');

-- DropIndex
DROP INDEX "chats_state_idx";

-- AlterTable
ALTER TABLE "chats" DROP COLUMN "state",
ADD COLUMN     "is_active" BOOLEAN NOT NULL DEFAULT true;

-- DropEnum
DROP TYPE "ChatState";

-- CreateTable
CREATE TABLE "admins" (
    "id" SERIAL NOT NULL,
    "telegram_id" BIGINT NOT NULL,
    "role" "AdminRole" NOT NULL DEFAULT 'admin',
    "name" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admins_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "admins_telegram_id_key" ON "admins"("telegram_id");

-- CreateIndex
CREATE INDEX "chats_is_active_idx" ON "chats"("is_active");
