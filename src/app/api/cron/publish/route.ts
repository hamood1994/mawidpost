import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { admin } from "@/lib/server/admin";
import { decrypt } from "@/lib/server/crypto";
import { MetaError } from "@/lib/server/meta";
import { publishPost } from "@/lib/server/publisher";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

interface PostRow {
  id: string;
  account_id: string | null;
  caption: string;
  first_comment: string | null;
  post_type: "post" | "story" | "reel";
  media_urls: string[];
  attempts: number;
}

function allowedMedia(urls: string[]): boolean {
  const base = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/media/`;
  return urls.every((u) => u.startsWith(base));
}

async function processPost(db: SupabaseClient, p: PostRow) {
  try {
    if (!p.account_id) throw new MetaError("المنشور غير مرتبط بحساب");
    const { data: acc } = await db.from("social_accounts").select("id, platform, external_id").eq("id", p.account_id).maybeSingle();
    if (!acc || !acc.external_id || (acc.platform !== "instagram" && acc.platform !== "facebook")) {
      throw new MetaError("هذا الحساب غير مربوط مع Meta. اربطه من زر «ربط حساب» ثم أعد المحاولة.");
    }
    const { data: tok } = await db.from("account_tokens").select("token_enc").eq("account_id", acc.id).maybeSingle();
    if (!tok) throw new MetaError("لا يوجد تصريح نشر لهذا الحساب. أعد ربط الحساب.");
    if (!allowedMedia(p.media_urls)) throw new MetaError("ملف غير مسموح به");

    const res = await publishPost({
      platform: acc.platform,
      externalId: acc.external_id,
      token: decrypt(tok.token_enc),
      postType: p.post_type,
      caption: p.caption,
      firstComment: p.first_comment,
      media: p.media_urls,
    });
    await db
      .from("posts")
      .update({ status: "published", external_id: res.externalId, published_at: new Date().toISOString(), error: res.warning ?? null, claimed_at: null })
      .eq("id", p.id);
  } catch (e) {
    const err = e instanceof MetaError ? e : new MetaError(e instanceof Error ? e.message : String(e));
    const attempts = p.attempts + 1;
    const retry = err.transient && attempts < 3;
    await db
      .from("posts")
      .update({ status: retry ? "scheduled" : "failed", attempts, error: err.message, claimed_at: null })
      .eq("id", p.id);
    if (err.authFailure && p.account_id) {
      await db.from("social_accounts").update({ status: "reauth" }).eq("id", p.account_id);
    }
    console.error("[publish]", p.id, err.message);
  }
}

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const db = admin();
  const { data, error } = await db.rpc("claim_due_posts", { batch: 5 });
  if (error) {
    console.error("[claim]", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  const rows = (data ?? []) as PostRow[];
  await Promise.allSettled(rows.map((p) => processPost(db, p)));
  return NextResponse.json({ processed: rows.length });
}
