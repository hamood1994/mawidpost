"use client";

import { Suspense, useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import {
  PLATFORMS, STATUS_LABEL, TYPE_LABEL, WEEKDAYS, hm, ymd,
  type Account, type Brand, type Org, type Plan, type Post, type Role,
} from "@/lib/shared";
import type { Ctx } from "./ctx";
import Composer from "./Composer";
import PostModal from "./PostModal";
import Autopilot from "./Autopilot";
import Analytics from "./Analytics";
import Library from "./Library";
import Team from "./Team";
import Bio from "./Bio";
import Settings from "./Settings";
import Plans from "./Plans";
import ClientPortal from "./ClientPortal";
import Guide from "./Guide";

type Tab = "calendar" | "autopilot" | "analytics" | "plans" | "library" | "team" | "bio" | "settings";
const TABS: [Tab, string][] = [
  ["calendar", "التقويم"], ["autopilot", "الأوتوبايلوت"], ["analytics", "التحليلات"], ["plans", "خطة العميل"], ["library", "المكتبة"],
  ["team", "الفريق والعملاء"], ["bio", "صفحة الروابط"], ["settings", "الإعدادات"],
];

function AppInner() {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [userId, setUserId] = useState("");
  const [checking, setChecking] = useState(true);
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [orgId, setOrgId] = useState("");
  const [brands, setBrands] = useState<Brand[]>([]);
  const [allAccounts, setAllAccounts] = useState<Account[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [brandId, setBrandId] = useState("");
  const [tab, setTab] = useState<Tab>("calendar");
  const [posts, setPosts] = useState<Post[]>([]);
  const [month, setMonth] = useState(() => { const n = new Date(); return new Date(n.getFullYear(), n.getMonth(), 1); });
  const [composeDay, setComposeDay] = useState<Date | null>(null);
  const [selected, setSelected] = useState<Post | null>(null);
  const [isPlatformAdmin, setIsPlatformAdmin] = useState(false);
  const [notice, setNotice] = useState<{ t: "ok" | "err"; s: string } | null>(null);

  const org = orgs.find((o) => o.id === orgId) ?? null;

  const loadOrgs = useCallback(async () => {
    const { data } = await supabase.from("members").select("role, organizations(id, name, plan, suspended, trial_ends_at)");
    const list: Org[] = ((data as any[]) ?? []).filter((r) => r.organizations).map((r) => ({ id: r.organizations.id, name: r.organizations.name, plan: r.organizations.plan, suspended: r.organizations.suspended, trial_ends_at: r.organizations.trial_ends_at, role: r.role as Role }));
    setOrgs(list);
    setOrgId((cur) => {
      if (cur && list.some((o) => o.id === cur)) return cur;
      try { const s = localStorage.getItem("mp_org"); if (s && list.some((o) => o.id === s)) return s; } catch {}
      return list[0]?.id ?? "";
    });
    setChecking(false);
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) return router.replace("/auth");
      setEmail(data.session.user.email ?? "");
      setUserId(data.session.user.id);
      loadOrgs();
    });
    supabase.rpc("is_platform_admin").then((r) => setIsPlatformAdmin(r.data === true));
    supabase.from("plans").select("*").order("sort").then((r) => setPlans((r.data as Plan[]) ?? []));
  }, [router, loadOrgs]);

  useEffect(() => {
    try { if (orgId) localStorage.setItem("mp_org", orgId); } catch {}
  }, [orgId]);

  useEffect(() => {
    const ok = params.get("connected");
    const err = params.get("meta_error");
    if (err) setNotice({ t: "err", s: err });
    else if (ok !== null) setNotice({ t: "ok", s: `تم ربط ${ok} حساب.${params.get("skipped") && params.get("skipped") !== "0" ? ` تخطّينا ${params.get("skipped")} بسبب حد الخطة.` : ""}` });
    if (ok !== null || err) { setTab("settings"); window.history.replaceState(null, "", "/app"); }
  }, [params]);

  const loadBase = useCallback(async () => {
    if (!orgId) return;
    const [b, a] = await Promise.all([
      supabase.from("brands").select("*").eq("org_id", orgId).order("created_at"),
      supabase.from("social_accounts").select("id, platform, handle, status, external_id, avatar_url, brand_id").eq("org_id", orgId).order("created_at"),
    ]);
    setBrands((b.data as Brand[]) ?? []);
    setAllAccounts((a.data as Account[]) ?? []);
  }, [orgId]);
  useEffect(() => { setBrandId(""); loadBase(); }, [loadBase]);

  const loadPosts = useCallback(async () => {
    if (!orgId) return;
    const from = new Date(month.getFullYear(), month.getMonth(), 1).toISOString();
    const to = new Date(month.getFullYear(), month.getMonth() + 1, 1).toISOString();
    const { data } = await supabase.from("posts")
      .select("id, org_id, account_id, caption, first_comment, scheduled_at, status, post_type, media_urls, error, published_at, external_id, autopilot, for_client")
      .eq("org_id", orgId).gte("scheduled_at", from).lt("scheduled_at", to).order("scheduled_at");
    setPosts((data as Post[]) ?? []);
  }, [orgId, month]);
  useEffect(() => { loadPosts(); }, [loadPosts]);
  useEffect(() => { const t = setInterval(loadPosts, 60000); return () => clearInterval(t); }, [loadPosts]);

  const accounts = useMemo(() => (brandId ? allAccounts.filter((a) => a.brand_id === brandId) : allAccounts), [allAccounts, brandId]);
  const visible = useMemo(() => (brandId ? posts.filter((p) => accounts.some((a) => a.id === p.account_id)) : posts), [posts, accounts, brandId]);
  const byDay = useMemo(() => {
    const m = new Map<string, Post[]>();
    for (const p of visible) { const k = ymd(new Date(p.scheduled_at)); m.set(k, [...(m.get(k) ?? []), p]); }
    return m;
  }, [visible]);

  if (checking) return <main className="center">لحظة...</main>;
  if (!org) return <Onboarding email={email} onDone={loadOrgs} />;

  const ctx: Ctx = {
    org, userId, email, brands, accounts, allAccounts, brandId, plans,
    plan: plans.find((p) => p.id === org.plan) ?? null,
    isAdmin: org.role === "owner" || org.role === "admin",
    reload: async () => { await Promise.all([loadOrgs(), loadBase(), loadPosts()]); },
  };

  const signOut = async () => { await supabase.auth.signOut(); router.replace("/auth"); };

  if (org.suspended && !isPlatformAdmin) {
    return (
      <main className="center"><div className="card"><h1>الحساب موقوف</h1><p className="sub">تم إيقاف هذا الحساب مؤقتاً. تواصل مع الدعم لإعادة تفعيله.</p><button className="btn" onClick={signOut}>خروج</button></div></main>
    );
  }
  const trialLeft = org.plan === "starter" && org.trial_ends_at ? Math.ceil((new Date(org.trial_ends_at).getTime() - Date.now()) / 86400000) : null;
  if (trialLeft !== null && trialLeft <= 0 && !isPlatformAdmin) {
    return (
      <main className="center"><div className="card"><h1>انتهت الفترة التجريبية</h1><p className="sub">انتهت تجربتك المجانية (14 يوماً). بياناتك محفوظة، وتواصل معنا لترقية باقتك ومتابعة النشر التلقائي.</p><div className="row"><a className="btn primary" href="/contact">تواصل معنا</a><button className="btn" onClick={signOut}>خروج</button></div></div></main>
    );
  }
  if (org.role === "client") return <ClientPortal ctx={ctx} onSignOut={signOut} />;

  const visibleTabs = TABS.filter(([k]) => ctx.isAdmin || k === "calendar" || k === "analytics" || k === "library" || k === "plans");

  const y = month.getFullYear();
  const mo = month.getMonth();
  const lead = new Date(y, mo, 1).getDay();
  const cells: (number | null)[] = [...Array(lead).fill(null), ...Array.from({ length: new Date(y, mo + 1, 0).getDate() }, (_, i) => i + 1)];
  while (cells.length % 7 !== 0) cells.push(null);
  const today = ymd(new Date());
  const monthLabel = new Intl.DateTimeFormat("ar-KW-u-nu-latn", { month: "long", year: "numeric" }).format(month);
  const pending = visible.filter((p) => p.status === "pending").length;

  return (
    <>
      <header className="topbar">
        <div className="brand">
          <span className="logo">م</span>
          <div>
            موعد بوست
            {orgs.length > 1 ? (
              <select className="inline" value={orgId} onChange={(e) => setOrgId(e.target.value)}>
                {orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
              </select>
            ) : <small>{org.name}</small>}
          </div>
        </div>
        <div className="row">
          {brands.length > 0 && (
            <select className="inline" aria-label="البراند" value={brandId} onChange={(e) => setBrandId(e.target.value)}>
              <option value="">كل العملاء</option>
              {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          )}
          {isPlatformAdmin && <a className="btn" href="/admin">لوحة الأدمن</a>}
          <span className="num" style={{ color: "var(--muted)", fontSize: 12 }}>{email}</span>
          <button className="btn" onClick={async () => { await supabase.auth.signOut(); router.replace("/auth"); }}>خروج</button>
        </div>
      </header>

      <nav className="tabs" aria-label="الأقسام">
        {visibleTabs.map(([k, l]) => (
          <button key={k} className={tab === k ? "on" : ""} onClick={() => setTab(k)}>
            {l}{k === "calendar" && pending > 0 ? ` (${pending} بانتظار الموافقة)` : ""}
          </button>
        ))}
      </nav>

      <div className="page">
        {trialLeft !== null && trialLeft > 0 && ctx.isAdmin && <div className="msg warn">تجربتك المجانية تنتهي بعد {trialLeft} {trialLeft === 1 ? "يوم" : "أيام"}. <a href="/contact" style={{ textDecoration: "underline" }}>تواصل معنا للترقية</a>.</div>}
        {notice && <div className={`msg ${notice.t}`}>{notice.s}</div>}

        {tab === "calendar" && (
          <>
            {ctx.isAdmin && <Guide ctx={ctx} onGo={setTab} />}
            <div className="toolbar">
              <div className="accounts">
                {accounts.map((a) => (
                  <span key={a.id} className="acct" style={{ "--c": PLATFORMS[a.platform].color } as CSSProperties}>
                    <i className="dot" />{PLATFORMS[a.platform].label} · <span className="num">@{a.handle}</span>
                  </span>
                ))}
                <button className="btn primary" disabled={accounts.length === 0} onClick={() => setComposeDay(new Date())}>+ منشور جديد</button>
              </div>
              <div className="row">
                <button className="btn" aria-label="الشهر السابق" onClick={() => setMonth(new Date(y, mo - 1, 1))}>›</button>
                <h2 style={{ minWidth: 130, textAlign: "center" }}>{monthLabel}</h2>
                <button className="btn" aria-label="الشهر التالي" onClick={() => setMonth(new Date(y, mo + 1, 1))}>‹</button>
              </div>
            </div>
            {allAccounts.length === 0 && (
              <div className="msg warn">لا توجد حسابات بعد. اذهب إلى «الإعدادات» واضغط «ربط حسابات Meta».</div>
            )}
            <div className="cal">
              <div className="cal-head">{WEEKDAYS.map((w) => <div key={w}>{w}</div>)}</div>
              <div className="cal-grid">
                {cells.map((d, i) => {
                  if (d === null) return <div key={i} className="cell empty" />;
                  const date = new Date(y, mo, d);
                  const key = ymd(date);
                  return (
                    <div key={i} className={`cell${key === today ? " today" : ""}`}>
                      <div className="d">
                        <span className="num">{d}</span>
                        <button className="add" aria-label={`منشور جديد يوم ${d}`} disabled={accounts.length === 0} onClick={() => setComposeDay(date)}>+</button>
                      </div>
                      {(byDay.get(key) ?? []).map((p) => {
                        const acc = allAccounts.find((a) => a.id === p.account_id);
                        return (
                          <button key={p.id} className={`chip ${p.status}${p.autopilot ? " auto" : ""}`} title={STATUS_LABEL[p.status]}
                            style={{ "--c": acc ? PLATFORMS[acc.platform].color : "var(--muted)" } as CSSProperties} onClick={() => setSelected(p)}>
                            <span className="num">{hm(p.scheduled_at)}</span> {TYPE_LABEL[p.post_type]} · {p.caption || "بدون نص"}
                          </button>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        )}
        {tab === "autopilot" && <Autopilot ctx={ctx} />}
        {tab === "analytics" && <Analytics ctx={ctx} />}
        {tab === "plans" && <Plans ctx={ctx} />}
        {tab === "library" && <Library ctx={ctx} />}
        {tab === "team" && <Team ctx={ctx} />}
        {tab === "bio" && <Bio ctx={ctx} />}
        {tab === "settings" && <Settings ctx={ctx} />}
      </div>

      {composeDay && <Composer ctx={ctx} day={composeDay} onClose={() => setComposeDay(null)} onSaved={() => { setComposeDay(null); loadPosts(); }} />}
      {selected && <PostModal ctx={ctx} post={selected} onClose={() => setSelected(null)} onChanged={() => { setSelected(null); loadPosts(); }} />}
    </>
  );
}

function Onboarding({ email, onDone }: { email: string; onDone: () => void }) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <main className="center">
      <form className="card" onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError("");
        const { error } = await supabase.rpc("create_organization", { org_name: name.trim() });
        if (error) { setError("تعذّر إنشاء الشركة."); setBusy(false); } else onDone();
      }}>
        <h1>أهلاً بك</h1>
        <p className="sub">سجّلت الدخول بـ <span className="num">{email}</span>. ما اسم شركتك؟</p>
        {error && <div className="msg err">{error}</div>}
        <div className="field"><label htmlFor="org">اسم الشركة</label><input id="org" required value={name} onChange={(e) => setName(e.target.value)} /></div>
        <button className="btn primary" style={{ width: "100%" }} disabled={busy || !name.trim()}>{busy ? "لحظة..." : "ابدأ"}</button>
      </form>
    </main>
  );
}

export default function AppPage() {
  return (
    <Suspense fallback={null}>
      <AppInner />
    </Suspense>
  );
}
