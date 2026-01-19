import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../generated/client'
// import { dbUrl } from '../src/utils/config'

console.log(process.env.DB_URL)
const adapter = new PrismaPg({ connectionString: process.env.DB_URL })
export const db = new PrismaClient({ adapter })
