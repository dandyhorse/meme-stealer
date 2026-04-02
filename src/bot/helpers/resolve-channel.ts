import { tgClient } from '@config';
import { Api } from 'telegram';

import { LogLevel } from '../../utils/common/dtos/index';
import { systemLogger } from '../../utils/system-logger';

// Converts a channel identifier (numeric ID or t.me link) into a Bot API format ID and title.
// Bot API format uses -100 prefix for supergroups/channels (e.g., -1001234567890).
export const resolveChannelId = async (input: string): Promise<{ id: string; title: string }> => {
  // If input is purely numeric, treat it as a direct chat ID
  if (/^-?\d+$/.test(input)) {
    systemLogger.log({
      level: LogLevel.LOG,
      module: 'RESOLVE_CHANNEL',
      message: `[resolve] numeric ID: ${input}, calling getEntity...`,
    });

    // Fetch channel metadata directly by ID
    const channel = await tgClient.getEntity(input);

    systemLogger.log({
      level: LogLevel.LOG,
      module: 'RESOLVE_CHANNEL',
      message: `[resolve] getEntity done, className=${channel.className}`,
    });

    const title = (channel as Api.Chat).title || 'без названия';
    return { id: input, title };
  }

  // Input is a link or username — strip common URL prefixes to extract the raw username
  const username = input
    .replace(/^[htps]+:\/\//, '')
    .replace(/^(www\.)?t\.me\//, '')
    .replace(/^(www\.)?telegram\.me\//, '')
    .replace(/^@/, '')
    .replace(/\/$/, '');

  systemLogger.log({
    level: LogLevel.INFO,
    module: 'RESOLVE_CHANNEL',
    message: `[resolve] username: ${username}, calling ResolveUsername...`,
  });

  // Ask Telegram to resolve the username to a peer (channel, user, or chat)
  const result = await tgClient.invoke(new Api.contacts.ResolveUsername({ username }));

  systemLogger.log({
    level: LogLevel.LOG,
    module: 'RESOLVE_CHANNEL',
    message: `[resolve] ResolveUsername done, peer=${result.peer.className}`,
  });

  // Ensure the resolved peer is actually a channel (not a user or group)
  if (result.peer.className !== 'PeerChannel') {
    throw new Error('Это не канал');
  }

  // Extract the raw channel ID (without -100 prefix)
  const channelId = result.peer.channelId.toJSNumber();

  systemLogger.log({
    level: LogLevel.LOG,
    module: 'RESOLVE_CHANNEL',
    message: `[resolve] channelId=${channelId}, calling getEntity...`,
  });

  // Fetch full channel metadata to get the display title
  const channel = await tgClient.getEntity(result.peer);

  systemLogger.log({
    level: LogLevel.LOG,
    module: 'RESOLVE_CHANNEL',
    message: `[resolve] getEntity done, className=${channel.className}`,
  });

  const title = (channel as Api.Chat).title || 'без названия';
  // Convert raw channel ID to Bot API format: -100 prefix + raw ID
  // Telegram MTProto uses positive IDs, but Bot API uses -100XXXXXXXXXX for channels
  const botApiId = -1000000000000 - channelId;

  return { id: String(botApiId), title };
};
