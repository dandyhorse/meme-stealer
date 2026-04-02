import { db } from '../../prisma/client';

// Data transfer object representing a monitored Telegram channel.
// Used to pass channel metadata between the database layer and the polling loop.
export interface ChannelData {
  chatId: bigint;
  title: string;
  isActive: boolean;
  lastMessageId: number;
}

// Fetches all channels currently marked as active in the database.
// The polling loop calls this to know which channels to check for new messages.
export const getActiveChannels = async (): Promise<ChannelData[]> => {
  const channels = await db.chat.findMany({
    where: { isActive: true },
  });

  return channels.map((ch) => ({
    chatId: ch.chatId,
    title: ch.title,
    isActive: ch.isActive,
    lastMessageId: ch.lastMessageId,
  }));
};

// Adds a new channel to the monitoring list, or reactivates an existing inactive one.
// Returns { reactivated: true } if the channel was previously deactivated.
// Returns { reactivated: false } if the channel is brand new or already active.
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

// Soft-deletes a channel by marking it as inactive.
// The channel stops being polled, but its database record (and deduplication history) is preserved.
// Returns true if successfully deactivated, false if not found or already inactive.
export const deactivateChannel = async (chatId: bigint): Promise<boolean> => {
  const existing = await db.chat.findUnique({ where: { chatId } });
  if (!existing || !existing.isActive) return false;

  await db.chat.update({
    where: { chatId },
    data: { isActive: false },
  });
  return true;
};
