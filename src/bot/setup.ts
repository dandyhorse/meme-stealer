import { getBotClient } from '@config';

import { executeCommand } from './commands';
import { isAdmin } from '../services/admin.service';
import { LogLevel } from '../utils/common/dtos';
import { systemLogger } from '../utils/system-logger';

export const setupBotClient = async () => {
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
