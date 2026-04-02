import crypto from 'crypto';

import { tgClient, getBotClient, initProxy } from '@config';
import { Api } from 'telegram';

import { executeCommand } from './bot/commands';
import { getActiveChats, checkAndTrackMinithumbnail, updateLastMessageId } from './modules/db';
import { isAdmin, loadAdmins } from './services/admin.service';
import { LogLevel } from './utils/common/dtos';
import { systemLogger } from './utils/system-logger';

const PROXY_CHAT_ID = -1003518762032;
const FILTERED_CHAT_ID = -1003722286620;
const POLL_INTERVAL = 60000;

// ============ CRITICAL ERROR HANDLING ============

const CRITICAL_ERRORS = ['Not connected', 'disconnect'];

const handleCriticalError = (error: unknown) => {
  const errorString = String(error);
  const isCritical = CRITICAL_ERRORS.some((err) => errorString.includes(err));

  if (isCritical) {
    systemLogger.log({
      level: LogLevel.ERROR,
      module: 'TGCLIENT',
      message: `Критическая ошибка, перезапуск: ${errorString}`,
    });
    process.exit(1);
  }
};

process.on('uncaughtException', handleCriticalError);
process.on('unhandledRejection', (reason) => {
  const errorString = String(reason);
  if (errorString.includes('TIMEOUT') || errorString.includes('Not connected')) {
    return;
  }
  handleCriticalError(reason);
});

// ============ HELPERS ============

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

// ============ FORWARDING ============

const forwardToFiltered = async (messageIds: number[], sourceChatId: bigint, reason: string) => {
  if (!FILTERED_CHAT_ID) return;

  await tgClient.forwardMessages(FILTERED_CHAT_ID, {
    fromPeer: String(sourceChatId),
    messages: messageIds,
  });
  systemLogger.log({
    level: LogLevel.LOG,
    module: 'FILTERED',
    message: `Сообщения [${messageIds.join(', ')}] -> filtered: ${reason}`,
  });
};

const forwardToProxy = async (messageIds: number[], sourceChatId: bigint, reason: string) => {
  await tgClient.forwardMessages(PROXY_CHAT_ID, {
    fromPeer: String(sourceChatId),
    messages: messageIds,
  });
  systemLogger.log({
    level: LogLevel.LOG,
    module: 'PROCESS',
    message: `Сообщения [${messageIds.join(', ')}] -> proxy: ${reason}`,
  });
};

// ============ SINGLE MESSAGE PROCESSING ============

const processMessage = async (
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

  const thumbnailBytes = extractThumbnailBytes(message);

  if (!thumbnailBytes) {
    const mediaType = getMediaType(message.media);
    await forwardToProxy(
      [message.id],
      sourceChatId,
      `[${channelTitle}] ${message.id} без дедупликации (${mediaType})`,
    );
    return;
  }

  const md5 = computeMd5(thumbnailBytes);
  const result = await checkAndTrackMinithumbnail(md5, sourceChatId);

  if (result.isNew) {
    await forwardToProxy([message.id], sourceChatId, `[${channelTitle}] ${message.id} (новый)`);
  } else {
    await forwardToFiltered([message.id], sourceChatId, `[${channelTitle}] дубликат`);
  }
};

// ============ GROUPED MESSAGE PROCESSING ============

const processGroupedMessages = async (
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

  // Дедупликация: берём thumbnail из первого сообщения с thumbnail
  let firstMd5: string | null = null;

  for (const msg of messages) {
    const thumbBytes = extractThumbnailBytes(msg);
    if (thumbBytes) {
      const md5 = computeMd5(thumbBytes);

      // Трекаем ВСЕ thumbnails группы для будущей дедупликации
      const trackResult = await checkAndTrackMinithumbnail(md5, sourceChatId);

      if (firstMd5 === null) {
        firstMd5 = md5;
        // Решение о forward/reject на основе первого thumbnail
        if (!trackResult.isNew) {
          await forwardToFiltered(messageIds, sourceChatId, `[${channelTitle}] группа дубликат`);
          return;
        }
      }
    }
  }

  // Если нет thumbnails вообще -- forward без дедупликации
  // Иначе -- первый thumbnail новый, forward всю группу
  await forwardToProxy(
    messageIds,
    sourceChatId,
    `[${channelTitle}] группа (${messageIds.length} сообщ.)`,
  );
};

// ============ POLLING ============

const pollMessages = async () => {
  systemLogger.log({
    level: LogLevel.LOG,
    module: 'POLLING',
    message: 'Начинаем забирать сообщения ...',
  });

  const channels = await getActiveChats();

  for (const channel of channels) {
    const { chatId, title } = channel;

    try {
      const messages = await tgClient.getMessages(String(chatId), { limit: 100 });
      const lastSeen = channel.lastMessageId;

      if (messages.length > 0) {
        const newestMessageId = messages[0].id;

        const newMessages = messages.filter((m) => m.id > lastSeen);

        if (newMessages.length > 0) {
          systemLogger.log({
            level: LogLevel.LOG,
            module: 'POLLING',
            message: `[${title}] Новых сообщений: ${newMessages.length}`,
          });

          // Разделяем на группы и одиночные
          const groups = new Map<string, Api.Message[]>();
          const ungrouped: Api.Message[] = [];

          for (const msg of newMessages) {
            if (msg.groupedId) {
              const key = msg.groupedId.toString();
              if (!groups.has(key)) groups.set(key, []);
              groups.get(key)!.push(msg);
            } else {
              ungrouped.push(msg);
            }
          }

          // Обрабатываем одиночные сообщения
          for (const message of ungrouped) {
            try {
              await processMessage(message, chatId, title);
            } catch (err) {
              systemLogger.log({
                level: LogLevel.ERROR,
                module: 'PROCESS',
                message: `[${title}] Ошибка обработки сообщения ${message.id}`,
                details: err,
              });
            }
          }

          // Обрабатываем группы (альбомы)
          for (const [groupId, groupMessages] of groups) {
            try {
              await processGroupedMessages(groupMessages, chatId, title);
            } catch (err) {
              systemLogger.log({
                level: LogLevel.ERROR,
                module: 'PROCESS',
                message: `[${title}] Ошибка обработки группы ${groupId}`,
                details: err,
              });
            }
          }
        }

        if (newestMessageId > lastSeen) {
          await updateLastMessageId(chatId, newestMessageId);
        }
      }
    } catch (error) {
      systemLogger.log({
        level: LogLevel.ERROR,
        module: 'POLLING',
        message: `Ошибка polling для ${title} (${chatId})`,
        details: error,
      });
    }
  }
};

// ============ BOT CLIENT SETUP ============

const setupBotClient = async () => {
  const botClient = getBotClient();

  if (!botClient) {
    systemLogger.log({
      level: LogLevel.WARN,
      module: 'BOT_CLIENT',
      message: 'BOT_TOKEN не настроен, help bot не запущен',
    });
    return;
  }

  systemLogger.log({
    level: LogLevel.INFO,
    module: 'BOT_CLIENT',
    message: 'Запуск help bot...',
  });

  botClient.on('text', async (ctx) => {
    const { from, chat, message } = ctx;

    if (!from || !isAdmin(from.id)) {
      return;
    }

    systemLogger.log({
      level: LogLevel.LOG,
      module: 'BOT_CLIENT',
      message: 'Получено сообщение',
      details: {
        from: from?.username || from?.first_name,
        chatId: chat.id,
        chatType: chat.type,
        text: message.text,
      },
    });

    if (message.text === '/start') {
      await ctx.reply(
        `Привет! Я help bot для meme-stealer.

Доступные команды:
/start — эта информация
/help — справка по всем командам
/channels — список каналов в полинге

Администрирование каналов:
/add <ссылка или id> — добавить канал
/remove <ссылка или id> — деактивировать канал`,
      );
      return;
    }

    if (message.text?.startsWith('/')) {
      const result = await executeCommand(message.text, ctx);

      if (result) {
        await ctx.reply(result, { parse_mode: 'HTML' });
      }
      return;
    }

    await ctx.reply('Напиши /help для списка команд');
  });

  botClient.catch((err, ctx) => {
    systemLogger.log({
      level: LogLevel.ERROR,
      module: 'BOT_CLIENT',
      message: 'Ошибка бота',
      details: {
        error: err instanceof Error ? err.message : String(err),
        update: ctx.update,
      },
    });
  });

  try {
    await botClient.launch();

    await botClient.telegram.setMyCommands([
      { command: 'start', description: 'Начать работу' },
      { command: 'help', description: 'Справка по командам' },
      { command: 'channels', description: 'Каналы в полинге' },
    ]);

    systemLogger.log({
      level: LogLevel.INFO,
      module: 'BOT_CLIENT',
      message: 'Help bot запущен! Команды установлены.',
    });
  } catch (error) {
    systemLogger.log({
      level: LogLevel.ERROR,
      module: 'BOT_CLIENT',
      message: 'Ошибка запуска help bot',
      details: error,
    });
  }
};

// ============ MAIN ============

export const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const main = async () => {
  systemLogger.log({
    level: LogLevel.INFO,
    module: 'TGCLIENT',
    message: 'meme-stealer starting...',
  });

  await initProxy();

  await tgClient.connect();
  await tgClient.getDialogs();

  systemLogger.log({
    level: LogLevel.INFO,
    module: 'TGCLIENT',
    message: 'tgClient подключен',
  });

  await loadAdmins();

  setupBotClient().catch((err) => {
    systemLogger.log({
      level: LogLevel.ERROR,
      module: 'MAIN',
      message: 'Ошибка в setupBotClient',
      details: err,
    });
  });

  systemLogger.log({
    level: LogLevel.INFO,
    module: 'MAIN',
    message: 'Запуск polling...',
  });

  while (true) {
    await pollMessages();
    await sleep(POLL_INTERVAL);
  }
};

(async () => {
  try {
    await main();
  } catch (err) {
    systemLogger.log({
      level: LogLevel.ERROR,
      module: 'MAIN',
      message: 'Критическая ошибка в main()',
      details: err,
    });
    process.exit(1);
  }
})();
