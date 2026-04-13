import { env } from '@config';
import { tgClient } from '@config/clients';

import { LogLevel } from '../utils/common/dtos';
import { systemLogger } from '../utils/system-logger';

export const forwardToFiltered = async (
  messageIds: number[],
  sourceChatId: bigint,
  reason: string,
) => {
  await tgClient.forwardMessages(String(env.FILTERED_CHAT_ID), {
    fromPeer: String(sourceChatId),
    messages: messageIds,
  });
  systemLogger.log({
    level: LogLevel.LOG,
    module: 'FILTERED',
    message: `Сообщения [${messageIds.join(', ')}] -> filtered: ${reason}`,
  });
};

export const forwardToProxy = async (
  messageIds: number[],
  sourceChatId: bigint,
  reason: string,
) => {
  await tgClient.forwardMessages(String(env.PROXY_CHAT_ID), {
    fromPeer: String(sourceChatId),
    messages: messageIds,
  });
  systemLogger.log({
    level: LogLevel.LOG,
    module: 'PROCESS',
    message: `Сообщения [${messageIds.join(', ')}] -> proxy: ${reason}`,
  });
};
