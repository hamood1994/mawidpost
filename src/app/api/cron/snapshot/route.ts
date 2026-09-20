import { NextResponse } from "next/server";
import { admin } from "@/lib/server/admin";
import { decrypt } from "@/lib/server/crypto";
import { graph } from "@/lib/server/meta";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Daily follower snapshot for growth charts. Safe to call more than once a day. */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const db = admin();
  const { data: accounts } = await db
    .from("social_accounts")
    .select("id, platform, external_id")
    .eq("status", "connected")
    .in("platform", ["instagram", "facebook"])
    .not("external_id", "is", null);
  const day = new Date().toISOString().slice(0, 10);
  let saved = 0;
  for (const a of accounts ?? []) {
    try {
      const { data: tok } = await db.from("account_tokens").select("token_enc").eq("account_id", a.id).maybeSingle();
      if (!tok) continue;
      const token = decrypt(tok.token_enc);
      const info =
        a.platform === "instagram"
          ? await graph<{ followers_count?: number; media_count?: number }>(a.external_id as string, { token, params: { fields: "followers_count,media_count" } })
          : await graph<{ followers_count?: number; fan_count?: number }>(a.external_id as string, { token, params: { fields: "followers_count,fan_count" } });
      const followers = info.followers_count ?? (info as { fan_count?: number }).fan_count ?? null;
      const media = (info as { media_count?: number }).media_count ?? null;
      await db.from("account_stats").upsert({ account_id: a.id, day, followers, media_count: media }, { onConflict: "account_id,day" });
      saved++;
    } catch (e) {
      console.error("[snapshot]", a.id, e instanceof Error ? e.message : e);
    }
  }
  return NextResponse.json({ saved });
}
