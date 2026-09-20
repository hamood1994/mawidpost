import { NextResponse } from "next/server";
import { admin, fail, HttpError, requireRole, requireUser } from "@/lib/server/admin";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const { accountId } = (await req.json()) as { accountId?: string };
    if (!accountId) throw new HttpError(400, "accountId مطلوب");
    const user = await requireUser(req);
    const db = admin();
    const { data: acc } = await db.from("social_accounts").select("org_id").eq("id", accountId).maybeSingle();
    if (!acc) throw new HttpError(404, "الحساب غير موجود");
    await requireRole(user.id, acc.org_id, ["owner", "admin"]);
    await db.from("account_tokens").delete().eq("account_id", accountId);
    await db.from("social_accounts").update({ status: "disconnected" }).eq("id", accountId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return fail(e);
  }
}
