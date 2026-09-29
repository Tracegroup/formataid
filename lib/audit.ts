import { getDb } from "@/lib/mongodb";

export type AuditAction =
  | "login"
  | "login_failed"
  | "logout"
  | "password_changed"
  | "user_created"
  | "user_updated"
  | "password_reset"
  | "report_formatted"
  | "report_downloaded"
  | "settings_changed";

/** Best-effort audit trail — never throws. */
export async function logAudit(actorEmail: string, action: AuditAction, details: Record<string, unknown> = {}): Promise<void> {
  try {
    const db = await getDb();
    const col = db.collection("auditLog");
    col.createIndex({ createdAt: -1 }).catch(() => {});
    await col.insertOne({ actorEmail, action, details, createdAt: new Date() });
  } catch (err) {
    console.error("logAudit failed:", err);
  }
}
