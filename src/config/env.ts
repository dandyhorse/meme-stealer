import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  API_ID: z.coerce.number().int().positive(),
  API_HASH: z.string().min(1),
  SESSION: z.string().min(1),
  BOT_TOKEN: z.string().min(1),
  PROXY_CHAT_ID: z.string().transform((v) => BigInt(v)),
  FILTERED_CHAT_ID: z.string().transform((v) => BigInt(v)),
  DATABASE_URL: z.string().min(1),
  SOCKS_HOST: z.string().default('127.0.0.1'),
  SOCKS_PORT: z.coerce.number().int().positive().default(1081),
  HAMMING_THRESHOLD: z.coerce.number().int().min(0).max(32).default(5),
});

const result = envSchema.safeParse(process.env);

if (!result.success) {
  const fieldErrors = result.error.flatten().fieldErrors;
  const formatted = Object.entries(fieldErrors)
    .map(([field, errors]) => `  ${field}: ${(errors ?? []).join(', ')}`)
    .join('\n');
  console.error(`Invalid environment variables:\n${formatted}`);
  process.exit(1);
}

export const env = result.data;
