import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/client';
import { dbUrl } from '../src/utils/config';

// Creates a PostgreSQL adapter using the connection string from config.
// Prisma uses this adapter to execute SQL queries against the database.
const adapter = new PrismaPg({ connectionString: dbUrl });

// Instantiates and exports the Prisma client with the PostgreSQL adapter.
// This is the single entry point for all database operations in the application.
export const db = new PrismaClient({ adapter });

