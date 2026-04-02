import { tgClient } from '@config';
import { Context } from 'telegraf';
import { Api } from 'telegram';

import { resolveChannelId } from './helpers/resolve-channel';
import { AdminRole } from '../../generated/client';
import { addAdmin, removeAdmin, hasFullAccess } from '../services/admin.service';
import { getActiveChannels, addChannel, deactivateChannel } from '../services/channel.service';
import { LogLevel } from '../utils/common/dtos/index';
import { systemLogger } from '../utils/system-logger';

export interface BotCommand {
  name: string;
  description: string;
  requireFullAccess?: boolean;
  handler: (args: string[], ctx?: Context) => Promise<string>;
}

export const listChannelsCommand: BotCommand = {
  name: '/channels',
  description: 'Показать каналы в полинге (id + title)',
  handler: async () => {
    const channels = await getActiveChannels();

    let result = '<b>Каналы в полинге:</b>\n\n';

    if (channels.length === 0) {
      result += '  Нет каналов\n';
    } else {
      for (const ch of channels) {
        result += `<code>${ch.chatId}</code> — ${ch.title}\n`;
      }
    }

    result += `\nВсего: ${channels.length}`;
    return result;
  },
};

export const addChannelCommand: BotCommand = {
  name: '/add',
  description: 'Добавить канал. Формат: /add <ссылка или id>',
  handler: async (args) => {
    if (args.length < 1) {
      return 'Использование: /add <ссылка или id>';
    }

    const input = args[0];

    try {
      systemLogger.log({
        level: LogLevel.LOG,
        module: 'BOT_COMMANDS',
        message: `[add] resolveChannelId start: ${input}`,
      });

      const { id, title } = await resolveChannelId(input);

      systemLogger.log({
        level: LogLevel.LOG,
        module: 'BOT_COMMANDS',
        message: `[add] resolved: id=${id}, title=${title}`,
      });

      systemLogger.log({
        level: LogLevel.LOG,
        module: 'BOT_COMMANDS',
        message: `[add] JoinChannel start: ${id}`,
      });

      await tgClient.invoke(new Api.channels.JoinChannel({ channel: id }));

      systemLogger.log({
        level: LogLevel.LOG,
        module: 'BOT_COMMANDS',
        message: `[add] JoinChannel done, creating DB record`,
      });

      const { reactivated } = await addChannel(BigInt(id), title);

      systemLogger.log({
        level: LogLevel.LOG,
        module: 'BOT_COMMANDS',
        message: `[add] DB record created`,
      });

      if (reactivated) {
        return `Канал реактивирован: ${title} (<code>${id}</code>)`;
      }

      return `Канал добавлен: ${title} (<code>${id}</code>)`;
    } catch (error) {
      systemLogger.log({
        level: LogLevel.ERROR,
        module: 'BOT_COMMANDS',
        message: `Ошибка добавления канала: ${input}`,
        details: error instanceof Error ? { message: error.message, stack: error.stack } : error,
      });
      return `Ошибка: ${String(error)}`;
    }
  },
};

export const removeChannelCommand: BotCommand = {
  name: '/remove',
  description: 'Деактивировать канал. Формат: /remove <ссылка или id>',
  handler: async (args) => {
    if (args.length < 1) {
      return 'Использование: /remove <ссылка или id>';
    }

    try {
      const input = args[0];
      let channelId: string;

      if (/^-?\d+$/.test(input)) {
        channelId = input;
      } else {
        const resolved = await resolveChannelId(input);
        channelId = resolved.id;
      }

      const deactivated = await deactivateChannel(BigInt(channelId));

      if (!deactivated) {
        return 'Канал не найден или уже неактивен';
      }

      return `Канал деактивирован (<code>${channelId}</code>)`;
    } catch (error) {
      systemLogger.log({
        level: LogLevel.ERROR,
        module: 'BOT_COMMANDS',
        message: `Ошибка удаления канала: ${args[0]}`,
        details: error instanceof Error ? { message: error.message, stack: error.stack } : error,
      });
      return `Ошибка: ${String(error)}`;
    }
  },
};

export const allChannelsCommand: BotCommand = {
  name: '/allChannels',
  description: 'Показать все каналы на аккаунте',
  requireFullAccess: true,
  handler: async () => {
    try {
      let result = '<b>Все каналы аккаунта:</b>\n\n';

      for await (const dialog of tgClient.iterDialogs({})) {
        if (dialog.isChannel || dialog.isGroup) {
          try {
            const peer = dialog.entity as Api.Channel;
            const channelId = peer.id.toJSNumber();

            const botApiId = -1000000000000 - channelId;
            const type = dialog.isChannel ? '[канал]' : '[группа]';
            result += `${type} <code>${botApiId}</code> — ${peer.title || 'без названия'}\n`;
          } catch {
            // skip
          }
        }
      }

      return result;
    } catch (error) {
      systemLogger.log({
        level: LogLevel.ERROR,
        module: 'BOT_COMMANDS',
        message: 'Ошибка получения списка каналов',
        details: error,
      });
      return 'Ошибка получения списка каналов';
    }
  },
};

export const privateChatsCommand: BotCommand = {
  name: '/privateChats',
  description: 'Показать личные чаты аккаунта (user ID + имя)',
  requireFullAccess: true,
  handler: async () => {
    try {
      let result = '<b>Личные чаты:</b>\n\n';
      let count = 0;

      for await (const dialog of tgClient.iterDialogs({})) {
        if (!dialog.isUser) continue;

        const user = dialog.entity as Api.User;
        if (user.bot || user.self) continue;

        const name = [user.firstName, user.lastName].filter(Boolean).join(' ');
        const username = user.username ? ' @' + user.username : '';
        result += `<code>${user.id}</code> — ${name}${username}\n`;
        count++;
      }

      result += `\nВсего: ${count}`;
      return result;
    } catch (error) {
      systemLogger.log({
        level: LogLevel.ERROR,
        module: 'BOT_COMMANDS',
        message: 'Ошибка получения личных чатов',
        details: error,
      });
      return 'Ошибка получения личных чатов';
    }
  },
};

export const addAdminCommand: BotCommand = {
  name: '/addAdmin',
  description: 'Добавить админа. Формат: /addAdmin <admin|full_access> <telegram_id>',
  requireFullAccess: true,
  handler: async (args) => {
    if (args.length < 2) {
      return 'Использование: /addAdmin <admin|full_access> <telegram_id>';
    }

    const role = args[0].toLowerCase();
    if (role !== 'admin' && role !== 'full_access') {
      return 'Роль должна быть admin или full_access';
    }

    try {
      await addAdmin(BigInt(args[1]), role as AdminRole);
      return `Админ ${args[1]} добавлен с ролью ${role}`;
    } catch (error) {
      systemLogger.log({
        level: LogLevel.ERROR,
        module: 'BOT_COMMANDS',
        message: `Ошибка добавления админа: ${args[1]}`,
        details: error,
      });
      return `Ошибка: ${String(error)}`;
    }
  },
};

export const removeAdminCommand: BotCommand = {
  name: '/removeAdmin',
  description: 'Удалить админа. Формат: /removeAdmin <telegram_id>',
  requireFullAccess: true,
  handler: async (args) => {
    if (args.length === 0) {
      return 'Использование: /removeAdmin <telegram_id>';
    }

    const removed = await removeAdmin(BigInt(args[0]));
    return removed ? `Админ ${args[0]} удален` : 'Админ не найден';
  },
};

export const helpCommand: BotCommand = {
  name: '/help',
  description: 'Показать справку по командам',
  handler: async (_args, ctx) => {
    let result = `<b>Справка по командам:</b>

/channels — список каналов в полинге
/add <code>&lt;ссылка или id&gt;</code> — добавить канал в полинг
/remove <code>&lt;ссылка или id&gt;</code> — деактивировать канал`;

    if (ctx?.from && hasFullAccess(ctx.from.id)) {
      result += `

<b>Full access:</b>
/allChannels — все каналы на аккаунте
/privateChats — личные чаты аккаунта (ID + имя)
/addAdmin <code>&lt;admin|full_access&gt;</code> <code>&lt;telegram_id&gt;</code> — добавить админа
/removeAdmin <code>&lt;telegram_id&gt;</code> — удалить админа`;
    }

    return result;
  },
};

export const allCommands: BotCommand[] = [
  listChannelsCommand,
  allChannelsCommand,
  addChannelCommand,
  removeChannelCommand,
  privateChatsCommand,
  addAdminCommand,
  removeAdminCommand,
  helpCommand,
];

export const executeCommand = async (commandText: string, ctx?: Context): Promise<string> => {
  const [command, ...args] = commandText.trim().split(' ');
  const cmd = allCommands.find((c) => c.name === command);

  if (!cmd) {
    return `Неизвестная команда: ${command}`;
  }

  if (cmd.requireFullAccess && ctx?.from && !hasFullAccess(ctx.from.id)) {
    return 'Нет доступа к этой команде';
  }

  try {
    return await cmd.handler(args, ctx);
  } catch (error) {
    systemLogger.log({
      level: LogLevel.ERROR,
      module: 'BOT_COMMANDS',
      message: `Ошибка выполнения команды: ${command}`,
      details: error,
    });
    return `Ошибка выполнения команды: ${String(error)}`;
  }
};
