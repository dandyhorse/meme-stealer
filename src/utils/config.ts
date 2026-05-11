import dotenv from 'dotenv';
import { Telegraf } from 'telegraf';
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
const botToken = process.env.BOT_TOKEN;
const stringSession = process.env.STRING_SESSION
  ? new StringSession(process.env.STRING_SESSION)
  : new StringSession('');

const parseProxyEnabled = (value: string | undefined): boolean => {
  if (!value) return true;

  return !['0', 'false', 'no', 'off'].includes(value.toLowerCase());
};

const parseProxyPort = (value: string | undefined): number => {
  const parsed = Number(value);

  return Number.isInteger(parsed) && parsed > 0 ? parsed : 1081;
};

const parseRequiredNumber = (name: string): number => {
  const value = process.env[name];
  const parsed = Number(value);

  if (!value || !Number.isSafeInteger(parsed)) {
    throw new Error(`${name} is required and must be a valid integer`);
  }

  return parsed;
};

const tgProxyEnabled = parseProxyEnabled(process.env.TG_PROXY_ENABLED);
const tgProxyHost = process.env.TG_PROXY_HOST || '127.0.0.1';
const tgProxyPort = parseProxyPort(process.env.TG_PROXY_PORT);
const tgProxyUrl = `socks5://${tgProxyHost}:${tgProxyPort}`;
const proxyChatId = parseRequiredNumber('PROXY_CHAT_ID');
const filteredChatId = parseRequiredNumber('FILTERED_CHAT_ID');

const tgClient = new TelegramClient(stringSession, apiId, apiHash, {
  connectionRetries: 5,
  timeout: 30,
  ...(tgProxyEnabled
    ? {
        proxy: {
          ip: tgProxyHost,
          port: tgProxyPort,
          socksType: 5 as const,
        },
      }
    : {}),
});

let _botClient: Telegraf | null = null;

const getBotClient = () => _botClient;

const initProxy = async () => {
  if (botToken) {
    if (tgProxyEnabled) {
      // @ts-expect-error moduleResolution:node does not resolve exports
      const { SocksProxyAgent } = await import('socks-proxy-agent');

      _botClient = new Telegraf(botToken, {
        telegram: {
          agent: new SocksProxyAgent(tgProxyUrl),
        },
      });
      return;
    }

    _botClient = new Telegraf(botToken);
  }
};

export {
  dbUrl,
  dbPort,
  dbName,
  dbUser,
  dbPassword,
  tgClient,
  botToken,
  proxyChatId,
  filteredChatId,
  getBotClient,
  initProxy,
};
