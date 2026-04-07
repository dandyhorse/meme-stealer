import { Api } from 'telegram';
import { NewMessage, NewMessageEvent } from 'telegram/events';

import { checkContentHash, getOriginalSource, trackContentHash } from './content-hash-db';
import { updateLastMessageId } from './db';
import { LogLevel } from '../utils/common/dtos';
import { sendDuplicateAlbum } from '../utils/duplicate-album';
import { safeComputeHash } from '../utils/phash';
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

  const { tgClient } = await import('@config');
  const hash = await safeComputeHash(message, tgClient);

  if (!hash) {
    const mediaType = getMediaType(message.media);
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

  const result = await checkContentHash(hash);

  if (result.isNew) {
    await tgClient.forwardMessages(PROXY_CHAT_ID, {
      fromPeer: String(sourceChatId),
      messages: [message.id],
    });
    await trackContentHash(hash, sourceChatId, message.id, sourceChatId);

    systemLogger.log({
      level: LogLevel.LOG,
      module: 'PROCESS',
      message: `[${channelTitle}] ${message.id} → proxy (новый)`,
    });
  } else {
    let albumSent = false;

    try {
      const original = await getOriginalSource(result.existing!.id);
      if (original?.messageId && original?.sourceChatId) {
        const [originalMsg] = await tgClient.getMessages(String(original.sourceChatId), {
          ids: [original.messageId],
        });
        if (originalMsg?.media && message.media) {
          albumSent = await sendDuplicateAlbum(
            tgClient,
            FILTERED_CHAT_ID,
            originalMsg.media,
            message.media,
          );
        }
      }
    } catch (err) {
      systemLogger.log({
        level: LogLevel.WARN,
        module: 'DEDUP',
        message: `Не удалось получить оригинал для hashId=${result.existing!.id}`,
        details: err,
      });
    }

    if (!albumSent) {
      await tgClient.sendMessage(FILTERED_CHAT_ID, { message: 'DUPLICATE' });
      await forwardToFiltered(message, sourceChatId, `[${channelTitle}] дубликат`);
    }

    await trackContentHash(hash, sourceChatId, message.id, sourceChatId, result.existing!.id);
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
