import { db } from '../../prisma/client';

// ============ CHATS ============

export const getActiveChats = async () => {
  return db.chat.findMany({
    where: { isActive: true },
  });
};

export const findChatByChatId = async (chatId: bigint) => {
  return db.chat.findUnique({
    where: { chatId },
  });
};

export const upsertChat = async (chatId: bigint, title: string, isActive: boolean = true) => {
  return db.chat.upsert({
    where: { chatId },
    update: { title },
    create: { chatId, title, isActive },
  });
};

export const updateLastMessageId = async (chatId: bigint, lastMessageId: number) => {
  return db.chat.update({
    where: { chatId },
    data: { lastMessageId },
  });
};
