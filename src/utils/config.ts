import dotenv from 'dotenv';
import { TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions/index.js';

dotenv.config();

const dbPort = process.env.DB_PORT;
const dbName = process.env.DB_NAME;
const dbUser = process.env.DB_USER;
const dbPassword = process.env.DB_PASSWORD;
const dbUrl = `postgresql://${dbUser}:${dbPassword}@localhost:${dbPort}/${dbName}`;

const apiId = Number(process.env.API_ID);
const apiHash = process.env.API_HASH;
const chatId = process.env.CHAT_ID;
const botToken = process.env.BOT_TOKEN;
const stringSession = process.env.STRING_SESSION
  ? new StringSession(process.env.STRING_SESSION)
  : new StringSession('');

const tgClient = new TelegramClient(stringSession, apiId, apiHash, {
  connectionRetries: 5,
});

export { dbUrl, dbPort, dbName, dbUser, dbPassword, tgClient, chatId, botToken };
