import { tgClient, initProxy } from '@config';

import { setupBotClient } from './bot/setup';
import { loadAdmins } from './services/admin.service';
import { loadBannedChats } from './services/banned.service';
import { startPollingLoop } from './services/polling.service';
import { LogLevel } from './utils/common/dtos';
import { registerCriticalErrorHandlers } from './utils/lifecycle';
import { systemLogger } from './utils/system-logger';

registerCriticalErrorHandlers();

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
  await loadBannedChats();

  setupBotClient().catch((err) => {
    systemLogger.log({
      level: LogLevel.ERROR,
      module: 'MAIN',
      message: 'Ошибка в setupBotClient',
      details: err,
    });
  });

  await startPollingLoop();
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
