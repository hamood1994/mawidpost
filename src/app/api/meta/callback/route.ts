import { NextResponse } from "next/server";
import { admin, requireRole, siteUrl } from "@/lib/server/admin";
import { encrypt, verifyState } from "@/lib/server/crypto";
import { exchangeCode, graph, listPages, longLivedToken } from "@/lib/server/meta";

export const dynamic = "force-dynamic";

interface State {
  o: string;
  u: string;
  exp: number;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const back = (q: string) => NextResponse.redirect(`${siteUrl()}/app?${q}`);
  const err = url.searchParams.get("error_description") || url.searchParams.get("error");
  if (err) return back(`meta_error=${encodeURIComponent(err)}`);

  const code = url.searchParams.get("code");
  const state = verifyState<State>(url.searchParams.get("state") ?? "");
  if (!code || !state || state.exp < Date.now()) {
    return back(`meta_error=${encodeURIComponent("انتهت صلاحية الطلب، حاول الربط مرة أخرى")}`);
  }

  try {
    await requireRole(state.u, state.o, ["owner", "admin"]);
    const db = admin();

    const userToken = await longLivedToken(await exchangeCode(code));
    const me = await graph<{ id: string }>("me", { token: userToken, params: { fields: "id" } });
    const pages = await listPages(userToken);
    if (pages.length === 0) {
      return back(`meta_error=${encodeURIComponent("لم نجد أي صفحة فيسبوك تديرها. تأكد أنك اخترت الصفحات في نافذة الموافقة.")}`);
    }

    const { data: org } = await db.from("organizations").select("plan").eq("id", state.o).single();
    const { data: plan } = await db.from("plans").select("max_accounts").eq("id", org?.plan ?? "starter").single();
    const { count: existing } = await db.from("social_accounts").select("id", { count: "exact", head: true }).eq("org_id", state.o);
    let total = existing ?? 0;
    const max = plan?.max_accounts ?? 3;
    let connected = 0;
    let skipped = 0;

    async function upsertAccount(platform: "facebook" | "instagram", externalId: string, handle: string, avatar: string | null, pageToken: string) {
      const { data: found } = await db
        .from("social_accounts")
        .select("id")
        .eq("org_id", state!.o)
        .eq("platform", platform)
        .eq("external_id", externalId)
        .maybeSingle();
      let id = found?.id as string | undefined;
      if (id) {
        await db.from("social_accounts").update({ handle, avatar_url: avatar, status: "connected" }).eq("id", id);
      } else {
        if (total >= max) {
          skipped++;
          return;
        }
        const { data: created, error } = await db
          .from("social_accounts")
          .insert({ org_id: state!.o, platform, handle, external_id: externalId, avatar_url: avatar, status: "connected" })
          .select("id")
          .single();
        if (error || !created) throw new Error(error?.message ?? "insert failed");
        id = created.id as string;
        total++;
      }
      await db
        .from("account_tokens")
        .upsert({ account_id: id, token_enc: encrypt(pageToken), fb_user_id: me.id, updated_at: new Date().toISOString() }, { onConflict: "account_id" });
      connected++;
    }

    for (const p of pages) {
      await upsertAccount("facebook", p.id, p.name, p.picture?.data?.url ?? null, p.access_token);
      const ig = p.instagram_business_account;
      if (ig) await upsertAccount("instagram", ig.id, ig.username ?? p.name, ig.profile_picture_url ?? null, p.access_token);
    }
    return back(`connected=${connected}&skipped=${skipped}`);
  } catch (e) {
    console.error("[meta/callback]", e instanceof Error ? e.message : e);
    return back(`meta_error=${encodeURIComponent(e instanceof Error ? e.message : "تعذّر الربط")}`);
  }
}
