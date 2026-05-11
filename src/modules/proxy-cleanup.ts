import { proxyChatId, tgClient } from '@config';
import { Api } from 'telegram';

import { LogLevel } from '../utils/common/dtos';
import { systemLogger } from '../utils/system-logger';

const DELETE_BATCH_SIZE = 100;

const extractSourceChatId = (message: Api.Message): bigint | null => {
  if (!message.fwdFrom?.fromId) return null;

  const fromId = message.fwdFrom.fromId;
  if (fromId.className === 'PeerChannel') {
    const channelId = (fromId as Api.PeerChannel).channelId.toJSNumber();
    return BigInt(-1000000000000 - channelId);
  }

  return null;
};

export const deleteMessagesFromProxy = async (sourceChatId: bigint): Promise<number> => {
  const toDelete: number[] = [];

  for await (const message of tgClient.iterMessages(String(proxyChatId), {})) {
    const msgSourceId = extractSourceChatId(message);
    if (msgSourceId === sourceChatId) {
      toDelete.push(message.id);
    }
  }

  if (toDelete.length === 0) return 0;

  for (let i = 0; i < toDelete.length; i += DELETE_BATCH_SIZE) {
    const batch = toDelete.slice(i, i + DELETE_BATCH_SIZE);
    await tgClient.deleteMessages(String(proxyChatId), batch, {
      revoke: true,
    });
  }

  systemLogger.log({
    level: LogLevel.LOG,
    module: 'PROXY_CLEANUP',
    message: `Удалено ${toDelete.length} сообщений из proxy для канала ${sourceChatId}`,
  });

  return toDelete.length;
};
