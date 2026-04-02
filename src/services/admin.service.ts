import { AdminRole } from '../../generated/client';
import { db } from '../../prisma/client';

// In-memory cache of admins to avoid hitting the database on every message.
// Reloaded whenever admins are added/removed or on application startup.
let adminCache: { telegramId: bigint; role: AdminRole }[] = [];

// Fetches all admins from the database and stores them in the in-memory cache.
// Called on startup and after any admin add/remove operation.
export const loadAdmins = async (): Promise<void> => {
  adminCache = await db.admin.findMany({
    select: { telegramId: true, role: true },
  });
};

// Checks if a Telegram user ID belongs to any registered admin (any role).
// Used to gate access to bot commands.
export const isAdmin = (telegramId: number): boolean => {
  const id = BigInt(telegramId);
  return adminCache.some((a) => a.telegramId === id);
};

// Checks if a Telegram user ID has the 'full_access' admin role.
// Full access admins can manage other admins and view sensitive data (all channels, private chats).
export const hasFullAccess = (telegramId: number): boolean => {
  const id = BigInt(telegramId);
  return adminCache.some((a) => a.telegramId === id && a.role === 'full_access');
};

// Adds or updates an admin in the database.
// Uses upsert so it works for both new admins and role changes.
// Refreshes the in-memory cache after the database operation.
export const addAdmin = async (
  telegramId: bigint,
  role: AdminRole,
  name?: string,
): Promise<void> => {
  await db.admin.upsert({
    where: { telegramId },
    update: { role, name },
    create: { telegramId, role, name },
  });
  await loadAdmins();
};

// Removes an admin from the database by their Telegram user ID.
// Returns true if successfully deleted, false if the admin was not found.
// Refreshes the in-memory cache after deletion.
export const removeAdmin = async (telegramId: bigint): Promise<boolean> => {
  try {
    await db.admin.delete({ where: { telegramId } });
    await loadAdmins();
    return true;
  } catch {
    return false;
  }
};
