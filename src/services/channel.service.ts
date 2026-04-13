import { db } from '../../prisma/client';

export interface ChannelData {
  id: number;
  chatId: bigint;
  title: string;
  isActive: boolean;
  lastMessageId: number;
}

export const getActiveChannels = async (): Promise<ChannelData[]> => {
  const channels = await db.chat.findMany({
    where: { isActive: true },
  });

  return channels.map((ch) => ({
    id: ch.id,
    chatId: ch.chatId,
    title: ch.title,
    isActive: ch.isActive,
    lastMessageId: ch.lastMessageId,
  }));
};

export const addChannel = async (
  chatId: bigint,
  title: string,
): Promise<{ reactivated: boolean }> => {
  const existing = await db.chat.findUnique({ where: { chatId } });

  if (existing) {
    if (!existing.isActive) {
      await db.chat.update({
        where: { chatId },
        data: { isActive: true, title },
      });
      return { reactivated: true };
    }
    return { reactivated: false };
  }

  await db.chat.create({
    data: { chatId, title, isActive: true },
  });
  return { reactivated: false };
};

export const deactivateChannel = async (chatId: bigint): Promise<boolean> => {
  const existing = await db.chat.findUnique({ where: { chatId } });
  if (!existing || !existing.isActive) return false;

  await db.chat.update({
    where: { chatId },
    data: { isActive: false },
  });
  return true;
};
