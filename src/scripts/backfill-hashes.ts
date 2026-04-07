import { tgClient, initProxy } from '@config';

import { db } from '../../prisma/client';
import { upsertChat, findChatByChatId } from '../modules/db';
import { LogLevel } from '../utils/common/dtos';
import { safeComputeHash } from '../utils/phash';
import { systemLogger } from '../utils/system-logger';

const PROXY_CHAT_ID = -1003518762032;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const parseArgs = () => {
  const args = process.argv.slice(2);
  let offsetId = 0;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--offset-id' && args[i + 1]) {
      offsetId = parseInt(args[i + 1], 10);
    }
  }

  return { offsetId };
};

const backfill = async () => {
  const { offsetId } = parseArgs();
  const proxyChatId = BigInt(PROXY_CHAT_ID);

  systemLogger.log({
    level: LogLevel.INFO,
    module: 'BACKFILL',
    message: `Запуск backfill для PROXY_CHAT ${PROXY_CHAT_ID}${offsetId ? ` с offsetId=${offsetId}` : ''}`,
  });

  await initProxy();
  await tgClient.connect();
  await tgClient.getDialogs();

  // Register PROXY_CHAT in chats (isActive=false — не попадёт в polling)
  await upsertChat(proxyChatId, 'PROXY_CHAT', false);
  const chat = await findChatByChatId(proxyChatId);
  if (!chat) throw new Error('Failed to find/create PROXY_CHAT in chats');

  systemLogger.log({
    level: LogLevel.INFO,
    module: 'BACKFILL',
    message: 'Telegram подключен, PROXY_CHAT зарегистрирован',
  });

  let processed = 0;
  let saved = 0;
  let skipped = 0;
  let lastMsgId = 0;

  const iterParams: Record<string, unknown> = {
    reverse: true,
    waitTime: 2,
  };

  if (offsetId) {
    iterParams.minId = offsetId;
  }

  try {
    for await (const message of tgClient.iterMessages(String(PROXY_CHAT_ID), iterParams)) {
      processed++;
      lastMsgId = message.id;

      if (!message.media) {
        skipped++;
        if (processed % 100 === 0) {
          systemLogger.log({
            level: LogLevel.LOG,
            module: 'BACKFILL',
            message: `Прогресс: ${processed} обработано, ${saved} хешей сохранено, ${skipped} без медиа | lastMsgId=${lastMsgId}`,
          });
        }
        continue;
      }

      const hash = await safeComputeHash(message, tgClient);
      if (!hash) {
        skipped++;
        continue;
      }

      // Сохраняем каждый хеш + messageId, без проверки на дубли
      const contentHash = await db.contentHash.create({ data: { phash: hash } });
      await db.contentHashSource.create({
        data: {
          contentHashId: contentHash.id,
          chatId: chat.id,
          messageId: message.id,
          sourceChatId: proxyChatId,
        },
      });

      saved++;

      if (processed % 100 === 0) {
        systemLogger.log({
          level: LogLevel.LOG,
          module: 'BACKFILL',
          message: `Прогресс: ${processed} обработано, ${saved} хешей сохранено, ${skipped} без медиа | lastMsgId=${lastMsgId}`,
        });
      }
    }
  } catch (err: unknown) {
    if (err && typeof err === 'object' && 'seconds' in err) {
      const waitErr = err as { seconds: number };
      systemLogger.log({
        level: LogLevel.WARN,
        module: 'BACKFILL',
        message: `FloodWait: ждём ${waitErr.seconds + 1}с`,
      });
      await sleep((waitErr.seconds + 1) * 1000);
      systemLogger.log({
        level: LogLevel.INFO,
        module: 'BACKFILL',
        message: `Resume offset-id: ${lastMsgId}`,
      });
    } else {
      throw err;
    }
  }

  systemLogger.log({
    level: LogLevel.INFO,
    module: 'BACKFILL',
    message: `Готово! Обработано: ${processed}, сохранено хешей: ${saved}, пропущено: ${skipped}`,
  });

  await db.$disconnect();
  process.exit(0);
};

backfill().catch((err) => {
  systemLogger.log({
    level: LogLevel.ERROR,
    module: 'BACKFILL',
    message: 'Критическая ошибка',
    details: err,
  });
  process.exit(1);
});
