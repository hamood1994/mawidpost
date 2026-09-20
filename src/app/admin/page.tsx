"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { api } from "@/lib/api";
import { friendly } from "@/lib/shared";

interface OrgRow {
  id: string; name: string; plan: string; suspended: boolean; trial_ends_at: string | null; created_at: string; owner_email: string;
  staff: number; clients: number; accounts: number; posts_month: number; published_month: number; failed_month: number;
}
interface Overview {
  totals: { orgs: number; users: number; accounts: number; connected: number; published_month: number; failed_month: number };
  orgs: OrgRow[];
  plans: { id: string; name: string }[];
  failures: { id: string; org: string; error: string | null; scheduled_at: string }[];
}

export default function AdminPage() {
  const router = useRouter();
  const [data, setData] = useState<Overview | null>(null);
  const [err, setErr] = useState("");
  const [q, setQ] = useState("");

  const load = () => api<Overview>("/api/admin/overview").then(setData).catch((e) => setErr(friendly((e as Error).message)));
  useEffect(() => {
    supabase.auth.getSession().then(({ data: s }) => {
      if (!s.session) return router.replace("/auth?next=/admin");
      load();
    });
  }, [router]); // eslint-disable-line react-hooks/exhaustive-deps

  async function patch(orgId: string, body: { plan?: string; suspended?: boolean; trialDays?: number }) {
    try { await api("/api/admin/org", { body: { orgId, ...body } }); load(); } catch (e) { setErr(friendly((e as Error).message)); }
  }

  if (err && !data) return <main className="center"><div className="card"><div className="msg err">{err}</div><Link className="btn" href="/app">العودة للتطبيق</Link></div></main>;
  if (!data) return <main className="center">لحظة...</main>;
  const t = data.totals;
  const rows = data.orgs.filter((o) => !q.trim() || `${o.name} ${o.owner_email}`.toLowerCase().includes(q.trim().toLowerCase()));

  return (
    <>
      <header className="topbar">
        <div className="brand"><span className="logo">م</span><div>لوحة مشغّل المنصة<small>MawidPost Admin</small></div></div>
        <Link className="btn" href="/app">العودة للتطبيق</Link>
      </header>
      <div className="page">
        {err && <div className="msg err">{err}</div>}
        <div className="tiles">
          <div className="tile"><b className="num">{t.orgs}</b><span>الشركات</span></div>
          <div className="tile"><b className="num">{t.users}</b><span>المستخدمون</span></div>
          <div className="tile"><b className="num">{t.connected}/{t.accounts}</b><span>حسابات مربوطة</span></div>
          <div className="tile"><b className="num">{t.published_month}</b><span>منشورات هذا الشهر</span></div>
          <div className="tile"><b className="num" style={{ color: t.failed_month ? "var(--bad)" : undefined }}>{t.failed_month}</b><span>فشل هذا الشهر</span></div>
        </div>

        <div className="panel">
          <div className="row between">
            <h3>الشركات</h3>
            <input className="inline" placeholder="بحث بالاسم أو البريد" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <div style={{ overflowX: "auto" }}>
            <table className="tbl">
              <thead><tr><th>الشركة</th><th>المالك</th><th>الخطة</th><th>فريق</th><th>عملاء</th><th>حسابات</th><th>منشورات</th><th>فشل</th><th>الحالة</th></tr></thead>
              <tbody>
                {rows.map((o) => (
                  <tr key={o.id} style={o.suspended ? { opacity: 0.6 } : undefined}>
                    <td><b>{o.name}</b><br /><span className="num" style={{ color: "var(--muted)", fontSize: 12 }}>{new Date(o.created_at).toLocaleDateString("en-GB")}</span></td>
                    <td className="num">{o.owner_email}</td>
                    <td>
                      <select className="inline" value={o.plan} onChange={(e) => patch(o.id, { plan: e.target.value })}>
                        {data.plans.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                      </select>
                      {o.plan === "starter" && o.trial_ends_at && (
                        <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 4 }}>
                          {new Date(o.trial_ends_at).getTime() < Date.now() ? "انتهت التجربة" : `تنتهي ${new Date(o.trial_ends_at).toLocaleDateString("en-GB")}`}
                          {" "}<button className="btn sm" onClick={() => patch(o.id, { trialDays: 14 })}>+14 يوم</button>
                        </div>
                      )}
                    </td>
                    <td className="num">{o.staff}</td>
                    <td className="num">{o.clients}</td>
                    <td className="num">{o.accounts}</td>
                    <td className="num">{o.published_month}/{o.posts_month}</td>
                    <td className="num">{o.failed_month}</td>
                    <td>
                      <button className={`btn sm${o.suspended ? " primary" : " danger"}`} onClick={() => { if (o.suspended || confirm(`إيقاف «${o.name}»؟ لن تُنشر منشوراتها.`)) patch(o.id, { suspended: !o.suspended }); }}>
                        {o.suspended ? "تفعيل" : "إيقاف"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="panel">
          <h3>آخر حالات فشل النشر</h3>
          {data.failures.length === 0 && <p className="hint">لا يوجد.</p>}
          <div className="list">
            {data.failures.map((f) => (
              <div key={f.id}><span><b>{f.org}</b> · <span style={{ color: "var(--muted)" }}>{f.error ?? "—"}</span></span><span className="num">{new Date(f.scheduled_at).toLocaleString("en-GB")}</span></div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
