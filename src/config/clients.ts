import { Telegraf } from 'telegraf';
import { TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions/index.js';
// @ts-expect-error moduleResolution:node does not resolve socks-proxy-agent exports
import { SocksProxyAgent } from 'socks-proxy-agent';
import { env } from './env';

const session = new StringSession(env.SESSION);

export const tgClient = new TelegramClient(session, env.API_ID, env.API_HASH, {
  connectionRetries: 5,
  timeout: 30,
  proxy: {
    ip: env.SOCKS_HOST,
    port: env.SOCKS_PORT,
    socksType: 5,
  },
});

export const bot = new Telegraf(env.BOT_TOKEN, {
  telegram: {
    agent: new SocksProxyAgent(`socks5://${env.SOCKS_HOST}:${env.SOCKS_PORT}`),
  },
});
