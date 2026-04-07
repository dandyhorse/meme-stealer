import { tgClient, initProxy } from '@config';

import { db } from '../../prisma/client';
import { LogLevel } from '../utils/common/dtos';
import { HAMMING_THRESHOLD } from '../utils/phash';
import { systemLogger } from '../utils/system-logger';

const PROXY_CHAT_ID = -1003518762032;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const parseArgs = () => {
  const args = process.argv.slice(2);
  let dryRun = true;

  for (const arg of args) {
    if (arg === '--delete') dryRun = false;
  }

  return { dryRun };
};

const cleanup = async () => {
  const { dryRun } = parseArgs();

  systemLogger.log({
    level: LogLevel.INFO,
    module: 'CLEANUP',
    message: `Поиск дублей по БД (${dryRun ? 'DRY RUN' : 'УДАЛЕНИЕ ВКЛЮЧЕНО'})`,
  });

  // Find duplicate pairs: two different content_hashes with similar phash,
  // both having sources in PROXY_CHAT. Keep the earlier message, delete the later.
  const duplicates = await db.$queryRaw<
    { duplicate_msg_id: number; original_msg_id: number; distance: number }[]
  >`
    SELECT
      s2."messageId" AS duplicate_msg_id,
      s1."messageId" AS original_msg_id,
      hamming_distance(h1.phash, h2.phash) AS distance
    FROM content_hashes h1
    JOIN content_hashes h2 ON h2.id > h1.id
    JOIN content_hash_sources s1 ON s1."contentHashId" = h1.id
    JOIN content_hash_sources s2 ON s2."contentHashId" = h2.id
    WHERE hamming_distance(h1.phash, h2.phash) <= ${HAMMING_THRESHOLD}
      AND s1."sourceChatId" = ${BigInt(PROXY_CHAT_ID)}
      AND s2."sourceChatId" = ${BigInt(PROXY_CHAT_ID)}
    ORDER BY s1."messageId" ASC
  `;

  if (duplicates.length === 0) {
    systemLogger.log({
      level: LogLevel.INFO,
      module: 'CLEANUP',
      message: 'Дублей не найдено',
    });
    await db.$disconnect();
    process.exit(0);
  }

  // Deduplicate: a message might be duplicate of multiple originals
  const toDelete = new Set<number>();
  for (const dup of duplicates) {
    toDelete.add(dup.duplicate_msg_id);
  }

  systemLogger.log({
    level: LogLevel.INFO,
    module: 'CLEANUP',
    message: `Найдено ${toDelete.size} дублей для удаления (из ${duplicates.length} пар)`,
  });

  if (dryRun) {
    // Show some examples
    for (const dup of duplicates.slice(0, 10)) {
      systemLogger.log({
        level: LogLevel.LOG,
        module: 'CLEANUP',
        message: `Дубль msg=${dup.duplicate_msg_id} ~ original=${dup.original_msg_id} (distance=${dup.distance})`,
      });
    }
    if (duplicates.length > 10) {
      systemLogger.log({
        level: LogLevel.LOG,
        module: 'CLEANUP',
        message: `... и ещё ${duplicates.length - 10} пар`,
      });
    }

    systemLogger.log({
      level: LogLevel.INFO,
      module: 'CLEANUP',
      message: `DRY RUN: найдено ${toDelete.size} дублей`,
    });
    await db.$disconnect();
    process.exit(0);
  }

  // Connect to Telegram for deletion
  await initProxy();
  await tgClient.connect();
  await tgClient.getDialogs();

  const msgIds = Array.from(toDelete);
  const BATCH_SIZE = 100;
  let deleted = 0;

  for (let i = 0; i < msgIds.length; i += BATCH_SIZE) {
    const batch = msgIds.slice(i, i + BATCH_SIZE);

    try {
      await tgClient.deleteMessages(String(PROXY_CHAT_ID), batch, { revoke: true });
      deleted += batch.length;

      systemLogger.log({
        level: LogLevel.LOG,
        module: 'CLEANUP',
        message: `Удалено ${deleted}/${msgIds.length}`,
      });
    } catch (err) {
      systemLogger.log({
        level: LogLevel.ERROR,
        module: 'CLEANUP',
        message: `Ошибка удаления батча (offset=${i})`,
        details: err,
      });
    }

    await sleep(1000);
  }

  systemLogger.log({
    level: LogLevel.INFO,
    module: 'CLEANUP',
    message: `Готово! Удалено ${deleted} дублей`,
  });

  await db.$disconnect();
  process.exit(0);
};

cleanup().catch((err) => {
  systemLogger.log({
    level: LogLevel.ERROR,
    module: 'CLEANUP',
    message: 'Критическая ошибка',
    details: err,
  });
  process.exit(1);
});
