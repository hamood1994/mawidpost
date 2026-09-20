import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { admin, siteUrl } from "@/lib/server/admin";

export const dynamic = "force-dynamic";

/** Meta "Data Deletion Request Callback": called when a user removes the app from their Facebook settings. */
export async function POST(req: Request) {
  const secret = process.env.META_APP_SECRET;
  const signed = String((await req.formData()).get("signed_request") ?? "");
  const [sig, payload] = signed.split(".");
  if (!secret || !sig || !payload) return NextResponse.json({ error: "bad request" }, { status: 400 });

  const expected = createHmac("sha256", secret).update(payload).digest();
  const given = Buffer.from(sig, "base64url");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
    return NextResponse.json({ error: "bad signature" }, { status: 403 });
  }
  const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { user_id?: string };
  if (data.user_id) {
    const db = admin();
    const { data: rows } = await db.from("account_tokens").select("account_id").eq("fb_user_id", data.user_id);
    const ids = (rows ?? []).map((r: { account_id: string }) => r.account_id);
    if (ids.length) {
      await db.from("account_tokens").delete().in("account_id", ids);
      await db.from("social_accounts").update({ status: "disconnected" }).in("id", ids);
    }
  }
  const code = randomUUID();
  return NextResponse.json({ url: `${siteUrl()}/data-deletion?code=${code}`, confirmation_code: code });
}
