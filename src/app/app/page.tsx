"use client";

import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

type Platform = "instagram" | "facebook" | "tiktok";
type Status = "draft" | "scheduled" | "published" | "failed";

interface Org { id: string; name: string }
interface Account { id: string; platform: Platform; handle: string }
type PostType = "post" | "story" | "reel";
interface Post {
  id: string; account_id: string | null; caption: string; scheduled_at: string; status: Status;
  post_type: PostType; media_urls: string[];
}
const TYPE_LABEL: Record<PostType, string> = { post: "منشور", story: "ستوري", reel: "ريلز" };
const isVideo = (u: string) => /\.(mp4|mov|m4v|webm)(\?|$)/i.test(u);

const PLATFORMS: Record<Platform, { label: string; color: string }> = {
  instagram: { label: "إنستغرام", color: "var(--instagram)" },
  facebook: { label: "فيسبوك", color: "var(--facebook)" },
  tiktok: { label: "تيك توك", color: "var(--tiktok)" },
};
const STATUS_LABEL: Record<Status, string> = {
  draft: "مسودة",
  scheduled: "مجدول",
  published: "منشور",
  failed: "فشل النشر",
};
const WEEKDAYS = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];

const pad = (n: number) => String(n).padStart(2, "0");
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const hm = (iso: string) => new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });

export default function AppPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [checking, setChecking] = useState(true);
  const [org, setOrg] = useState<Org | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [posts, setPosts] = useState<Post[]>([]);
  const [month, setMonth] = useState(() => {
    const n = new Date();
    return new Date(n.getFullYear(), n.getMonth(), 1);
  });
  const [composeDay, setComposeDay] = useState<Date | null>(null);
  const [selected, setSelected] = useState<Post | null>(null);
  const [accountModal, setAccountModal] = useState(false);

  const loadOrg = useCallback(async () => {
    const { data } = await supabase.from("members").select("org_id, organizations(id, name)").limit(1);
    const row = (data as any[] | null)?.[0];
    const o = row?.organizations;
    setOrg(o ? { id: o.id, name: o.name } : null);
    setChecking(false);
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) {
        router.replace("/auth");
        return;
      }
      setEmail(data.session.user.email ?? "");
      loadOrg();
    });
  }, [router, loadOrg]);

  const loadData = useCallback(async () => {
    if (!org) return;
    const from = new Date(month.getFullYear(), month.getMonth(), 1).toISOString();
    const to = new Date(month.getFullYear(), month.getMonth() + 1, 1).toISOString();
    const [a, p] = await Promise.all([
      supabase.from("social_accounts").select("id, platform, handle").eq("org_id", org.id).order("created_at"),
      supabase
        .from("posts")
        .select("id, account_id, caption, scheduled_at, status, post_type, media_urls")
        .eq("org_id", org.id)
        .gte("scheduled_at", from)
        .lt("scheduled_at", to)
        .order("scheduled_at"),
    ]);
    setAccounts((a.data as Account[] | null) ?? []);
    setPosts((p.data as Post[] | null) ?? []);
  }, [org, month]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const byDay = useMemo(() => {
    const m = new Map<string, Post[]>();
    for (const p of posts) {
      const k = ymd(new Date(p.scheduled_at));
      m.set(k, [...(m.get(k) ?? []), p]);
    }
    return m;
  }, [posts]);

  const accountOf = (id: string | null) => accounts.find((a) => a.id === id);

  if (checking) return <main className="center">لحظة...</main>;

  if (!org) return <Onboarding email={email} onDone={loadOrg} />;

  const y = month.getFullYear();
  const mo = month.getMonth();
  const lead = new Date(y, mo, 1).getDay();
  const days = new Date(y, mo + 1, 0).getDate();
  const cells: (number | null)[] = [...Array(lead).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)];
  while (cells.length % 7 !== 0) cells.push(null);
  const today = ymd(new Date());
  const monthLabel = new Intl.DateTimeFormat("ar-KW-u-nu-latn", { month: "long", year: "numeric" }).format(month);

  return (
    <>
      <header className="topbar">
        <div className="brand">
          <span className="logo">م</span>
          <div>
            موعد بوست
            <small>{org.name}</small>
          </div>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <span className="num" style={{ color: "var(--muted)", fontSize: 12 }}>{email}</span>
          <button
            className="btn"
            onClick={async () => {
              await supabase.auth.signOut();
              router.replace("/auth");
            }}
          >
            خروج
          </button>
        </div>
      </header>

      <div className="page">
        <div className="toolbar">
          <div className="accounts">
            {accounts.map((a) => (
              <span key={a.id} className="acct" style={{ "--c": PLATFORMS[a.platform].color } as CSSProperties}>
                <i className="dot" />
                {PLATFORMS[a.platform].label} · <span className="num">@{a.handle}</span>
              </span>
            ))}
            <button className="btn" onClick={() => setAccountModal(true)}>+ إضافة حساب</button>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button className="btn" aria-label="الشهر السابق" onClick={() => setMonth(new Date(y, mo - 1, 1))}>›</button>
            <h2 style={{ minWidth: 130, textAlign: "center" }}>{monthLabel}</h2>
            <button className="btn" aria-label="الشهر التالي" onClick={() => setMonth(new Date(y, mo + 1, 1))}>‹</button>
          </div>
        </div>

        {accounts.length === 0 && (
          <div className="msg warn">أضف حساباً أولاً لتتمكن من جدولة المنشورات. الربط الفعلي مع إنستغرام وفيسبوك يأتي في الخطوة القادمة، والآن يمكنك إضافة الحساب يدوياً للتجربة.</div>
        )}

        <div className="cal">
          <div className="cal-head">
            {WEEKDAYS.map((w) => (
              <div key={w}>{w}</div>
            ))}
          </div>
          <div className="cal-grid">
            {cells.map((d, i) => {
              if (d === null) return <div key={i} className="cell empty" />;
              const date = new Date(y, mo, d);
              const key = ymd(date);
              const list = byDay.get(key) ?? [];
              return (
                <div key={i} className={`cell${key === today ? " today" : ""}`}>
                  <div className="d">
                    <span className="num">{d}</span>
                    <button className="add" aria-label={`منشور جديد يوم ${d}`} disabled={accounts.length === 0} onClick={() => setComposeDay(date)}>+</button>
                  </div>
                  {list.map((p) => {
                    const acc = accountOf(p.account_id);
                    return (
                      <button
                        key={p.id}
                        className={`chip ${p.status}`}
                        style={{ "--c": acc ? PLATFORMS[acc.platform].color : "var(--muted)" } as CSSProperties}
                        onClick={() => setSelected(p)}
                      >
                        <span className="num">{hm(p.scheduled_at)}</span> {TYPE_LABEL[p.post_type]} · {p.caption || "بدون نص"}
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {composeDay && (
        <Composer
          org={org}
          day={composeDay}
          accounts={accounts}
          onClose={() => setComposeDay(null)}
          onSaved={() => {
            setComposeDay(null);
            loadData();
          }}
        />
      )}
      {accountModal && (
        <AccountForm
          org={org}
          onClose={() => setAccountModal(false)}
          onSaved={() => {
            setAccountModal(false);
            loadData();
          }}
        />
      )}
      {selected && (
        <div className="overlay" onClick={() => setSelected(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>{TYPE_LABEL[selected.post_type]} {STATUS_LABEL[selected.status]}</h3>
            {selected.media_urls.length > 0 && (
              <div className="media-grid">
                {selected.media_urls.map((u) =>
                  isVideo(u) ? <video key={u} src={u} controls /> : <img key={u} src={u} alt="" />
                )}
              </div>
            )}
            <p style={{ whiteSpace: "pre-wrap" }}>{selected.caption || "بدون نص"}</p>
            <p style={{ color: "var(--muted)" }}>
              {accountOf(selected.account_id) ? PLATFORMS[accountOf(selected.account_id)!.platform].label : "بدون حساب"} ·{" "}
              <span className="num">{new Date(selected.scheduled_at).toLocaleString("en-GB")}</span>
            </p>
            <div className="actions">
              <button
                className="btn"
                onClick={async () => {
                  await supabase.from("posts").delete().eq("id", selected.id);
                  setSelected(null);
                  loadData();
                }}
              >
                حذف
              </button>
              <button className="btn primary" onClick={() => setSelected(null)}>إغلاق</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function Onboarding({ email, onDone }: { email: string; onDone: () => void }) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <main className="center">
      <form
        className="card"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          const { error } = await supabase.rpc("create_organization", { org_name: name.trim() });
          if (error) {
            setError("تعذّر إنشاء الشركة. تأكد من تشغيل ملف schema.sql في Supabase.");
            setBusy(false);
          } else onDone();
        }}
      >
        <h1>أهلاً بك</h1>
        <p className="sub">
          سجّلت الدخول بـ <span className="num">{email}</span>. ما اسم شركتك؟
        </p>
        {error && <div className="msg err">{error}</div>}
        <div className="field">
          <label htmlFor="org">اسم الشركة</label>
          <input id="org" required value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <button className="btn primary" style={{ width: "100%" }} disabled={busy || !name.trim()}>
          {busy ? "لحظة..." : "ابدأ"}
        </button>
      </form>
    </main>
  );
}

function AccountForm({ org, onClose, onSaved }: { org: Org; onClose: () => void; onSaved: () => void }) {
  const [platform, setPlatform] = useState<Platform>("instagram");
  const [handle, setHandle] = useState("");
  const [error, setError] = useState("");
  return (
    <div className="overlay" onClick={onClose}>
      <form
        className="modal"
        onClick={(e) => e.stopPropagation()}
        onSubmit={async (e) => {
          e.preventDefault();
          const { error } = await supabase
            .from("social_accounts")
            .insert({ org_id: org.id, platform, handle: handle.trim().replace(/^@/, "") });
          if (error) setError("تعذّر حفظ الحساب.");
          else onSaved();
        }}
      >
        <h3>إضافة حساب</h3>
        <div className="msg warn">إضافة يدوية للتجربة فقط. الربط الفعلي مع Meta يأتي في الخطوة القادمة.</div>
        {error && <div className="msg err">{error}</div>}
        <div className="field">
          <label htmlFor="platform">المنصة</label>
          <select id="platform" value={platform} onChange={(e) => setPlatform(e.target.value as Platform)}>
            {(Object.keys(PLATFORMS) as Platform[]).map((k) => (
              <option key={k} value={k}>{PLATFORMS[k].label}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="handle">اسم الحساب</label>
          <input id="handle" dir="ltr" required placeholder="mawidpost" value={handle} onChange={(e) => setHandle(e.target.value)} />
        </div>
        <div className="actions">
          <button type="button" className="btn" onClick={onClose}>إلغاء</button>
          <button className="btn primary">حفظ</button>
        </div>
      </form>
    </div>
  );
}

function Composer({
  org, day, accounts, onClose, onSaved,
}: { org: Org; day: Date; accounts: Account[]; onClose: () => void; onSaved: () => void }) {
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const [postType, setPostType] = useState<PostType>("post");
  const [caption, setCaption] = useState("");
  const [when, setWhen] = useState(`${ymd(day)}T10:00`);
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const previews = useMemo(() => files.map((f) => ({ name: f.name, url: URL.createObjectURL(f), video: f.type.startsWith("video/") })), [files]);
  useEffect(() => () => previews.forEach((p) => URL.revokeObjectURL(p.url)), [previews]);

  function pick(list: FileList | null) {
    if (!list) return;
    const next = postType === "post" ? [...files, ...Array.from(list)].slice(0, 10) : Array.from(list).slice(0, 1);
    setFiles(next);
  }

  function changeType(t: PostType) {
    setPostType(t);
    if (t !== "post") setFiles((f) => f.slice(0, 1));
  }

  async function save(asDraft: boolean) {
    setError("");
    if (!asDraft) {
      if (postType !== "post" && files.length === 0) return setError("الستوري والريلز يحتاجان صورة أو فيديو.");
      if (postType === "reel" && !files[0]?.type.startsWith("video/")) return setError("الريلز يجب أن يكون فيديو.");
      if (postType === "post" && files.length === 0 && !caption.trim()) return setError("أضف نصاً أو صورة.");
    }
    setBusy(true);
    const urls: string[] = [];
    for (const f of files) {
      const ext = (f.name.split(".").pop() ?? "bin").toLowerCase().replace(/[^a-z0-9]/g, "");
      const path = `${org.id}/${crypto.randomUUID()}.${ext}`;
      const { error: upErr } = await supabase.storage.from("media").upload(path, f, { contentType: f.type });
      if (upErr) {
        setBusy(false);
        return setError("تعذّر رفع الملف. تأكد من تشغيل migration-media.sql في Supabase.");
      }
      urls.push(supabase.storage.from("media").getPublicUrl(path).data.publicUrl);
    }
    const { error } = await supabase.from("posts").insert({
      org_id: org.id,
      account_id: accountId || null,
      caption,
      post_type: postType,
      media_urls: urls,
      media_url: urls[0] ?? null,
      scheduled_at: new Date(when).toISOString(),
      status: asDraft ? "draft" : "scheduled",
    });
    setBusy(false);
    if (error) setError("تعذّر حفظ المنشور.");
    else onSaved();
  }

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>منشور جديد</h3>
        {error && <div className="msg err">{error}</div>}
        <div className="field">
          <label htmlFor="acct">الحساب</label>
          <select id="acct" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>{PLATFORMS[a.platform].label} — @{a.handle}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>النوع</label>
          <div className="seg">
            {(Object.keys(TYPE_LABEL) as PostType[]).map((t) => (
              <button key={t} type="button" className={postType === t ? "on" : ""} onClick={() => changeType(t)}>
                {TYPE_LABEL[t]}
              </button>
            ))}
          </div>
        </div>
        <div className="field">
          <label htmlFor="media">
            {postType === "post" ? "الصور / الفيديو (حتى 10)" : postType === "story" ? "صورة أو فيديو الستوري" : "فيديو الريلز"}
          </label>
          <input
            id="media"
            type="file"
            accept={postType === "reel" ? "video/*" : "image/*,video/*"}
            multiple={postType === "post"}
            onChange={(e) => {
              pick(e.target.files);
              e.target.value = "";
            }}
          />
          {previews.length > 0 && (
            <div className="media-grid">
              {previews.map((p, i) => (
                <div key={p.url} className="thumb">
                  {p.video ? <video src={p.url} muted /> : <img src={p.url} alt={p.name} />}
                  <button type="button" aria-label="إزالة" onClick={() => setFiles(files.filter((_, j) => j !== i))}>×</button>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="field">
          <label htmlFor="caption">النص</label>
          <textarea id="caption" value={caption} onChange={(e) => setCaption(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="when">موعد النشر</label>
          <input id="when" type="datetime-local" dir="ltr" value={when} onChange={(e) => setWhen(e.target.value)} />
        </div>
        <div className="actions">
          <button className="btn" onClick={onClose} disabled={busy}>إلغاء</button>
          <button className="btn" onClick={() => save(true)} disabled={busy}>حفظ كمسودة</button>
          <button className="btn primary" onClick={() => save(false)} disabled={busy || !when}>{busy ? "جاري الرفع..." : "جدولة"}</button>
        </div>
      </div>
    </div>
  );
}
