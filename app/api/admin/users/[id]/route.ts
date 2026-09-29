import { NextResponse } from "next/server";
import { handle, readJson, toObjectId } from "@/lib/api";
import { HttpError, generateOneTimePassword, hashPassword, requireUser, usersCollection, type Role, type UserDoc } from "@/lib/auth";
import { logAudit } from "@/lib/audit";

const ROLES: Role[] = ["super_admin", "admin", "user"];

type Ctx = { params: Promise<{ id: string }> };

/** Update name/role/active, or reset the password to a new one-time password. */
export const PATCH = handle(async (req: Request, { params }: Ctx) => {
  const me = await requireUser(["super_admin"]);
  const _id = toObjectId((await params).id, "user");
  const body = await readJson<{ name?: string; role?: Role; active?: boolean; resetPassword?: boolean }>(req);

  const users = await usersCollection();
  const user = await users.findOne({ _id });
  if (!user) throw new HttpError(404, "No such user.");

  const isSelf = user._id.toString() === me.id;
  if (isSelf && (body.active === false || (body.role && body.role !== "super_admin"))) {
    throw new HttpError(400, "You can't deactivate or demote your own account.");
  }

  const set: Partial<UserDoc> = { updatedAt: new Date() };
  let bumpSession = false;
  if (body.name !== undefined) {
    if (!body.name.trim()) throw new HttpError(400, "Name can't be empty.");
    set.name = body.name.trim();
  }
  if (body.role !== undefined) {
    if (!ROLES.includes(body.role)) throw new HttpError(400, "Invalid role.");
    set.role = body.role;
    bumpSession = true;
  }
  if (body.active !== undefined) {
    set.active = !!body.active;
    bumpSession = true;
  }

  let oneTimePassword: string | undefined;
  if (body.resetPassword) {
    oneTimePassword = generateOneTimePassword();
    set.passwordHash = await hashPassword(oneTimePassword);
    set.mustChangePassword = true;
    bumpSession = true;
  }

  // Bumping sessionVersion signs the user out everywhere so the change applies immediately.
  await users.updateOne({ _id }, { $set: set, ...(bumpSession && !isSelf ? { $inc: { sessionVersion: 1 } } : {}) });
  await logAudit(me.email, body.resetPassword ? "password_reset" : "user_updated", {
    email: user.email,
    ...(body.role ? { role: body.role } : {}),
    ...(body.active !== undefined ? { active: body.active } : {}),
  });
  return NextResponse.json({ ok: true, ...(oneTimePassword ? { oneTimePassword } : {}) });
});
