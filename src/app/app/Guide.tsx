"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { Ctx } from "./ctx";

type Go = (tab: "settings" | "autopilot" | "team" | "calendar" | "plans") => void;

/** "Start here" checklist for owners/admins. Steps tick themselves off from real data. */
export default function Guide({ ctx, onGo }: { ctx: Ctx; onGo: Go }) {
  const key = `mp_guide_${ctx.org.id}`;
  const [hidden, setHidden] = useState(true);
  const [n, setN] = useState<{ media: number; rules: number; clients: number; posts: number } | null>(null);

  useEffect(() => {
    try { setHidden(localStorage.getItem(key) === "1"); } catch { setHidden(false); }
    (async () => {
      const [m, r, mem, p] = await Promise.all([
        supabase.from("media_library").select("id", { count: "exact", head: true }).eq("org_id", ctx.org.id),
        supabase.from("autopilot_rules").select("id", { count: "exact", head: true }).eq("org_id", ctx.org.id).eq("enabled", true),
        supabase.rpc("org_members", { o: ctx.org.id }),
        supabase.from("posts").select("id", { count: "exact", head: true }).eq("org_id", ctx.org.id).in("status", ["scheduled", "published", "pending"]),
      ]);
      setN({
        media: m.count ?? 0,
        rules: r.count ?? 0,
        clients: ((mem.data as { role: string }[] | null) ?? []).filter((x) => x.role === "client").length,
        posts: p.count ?? 0,
      });
    })();
  }, [ctx.org.id, key]);

  if (hidden || !n) return null;
  const connected = ctx.allAccounts.filter((a) => a.status === "connected").length;
  const steps: { done: boolean; title: string; why: string; btn: string; go: Parameters<Go>[0] }[] = [
    { done: connected > 0, title: "اربط حسابات إنستغرام وفيسبوك", why: "بدون الربط الموقع ما بيقدر ينشر. اضغط «ربط حسابات Meta» واختر الصفحات.", btn: "افتح الإعدادات", go: "settings" },
    { done: ctx.allAccounts.some((a) => a.brand_id), title: "حدّد لكل حساب اسم العميل (البراند)", why: "بالإعدادات، بجانب كل حساب اختر العميل صاحبه، عشان كل عميل يشوف حساباته فقط.", btn: "افتح الإعدادات", go: "settings" },
    { done: n.media > 0 || n.posts > 0, title: "ارفع التصاميم والكابشنات", why: "من تبويب الأوتوبايلوت ارفع عدة تصاميم مع الكابشن تحت كل واحد.", btn: "افتح الأوتوبايلوت", go: "autopilot" },
    { done: n.rules > 0, title: "حدّد أيام وأوقات النشر وفعّل الأوتوبايلوت", why: "لكل حساب: أي أيام وأي ساعات. بعدها الموقع ينزّل لوحده.", btn: "افتح الأوتوبايلوت", go: "autopilot" },
    { done: n.clients > 0, title: "ادعُ العميل لبوابته", why: "من «الفريق والعملاء» أنشئ دعوة بدور «عميل» وأرسل له الرابط ليوافق على المنشورات.", btn: "افتح الفريق", go: "team" },
  ];
  const doneCount = steps.filter((s) => s.done).length;
  if (doneCount === steps.length) return null;
  const next = steps.findIndex((s) => !s.done);

  return (
    <div className="panel" style={{ borderColor: "var(--brand)" }}>
      <div className="row between">
        <div>
          <h3>ابدأ من هنا ({doneCount}/{steps.length})</h3>
          <p className="hint">خمس خطوات وينشر موعد بوست لعملائك لوحده.</p>
        </div>
        <button className="btn sm" onClick={() => { try { localStorage.setItem(key, "1"); } catch {} setHidden(true); }}>إخفاء</button>
      </div>
      <div className="bar" style={{ marginBottom: 10 }}><i style={{ width: `${(doneCount / steps.length) * 100}%` }} /></div>
      <div className="list">
        {steps.map((s, i) => (
          <div key={i} style={{ opacity: s.done ? 0.55 : 1 }}>
            <span>
              <b>{s.done ? "✓ " : `${i + 1}. `}{s.title}</b>
              {!s.done && <><br /><span style={{ color: "var(--muted)", fontSize: 13 }}>{s.why}</span></>}
            </span>
            {!s.done && <button className={`btn sm${i === next ? " primary" : ""}`} onClick={() => onGo(s.go)}>{s.btn}</button>}
          </div>
        ))}
      </div>
    </div>
  );
}
