"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { api } from "@/lib/api";
import { PLATFORMS, friendly } from "@/lib/shared";
import type { Ctx } from "./ctx";

export default function Settings({ ctx }: { ctx: Ctx }) {
  const [msg, setMsg] = useState<{ t: "ok" | "err"; s: string } | null>(null);
  const [brandName, setBrandName] = useState("");
  const isOwner = ctx.org.role === "owner";

  async function connect() {
    try {
      const r = await api<{ url: string }>("/api/meta/connect", { body: { orgId: ctx.org.id } });
      location.href = r.url;
    } catch (e) {
      setMsg({ t: "err", s: friendly((e as Error).message) });
    }
  }

  return (
    <>
      {msg && <div className={`msg ${msg.t}`}>{msg.s}</div>}

      <div className="panel">
        <div className="row between">
          <div>
            <h3>الحسابات المربوطة ({ctx.allAccounts.length}/{ctx.plan?.max_accounts ?? "—"})</h3>
            <p className="hint">اربط صفحات فيسبوك وحسابات إنستغرام المرتبطة بها عبر Meta. اختر البراند (العميل) لكل حساب.</p>
          </div>
          {ctx.isAdmin && <button className="btn primary" onClick={connect}>ربط حسابات Meta</button>}
        </div>
        <div className="list">
          {ctx.allAccounts.map((a) => (
            <div key={a.id}>
              <span>{PLATFORMS[a.platform].label} · <span className="num">@{a.handle}</span> <span className={`badge ${a.status === "connected" ? "published" : "failed"}`}>{a.status === "connected" ? "مربوط" : "غير مربوط"}</span></span>
              <span className="row">
                {ctx.isAdmin && (
                  <select className="inline" value={a.brand_id ?? ""} onChange={async (e) => { await supabase.from("social_accounts").update({ brand_id: e.target.value || null }).eq("id", a.id); ctx.reload(); }}>
                    <option value="">بدون براند</option>
                    {ctx.brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                )}
                {ctx.isAdmin && a.status === "connected" && (
                  <button className="btn sm danger" onClick={async () => { await api("/api/meta/disconnect", { body: { accountId: a.id } }); ctx.reload(); }}>فصل</button>
                )}
                {ctx.isAdmin && a.status !== "connected" && (
                  <button className="btn sm danger" onClick={async () => { await supabase.from("social_accounts").delete().eq("id", a.id); ctx.reload(); }}>حذف</button>
                )}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="panel">
        <h3>البراندات / العملاء ({ctx.brands.length}/{ctx.plan?.max_brands ?? "—"})</h3>
        <div className="list">
          {ctx.brands.map((b) => (
            <div key={b.id}>
              <span>{b.name}</span>
              {ctx.isAdmin && (
                <label className={`check${b.client_approval ? " on" : ""}`} title="بعد موافقة المدير، يرسل المنشور للعميل ليوافق قبل الجدولة">
                  <input type="checkbox" checked={b.client_approval ?? false} onChange={async (e) => { await supabase.from("brands").update({ client_approval: e.target.checked }).eq("id", b.id); ctx.reload(); }} />
                  موافقة العميل بعد المدير
                </label>
              )}
              {ctx.isAdmin && ctx.brands.length > 1 && (
                <button className="btn sm danger" onClick={async () => { if (confirm(`حذف «${b.name}» وتصاميمه وقواعده؟`)) { await supabase.from("brands").delete().eq("id", b.id); ctx.reload(); } }}>حذف</button>
              )}
            </div>
          ))}
        </div>
        {ctx.isAdmin && (
          <div className="row" style={{ marginTop: 10 }}>
            <input className="inline" placeholder="اسم العميل الجديد" value={brandName} onChange={(e) => setBrandName(e.target.value)} />
            <button className="btn primary" disabled={!brandName.trim()} onClick={async () => {
              const { error } = await supabase.from("brands").insert({ org_id: ctx.org.id, name: brandName.trim() });
              setMsg(error ? { t: "err", s: friendly(error.message.includes("plan_limit_brands") ? "وصلت لحد البراندات في خطتك." : error.message) } : null);
              setBrandName("");
              ctx.reload();
            }}>إضافة</button>
          </div>
        )}
      </div>

      <div className="panel">
        <h3>الخطة</h3>
        <p className="hint">خطتك الحالية: <b>{ctx.plan?.name}</b>. الدفع الإلكتروني قيد التجهيز. للترقية تواصل معنا وسنفعّل الباقة لك.</p>
        <div className="grid2">
          {ctx.plans.map((p) => (
            <div key={p.id} className="panel" style={{ background: p.id === ctx.org.plan ? "var(--soft)" : undefined }}>
              <b>{p.name}</b>
              <ul style={{ paddingInlineStart: 18, margin: "6px 0" }}>
                <li>{p.max_accounts} حساب · {p.max_brands} براند · {p.max_members} أعضاء</li>
                <li>{p.max_posts_per_account ?? "بلا حد"} منشور شهرياً لكل حساب</li>
                <li>أوتوبايلوت: {p.autopilot_posts} منشور شهرياً · {p.ai_credits} رصيد ذكاء اصطناعي</li>
                <li>{p.approvals ? "سير موافقات" : "بدون سير موافقات"}</li>
              </ul>
              {isOwner && p.id !== ctx.org.plan && <a className="btn sm" href="/contact">تواصل للترقية</a>}
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
