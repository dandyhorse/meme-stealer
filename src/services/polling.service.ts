import { tgClient } from '@config/clients';
import { Api } from 'telegram';

import { updateLastMessageId } from '../modules/db';
import { getActiveChannels } from './channel.service';
import { processMessage, processGroupedMessages } from './dedup.service';
import { LogLevel } from '../utils/common/dtos';
import { systemLogger } from '../utils/system-logger';

const POLL_INTERVAL = 60_000;

let running = false;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const startPolling = () => {
  running = true;
  systemLogger.log({ level: LogLevel.INFO, module: 'POLLING', message: 'Запуск polling...' });
  poll();
};

export const stopPolling = () => {
  running = false;
};

const poll = async () => {
  while (running) {
    await pollMessages();
    if (running) await sleep(POLL_INTERVAL);
  }
};

const pollMessages = async () => {
  systemLogger.log({
    level: LogLevel.LOG,
    module: 'POLLING',
    message: 'Начинаем забирать сообщения ...',
  });

  const channels = await getActiveChannels();

  for (const channel of channels) {
    const { id: chatDbId, chatId, title } = channel;

    try {
      const messages = await tgClient.getMessages(String(chatId), { limit: 100 });
      const lastSeen = channel.lastMessageId;

      if (messages.length === 0) continue;

      const newestMessageId = messages[0].id;
      const newMessages = messages.filter((m: Api.Message) => m.id > lastSeen);

      if (newMessages.length > 0) {
        systemLogger.log({
          level: LogLevel.LOG,
          module: 'POLLING',
          message: `[${title}] Новых сообщений: ${newMessages.length}`,
        });

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

        for (const message of ungrouped) {
          try {
            await processMessage(message, chatId, title, chatDbId);
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
            await processGroupedMessages(groupMessages, chatId, title, chatDbId);
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
