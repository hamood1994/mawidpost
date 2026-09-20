import { NextResponse } from "next/server";
import { admin, fail, HttpError, requireBrandAccess, requireUser } from "@/lib/server/admin";
import { decrypt } from "@/lib/server/crypto";
import { graph } from "@/lib/server/meta";

export const dynamic = "force-dynamic";

export interface AnalyticsPost {
  id: string;
  text: string;
  url: string | null;
  thumb: string | null;
  time: string;
  likes: number;
  comments: number;
  shares: number;
  kind: string;
}

export async function GET(req: Request) {
  try {
    const user = await requireUser(req);
    const accountId = new URL(req.url).searchParams.get("accountId");
    if (!accountId) throw new HttpError(400, "accountId مطلوب");
    const db = admin();
    const { data: acc } = await db.from("social_accounts").select("id, org_id, brand_id, platform, external_id, handle").eq("id", accountId).maybeSingle();
    if (!acc) throw new HttpError(404, "الحساب غير موجود");
    await requireBrandAccess(user.id, acc.org_id, acc.brand_id, ["owner", "admin", "editor", "client"]);
    if (!acc.external_id) throw new HttpError(400, "هذا الحساب غير مربوط مع Meta");
    const { data: tok } = await db.from("account_tokens").select("token_enc").eq("account_id", acc.id).maybeSingle();
    if (!tok) throw new HttpError(400, "أعد ربط الحساب لعرض التحليلات");
    const token = decrypt(tok.token_enc);

    let followers: number | null = null;
    let mediaCount: number | null = null;
    let posts: AnalyticsPost[] = [];

    if (acc.platform === "instagram") {
      const info = await graph<{ followers_count?: number; media_count?: number }>(acc.external_id, {
        token,
        params: { fields: "followers_count,media_count" },
      });
      followers = info.followers_count ?? null;
      mediaCount = info.media_count ?? null;
      const m = await graph<{ data: any[] }>(`${acc.external_id}/media`, {
        token,
        params: { fields: "id,caption,media_type,timestamp,like_count,comments_count,permalink,thumbnail_url,media_url", limit: 50 },
      });
      posts = m.data.map((x) => ({
        id: x.id,
        text: x.caption ?? "",
        url: x.permalink ?? null,
        thumb: x.thumbnail_url ?? x.media_url ?? null,
        time: x.timestamp,
        likes: x.like_count ?? 0,
        comments: x.comments_count ?? 0,
        shares: 0,
        kind: x.media_type ?? "",
      }));
    } else {
      const info = await graph<{ followers_count?: number; fan_count?: number }>(acc.external_id, {
        token,
        params: { fields: "followers_count,fan_count" },
      });
      followers = info.followers_count ?? info.fan_count ?? null;
      const m = await graph<{ data: any[] }>(`${acc.external_id}/posts`, {
        token,
        params: {
          fields: "id,message,created_time,permalink_url,full_picture,shares,reactions.summary(true).limit(0),comments.summary(true).limit(0)",
          limit: 50,
        },
      });
      posts = m.data.map((x) => ({
        id: x.id,
        text: x.message ?? "",
        url: x.permalink_url ?? null,
        thumb: x.full_picture ?? null,
        time: x.created_time,
        likes: x.reactions?.summary?.total_count ?? 0,
        comments: x.comments?.summary?.total_count ?? 0,
        shares: x.shares?.count ?? 0,
        kind: "POST",
      }));
    }

    const { data: history } = await db
      .from("account_stats")
      .select("day, followers")
      .eq("account_id", acc.id)
      .order("day", { ascending: true })
      .limit(120);

    return NextResponse.json({ handle: acc.handle, platform: acc.platform, followers, mediaCount, posts, history: history ?? [] });
  } catch (e) {
    return fail(e);
  }
}
