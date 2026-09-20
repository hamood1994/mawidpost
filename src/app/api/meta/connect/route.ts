import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { fail, requireRole, requireUser } from "@/lib/server/admin";
import { signState } from "@/lib/server/crypto";
import { oauthUrl } from "@/lib/server/meta";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const { orgId } = (await req.json()) as { orgId?: string };
    if (!orgId) return NextResponse.json({ error: "orgId مطلوب" }, { status: 400 });
    const user = await requireUser(req);
    await requireRole(user.id, orgId, ["owner", "admin"]);
    const state = signState({ o: orgId, u: user.id, exp: Date.now() + 10 * 60_000, n: randomUUID() });
    return NextResponse.json({ url: oauthUrl(state) });
  } catch (e) {
    return fail(e);
  }
}
