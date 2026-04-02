import { db } from '../../prisma/client';

// ============ CHATS ============
// Functions for managing watched Telegram channels (chats) in the database.
// Each chat represents a source channel that the bot polls for new memes.

// Returns all channels that are currently active (not deactivated).
// Used by the polling loop to know which channels to check for new messages.
export const getActiveChats = async () => {
  return db.chat.findMany({
    where: { isActive: true },
  });
};

// Looks up a single channel by its Telegram chat ID.
// Returns null if the channel is not in the database.
export const findChatByChatId = async (chatId: bigint) => {
  return db.chat.findUnique({
    where: { chatId },
  });
};

// Creates a new channel record or updates the title if it already exists.
// Useful when seeding or when a channel's title changes.
export const upsertChat = async (chatId: bigint, title: string, isActive: boolean = true) => {
  return db.chat.upsert({
    where: { chatId },
    update: { title },
    create: { chatId, title, isActive },
  });
};

// Updates the last processed message ID for a channel.
// The polling loop uses this to skip messages it has already seen.
export const updateLastMessageId = async (chatId: bigint, lastMessageId: number) => {
  return db.chat.update({
    where: { chatId },
    data: { lastMessageId },
  });
};

// ============ MINITHUMBNAILS ============
// Functions for deduplication using MD5 hashes of stripped thumbnails (~32x32 JPEG).
// Each unique thumbnail hash is stored with its source channels tracked.
// If the same hash appears from multiple channels, it's considered a duplicate.

// Finds a thumbnail record by its MD5 hash.
// Also loads all source channels (channelsFrom) so we know where this content has appeared.
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

// Creates a new thumbnail record and links it to the source channel.
// Throws if the channel doesn't exist in the database (shouldn't happen during normal operation).
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

// Adds a new source channel to an existing thumbnail record.
// Uses upsert to avoid duplicate entries if the same channel sends the same content twice.
export const addMinithumbnailSource = async (minithumbnailId: number, chatId: bigint) => {
  const chat = await findChatByChatId(chatId);
  if (!chat) {
    throw new Error(`Chat not found: ${chatId}`);
  }

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
 * Main deduplication entry point.
 * Checks if a thumbnail hash is new or already seen:
 * - If new: creates a record and returns { isNew: true }
 * - If duplicate: adds the source channel and returns { isNew: false }
 *
 * The caller uses `isNew` to decide whether to forward to proxy (new) or filtered (duplicate).
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
