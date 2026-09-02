import { adminAccounts, adminRoles } from "./schema.js";
import { createDatabase } from "./client.js";

const databaseUrl = process.env.DATABASE_URL;
const telegramUserId = process.env.ADMIN_TELEGRAM_USER_ID;

if (!databaseUrl) throw new Error("DATABASE_URL is required");
if (!telegramUserId || !/^\d+$/.test(telegramUserId)) {
  throw new Error("ADMIN_TELEGRAM_USER_ID must be a positive Telegram numeric user ID");
}

const database = createDatabase(databaseUrl);

try {
  const result = await database.db.transaction(async (transaction) => {
    const [role] = await transaction
      .insert(adminRoles)
      .values({ name: "administrator", permissions: ["*"] })
      .onConflictDoUpdate({
        target: adminRoles.name,
        set: { permissions: ["*"], updatedAt: new Date() },
      })
      .returning();
    if (!role) throw new Error("Administrator role upsert returned no row");

    const [account] = await transaction
      .insert(adminAccounts)
      .values({ telegramUserId: BigInt(telegramUserId), roleId: role.id, active: true })
      .onConflictDoUpdate({
        target: adminAccounts.telegramUserId,
        set: { roleId: role.id, active: true, updatedAt: new Date() },
      })
      .returning();
    if (!account) throw new Error("Administrator account upsert returned no row");
    return { roleName: role.name, accountId: account.id, active: account.active };
  });

  console.log(
    JSON.stringify({
      status: "ok",
      role: result.roleName,
      accountId: result.accountId,
      telegramUserId,
      active: result.active,
    }),
  );
} finally {
  await database.close();
}
