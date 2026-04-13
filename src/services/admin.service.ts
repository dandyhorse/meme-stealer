import { AdminRole } from '../../generated/client';
import { db } from '../../prisma/client';

let adminCache: { telegramId: bigint; role: AdminRole }[] = [];

export const loadAdmins = async (): Promise<void> => {
  adminCache = await db.admin.findMany({
    select: { telegramId: true, role: true },
  });
};

export const isAdmin = (telegramId: number): boolean => {
  const id = BigInt(telegramId);
  return adminCache.some((a) => a.telegramId === id);
};

export const hasFullAccess = (telegramId: number): boolean => {
  const id = BigInt(telegramId);
  return adminCache.some((a) => a.telegramId === id && a.role === 'full_access');
};

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

export const removeAdmin = async (
  telegramId: bigint,
): Promise<'removed' | 'not_found' | 'last_full_access'> => {
  const admin = adminCache.find((a) => a.telegramId === telegramId);
  if (!admin) return 'not_found';

  if (admin.role === 'full_access') {
    const fullAccessCount = adminCache.filter((a) => a.role === 'full_access').length;
    if (fullAccessCount <= 1) return 'last_full_access';
  }

  try {
    await db.admin.delete({ where: { telegramId } });
    await loadAdmins();
    return 'removed';
  } catch {
    return 'not_found';
  }
};
