import dotenv from 'dotenv';
import { Telegraf } from 'telegraf';
import { TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions/index.js';

// Load environment variables from .env file into process.env
dotenv.config();

// Database connection parameters read from environment variables
const dbPort = process.env.DB_PORT;
const dbName = process.env.DB_NAME;
const dbUser = process.env.DB_USER;
const dbPassword = process.env.DB_PASSWORD;
// Construct the full PostgreSQL connection string
const dbUrl = `postgresql://${dbUser}:${dbPassword}@localhost:${dbPort}/${dbName}`;

// Telegram API credentials (obtained from my.telegram.org)
const apiId = Number(process.env.API_ID);
const apiHash = process.env.API_HASH;
// Optional: default chat ID for the bot
const chatId = process.env.CHAT_ID;
// Bot API token for the optional Telegraf help bot
const botToken = process.env.BOT_TOKEN;
// Restore previous Telegram session from env, or start with an empty session
const stringSession = process.env.STRING_SESSION
  ? new StringSession(process.env.STRING_SESSION)
  : new StringSession('');

// SOCKS5 proxy configuration for routing Telegram traffic through a local proxy
const SOCKS5_PROXY = { host: '127.0.0.1', port: 1081 };

// MTProto userbot client — connects to Telegram as a regular user account
// Used for polling channels, downloading media, and forwarding messages
const tgClient = new TelegramClient(stringSession, apiId, apiHash, {
  connectionRetries: 5,
  timeout: 30,
  proxy: {
    ip: SOCKS5_PROXY.host,
    port: SOCKS5_PROXY.port,
    socksType: 5,
  },
});

// Lazy-initialized Telegraf bot client (Bot API, separate from the userbot)
let _botClient: Telegraf | null = null;

// Returns the bot client instance (or null if not yet initialized)
const getBotClient = () => _botClient;

// Configures a global SOCKS5 proxy for all HTTP(S) requests made by the application.
// This includes:
// 1. undici (used by Prisma and other HTTP clients) — via a custom connect handler
// 2. Telegraf Bot API client — via socks-proxy-agent
// Must be called before making any network requests.
const initProxy = async () => {
  const { SocksClient } = await import('socks');
  // @ts-expect-error moduleResolution:node does not resolve exports
  const { SocksProxyAgent } = await import('socks-proxy-agent');
  const { Agent, setGlobalDispatcher } = await import('undici');

  // Create a custom undici agent that routes connections through the SOCKS5 proxy
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
  // Set as the global dispatcher so all undici requests use the proxy
  setGlobalDispatcher(socksAgent);

  // Initialize the Telegraf bot client if a BOT_TOKEN is provided
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
  tgClient,       // MTProto userbot client
  chatId,
  botToken,
  getBotClient,  // Telegraf Bot API client (lazy init)
  initProxy,     // Sets up global SOCKS5 proxy
};
