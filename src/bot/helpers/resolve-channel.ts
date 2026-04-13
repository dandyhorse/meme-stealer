import { tgClient } from '@config/clients';
import { Api } from 'telegram';

import { LogLevel } from '../../utils/common/dtos/index';
import { systemLogger } from '../../utils/system-logger';

export const BOT_API_CHANNEL_OFFSET = -1_000_000_000_000;

export const resolveChannelId = async (input: string): Promise<{ id: string; title: string }> => {
  if (/^-?\d+$/.test(input)) {
    systemLogger.log({
      level: LogLevel.LOG,
      module: 'RESOLVE_CHANNEL',
      message: `[resolve] numeric ID: ${input}, calling getEntity...`,
    });

    const channel = await tgClient.getEntity(input);

    systemLogger.log({
      level: LogLevel.LOG,
      module: 'RESOLVE_CHANNEL',
      message: `[resolve] getEntity done, className=${channel.className}`,
    });

    const title = (channel as Api.Chat).title || 'без названия';
    return { id: input, title };
  }

  const username = input
    .replace(/^https?:\/\//, '')
    .replace(/^(www\.)?t\.me\//, '')
    .replace(/^(www\.)?telegram\.me\//, '')
    .replace(/^@/, '')
    .replace(/\/$/, '');

  systemLogger.log({
    level: LogLevel.INFO,
    module: 'RESOLVE_CHANNEL',
    message: `[resolve] username: ${username}, calling ResolveUsername...`,
  });

  const result = await tgClient.invoke(new Api.contacts.ResolveUsername({ username }));

  systemLogger.log({
    level: LogLevel.LOG,
    module: 'RESOLVE_CHANNEL',
    message: `[resolve] ResolveUsername done, peer=${result.peer.className}`,
  });

  if (result.peer.className !== 'PeerChannel') {
    throw new Error('Это не канал');
  }

  const channelId = result.peer.channelId.toJSNumber();

  systemLogger.log({
    level: LogLevel.LOG,
    module: 'RESOLVE_CHANNEL',
    message: `[resolve] channelId=${channelId}, calling getEntity...`,
  });

  const channel = await tgClient.getEntity(result.peer);

  systemLogger.log({
    level: LogLevel.LOG,
    module: 'RESOLVE_CHANNEL',
    message: `[resolve] getEntity done, className=${channel.className}`,
  });

  const title = (channel as Api.Chat).title || 'без названия';
  const botApiId = BOT_API_CHANNEL_OFFSET - channelId;

  return { id: String(botApiId), title };
};
