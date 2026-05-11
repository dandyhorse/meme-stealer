import { filteredChatId, proxyChatId, tgClient } from '@config';

import { LogLevel } from '../utils/common/dtos';
import { systemLogger } from '../utils/system-logger';

export const forwardToFiltered = async (
  messageIds: number[],
  sourceChatId: bigint,
  reason: string,
) => {
  if (!filteredChatId) return;

  await tgClient.forwardMessages(filteredChatId, {
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
  await tgClient.forwardMessages(proxyChatId, {
    fromPeer: String(sourceChatId),
    messages: messageIds,
  });
  systemLogger.log({
    level: LogLevel.LOG,
    module: 'PROCESS',
    message: `Сообщения [${messageIds.join(', ')}] -> proxy: ${reason}`,
  });
};
