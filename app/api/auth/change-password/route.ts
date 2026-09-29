import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { handle, readJson } from "@/lib/api";
import { HttpError, checkPassword, hashPassword, passwordProblem, requireUser, startSession, usersCollection } from "@/lib/auth";
import { logAudit } from "@/lib/audit";

export const POST = handle(async (req: Request) => {
  const me = await requireUser(undefined, { allowPasswordChange: true });
  const { currentPassword = "", newPassword = "" } = await readJson<{ currentPassword?: string; newPassword?: string }>(req);

  const users = await usersCollection();
  const user = await users.findOne({ _id: new ObjectId(me.id) });
  if (!user) throw new HttpError(401, "Please sign in.");
  if (!(await checkPassword(currentPassword, user.passwordHash))) throw new HttpError(400, "Your current password is incorrect.");

  const problem = passwordProblem(newPassword);
  if (problem) throw new HttpError(400, problem);
  if (newPassword === currentPassword) throw new HttpError(400, "Choose a password different from your current one.");

  const updated = await users.findOneAndUpdate(
    { _id: user._id },
    {
      $set: { passwordHash: await hashPassword(newPassword), mustChangePassword: false, passwordChangedAt: new Date(), updatedAt: new Date() },
      // Sign out other sessions that used the old password.
      $inc: { sessionVersion: 1 },
    },
    { returnDocument: "after" }
  );
  if (updated) await startSession(updated);
  await logAudit(user.email, "password_changed");
  return NextResponse.json({ ok: true });
});
