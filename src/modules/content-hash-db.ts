import { findChatByChatId } from './db';
import { db } from '../../prisma/client';
import { LogLevel } from '../utils/common/dtos';
import { HAMMING_THRESHOLD } from '../utils/phash';
import { systemLogger } from '../utils/system-logger';

// ============ CONTENT HASHES ============

interface ContentHashRow {
  id: number;
  phash: bigint;
  distance: number;
  createdAt: Date;
}

export const findSimilarHash = async (
  phash: bigint,
  threshold: number = HAMMING_THRESHOLD,
): Promise<ContentHashRow | null> => {
  const results = await db.$queryRaw<ContentHashRow[]>`
    SELECT id, phash, "createdAt",
           hamming_distance(phash, ${phash}::bigint) AS distance
    FROM content_hashes
    WHERE hamming_distance(phash, ${phash}::bigint) <= ${threshold}
    ORDER BY hamming_distance(phash, ${phash}::bigint) ASC
    LIMIT 1
  `;

  return results.length > 0 ? results[0] : null;
};

export const createContentHash = async (
  phash: bigint,
  chatId: bigint,
  messageId: number,
  sourceChatId: bigint,
) => {
  const chat = await findChatByChatId(chatId);
  if (!chat) {
    throw new Error(`Chat not found: ${chatId}`);
  }

  return db.contentHash.create({
    data: {
      phash,
      sources: {
        create: { chatId: chat.id, messageId, sourceChatId },
      },
    },
    include: {
      sources: true,
    },
  });
};

export const addContentHashSource = async (
  contentHashId: number,
  chatId: bigint,
  messageId: number,
  sourceChatId: bigint,
) => {
  const chat = await findChatByChatId(chatId);
  if (!chat) {
    throw new Error(`Chat not found: ${chatId}`);
  }

  return db.contentHashSource.upsert({
    where: {
      contentHashId_chatId: {
        contentHashId,
        chatId: chat.id,
      },
    },
    update: {},
    create: {
      contentHashId,
      chatId: chat.id,
      messageId,
      sourceChatId,
    },
  });
};

export const getOriginalSource = async (contentHashId: number) => {
  return db.contentHashSource.findFirst({
    where: { contentHashId },
    orderBy: { addedAt: 'asc' },
  });
};

// ============ COMBINED LOGIC ============

/**
 * Проверяет хэш: новый или дубликат. НЕ записывает в базу.
 */
export const checkContentHash = async (phash: bigint) => {
  const existing = await findSimilarHash(phash);

  if (!existing) {
    return { isNew: true, existing: null };
  }

  systemLogger.log({
    level: LogLevel.INFO,
    module: 'CONTENT_HASH',
    message: `Дубликат: distance=${existing.distance}, hashId=${existing.id}`,
  });

  return { isNew: false, existing };
};

/**
 * Записывает хэш в базу. Вызывать ПОСЛЕ успешного форварда.
 */
export const trackContentHash = async (
  phash: bigint,
  chatId: bigint,
  messageId: number,
  sourceChatId: bigint,
  existingHashId?: number,
) => {
  if (existingHashId) {
    await addContentHashSource(existingHashId, chatId, messageId, sourceChatId);
  } else {
    await createContentHash(phash, chatId, messageId, sourceChatId);
  }
};
