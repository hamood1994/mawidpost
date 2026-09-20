"use client";

import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import { supabase } from "@/lib/supabase";
import { uploadMedia } from "@/lib/api";
import {
  PLATFORMS, STATUS_LABEL, TYPE_LABEL, WEEKDAYS, arMonth, firstOfMonth, friendly, hm, toJpeg, ymd,
  type BrandPlan, type Post,
} from "@/lib/shared";
import type { Ctx } from "./ctx";
import Preview from "./Preview";
import Analytics from "./Analytics";

type Tab = "home" | "approvals" | "calendar" | "plan" | "analytics" | "materials";
const TABS: [Tab, string][] = [
  ["home", "الرئيسية"], ["approvals", "الموافقات"], ["calendar", "التقويم"], ["plan", "الخطة"], ["analytics", "التحليلات"], ["materials", "أرسل لنا مواد"],
];
const COLS = "id, org_id, account_id, caption, first_comment, scheduled_at, status, post_type, media_urls, error, published_at, external_id, autopilot, for_client";

export default function ClientPortal({ ctx, onSignOut }: { ctx: Ctx; onSignOut: () => void }) {
  const [brandId, setBrandId] = useState("");
  // brands arrive after the first render, so pick one as soon as they are loaded
  useEffect(() => {
    if (!ctx.brands.some((b) => b.id === brandId)) setBrandId(ctx.brands[0]?.id ?? "");
  }, [ctx.brands, brandId]);
  const [tab, setTab] = useState<Tab>("home");
  const [month, setMonth] = useState(() => { const n = new Date(); return new Date(n.getFullYear(), n.getMonth(), 1); });
  const [posts, setPosts] = useState<Post[]>([]);
  const [pending, setPending] = useState<Post[]>([]);
  const [open, setOpen] = useState<Post | null>(null);
  const [notice, setNotice] = useState<{ t: "ok" | "err"; s: string } | null>(null);

  const brand = ctx.brands.find((b) => b.id === brandId);
  const accounts = useMemo(() => ctx.allAccounts.filter((a) => a.brand_id === brandId), [ctx.allAccounts, brandId]);
  const ids = useMemo(() => accounts.map((a) => a.id), [accounts]);
  const accOf = (id: string | null) => accounts.find((a) => a.id === id);

  const load = useCallback(async () => {
    if (ids.length === 0) { setPosts([]); setPending([]); return; }
    const from = new Date(month.getFullYear(), month.getMonth(), 1).toISOString();
    const to = new Date(month.getFullYear(), month.getMonth() + 1, 1).toISOString();
    const [m, p] = await Promise.all([
      supabase.from("posts").select(COLS).in("account_id", ids).gte("scheduled_at", from).lt("scheduled_at", to).order("scheduled_at"),
      supabase.from("posts").select(COLS).in("account_id", ids).eq("status", "pending").eq("for_client", true).order("scheduled_at"),
    ]);
    setPosts((m.data as Post[]) ?? []);
    setPending((p.data as Post[]) ?? []);
  }, [ids, month]);
  useEffect(() => { load(); }, [load]);

  async function review(p: Post, decision: "approve" | "changes", note: string) {
    const { error } = await supabase.rpc("review_post", { p_post: p.id, p_decision: decision, p_note: note });
    setNotice(error ? { t: "err", s: friendly(error.message) } : { t: "ok", s: decision === "approve" ? "تمت الموافقة، وسيُنشر في موعده." : "أرسلنا طلب التعديل للفريق." });
    load();
  }

  const upcoming = posts.filter((p) => new Date(p.scheduled_at) > new Date() && p.status !== "pending").slice(0, 1)[0];
  const cnt = (s: string[]) => posts.filter((p) => s.includes(p.status)).length;

  if (!brand) return <main className="center"><div className="card"><h1>مرحباً</h1><p className="sub">لم يتم ربط حسابك بأي براند بعد. تواصل مع {ctx.org.name}.</p><button className="btn" onClick={onSignOut}>خروج</button></div></main>;

  return (
    <>
      <header className="topbar">
        <div className="brand">
          <span className="logo">{ctx.org.name.slice(0, 1)}</span>
          <div>{brand.name}<small>بوابة العميل · {ctx.org.name}</small></div>
        </div>
        <div className="row">
          {ctx.brands.length > 1 && (
            <select className="inline" value={brandId} onChange={(e) => setBrandId(e.target.value)}>
              {ctx.brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          )}
          <button className="btn" onClick={onSignOut}>خروج</button>
        </div>
      </header>

      <nav className="tabs">
        {TABS.map(([k, l]) => (
          <button key={k} className={tab === k ? "on" : ""} onClick={() => setTab(k)}>
            {l}{k === "approvals" && pending.length > 0 ? ` (${pending.length})` : ""}
          </button>
        ))}
      </nav>

      <div className="page">
        {notice && <div className={`msg ${notice.t}`}>{notice.s}</div>}

        {tab === "home" && (
          <>
            {pending.length > 0 && (
              <div className="msg warn">
                لديك {pending.length} منشور بانتظار موافقتك. <button className="btn sm" onClick={() => setTab("approvals")}>راجعها الآن</button>
              </div>
            )}
            <div className="tiles">
              <div className="tile"><b className="num">{pending.length}</b><span>بانتظار موافقتك</span></div>
              <div className="tile"><b className="num">{cnt(["scheduled", "publishing"])}</b><span>مجدولة هذا الشهر</span></div>
              <div className="tile"><b className="num">{cnt(["published"])}</b><span>منشورة هذا الشهر</span></div>
            </div>
            {upcoming && (
              <div className="panel">
                <h3>المنشور القادم</h3>
                <p className="hint"><span className="num">{new Date(upcoming.scheduled_at).toLocaleString("en-GB")}</span></p>
                <Preview post={upcoming} account={accOf(upcoming.account_id)} />
              </div>
            )}
            <PlanProgress ctx={ctx} brandId={brandId} month={month} posts={posts} compact />
          </>
        )}

        {tab === "approvals" && (
          <>
            {pending.length === 0 && <div className="panel"><h3>كل شيء تمام</h3><p className="hint">لا توجد منشورات بانتظار موافقتك الآن.</p></div>}
            {pending.length > 1 && (
              <div><button className="btn primary" onClick={async () => { for (const p of pending) await supabase.rpc("review_post", { p_post: p.id, p_decision: "approve", p_note: "" }); setNotice({ t: "ok", s: "تمت الموافقة على الكل." }); load(); }}>الموافقة على الكل ({pending.length})</button></div>
            )}
            {pending.map((p) => <ApproveCard key={p.id} post={p} account={accOf(p.account_id)} agency={ctx.org.name} onReview={review} />)}
          </>
        )}

        {tab === "calendar" && (
          <>
            <div className="row between">
              <h2 style={{ margin: 0, fontSize: 18 }}>{arMonth(month)}</h2>
              <div className="row">
                <button className="btn" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}>›</button>
                <button className="btn" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}>‹</button>
              </div>
            </div>
            <MonthGrid month={month} posts={[...posts, ...pending.filter((p) => !posts.some((x) => x.id === p.id))]} accOf={accOf} onOpen={setOpen} />
          </>
        )}

        {tab === "plan" && <PlanProgress ctx={ctx} brandId={brandId} month={month} posts={posts} onMonth={setMonth} />}

        {tab === "analytics" && <Analytics ctx={{ ...ctx, accounts }} simple />}

        {tab === "materials" && <Materials ctx={ctx} brandId={brandId} />}
      </div>

      {open && (
        <div className="overlay" onClick={() => setOpen(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3><span className={`badge ${open.status}`}>{STATUS_LABEL[open.status]}</span> <span className="num" style={{ fontSize: 13 }}>{new Date(open.scheduled_at).toLocaleString("en-GB")}</span></h3>
            <Preview post={open} account={accOf(open.account_id)} />
            <div className="actions"><button className="btn" onClick={() => setOpen(null)}>إغلاق</button></div>
          </div>
        </div>
      )}
    </>
  );
}

function ApproveCard({ post, account, agency, onReview }: {
  post: Post; account?: import("@/lib/shared").Account; agency: string;
  onReview: (p: Post, d: "approve" | "changes", note: string) => Promise<void>;
}) {
  const [note, setNote] = useState("");
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  return (
    <div className="panel approve-card">
      <Preview post={post} account={account} agency={agency} />
      <div>
        <p className="hint">
          {account ? PLATFORMS[account.platform].label : ""} · {TYPE_LABEL[post.post_type]} · يُنشر <span className="num">{new Date(post.scheduled_at).toLocaleString("en-GB")}</span>
        </p>
        {asking ? (
          <>
            <div className="field"><label>ما التعديل المطلوب؟</label><textarea autoFocus value={note} onChange={(e) => setNote(e.target.value)} /></div>
            <div className="row">
              <button className="btn primary" disabled={busy || !note.trim()} onClick={async () => { setBusy(true); await onReview(post, "changes", note); }}>إرسال طلب التعديل</button>
              <button className="btn" onClick={() => setAsking(false)}>رجوع</button>
            </div>
          </>
        ) : (
          <div className="row">
            <button className="btn primary" disabled={busy} onClick={async () => { setBusy(true); await onReview(post, "approve", ""); }}>موافق ✓</button>
            <button className="btn" disabled={busy} onClick={() => setAsking(true)}>أطلب تعديل</button>
          </div>
        )}
      </div>
    </div>
  );
}

export function MonthGrid({ month, posts, accOf, onOpen }: {
  month: Date; posts: Post[]; accOf: (id: string | null) => { platform: keyof typeof PLATFORMS } | undefined; onOpen: (p: Post) => void;
}) {
  const y = month.getFullYear(), mo = month.getMonth();
  const lead = new Date(y, mo, 1).getDay();
  const cells: (number | null)[] = [...Array(lead).fill(null), ...Array.from({ length: new Date(y, mo + 1, 0).getDate() }, (_, i) => i + 1)];
  while (cells.length % 7 !== 0) cells.push(null);
  const today = ymd(new Date());
  const by = new Map<string, Post[]>();
  for (const p of posts) { const k = ymd(new Date(p.scheduled_at)); by.set(k, [...(by.get(k) ?? []), p]); }
  return (
    <div className="cal">
      <div className="cal-head">{WEEKDAYS.map((w) => <div key={w}>{w}</div>)}</div>
      <div className="cal-grid">
        {cells.map((d, i) => {
          if (d === null) return <div key={i} className="cell empty" />;
          const key = ymd(new Date(y, mo, d));
          return (
            <div key={i} className={`cell${key === today ? " today" : ""}`}>
              <div className="d"><span className="num">{d}</span></div>
              {(by.get(key) ?? []).map((p) => {
                const a = accOf(p.account_id);
                return (
                  <button key={p.id} className={`chip ${p.status}`} style={{ "--c": a ? PLATFORMS[a.platform].color : "var(--muted)" } as CSSProperties} onClick={() => onOpen(p)}>
                    <span className="num">{hm(p.scheduled_at)}</span> {TYPE_LABEL[p.post_type]} · {p.caption || "بدون نص"}
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** The month's content plan with delivery progress. Read-only for clients. */
export function PlanProgress({ ctx, brandId, month, posts, onMonth, compact, editable }: {
  ctx: Ctx; brandId: string; month: Date; posts: Post[]; onMonth?: (d: Date) => void; compact?: boolean; editable?: boolean;
}) {
  const [plan, setPlan] = useState<BrandPlan | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [msg, setMsg] = useState("");
  const m1 = firstOfMonth(month);

  useEffect(() => {
    setLoaded(false);
    supabase.from("brand_plans").select("*").eq("brand_id", brandId).eq("month", m1).maybeSingle().then(({ data }) => {
      setPlan((data as BrandPlan | null) ?? (editable ? { org_id: ctx.org.id, brand_id: brandId, month: m1, notes: "", target_posts: 0, target_reels: 0, target_stories: 0, themes: [] } : null));
      setLoaded(true);
    });
  }, [brandId, m1, ctx.org.id, editable]);

  const live = ["pending", "scheduled", "publishing", "published"];
  const done = (t: string) => posts.filter((p) => p.post_type === t && live.includes(p.status)).length;
  const rows: [string, "post" | "reel" | "story", number][] = plan ? [["منشورات", "post", plan.target_posts], ["ريلز", "reel", plan.target_reels], ["ستوري", "story", plan.target_stories]] : [];

  async function save() {
    if (!plan) return;
    const { id: _id, ...row } = plan;
    void _id;
    const { error } = await supabase.from("brand_plans").upsert({ ...row, themes: plan.themes.filter((t) => t.title.trim()) }, { onConflict: "brand_id,month" });
    setMsg(error ? friendly(error.message) : "تم الحفظ.");
  }

  if (!loaded) return null;
  if (!plan) return compact ? null : (
    <div className="panel"><h3>خطة {arMonth(month)}</h3><p className="hint">لم تُحدَّد خطة لهذا الشهر بعد.</p></div>
  );

  return (
    <div className="panel">
      <div className="row between">
        <h3>خطة المحتوى — {arMonth(month)}</h3>
        {onMonth && (
          <div className="row">
            <button className="btn sm" onClick={() => onMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}>›</button>
            <button className="btn sm" onClick={() => onMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}>‹</button>
          </div>
        )}
      </div>
      {msg && <div className="msg ok">{msg}</div>}

      {rows.filter(([, , target]) => target > 0 || editable).map(([label, t, target]) => (
        <div key={t} style={{ margin: "10px 0" }}>
          <div className="row between">
            <span>{label}</span>
            {editable ? (
              <input className="inline num" type="number" min={0} style={{ width: 80 }} value={target}
                onChange={(e) => setPlan({ ...plan, [`target_${t === "post" ? "posts" : t === "reel" ? "reels" : "stories"}`]: Math.max(0, Number(e.target.value) || 0) } as BrandPlan)} />
            ) : null}
            <span className="num">{done(t)} / {target}</span>
          </div>
          <div className="bar"><i style={{ width: `${target ? Math.min(100, (done(t) / target) * 100) : 0}%` }} /></div>
        </div>
      ))}

      {!compact && (
        <>
          <h4 style={{ margin: "14px 0 6px" }}>محاور الشهر</h4>
          {plan.themes.length === 0 && !editable && <p className="hint">—</p>}
          {plan.themes.map((t, i) => (
            <div key={i} style={{ marginBottom: 8 }}>
              {editable ? (
                <div className="row">
                  <input className="inline" placeholder="المحور" value={t.title} onChange={(e) => setPlan({ ...plan, themes: plan.themes.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)) })} />
                  <input className="inline" style={{ flex: 1 }} placeholder="ملاحظة" value={t.note} onChange={(e) => setPlan({ ...plan, themes: plan.themes.map((x, j) => (j === i ? { ...x, note: e.target.value } : x)) })} />
                  <button className="btn sm danger" onClick={() => setPlan({ ...plan, themes: plan.themes.filter((_, j) => j !== i) })}>×</button>
                </div>
              ) : (
                <><b>{t.title}</b>{t.note && <span style={{ color: "var(--muted)" }}> — {t.note}</span>}</>
              )}
            </div>
          ))}
          {editable && <button className="btn sm" onClick={() => setPlan({ ...plan, themes: [...plan.themes, { title: "", note: "" }] })}>+ محور</button>}
          {(plan.notes || editable) && (
            <div className="field" style={{ marginTop: 12 }}>
              <label>ملاحظات</label>
              {editable ? <textarea value={plan.notes} onChange={(e) => setPlan({ ...plan, notes: e.target.value })} /> : <p style={{ whiteSpace: "pre-wrap", margin: 0 }}>{plan.notes}</p>}
            </div>
          )}
          {editable && <div className="actions"><button className="btn primary" onClick={save}>حفظ الخطة</button></div>}
        </>
      )}
    </div>
  );
}

function Materials({ ctx, brandId }: { ctx: Ctx; brandId: string }) {
  const [rows, setRows] = useState<{ id: string; url: string | null; note: string; author_email: string | null; created_at: string }[]>([]);
  const [note, setNote] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ t: "ok" | "err"; s: string } | null>(null);
  const load = () => supabase.from("client_uploads").select("id, url, note, author_email, created_at").eq("brand_id", brandId).order("created_at", { ascending: false }).limit(50).then((r) => setRows((r.data as typeof rows) ?? []));
  useEffect(() => { load(); }, [brandId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function send() {
    setBusy(true);
    try {
      const list: (string | null)[] = [];
      for (const f of files) list.push(await uploadMedia(ctx.org.id, await toJpeg(f)));
      if (list.length === 0) list.push(null);
      const { error } = await supabase.from("client_uploads").insert(list.map((url) => ({ org_id: ctx.org.id, brand_id: brandId, url, note, author_email: ctx.email })));
      if (error) throw new Error(error.message);
      setNote(""); setFiles([]);
      setMsg({ t: "ok", s: "وصلت مواداتك للفريق." });
      load();
    } catch (e) {
      setMsg({ t: "err", s: friendly((e as Error).message) });
    }
    setBusy(false);
  }

  return (
    <>
      <div className="panel">
        <h3>أرسل لنا صور أو ملاحظات</h3>
        <p className="hint">صور المنتجات، عروض جديدة، أو أي شيء تريدنا أن ننشره.</p>
        {msg && <div className={`msg ${msg.t}`}>{msg.s}</div>}
        <div className="field"><label>الملفات</label><input type="file" multiple accept="image/*,video/*" onChange={(e) => setFiles(Array.from(e.target.files ?? []))} /></div>
        <div className="field"><label>ملاحظة</label><textarea value={note} onChange={(e) => setNote(e.target.value)} /></div>
        <button className="btn primary" disabled={busy || (!note.trim() && files.length === 0)} onClick={send}>{busy ? "جاري الإرسال..." : "إرسال"}</button>
      </div>
      <div className="panel">
        <h3>ما أرسلته سابقاً</h3>
        <div className="items">
          {rows.map((r) => (
            <div className="item" key={r.id}>
              {r.url && <img src={r.url} alt="" />}
              <div className="b"><span>{r.note || "—"}</span><small style={{ color: "var(--muted)" }} className="num">{new Date(r.created_at).toLocaleDateString("en-GB")}</small></div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
