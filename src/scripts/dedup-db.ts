import { db } from '../../prisma/client';
import { LogLevel } from '../utils/common/dtos';
import { systemLogger } from '../utils/system-logger';

const parseArgs = () => {
  const args = process.argv.slice(2);
  let execute = false;

  for (const arg of args) {
    if (arg === '--execute') execute = true;
  }

  return { execute };
};

const dedupDb = async () => {
  const { execute } = parseArgs();

  systemLogger.log({
    level: LogLevel.INFO,
    module: 'DEDUP_DB',
    message: `Очистка дублей в БД (${execute ? 'EXECUTE' : 'DRY RUN'})`,
  });

  // Counts before
  const [{ count: sourcesBefore }] = await db.$queryRaw<[{ count: bigint }]>`
    SELECT COUNT(*) as count FROM content_hash_sources
  `;
  const [{ count: hashesBefore }] = await db.$queryRaw<[{ count: bigint }]>`
    SELECT COUNT(*) as count FROM content_hashes
  `;

  systemLogger.log({
    level: LogLevel.INFO,
    module: 'DEDUP_DB',
    message: `До очистки: ${hashesBefore} content_hashes, ${sourcesBefore} content_hash_sources`,
  });

  // Count duplicate sources (same chatId + messageId + sourceChatId)
  const [{ count: duplicateSources }] = await db.$queryRaw<[{ count: bigint }]>`
    SELECT COUNT(*) as count FROM content_hash_sources
    WHERE id NOT IN (
      SELECT MIN(id)
      FROM content_hash_sources
      GROUP BY "chatId", "messageId", "sourceChatId"
    )
  `;

  systemLogger.log({
    level: LogLevel.INFO,
    module: 'DEDUP_DB',
    message: `Дублей sources для удаления: ${duplicateSources}`,
  });

  if (!execute) {
    // Count orphaned hashes (estimate — after removing duplicate sources)
    const [{ count: orphanedHashes }] = await db.$queryRaw<[{ count: bigint }]>`
      SELECT COUNT(*) as count FROM content_hashes
      WHERE id NOT IN (
        SELECT DISTINCT "contentHashId"
        FROM (
          SELECT DISTINCT ON ("chatId", "messageId", "sourceChatId") id, "contentHashId"
          FROM content_hash_sources
          ORDER BY "chatId", "messageId", "sourceChatId", id ASC
        ) kept
      )
    `;

    systemLogger.log({
      level: LogLevel.INFO,
      module: 'DEDUP_DB',
      message: `Осиротевших hashes (оценка): ${orphanedHashes}`,
    });

    systemLogger.log({
      level: LogLevel.INFO,
      module: 'DEDUP_DB',
      message: `DRY RUN завершён`,
    });

    await db.$disconnect();
    process.exit(0);
  }

  // Step 1: Delete duplicate sources
  const [{ count: deletedSources }] = await db.$queryRaw<[{ count: bigint }]>`
    WITH deleted AS (
      DELETE FROM content_hash_sources
      WHERE id NOT IN (
        SELECT MIN(id)
        FROM content_hash_sources
        GROUP BY "chatId", "messageId", "sourceChatId"
      )
      RETURNING id
    )
    SELECT COUNT(*) as count FROM deleted
  `;

  systemLogger.log({
    level: LogLevel.INFO,
    module: 'DEDUP_DB',
    message: `Удалено дублей sources: ${deletedSources}`,
  });

  // Step 2: Delete orphaned content_hashes
  const [{ count: deletedHashes }] = await db.$queryRaw<[{ count: bigint }]>`
    WITH deleted AS (
      DELETE FROM content_hashes
      WHERE id NOT IN (
        SELECT DISTINCT "contentHashId"
        FROM content_hash_sources
      )
      RETURNING id
    )
    SELECT COUNT(*) as count FROM deleted
  `;

  systemLogger.log({
    level: LogLevel.INFO,
    module: 'DEDUP_DB',
    message: `Удалено осиротевших hashes: ${deletedHashes}`,
  });

  // Counts after
  const [{ count: sourcesAfter }] = await db.$queryRaw<[{ count: bigint }]>`
    SELECT COUNT(*) as count FROM content_hash_sources
  `;
  const [{ count: hashesAfter }] = await db.$queryRaw<[{ count: bigint }]>`
    SELECT COUNT(*) as count FROM content_hashes
  `;

  systemLogger.log({
    level: LogLevel.INFO,
    module: 'DEDUP_DB',
    message: `После очистки: ${hashesAfter} content_hashes, ${sourcesAfter} content_hash_sources`,
  });

  await db.$disconnect();
  process.exit(0);
};

dedupDb().catch((err) => {
  systemLogger.log({
    level: LogLevel.ERROR,
    module: 'DEDUP_DB',
    message: 'Критическая ошибка',
    details: err,
  });
  process.exit(1);
});
