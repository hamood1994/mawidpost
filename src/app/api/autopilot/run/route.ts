import { NextResponse } from "next/server";
import { admin, fail, HttpError, requireBrandAccess, requireRole, requireUser } from "@/lib/server/admin";
import { runAutopilot } from "@/lib/server/autopilot";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** "Generate now": the manager clicks a button instead of waiting for the hourly run. */
export async function POST(req: Request) {
  try {
    const user = await requireUser(req);
    const { orgId, brandId } = (await req.json()) as { orgId?: string; brandId?: string };
    if (!orgId) throw new HttpError(400, "orgId مطلوب");
    if (brandId) await requireBrandAccess(user.id, orgId, brandId, ["owner", "admin", "editor"]);
    else await requireRole(user.id, orgId, ["owner", "admin"]);
    const r = await runAutopilot(admin(), { orgId, brandId, maxPerRule: 14 });
    return NextResponse.json(r);
  } catch (e) {
    return fail(e);
  }
}
