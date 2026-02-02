import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/client';
import { dbUrl } from '../src/utils/config';

const adapter = new PrismaPg({ connectionString: dbUrl });
export const db = new PrismaClient({ adapter });

