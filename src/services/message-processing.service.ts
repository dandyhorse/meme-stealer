import { filteredChatId, tgClient } from '@config';
import { Api } from 'telegram';

import { forwardToFiltered, forwardToProxy } from './forwarding.service';
import { checkContentHash, getOriginalSource, trackContentHash } from '../modules/content-hash-db';
import { LogLevel } from '../utils/common/dtos';
import { sendDuplicateAlbum } from '../utils/duplicate-album';
import { safeComputeHash } from '../utils/phash';
import { systemLogger } from '../utils/system-logger';
import { hasUrl } from '../utils/url-filter';

const getMediaType = (media: Api.TypeMessageMedia): string => {
  return media.className || 'Unknown';
};

export const processMessage = async (
  message: Api.Message,
  sourceChatId: bigint,
  channelTitle: string,
): Promise<void> => {
  if (!message.media) {
    await forwardToFiltered([message.id], sourceChatId, `[${channelTitle}] нет медиа`);
    return;
  }

  if (hasUrl(message)) {
    await forwardToFiltered([message.id], sourceChatId, `[${channelTitle}] реклама/URL`);
    return;
  }

  const hash = await safeComputeHash(message, tgClient);

  if (!hash) {
    const mediaType = getMediaType(message.media);
    await forwardToProxy(
      [message.id],
      sourceChatId,
      `[${channelTitle}] ${message.id} без дедупликации (${mediaType})`,
    );
    return;
  }

  const result = await checkContentHash(hash);

  if (result.isNew) {
    await forwardToProxy([message.id], sourceChatId, `[${channelTitle}] ${message.id} (новый)`);
    await trackContentHash(hash, sourceChatId, message.id, sourceChatId);
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
            filteredChatId,
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
      await tgClient.sendMessage(filteredChatId, { message: 'DUPLICATE' });
      await forwardToFiltered([message.id], sourceChatId, `[${channelTitle}] дубликат`);
    }

    await trackContentHash(hash, sourceChatId, message.id, sourceChatId, result.existing!.id);
  }
};

export const processGroupedMessages = async (
  messages: Api.Message[],
  sourceChatId: bigint,
  channelTitle: string,
): Promise<void> => {
  const messageIds = messages.map((m) => m.id);

  // Реклама -- если хоть одно сообщение с URL, вся группа в filtered
  if (messages.some((m) => hasUrl(m))) {
    await forwardToFiltered(messageIds, sourceChatId, `[${channelTitle}] группа реклама/URL`);
    return;
  }

  // Нет медиа ни в одном -- в filtered
  if (messages.every((m) => !m.media)) {
    await forwardToFiltered(messageIds, sourceChatId, `[${channelTitle}] группа без медиа`);
    return;
  }

  // Дедупликация: собираем хэши всех сообщений группы
  const hashes: { hash: bigint; msgId: number }[] = [];

  for (const msg of messages) {
    const hash = await safeComputeHash(msg, tgClient);
    if (hash) {
      const result = await checkContentHash(hash);
      if (!result.isNew) {
        let albumSent = false;

        try {
          const original = await getOriginalSource(result.existing!.id);
          if (original?.messageId && original?.sourceChatId) {
            const [originalMsg] = await tgClient.getMessages(String(original.sourceChatId), {
              ids: [original.messageId],
            });
            if (originalMsg?.media && msg.media) {
              albumSent = await sendDuplicateAlbum(
                tgClient,
                filteredChatId,
                originalMsg.media,
                msg.media,
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
          await tgClient.sendMessage(filteredChatId, { message: 'DUPLICATE' });
          await forwardToFiltered(messageIds, sourceChatId, `[${channelTitle}] группа дубликат`);
        }

        await trackContentHash(hash, sourceChatId, msg.id, sourceChatId, result.existing!.id);
        return;
      }
      hashes.push({ hash, msgId: msg.id });
    }
  }

  // Все хэши новые или нет thumbnails — forward группу
  await forwardToProxy(
    messageIds,
    sourceChatId,
    `[${channelTitle}] группа (${messageIds.length} сообщ.)`,
  );

  // Записываем хэши ПОСЛЕ успешного форварда
  for (const { hash, msgId } of hashes) {
    await trackContentHash(hash, sourceChatId, msgId, sourceChatId);
  }
};
