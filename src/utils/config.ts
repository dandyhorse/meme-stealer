import dotenv from 'dotenv';
import { TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions';

dotenv.config();

const dbUrl = process.env.DB_URL;

const apiId = Number(process.env.API_ID);
const apiHash = process.env.API_HASH;
const chatId = process.env.CHAT_ID;
const botToken = process.env.BOT_TOKEN;
const stringSession = process.env.STRING_SESSION
  ? new StringSession(process.env.STRING_SESSION)
  : null;

const tgClient = new TelegramClient(stringSession, apiId, apiHash, {
  connectionRetries: 5,
});

export { dbUrl, tgClient, chatId, botToken };
