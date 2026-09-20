import type { SupabaseClient } from "@supabase/supabase-js";

interface Rule {
  id: string;
  org_id: string;
  brand_id: string;
  account_id: string;
  days: number[];
  times: string[];
  tz: string;
  post_type: "post" | "story" | "reel";
  approval: boolean;
  text_only_ok: boolean;
  recycle: boolean;
}

// ───────────── time zones (no external library) ─────────────
function tzOffsetMs(ts: number, tz: string): number {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: tz, hour12: false, year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit",
    }).formatToParts(new Date(ts)).map((p) => [p.type, p.value]),
  );
  const asUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour % 24, +parts.minute, +parts.second);
  return asUtc - ts;
}

function zonedToUtc(y: number, m: number, d: number, hh: number, mm: number, tz: string): Date {
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  return new Date(guess - tzOffsetMs(guess, tz));
}

/** Upcoming slots (UTC instants) for a rule inside the next `horizonDays` days. */
export function slotsFor(rule: Pick<Rule, "days" | "times" | "tz">, now = new Date(), horizonDays = 7): Date[] {
  const today = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone: rule.tz, year: "numeric", month: "2-digit", day: "2-digit" })
      .formatToParts(now).map((p) => [p.type, p.value]),
  );
  const out: Date[] = [];
  for (let i = 0; i <= horizonDays; i++) {
    const base = new Date(Date.UTC(+today.year, +today.month - 1, +today.day + i));
    const y = base.getUTCFullYear(), m = base.getUTCMonth() + 1, d = base.getUTCDate();
    if (!rule.days.includes(base.getUTCDay())) continue;
    for (const t of rule.times) {
      const [hh, mm] = t.split(":").map(Number);
      if (Number.isNaN(hh) || Number.isNaN(mm)) continue;
      const at = zonedToUtc(y, m, d, hh, mm, rule.tz);
      if (at.getTime() > now.getTime() + 5 * 60_000) out.push(at);
    }
  }
  return out.sort((a, b) => a.getTime() - b.getTime());
}

// ───────────── caption generation ─────────────
interface Brand {
  name: string; industry: string; description: string; audience: string;
  tone: string; language: string; avoid: string; default_hashtags: string;
}

async function writeCaption(opts: {
  brand: Brand; platform: string; postType: string; note: string; imageUrl: string | null; recent: string[];
}): Promise<string> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("ANTHROPIC_API_KEY غير مضبوط");
  const { brand } = opts;
  const lang = brand.language === "en" ? "English" : "Arabic (clear, natural, Gulf-friendly; not stiff or overly formal)";
  const text =
    `Write ONE ${opts.platform} ${opts.postType} caption for this brand.\n\n` +
    `Brand: ${brand.name}\nIndustry: ${brand.industry}\nAbout: ${brand.description}\nAudience: ${brand.audience}\n` +
    `Tone: ${brand.tone}\nLanguage: ${lang}\n` +
    (brand.avoid ? `Never mention or do: ${brand.avoid}\n` : "") +
    (opts.note ? `Details supplied by the account manager for this design (treat as the only source of facts):\n${opts.note}\n` : "") +
    (opts.recent.length ? `\nRecent captions (do NOT repeat their wording or structure):\n${opts.recent.map((c) => `- ${c.slice(0, 160)}`).join("\n")}\n` : "") +
    `\nRules: use ONLY facts from the details above or clearly visible in the attached design. Do not invent prices, discounts, dates, phone numbers, or claims. ` +
    `Structure: a short hook, one or two short lines of body, a call to action, then 3-6 relevant hashtags` +
    (brand.default_hashtags ? ` (always include: ${brand.default_hashtags})` : "") +
    `. Output only the caption text, nothing else.`;

  const call = async (withImage: boolean) => {
    const content: unknown[] = [];
    if (withImage && opts.imageUrl) content.push({ type: "image", source: { type: "url", url: opts.imageUrl } });
    content.push({ type: "text", text });
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: process.env.AI_MODEL || "claude-sonnet-4-5",
        max_tokens: 700,
        system: "You are a senior social media copywriter at a marketing agency. You write accurate, engaging copy and never invent facts.",
        messages: [{ role: "user", content }],
      }),
    });
    const json: any = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json?.error?.message ?? `AI HTTP ${res.status}`);
    return ((json.content ?? []) as { type: string; text?: string }[]).filter((c) => c.type === "text").map((c) => c.text ?? "").join("\n").trim();
  };

  try {
    return await call(true);
  } catch (e) {
    if (opts.imageUrl) return call(false); // e.g. unsupported image format: fall back to text-only
    throw e;
  }
}

// ───────────── the runner ─────────────
export async function runAutopilot(
  db: SupabaseClient,
  opts: { orgId?: string; brandId?: string; maxPerRule?: number } = {},
): Promise<{ created: number; notes: string[] }> {
  const maxPerRule = opts.maxPerRule ?? 3;
  let q = db.from("autopilot_rules").select("*").eq("enabled", true);
  if (opts.orgId) q = q.eq("org_id", opts.orgId);
  if (opts.brandId) q = q.eq("brand_id", opts.brandId);
  const { data: rules } = await q;

  const notes: string[] = [];
  let created = 0;
  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
  const usedByOrg = new Map<string, number>();

  for (const rule of (rules ?? []) as Rule[]) {
    const note = (m: string) => {
      notes.push(m);
      return db.from("autopilot_rules").update({ last_run_at: new Date().toISOString(), last_note: m }).eq("id", rule.id);
    };
    try {
      const { data: acc } = await db.from("social_accounts").select("id, platform, handle, status, external_id").eq("id", rule.account_id).maybeSingle();
      if (!acc) continue;
      if (acc.platform !== "instagram" && acc.platform !== "facebook") {
        await note(`${acc.handle}: النشر التلقائي متاح لإنستغرام وفيسبوك فقط`);
        continue;
      }
      if (!acc.external_id || acc.status !== "connected") {
        await note(`${acc.handle}: الحساب غير مربوط مع Meta`);
        continue;
      }
      const { data: brand } = await db.from("brands").select("*").eq("id", rule.brand_id).maybeSingle();
      if (!brand) continue;

      const { data: org } = await db.from("organizations").select("plan").eq("id", rule.org_id).single();
      const { data: plan } = await db.from("plans").select("autopilot_posts, max_posts_per_account").eq("id", org?.plan ?? "starter").single();
      if (!usedByOrg.has(rule.org_id)) {
        const { count } = await db.from("ai_usage").select("id", { count: "exact", head: true })
          .eq("org_id", rule.org_id).eq("kind", "autopilot").gte("created_at", monthStart);
        usedByOrg.set(rule.org_id, count ?? 0);
      }

      const slots = slotsFor(rule, now);
      if (slots.length === 0) {
        await note(`${acc.handle}: لا توجد مواعيد قادمة ضمن القواعد`);
        continue;
      }
      const { data: existing } = await db.from("posts").select("scheduled_at")
        .eq("account_id", acc.id).eq("autopilot", true)
        .gte("scheduled_at", slots[0].toISOString()).lte("scheduled_at", slots[slots.length - 1].toISOString());
      const taken = new Set((existing ?? []).map((p: { scheduled_at: string }) => new Date(p.scheduled_at).getTime()));
      const free = slots.filter((s) => !taken.has(s.getTime())).slice(0, maxPerRule);
      if (free.length === 0) {
        await note(`${acc.handle}: الأسبوع القادم ممتلئ`);
        continue;
      }

      let madeHere = 0;
      let lastNote = "";
      for (const slot of free) {
        if (plan?.max_posts_per_account != null) {
          const ms = new Date(Date.UTC(slot.getUTCFullYear(), slot.getUTCMonth(), 1)).toISOString();
          const me = new Date(Date.UTC(slot.getUTCFullYear(), slot.getUTCMonth() + 1, 1)).toISOString();
          const { count } = await db.from("posts").select("id", { count: "exact", head: true })
            .eq("account_id", acc.id).in("status", ["pending", "scheduled", "publishing", "published"]).gte("scheduled_at", ms).lt("scheduled_at", me);
          if ((count ?? 0) >= plan.max_posts_per_account) {
            lastNote = "وصل الحساب لحد المنشورات الشهري حسب الخطة";
            break;
          }
        }

        // 1) designs never used, oldest first (the manager's queue). 2) optionally recycle the least used.
        const cols = "id, url, kind, caption, note, used_count";
        const base = () => {
          let mq = db.from("media_library").select(cols).eq("brand_id", rule.brand_id);
          if (rule.post_type === "reel") mq = mq.eq("kind", "video");
          return mq;
        };
        let { data: media } = await base().eq("used_count", 0).order("created_at", { ascending: true }).limit(1);
        if (!media?.length && rule.recycle) {
          ({ data: media } = await base().order("used_count", { ascending: true }).order("last_used_at", { ascending: true, nullsFirst: true }).limit(1));
        }
        const pick = media?.[0] as { id: string; url: string; kind: string; caption: string; note: string; used_count: number } | undefined;
        if (!pick && !(acc.platform === "facebook" && rule.text_only_ok && rule.post_type === "post")) {
          lastNote = rule.post_type === "reel" ? "لا توجد فيديوهات جاهزة في المكتبة" : "لا توجد تصاميم جاهزة في المكتبة، ارفع تصاميم جديدة";
          break;
        }

        // The manager's own caption is used exactly as written. AI (and its monthly allowance) is only for designs without one.
        let caption = pick?.caption?.trim() ?? "";
        let usedAi = false;
        if (!caption) {
          if ((usedByOrg.get(rule.org_id) ?? 0) >= (plan?.autopilot_posts ?? 0)) {
            lastNote = "انتهى رصيد كتابة الكابشنات بالذكاء الاصطناعي لهذا الشهر. أضف كابشن للتصميم أو رقّ الخطة";
            break;
          }
          const { data: recent } = await db.from("posts").select("caption").eq("account_id", acc.id)
            .order("scheduled_at", { ascending: false }).limit(8);
          caption = await writeCaption({
            brand: brand as Brand,
            platform: acc.platform,
            postType: rule.post_type,
            note: pick?.note ?? "",
            imageUrl: pick && pick.kind === "image" ? pick.url : null,
            recent: (recent ?? []).map((r: { caption: string }) => r.caption).filter(Boolean),
          });
          usedAi = true;
          if (!caption) {
            lastNote = "لم يُنتج الذكاء الاصطناعي نصاً";
            break;
          }
        }

        const { error } = await db.from("posts").insert({
          org_id: rule.org_id,
          account_id: acc.id,
          caption,
          media_urls: pick ? [pick.url] : [],
          media_url: pick?.url ?? null,
          post_type: rule.post_type,
          scheduled_at: slot.toISOString(),
          status: rule.approval ? "pending" : "scheduled",
          autopilot: true,
        });
        if (error) {
          if (error.code === "23505") continue; // slot already filled by a parallel run
          lastNote = error.message;
          break;
        }
        if (pick) {
          await db.from("media_library").update({ used_count: pick.used_count + 1, last_used_at: new Date().toISOString() }).eq("id", pick.id);
        }
        if (usedAi) {
          await db.from("ai_usage").insert({ org_id: rule.org_id, kind: "autopilot" });
          usedByOrg.set(rule.org_id, (usedByOrg.get(rule.org_id) ?? 0) + 1);
        }
        madeHere++;
        created++;
      }
      await note(madeHere > 0 ? `${acc.handle}: أُنشئ ${madeHere} منشور${lastNote ? ` (ثم توقف: ${lastNote})` : ""}` : `${acc.handle}: ${lastNote || "لا جديد"}`);
    } catch (e) {
      await note(`خطأ: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return { created, notes };
}
