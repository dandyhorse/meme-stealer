import { bot } from '@config/clients';
import { Context } from 'telegraf';

import { executeCommand } from './commands';
import { isAdmin } from '../services/admin.service';
import { LogLevel } from '../utils/common/dtos';
import { systemLogger } from '../utils/system-logger';

export const launchBot = async () => {
  bot.on('text', async (ctx: Context) => {
    if (!ctx.from || !isAdmin(ctx.from.id)) return;

    const text = (ctx.message as { text?: string })?.text;
    if (!text) return;

    if (text === '/start') {
      await ctx.reply(
        `Привет! Я help bot для meme-stealer.\n\nДоступные команды:\n/start — эта информация\n/help — справка по всем командам\n/channels — список каналов в полинге\n\nАдминистрирование каналов:\n/add <ссылка или id> — добавить канал\n/remove <ссылка или id> — деактивировать канал`,
      );
      return;
    }

    if (text.startsWith('/')) {
      const result = await executeCommand(text, ctx);
      if (result) await ctx.reply(result, { parse_mode: 'HTML' });
      return;
    }

    await ctx.reply('Напиши /help для списка команд');
  });

  bot.catch((err: unknown, ctx) => {
    systemLogger.log({
      level: LogLevel.ERROR,
      module: 'BOT',
      message: 'Ошибка бота',
      details: { error: err instanceof Error ? err.message : String(err), update: ctx.update },
    });
  });

  await bot.launch();
  await bot.telegram.setMyCommands([
    { command: 'start', description: 'Начать работу' },
    { command: 'help', description: 'Справка по командам' },
    { command: 'channels', description: 'Каналы в полинге' },
  ]);
  systemLogger.log({ level: LogLevel.INFO, module: 'BOT', message: 'Help bot запущен' });
};
