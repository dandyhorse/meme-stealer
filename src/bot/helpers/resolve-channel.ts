import { tgClient } from '@config';
import { Api, utils } from 'telegram';

import { LogLevel } from '../../utils/common/dtos/index';
import { systemLogger } from '../../utils/system-logger';

const BOT_API_CHANNEL_PREFIX = -1000000000000;

export interface ResolvedChannel {
  id: string;
  title: string;
  entity?: Api.TypeEntityLike;
  needsJoin: boolean;
}

interface ResolveChannelOptions {
  joinInvite?: boolean;
}

const toBotApiChannelId = (channelId: number): number => BOT_API_CHANNEL_PREFIX - channelId;

const toInternalChannelId = (id: number): number => {
  if (id < BOT_API_CHANNEL_PREFIX) {
    return Math.abs(id - BOT_API_CHANNEL_PREFIX);
  }

  return Math.abs(id);
};

const getChatTitle = (chat: Api.TypeChat): string => {
  if ('title' in chat && chat.title) {
    return chat.title;
  }

  return 'без названия';
};

const resolveFromChat = (chat: Api.TypeChat, needsJoin: boolean): ResolvedChannel => {
  if (chat instanceof Api.Channel) {
    return {
      id: String(toBotApiChannelId(chat.id.toJSNumber())),
      title: getChatTitle(chat),
      entity: chat,
      needsJoin,
    };
  }

  if (chat instanceof Api.Chat) {
    return {
      id: String(-chat.id.toJSNumber()),
      title: getChatTitle(chat),
      entity: chat,
      needsJoin,
    };
  }

  throw new Error('Это не канал или группа');
};

const findDialogByNumericId = async (input: string): Promise<ResolvedChannel | null> => {
  const inputId = Number(input);
  const internalChannelId = toInternalChannelId(inputId);

  for await (const dialog of tgClient.iterDialogs({})) {
    const entity = dialog.entity;

    if (entity instanceof Api.Channel) {
      const channelId = entity.id.toJSNumber();
      const botApiId = toBotApiChannelId(channelId);

      if (inputId === channelId || inputId === botApiId) {
        return {
          id: String(botApiId),
          title: entity.title || dialog.title || 'без названия',
          entity,
          needsJoin: false,
        };
      }
    }

    if (entity instanceof Api.Chat) {
      const chatId = entity.id.toJSNumber();

      if (inputId === chatId || inputId === -chatId) {
        return {
          id: String(-chatId),
          title: entity.title || dialog.title || 'без названия',
          entity,
          needsJoin: false,
        };
      }
    }
  }

  if (internalChannelId) {
    systemLogger.log({
      level: LogLevel.INFO,
      module: 'RESOLVE_CHANNEL',
      message: `[resolve] numeric ID not found in dialogs/cache: ${input}`,
    });
  }

  return null;
};

const findResolvedChat = (result: Api.contacts.ResolvedPeer): Api.TypeChat | null => {
  if (result.peer.className !== 'PeerChannel') {
    return null;
  }

  const peerChannelId = result.peer.channelId.toString();

  return (
    result.chats.find(
      (chat): chat is Api.Channel =>
        chat instanceof Api.Channel && chat.id.toString() === peerChannelId,
    ) || null
  );
};

const resolveUsername = async (username: string): Promise<ResolvedChannel> => {
  systemLogger.log({
    level: LogLevel.INFO,
    module: 'RESOLVE_CHANNEL',
    message: `[resolve] username: ${username}, calling ResolveUsername...`,
  });

  const result = await tgClient.invoke(new Api.contacts.ResolveUsername({ username }));
  const chat = findResolvedChat(result);

  systemLogger.log({
    level: LogLevel.LOG,
    module: 'RESOLVE_CHANNEL',
    message: `[resolve] ResolveUsername done, peer=${result.peer.className}`,
  });

  if (!chat) {
    throw new Error('Это не канал или супергруппа');
  }

  return resolveFromChat(chat, true);
};

const findChatInUpdates = (updates: Api.TypeUpdates): Api.TypeChat | null => {
  if (!('chats' in updates)) {
    return null;
  }

  return (
    updates.chats.find((chat): chat is Api.Channel | Api.Chat => {
      return chat instanceof Api.Channel || chat instanceof Api.Chat;
    }) || null
  );
};

const resolveInvite = async (
  hash: string,
  { joinInvite = false }: ResolveChannelOptions,
): Promise<ResolvedChannel> => {
  systemLogger.log({
    level: LogLevel.INFO,
    module: 'RESOLVE_CHANNEL',
    message: '[resolve] invite link, calling CheckChatInvite...',
  });

  const invite = await tgClient.invoke(new Api.messages.CheckChatInvite({ hash }));

  if (invite instanceof Api.ChatInviteAlready) {
    return resolveFromChat(invite.chat, false);
  }

  if (!joinInvite) {
    throw new Error(
      'Для invite-ссылки нужно сначала вступить в канал. Используй /add с этой ссылкой',
    );
  }

  if (invite instanceof Api.ChatInvite && invite.requestNeeded) {
    throw new Error(
      'Это invite-ссылка с заявкой на вступление; автоматически добавить канал нельзя',
    );
  }

  const updates = await tgClient.invoke(new Api.messages.ImportChatInvite({ hash }));
  const chat = findChatInUpdates(updates);

  if (!chat) {
    throw new Error('Не удалось получить канал после вступления по invite-ссылке');
  }

  return resolveFromChat(chat, false);
};

const resolveNumeric = async (input: string): Promise<ResolvedChannel> => {
  systemLogger.log({
    level: LogLevel.LOG,
    module: 'RESOLVE_CHANNEL',
    message: `[resolve] numeric ID: ${input}, checking dialogs/cache...`,
  });

  const dialogMatch = await findDialogByNumericId(input);
  if (dialogMatch) {
    return dialogMatch;
  }

  try {
    const channel = await tgClient.getEntity(input);

    systemLogger.log({
      level: LogLevel.LOG,
      module: 'RESOLVE_CHANNEL',
      message: `[resolve] getEntity done, className=${channel.className}`,
    });

    if (channel instanceof Api.Channel || channel instanceof Api.Chat) {
      return resolveFromChat(channel, false);
    }
  } catch (error) {
    systemLogger.log({
      level: LogLevel.WARN,
      module: 'RESOLVE_CHANNEL',
      message: `[resolve] numeric getEntity failed: ${input}`,
      details: error,
    });
  }

  throw new Error(
    'Не удалось найти канал по id. Telegram не отдаёт accessHash по одному id: добавь канал по @username, t.me-ссылке или сначала открой его аккаунтом, чтобы он попал в dialogs/cache.',
  );
};

export const resolveChannelId = async (
  input: string,
  options: ResolveChannelOptions = {},
): Promise<ResolvedChannel> => {
  const normalizedInput = input.trim();

  if (/^-?\d+$/.test(normalizedInput)) {
    return resolveNumeric(normalizedInput);
  }

  const { username, isInvite } = utils.parseUsername(normalizedInput);

  if (!username) {
    throw new Error(
      'Не удалось распознать канал. Используй @username, t.me-ссылку, invite-ссылку или id',
    );
  }

  if (isInvite) {
    return resolveInvite(username, options);
  }

  return resolveUsername(username);
};
