import crypto from 'crypto';

import { Api } from 'telegram';
import { NewMessage, NewMessageEvent } from 'telegram/events';

import { checkAndTrackMinithumbnail, updateLastMessageId } from './db';
import { LogLevel } from '../utils/common/dtos';
import { systemLogger } from '../utils/system-logger';

const PROXY_CHAT_ID = -1003518762032;
const FILTERED_CHAT_ID = -1003722286620;

const hasUrl = (message: Api.Message): boolean => {
  const text = message.message || message.text;
  if (text && /https?:\/\//.test(text)) {
    return true;
  }

  if (message.entities) {
    for (const entity of message.entities) {
      if (entity.className === 'MessageEntityUrl' || entity.className === 'MessageEntityTextUrl') {
        return true;
      }
    }
  }

  if (message.replyMarkup && 'rows' in message.replyMarkup) {
    for (const row of message.replyMarkup.rows) {
      for (const button of row.buttons) {
        if ('url' in button && button.url) {
          return true;
        }
      }
    }
  }

  return false;
};

const getMediaType = (media: Api.TypeMessageMedia): string => {
  return media.className || 'Unknown';
};

const extractThumbnailBytes = (message: Api.Message): Buffer | null => {
  const media = message.media;
  if (!media) return null;

  let thumbs: Api.TypePhotoSize[] | undefined;

  if ('document' in media && media.document && 'thumbs' in media.document) {
    thumbs = media.document.thumbs;
  }

  if ('photo' in media && media.photo && 'sizes' in media.photo) {
    thumbs = media.photo.sizes;
  }

  if ('story' in media && media.story && 'media' in media.story) {
    const storyMedia = media.story.media;
    if (storyMedia && 'photo' in storyMedia && storyMedia.photo && 'sizes' in storyMedia.photo) {
      thumbs = storyMedia.photo.sizes;
    }
    if (
      storyMedia &&
      'document' in storyMedia &&
      storyMedia.document &&
      'thumbs' in storyMedia.document
    ) {
      thumbs = storyMedia.document.thumbs;
    }
  }

  if (!thumbs) return null;

  const stripped = thumbs.find(
    (t): t is Api.PhotoStrippedSize => 'type' in t && t.type === 'i' && 'bytes' in t,
  );

  if (stripped && stripped.bytes) {
    return Buffer.from(stripped.bytes);
  }

  return null;
};

const computeMd5 = (data: Buffer): string => {
  return crypto.createHash('md5').update(data).digest('hex');
};

const forwardToFiltered = async (message: Api.Message, sourceChatId: bigint, reason: string) => {
  if (!FILTERED_CHAT_ID) return;

  const { tgClient } = await import('@config');
  await tgClient.forwardMessages(FILTERED_CHAT_ID, {
    fromPeer: String(sourceChatId),
    messages: [message.id],
  });
  systemLogger.log({
    level: LogLevel.LOG,
    module: 'FILTERED',
    message: `Сообщение ${message.id} → filtered: ${reason}`,
  });
};

const processMessage = async (
  message: Api.Message,
  sourceChatId: bigint,
  channelTitle: string,
): Promise<void> => {
  if (!message.media) {
    await forwardToFiltered(message, sourceChatId, `[${channelTitle}] нет медиа`);
    return;
  }

  if (hasUrl(message)) {
    await forwardToFiltered(message, sourceChatId, `[${channelTitle}] реклама/URL`);
    return;
  }

  const thumbnailBytes = extractThumbnailBytes(message);

  if (!thumbnailBytes) {
    const mediaType = getMediaType(message.media);
    const { tgClient } = await import('@config');
    await tgClient.forwardMessages(PROXY_CHAT_ID, {
      fromPeer: String(sourceChatId),
      messages: [message.id],
    });

    systemLogger.log({
      level: LogLevel.LOG,
      module: 'PROCESS',
      message: `[${channelTitle}] ${message.id} → proxy без дедупликации (${mediaType})`,
    });

    return;
  }

  const md5 = computeMd5(thumbnailBytes);
  const result = await checkAndTrackMinithumbnail(md5, sourceChatId);

  if (result.isNew) {
    const { tgClient } = await import('@config');
    await tgClient.forwardMessages(PROXY_CHAT_ID, {
      fromPeer: String(sourceChatId),
      messages: [message.id],
    });

    systemLogger.log({
      level: LogLevel.LOG,
      module: 'PROCESS',
      message: `[${channelTitle}] ${message.id} → proxy (новый)`,
    });
  } else {
    await forwardToFiltered(message, sourceChatId, `[${channelTitle}] дубликат`);
  }
};

export const handleNewMessage = async (event: NewMessageEvent) => {
  const message = event.message;

  let rawChatId = event.chatId ?? message.chatId;

  if (!rawChatId && message.peerId) {
    if ('channelId' in message.peerId) {
      rawChatId = message.peerId.channelId;
    } else if ('chatId' in message.peerId) {
      rawChatId = message.peerId.chatId;
    } else if ('userId' in message.peerId) {
      rawChatId = message.peerId.userId;
    }
  }

  if (!rawChatId) {
    systemLogger.log({
      level: LogLevel.WARN,
      module: 'EVENT',
      message: `Не удалось получить chatId из события`,
      details: { messageId: message.id, peerId: message.peerId },
    });
    return;
  }

  const cleanChatId = BigInt(String(rawChatId).replace(/\n/g, ''));

  try {
    await processMessage(message, cleanChatId, 'TEST');
    await updateLastMessageId(cleanChatId, message.id);
  } catch (err) {
    systemLogger.log({
      level: LogLevel.ERROR,
      module: 'EVENT',
      message: `Ошибка обработки сообщения ${message.id} `,
      details: err,
    });
  }
};

export { NewMessage };
