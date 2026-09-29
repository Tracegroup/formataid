import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { handle, readJson } from "@/lib/api";
import { HttpError, generateOneTimePassword, hashPassword, normalizeEmail, requireUser, usersCollection, type Role } from "@/lib/auth";
import { logAudit } from "@/lib/audit";

const ROLES: Role[] = ["super_admin", "admin", "user"];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const GET = handle(async () => {
  await requireUser(["super_admin"]);
  const users = await usersCollection();
  const list = await users.find({}, { projection: { passwordHash: 0 } }).sort({ createdAt: -1 }).toArray();
  return NextResponse.json({
    users: list.map((u) => ({
      id: u._id.toString(),
      email: u.email,
      name: u.name,
      role: u.role,
      active: u.active,
      mustChangePassword: u.mustChangePassword,
      createdAt: u.createdAt,
      lastLoginAt: u.lastLoginAt ?? null,
    })),
  });
});

/** Creates a user with a one-time password that is returned exactly once. */
export const POST = handle(async (req: Request) => {
  const me = await requireUser(["super_admin"]);
  const body = await readJson<{ email?: string; name?: string; role?: Role }>(req);
  const email = normalizeEmail(body.email ?? "");
  const name = (body.name ?? "").trim();
  const role = body.role ?? "user";
  if (!EMAIL_RE.test(email)) throw new HttpError(400, "Enter a valid email address.");
  if (!name) throw new HttpError(400, "Enter the user's name.");
  if (!ROLES.includes(role)) throw new HttpError(400, "Invalid role.");

  const users = await usersCollection();
  if (await users.findOne({ email })) throw new HttpError(409, "A user with that email already exists.");

  const oneTimePassword = generateOneTimePassword();
  const now = new Date();
  const _id = new ObjectId();
  await users.insertOne({
    _id,
    email,
    name,
    role,
    passwordHash: await hashPassword(oneTimePassword),
    mustChangePassword: true,
    active: true,
    sessionVersion: 0,
    createdBy: me.email,
    createdAt: now,
    updatedAt: now,
  });
  await logAudit(me.email, "user_created", { email, role });
  return NextResponse.json({ user: { id: _id.toString(), email, name, role }, oneTimePassword }, { status: 201 });
});
