import { NextResponse } from "next/server";
import { admin, fail, HttpError, requireRole, requireUser } from "@/lib/server/admin";

export const dynamic = "force-dynamic";

const SYSTEM =
  "You are a senior social media copywriter working for a marketing agency in the Gulf region. " +
  "Write natural, engaging copy for the platform requested. Match the requested language and tone. " +
  "Never invent facts, prices, discounts or claims that were not provided. Do not add explanations, just the copy.";

export async function POST(req: Request) {
  try {
    const user = await requireUser(req);
    const b = (await req.json()) as { orgId?: string; kind?: "caption" | "ideas"; prompt?: string; platform?: string; tone?: string; lang?: string };
    if (!b.orgId || !b.prompt?.trim()) throw new HttpError(400, "اكتب موضوع المنشور");
    if (b.prompt.length > 1500) throw new HttpError(400, "الوصف طويل جداً");
    await requireRole(user.id, b.orgId, ["owner", "admin", "editor"]);

    const key = process.env.ANTHROPIC_API_KEY;
    if (!key) throw new HttpError(503, "ميزة الذكاء الاصطناعي غير مفعّلة على الخادم بعد");

    const db = admin();
    const { data: org } = await db.from("organizations").select("plan").eq("id", b.orgId).single();
    const { data: plan } = await db.from("plans").select("ai_credits").eq("id", org?.plan ?? "starter").single();
    const credits = plan?.ai_credits ?? 0;
    const monthStart = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1)).toISOString();
    const { count } = await db.from("ai_usage").select("id", { count: "exact", head: true }).eq("org_id", b.orgId).neq("kind", "autopilot").gte("created_at", monthStart);
    const used = count ?? 0;
    if (used >= credits) throw new HttpError(402, `استهلكت رصيد الذكاء الاصطناعي لهذا الشهر (${credits}). رقّ الخطة لرصيد أكبر.`);

    const lang = b.lang === "en" ? "English" : "Arabic (clear, friendly Gulf-friendly tone, not overly formal)";
    const task =
      b.kind === "ideas"
        ? `Give 6 distinct content ideas (one short line each, numbered) for ${b.platform || "Instagram"}. Language: ${lang}.\nBrand/topic: ${b.prompt}`
        : `Write 3 different caption options for a ${b.platform || "Instagram"} post. Language: ${lang}. Tone: ${b.tone || "friendly"}.\n` +
          `Each option: a hook, short body, a call to action, and 3-6 relevant hashtags at the end. Separate options with a line containing only ---.\nTopic: ${b.prompt}`;

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: process.env.AI_MODEL || "claude-sonnet-4-5", max_tokens: 1000, system: SYSTEM, messages: [{ role: "user", content: task }] }),
    });
    const json: any = await res.json().catch(() => ({}));
    if (!res.ok) throw new HttpError(502, json?.error?.message ?? "تعذّر الاتصال بخدمة الذكاء الاصطناعي");
    const text = ((json.content ?? []) as { type: string; text?: string }[]).filter((c) => c.type === "text").map((c) => c.text ?? "").join("\n").trim();

    await db.from("ai_usage").insert({ org_id: b.orgId, user_id: user.id, kind: b.kind ?? "caption" });
    return NextResponse.json({ text, used: used + 1, credits });
  } catch (e) {
    return fail(e);
  }
}
