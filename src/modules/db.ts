import { ChatState } from '../../generated/client';
import { db } from '../../prisma/client';

// ============ CHATS ============

export const getFavoriteChats = async () => {
  return db.chat.findMany({
    where: { state: ChatState.FAVORITE },
  });
};

export const findChatByChatId = async (chatId: bigint) => {
  return db.chat.findUnique({
    where: { chatId },
  });
};

export const upsertChat = async (
  chatId: bigint,
  title: string,
  state: ChatState = ChatState.FAVORITE,
) => {
  return db.chat.upsert({
    where: { chatId },
    update: { title },
    create: { chatId, title, state },
  });
};

export const updateLastMessageId = async (chatId: bigint, lastMessageId: number) => {
  return db.chat.update({
    where: { chatId },
    data: { lastMessageId },
  });
};

// ============ MINITHUMBNAILS ============

export const findMinithumbnailByMd5 = async (md5: string) => {
  return db.minithumbnail.findUnique({
    where: { md5 },
    include: {
      channelsFrom: {
        include: { chat: true },
      },
    },
  });
};

export const createMinithumbnail = async (md5: string, chatId: bigint) => {
  const chat = await findChatByChatId(chatId);
  if (!chat) {
    throw new Error(`Chat not found: ${chatId}`);
  }

  return db.minithumbnail.create({
    data: {
      md5,
      channelsFrom: {
        create: { chatId: chat.id },
      },
    },
    include: {
      channelsFrom: true,
    },
  });
};

export const addMinithumbnailSource = async (minithumbnailId: number, chatId: bigint) => {
  const chat = await findChatByChatId(chatId);
  if (!chat) {
    throw new Error(`Chat not found: ${chatId}`);
  }

  // upsert чтобы не дублировать связь
  return db.minithumbnailSource.upsert({
    where: {
      minithumbnailId_chatId: {
        minithumbnailId,
        chatId: chat.id,
      },
    },
    update: {},
    create: {
      minithumbnailId,
      chatId: chat.id,
    },
  });
};

// ============ COMBINED LOGIC ============

/**
 * Проверяет minithumbnail: новый или дубликат
 */
export const checkAndTrackMinithumbnail = async (md5: string, chatId: bigint) => {
  const existing = await findMinithumbnailByMd5(md5);

  if (!existing) {
    const created = await createMinithumbnail(md5, chatId);
    return { isNew: true, minithumbnail: created };
  }

  await addMinithumbnailSource(existing.id, chatId);
  return { isNew: false, minithumbnail: existing };
};
