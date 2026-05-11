import { tgClient } from '@config';
import { Api } from 'telegram';

import { isBanned } from './banned.service';
import { processGroupedMessages, processMessage } from './message-processing.service';
import { getActiveChats, updateLastMessageId } from '../modules/db';
import { LogLevel } from '../utils/common/dtos';
import { sleep } from '../utils/lifecycle';
import { systemLogger } from '../utils/system-logger';

const POLL_INTERVAL = 60000;

const splitMessages = (messages: Api.Message[]) => {
  const groups = new Map<string, Api.Message[]>();
  const ungrouped: Api.Message[] = [];

  for (const msg of messages) {
    if (msg.groupedId) {
      const key = msg.groupedId.toString();
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(msg);
    } else {
      ungrouped.push(msg);
    }
  }

  return { groups, ungrouped };
};

export const pollMessages = async () => {
  systemLogger.log({
    level: LogLevel.LOG,
    module: 'POLLING',
    message: 'Начинаем забирать сообщения ...',
  });

  const channels = await getActiveChats();

  for (const channel of channels) {
    const { chatId, title } = channel;

    if (isBanned(chatId)) continue;

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

          const { groups, ungrouped } = splitMessages(newMessages);

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

export const startPollingLoop = async () => {
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
