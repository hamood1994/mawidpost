import { NextResponse } from "next/server";
import { admin, fail, HttpError, requirePlatformAdmin } from "@/lib/server/admin";

export const dynamic = "force-dynamic";

/** Platform operator: change a company's plan or suspend / reactivate it. */
export async function POST(req: Request) {
  try {
    await requirePlatformAdmin(req);
    const b = (await req.json()) as { orgId?: string; plan?: string; suspended?: boolean };
    if (!b.orgId) throw new HttpError(400, "orgId مطلوب");
    const patch: Record<string, unknown> = {};
    if (typeof b.plan === "string") patch.plan = b.plan;
    if (typeof b.suspended === "boolean") patch.suspended = b.suspended;
    if (Object.keys(patch).length === 0) throw new HttpError(400, "لا يوجد تغيير");
    const { error } = await admin().from("organizations").update(patch).eq("id", b.orgId);
    if (error) throw new HttpError(400, error.message);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return fail(e);
  }
}
