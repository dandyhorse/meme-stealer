import { tgClient, bot } from '@config/clients';

import { launchBot } from './bot/setup';
import { loadAdmins } from './services/admin.service';
import { startPolling, stopPolling } from './services/polling.service';
import { LogLevel } from './utils/common/dtos';
import { systemLogger } from './utils/system-logger';

const CRITICAL_ERRORS = ['Not connected', 'disconnect'];

process.on('uncaughtException', (error) => {
  if (CRITICAL_ERRORS.some((e) => String(error).includes(e))) {
    systemLogger.log({
      level: LogLevel.ERROR,
      module: 'TGCLIENT',
      message: `Критическая ошибка, перезапуск: ${error}`,
    });
    process.exit(1);
  }
  systemLogger.log({ level: LogLevel.ERROR, module: 'UNCAUGHT', message: String(error) });
});

process.on('unhandledRejection', (reason) => {
  const s = String(reason);
  if (s.includes('TIMEOUT') || s.includes('Not connected')) return;
  if (CRITICAL_ERRORS.some((e) => s.includes(e))) {
    systemLogger.log({
      level: LogLevel.ERROR,
      module: 'TGCLIENT',
      message: `Критическая ошибка, перезапуск: ${s}`,
    });
    process.exit(1);
  }
  systemLogger.log({ level: LogLevel.ERROR, module: 'UNCAUGHT', message: s });
});

const shutdown = async () => {
  systemLogger.log({ level: LogLevel.INFO, module: 'MAIN', message: 'Получен сигнал завершения, выключаюсь...' });
  stopPolling();
  try {
    bot.stop();
    await tgClient.disconnect();
  } finally {
    process.exit(0);
  }
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

const main = async () => {
  systemLogger.log({ level: LogLevel.INFO, module: 'MAIN', message: 'meme-stealer запускается...' });

  await tgClient.connect();
  await tgClient.getDialogs();
  systemLogger.log({ level: LogLevel.INFO, module: 'MAIN', message: 'tgClient подключен' });

  await loadAdmins();

  launchBot().catch((err) => {
    systemLogger.log({
      level: LogLevel.ERROR,
      module: 'MAIN',
      message: 'Ошибка в launchBot',
      details: err,
    });
  });

  startPolling();
};

main().catch((err) => {
  systemLogger.log({
    level: LogLevel.ERROR,
    module: 'MAIN',
    message: 'Критическая ошибка',
    details: err,
  });
  process.exit(1);
});
