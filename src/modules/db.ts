import { db } from '../../prisma/client';
import { hammingDistance } from '../utils/phash';

// ============ CHATS ============

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

// ============ PHASH CACHE ============

interface HashCacheEntry {
  id: number;
  phash: bigint;
  sourceCount: number;
}

let hashCache: HashCacheEntry[] = [];
let cacheLoaded = false;
let loadingPromise: Promise<void> | null = null;
const MAX_CACHE_SIZE = 500_000;

export async function loadHashCache(): Promise<void> {
  const all = await db.minithumbnail.findMany({
    where: { phash: { not: null } },
    select: { id: true, phash: true, _count: { select: { channelsFrom: true } } },
  });
  hashCache = all.map((h) => ({
    id: h.id,
    phash: h.phash!,
    sourceCount: h._count.channelsFrom,
  }));
  cacheLoaded = true;
  if (hashCache.length >= MAX_CACHE_SIZE) {
    console.warn(`[phash] Hash cache size ${hashCache.length} exceeds ${MAX_CACHE_SIZE} — consider pruning`);
  }
}

async function ensureCacheLoaded(): Promise<void> {
  if (!cacheLoaded) {
    if (!loadingPromise) {
      loadingPromise = loadHashCache().catch((err) => {
        loadingPromise = null;
        throw err;
      });
    }
    await loadingPromise;
  }
}

function findNearestHash(phash: bigint, threshold: number): HashCacheEntry | null {
  let bestMatch: HashCacheEntry | null = null;
  let bestDistance = threshold + 1;

  for (const entry of hashCache) {
    const dist = hammingDistance(phash, entry.phash);
    if (dist < bestDistance) {
      bestDistance = dist;
      bestMatch = entry;
    }
  }

  return bestMatch;
}

export async function checkAndTrackHash(
  phash: bigint,
  chatDbId: number,
  threshold: number,
): Promise<{ isNew: boolean; sourceCount: number }> {
  await ensureCacheLoaded();

  const match = findNearestHash(phash, threshold);

  if (!match) {
    const created = await db.minithumbnail.create({
      data: { phash },
    });
    await db.minithumbnailSource.create({
      data: { minithumbnailId: created.id, chatId: chatDbId },
    });
    hashCache.push({ id: created.id, phash, sourceCount: 1 });
    if (hashCache.length >= MAX_CACHE_SIZE) {
      console.warn(`[phash] Hash cache size ${hashCache.length} exceeds ${MAX_CACHE_SIZE} — consider pruning`);
    }
    return { isNew: true, sourceCount: 1 };
  }

  const alreadyTracked = await db.minithumbnailSource.findUnique({
    where: { minithumbnailId_chatId: { minithumbnailId: match.id, chatId: chatDbId } },
  });

  if (!alreadyTracked) {
    await db.minithumbnailSource.create({
      data: { minithumbnailId: match.id, chatId: chatDbId },
    });
    match.sourceCount += 1;
  }

  return { isNew: false, sourceCount: match.sourceCount };
}
