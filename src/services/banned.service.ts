import { db } from '../../prisma/client';

let bannedCache = new Set<bigint>();

export const loadBannedChats = async (): Promise<void> => {
  const rows = await db.bannedChat.findMany({ select: { chatId: true } });
  bannedCache = new Set(rows.map((r) => r.chatId));
};

export const isBanned = (chatId: bigint): boolean => {
  return bannedCache.has(chatId);
};

export const banChannel = async (chatId: bigint, title: string): Promise<void> => {
  await db.bannedChat.upsert({
    where: { chatId },
    update: { title },
    create: { chatId, title },
  });
  await loadBannedChats();
};

export const unbanChannel = async (chatId: bigint): Promise<boolean> => {
  try {
    await db.bannedChat.delete({ where: { chatId } });
    await loadBannedChats();
    return true;
  } catch {
    return false;
  }
};

export const getBannedChannels = async (): Promise<{ chatId: bigint; title: string }[]> => {
  return db.bannedChat.findMany({ select: { chatId: true, title: true } });
};
