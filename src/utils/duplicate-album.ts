import { TelegramClient } from 'telegram';
import { Api } from 'telegram';

import { LogLevel } from './common/dtos';
import { systemLogger } from './system-logger';

/**
 * Send original + duplicate as a single album message to target chat.
 * Returns true if sent successfully, false otherwise (caller should use fallback).
 */
export const sendDuplicateAlbum = async (
  client: TelegramClient,
  targetChat: number,
  originalMedia: Api.TypeMessageMedia,
  duplicateMedia: Api.TypeMessageMedia,
): Promise<boolean> => {
  try {
    await client.sendFile(targetChat, {
      file: [originalMedia, duplicateMedia],
      caption: ['', 'DUPLICATE'],
    });
    return true;
  } catch (err) {
    systemLogger.log({
      level: LogLevel.WARN,
      module: 'DEDUP',
      message: 'Не удалось отправить альбом дубля',
      details: err,
    });
    return false;
  }
};
