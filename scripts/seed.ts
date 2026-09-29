/**
 * Creates the first super admin (from SUPERADMIN_* env vars).
 * Safe to re-run: existing users are left untouched.
 *
 *   npm run seed
 */
import { ObjectId } from "mongodb";
import bcrypt from "bcryptjs";
import { closeDb, getDb } from "../lib/mongodb";

async function main() {
  const email = process.env.SUPERADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.SUPERADMIN_PASSWORD ?? "";
  const name = process.env.SUPERADMIN_NAME?.trim() || "Super Admin";
  if (!email || !password) throw new Error("Set SUPERADMIN_EMAIL and SUPERADMIN_PASSWORD in .env.local first.");

  const db = await getDb();
  const users = db.collection("users");
  await users.createIndex({ email: 1 }, { unique: true });

  const existing = await users.findOne({ email });
  if (existing) {
    console.log(`User ${email} already exists (role: ${existing.role}) — left unchanged.`);
  } else {
    const now = new Date();
    await users.insertOne({
      _id: new ObjectId(),
      email,
      name,
      role: "super_admin",
      passwordHash: await bcrypt.hash(password, 12),
      mustChangePassword: true,
      active: true,
      sessionVersion: 0,
      createdBy: "seed",
      createdAt: now,
      updatedAt: now,
    });
    console.log(`Created super admin ${email}. Sign in with SUPERADMIN_PASSWORD; you'll be asked to change it.`);
  }
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
