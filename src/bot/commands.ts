import { tgClient } from '@config';
import { Context } from 'telegraf';
import { Api } from 'telegram';

import { resolveChannelId } from './helpers/resolve-channel';
import { AdminRole } from '../../generated/client';
import { addAdmin, removeAdmin, hasFullAccess } from '../services/admin.service';
import { getActiveChannels, addChannel, deactivateChannel } from '../services/channel.service';
import { LogLevel } from '../utils/common/dtos/index';
import { systemLogger } from '../utils/system-logger';

// Defines the structure for a bot command.
// Each command has a name (e.g. '/channels'), a description for help text,
// an optional full_access requirement, and an async handler that returns a response string.
export interface BotCommand {
  name: string;
  description: string;
  requireFullAccess?: boolean;
  handler: (args: string[], ctx?: Context) => Promise<string>;
}

// Lists all active channels currently being polled for memes.
// Returns a formatted string with each channel's ID and title.
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

// Adds a new channel to the polling list.
// Accepts either a Telegram link (t.me/...) or a numeric chat ID.
// Resolves the input to a channel, joins it via the userbot, and creates a DB record.
// If the channel was previously deactivated, it gets reactivated.
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

// Deactivates a channel so it's no longer polled.
// Does NOT leave the channel — just marks it as inactive in the database.
// Accepts a numeric ID or a link (which gets resolved to an ID).
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

// Lists ALL channels and groups the userbot account is a member of.
// Requires full_access admin role.
// Converts raw Telegram channel IDs to Bot API format (-100 prefix) for compatibility.
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

// Lists all private (user-to-user) chats the userbot has interacted with.
// Excludes bots and the user's own account.
// Requires full_access admin role.
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

// Adds a new admin to the database with a specified role (admin or full_access).
// Requires full_access to execute.
// Reloads the in-memory admin cache after adding.
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

// Removes an admin from the database by their Telegram user ID.
// Requires full_access to execute.
// Reloads the in-memory admin cache after removal.
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

// Displays a help message listing available commands.
// Dynamically shows full_access commands only if the requesting user has that role.
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

// Registry of all available bot commands.
// The executeCommand function searches this array to route incoming commands.
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

// Routes an incoming command string to the appropriate handler.
// Splits the input into command name and arguments, finds the matching command,
// checks access permissions, and executes the handler.
// Returns the handler's response string or an error message.
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
