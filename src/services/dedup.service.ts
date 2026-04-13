import { Api } from 'telegram';

import { env } from '@config';
import { checkAndTrackHash } from '../modules/db';
import {
  downloadSmallDocument,
  downloadThumbnail,
  extractThumbnailBytes,
  getMediaType,
  detectMediaKind,
  MAX_STICKER_SIZE,
  MAX_GIF_SIZE,
  type MediaKind,
} from '../utils/media';
import { computeDHash } from '../utils/phash';
import { hasUrl } from '../utils/url-filter';
import { forwardToProxy, forwardToFiltered } from './forwarding.service';

const VIRAL_THRESHOLD = 3;

interface HashResult {
  hash: bigint;
  kind: MediaKind;
}

async function computeHashForMessage(message: Api.Message, kind: MediaKind): Promise<HashResult | null> {
  if (kind === 'round_video') return null;

  // Stage 1: Stripped thumbnail (free, inline, works for all media types)
  const stripped = extractThumbnailBytes(message);
  if (stripped) {
    try {
      return { hash: await computeDHash(stripped), kind };
    } catch {
      // Stripped thumbnail may not be valid image data — fall through
    }
  }

  // Stage 2: Download PhotoSize thumbnail ('m' or 's')
  const downloaded = await downloadThumbnail(message);
  if (downloaded) {
    try {
      return { hash: await computeDHash(downloaded), kind };
    } catch {
      // fall through to media-type-specific fallback
    }
  }

  // Stage 3: Media-type-specific fallback — download the actual file
  if (kind === 'sticker') {
    const file = await downloadSmallDocument(message, MAX_STICKER_SIZE);
    if (file) {
      try {
        return { hash: await computeDHash(file), kind };
      } catch {
        // WebP/Lottie might not be processable
      }
    }
  }

  if (kind === 'gif') {
    const file = await downloadSmallDocument(message, MAX_GIF_SIZE);
    if (file) {
      try {
        return { hash: await computeDHash(file), kind };
      } catch {
        // MP4 "GIFs" can't be processed by sharp — those should have thumbnails above
      }
    }
  }

  return null;
}

export const processMessage = async (
  message: Api.Message,
  sourceChatId: bigint,
  channelTitle: string,
  chatDbId: number,
): Promise<void> => {
  if (!message.media) {
    await forwardToFiltered([message.id], sourceChatId, `[${channelTitle}] нет медиа`);
    return;
  }

  const kind = detectMediaKind(message);
  if (kind === 'round_video') {
    await forwardToFiltered([message.id], sourceChatId, `[${channelTitle}] видеосообщение`);
    return;
  }

  if (hasUrl(message)) {
    await forwardToFiltered([message.id], sourceChatId, `[${channelTitle}] реклама/URL`);
    return;
  }

  const hashResult = await computeHashForMessage(message, kind);

  if (hashResult === null) {
    const kindStr = kind !== 'unknown' ? kind : getMediaType(message.media);
    await forwardToProxy(
      [message.id],
      sourceChatId,
      `[${channelTitle}] ${message.id} без дедупликации (${kindStr})`,
    );
    return;
  }

  const { hash, kind: resolvedKind } = hashResult;
  const result = await checkAndTrackHash(hash, chatDbId, env.HAMMING_THRESHOLD);
  const kindLabel = resolvedKind !== 'unknown' ? ` [${resolvedKind}]` : '';

  if (result.isNew) {
    await forwardToProxy(
      [message.id],
      sourceChatId,
      `[${channelTitle}] ${message.id}${kindLabel} (новый)`,
    );
    return;
  }

  if (result.sourceCount >= VIRAL_THRESHOLD) {
    await forwardToProxy(
      [message.id],
      sourceChatId,
      `[${channelTitle}] ${message.id}${kindLabel} вирусный (${result.sourceCount} источников)`,
    );
    return;
  }

  await forwardToFiltered(
    [message.id],
    sourceChatId,
    `[${channelTitle}] ${message.id}${kindLabel} дубликат`,
  );
};

export const processGroupedMessages = async (
  messages: Api.Message[],
  sourceChatId: bigint,
  channelTitle: string,
  chatDbId: number,
): Promise<void> => {
  const messageIds = messages.map((m) => m.id);

  if (messages.some((m) => hasUrl(m))) {
    await forwardToFiltered(messageIds, sourceChatId, `[${channelTitle}] группа реклама/URL`);
    return;
  }

  if (messages.every((m) => !m.media)) {
    await forwardToFiltered(messageIds, sourceChatId, `[${channelTitle}] группа без медиа`);
    return;
  }

  let firstChecked = false;
  let viralDetected = false;
  let groupKindLabel = '';

  for (const msg of messages) {
    const msgKind = detectMediaKind(msg);
    if (msgKind === 'round_video') continue;
    const hashResult = await computeHashForMessage(msg, msgKind);
    if (hashResult !== null) {
      const { hash, kind } = hashResult;
      const trackResult = await checkAndTrackHash(hash, chatDbId, env.HAMMING_THRESHOLD);

      if (!firstChecked) {
        firstChecked = true;
        groupKindLabel = kind !== 'unknown' ? ` [${kind}]` : '';
        if (!trackResult.isNew) {
          if (trackResult.sourceCount >= VIRAL_THRESHOLD) {
            viralDetected = true;
          } else {
            await forwardToFiltered(
              messageIds,
              sourceChatId,
              `[${channelTitle}]${groupKindLabel} группа дубликат`,
            );
            return;
          }
        }
      }
    }
  }

  const reason = viralDetected
    ? `[${channelTitle}]${groupKindLabel} группа вирусная (${messageIds.length} сообщ.)`
    : `[${channelTitle}]${groupKindLabel} группа (${messageIds.length} сообщ.)`;

  await forwardToProxy(messageIds, sourceChatId, reason);
};
