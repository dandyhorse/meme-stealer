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
const chatId = process.env.CHAT_ID;
const botToken = process.env.BOT_TOKEN;
const stringSession = process.env.STRING_SESSION
  ? new StringSession(process.env.STRING_SESSION)
  : new StringSession('');

const SOCKS5_PROXY = { host: '127.0.0.1', port: 1081 };

const tgClient = new TelegramClient(stringSession, apiId, apiHash, {
  connectionRetries: 5,
  timeout: 30,
  proxy: {
    ip: SOCKS5_PROXY.host,
    port: SOCKS5_PROXY.port,
    socksType: 5,
  },
});

let _botClient: Telegraf | null = null;

const getBotClient = () => _botClient;

const initProxy = async () => {
  const { SocksClient } = await import('socks');
  // @ts-expect-error moduleResolution:node does not resolve exports
  const { SocksProxyAgent } = await import('socks-proxy-agent');
  const { Agent, setGlobalDispatcher } = await import('undici');

  const socksAgent = new Agent({
    connect: async (
      opts: import('undici').buildConnector.Options,
      callback: import('undici').buildConnector.Callback,
    ) => {
      try {
        const { hostname, port } = opts;
        const { socket } = await SocksClient.createConnection({
          proxy: { ...SOCKS5_PROXY, type: 5 },
          command: 'connect',
          destination: { host: hostname, port: Number(port) },
        });
        callback(null, socket);
      } catch (err) {
        callback(err instanceof Error ? err : new Error(String(err)), null);
      }
    },
  });
  setGlobalDispatcher(socksAgent);

  if (botToken) {
    _botClient = new Telegraf(botToken, {
      telegram: {
        agent: new SocksProxyAgent(`socks5://${SOCKS5_PROXY.host}:${SOCKS5_PROXY.port}`),
      },
    });
  }
};

export {
  dbUrl,
  dbPort,
  dbName,
  dbUser,
  dbPassword,
  tgClient,
  chatId,
  botToken,
  getBotClient,
  initProxy,
};
