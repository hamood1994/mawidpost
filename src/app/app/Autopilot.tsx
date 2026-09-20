"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { api, uploadMedia } from "@/lib/api";
import { PLATFORMS, TYPE_LABEL, WEEKDAYS, friendly, isVideo, toJpeg, ymd, type Account, type PostType } from "@/lib/shared";
import type { Ctx } from "./ctx";

interface Item { id: string; url: string; kind: "image" | "video"; caption: string; note: string; used_count: number; extra_urls?: string[] }
interface Rule {
  id?: string; account_id: string; enabled: boolean; days: number[]; times: string[]; post_type: PostType;
  approval: boolean; send_to_client?: boolean; text_only_ok: boolean; last_note?: string | null; last_run_at?: string | null;
}
interface Draft { key: string; file: File; caption: string; when: string; extra?: File[] }

/** Minimal CSV reader (handles quotes) for: filename,caption,datetime */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], cur = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') q = false;
      else cur += c;
    } else if (c === '"') q = true;
    else if (c === "," || c === ";" || c === "\t") { row.push(cur); cur = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cur); cur = "";
      if (row.some((x) => x.trim())) rows.push(row);
      row = [];
    } else cur += c;
  }
  row.push(cur);
  if (row.some((x) => x.trim())) rows.push(row);
  return rows;
}

export default function Autopilot({ ctx }: { ctx: Ctx }) {
  const brand = ctx.brands.find((b) => b.id === ctx.brandId) ?? ctx.brands[0];
  if (!brand) return <div className="msg warn">أنشئ براند (عميل) من تبويب «الإعدادات» أولاً.</div>;
  if (!ctx.isAdmin) return <div className="msg warn">الأوتوبايلوت متاح للمالك والمدير فقط.</div>;
  return <Inner key={brand.id} ctx={ctx} brandId={brand.id} />;
}

function Inner({ ctx, brandId }: { ctx: Ctx; brandId: string }) {
  const brand = ctx.brands.find((b) => b.id === brandId)!;
  const accounts = ctx.allAccounts.filter((a) => a.brand_id === brandId && a.status === "connected" && a.platform !== "tiktok");
  const [items, setItems] = useState<Item[]>([]);
  const [rules, setRules] = useState<Rule[]>([]);
  const [msg, setMsg] = useState<{ t: "ok" | "err" | "warn"; s: string } | null>(null);
  const [profile, setProfile] = useState({ ...brand });
  const [running, setRunning] = useState(false);

  const load = async () => {
    const [m, r] = await Promise.all([
      supabase.from("media_library").select("id, url, kind, caption, note, used_count, extra_urls").eq("brand_id", brandId).order("created_at", { ascending: false }).limit(200),
      supabase.from("autopilot_rules").select("*").eq("brand_id", brandId),
    ]);
    setItems((m.data as Item[]) ?? []);
    setRules((r.data as Rule[]) ?? []);
  };
  useEffect(() => { load(); }, [brandId]); // eslint-disable-line react-hooks/exhaustive-deps

  const ruleFor = (a: Account): Rule =>
    rules.find((r) => r.account_id === a.id) ?? { account_id: a.id, enabled: false, days: [1, 3, 5], times: ["19:00"], post_type: "post", approval: true, text_only_ok: false };

  async function saveRule(r: Rule) {
    const { error } = await supabase.from("autopilot_rules").upsert(
      { org_id: ctx.org.id, brand_id: brandId, account_id: r.account_id, enabled: r.enabled, days: r.days, times: r.times, post_type: r.post_type, approval: r.approval, send_to_client: r.send_to_client ?? false, text_only_ok: r.text_only_ok },
      { onConflict: "account_id" }
    );
    if (error) setMsg({ t: "err", s: friendly(error.message) });
    else { setMsg({ t: "ok", s: "تم حفظ القواعد." }); load(); }
  }

  async function saveProfile() {
    const { error } = await supabase.from("brands").update({
      name: profile.name, industry: profile.industry, description: profile.description, audience: profile.audience,
      tone: profile.tone, language: profile.language, avoid: profile.avoid, default_hashtags: profile.default_hashtags,
    }).eq("id", brandId);
    if (error) setMsg({ t: "err", s: friendly(error.message) });
    else { setMsg({ t: "ok", s: "تم حفظ ملف البراند." }); await ctx.reload(); }
  }

  async function runNow() {
    setRunning(true);
    setMsg(null);
    try {
      const r = await api<{ created: number; notes: string[] }>("/api/autopilot/run", { body: { orgId: ctx.org.id, brandId } });
      setMsg({ t: r.created ? "ok" : "warn", s: `تم إنشاء ${r.created} منشور. ${r.notes.join(" · ")}` });
      load();
    } catch (e) {
      setMsg({ t: "err", s: friendly((e as Error).message) });
    }
    setRunning(false);
  }

  return (
    <>
      {msg && <div className={`msg ${msg.t}`}>{msg.s}</div>}

      <div className="panel">
        <div className="row between">
          <div>
            <h3>الأوتوبايلوت — {brand.name}</h3>
            <p className="hint">ارفع التصاميم مع الكابشنات، حدّد الأيام والأوقات لكل حساب، والنظام ينشر لوحده حسب المواعيد. الذكاء الاصطناعي يكتب فقط للتصاميم التي بلا كابشن.</p>
          </div>
          <button className="btn primary" onClick={runNow} disabled={running}>{running ? "جاري التوليد..." : "ولّد الجدول الآن"}</button>
        </div>
      </div>

      <Uploader ctx={ctx} brandId={brandId} accounts={accounts} onDone={(s) => { setMsg({ t: "ok", s }); load(); }} onError={(s) => setMsg({ t: "err", s })} />

      <div className="panel">
        <h3>القواعد لكل حساب</h3>
        <p className="hint">الأوقات بتوقيت الكويت. عند إيقاف «يحتاج موافقة» ينشر النظام بدون مراجعة.</p>
        {accounts.length === 0 && <div className="msg warn">لا توجد حسابات مربوطة بهذا البراند. اربط الحسابات وحدّد البراند من «الإعدادات».</div>}
        <div className="grid2">
          {accounts.map((a) => (
            <RuleCard key={a.id} account={a} rule={ruleFor(a)} onSave={saveRule} />
          ))}
        </div>
      </div>

      <div className="panel">
        <h3>ملف البراند (للذكاء الاصطناعي)</h3>
        <p className="hint">يُستخدم فقط عند وجود تصميم بلا كابشن.</p>
        <div className="grid2">
          {([["name", "الاسم"], ["industry", "المجال"], ["audience", "الجمهور"], ["tone", "النبرة"], ["avoid", "ممنوع ذكره"], ["default_hashtags", "هاشتاقات ثابتة"]] as const).map(([k, l]) => (
            <div className="field" key={k}>
              <label>{l}</label>
              <input value={profile[k]} onChange={(e) => setProfile({ ...profile, [k]: e.target.value })} />
            </div>
          ))}
          <div className="field">
            <label>اللغة</label>
            <select value={profile.language} onChange={(e) => setProfile({ ...profile, language: e.target.value })}>
              <option value="ar">العربية</option>
              <option value="en">English</option>
            </select>
          </div>
        </div>
        <div className="field">
          <label>وصف النشاط</label>
          <textarea value={profile.description} onChange={(e) => setProfile({ ...profile, description: e.target.value })} />
        </div>
        <button className="btn primary" onClick={saveProfile}>حفظ</button>
      </div>

      <div className="panel">
        <h3>مكتبة التصاميم ({items.length})</h3>
        <p className="hint">الكابشن هنا يُنشر كما هو. عدّله ثم اضغط خارج الخانة ليُحفظ.</p>
        <div className="items">
          {items.map((it) => (
            <div className="item" key={it.id}>
              {it.kind === "video" || isVideo(it.url) ? <video src={it.url} muted controls /> : <img src={it.url} alt="" />}
              <div className="b">
                <textarea
                  defaultValue={it.caption}
                  placeholder="بدون كابشن — سيكتبه الذكاء الاصطناعي"
                  onBlur={async (e) => {
                    if (e.target.value !== it.caption) await supabase.from("media_library").update({ caption: e.target.value }).eq("id", it.id);
                  }}
                />
                <div className="row between">
                  <span>{it.extra_urls?.length ? <span className="badge">كاروسيل · {it.extra_urls.length + 1}</span> : null} <span className="badge">استُخدم {it.used_count}×</span></span>
                  <button className="btn sm danger" onClick={async () => { await supabase.from("media_library").delete().eq("id", it.id); load(); }}>حذف</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

function RuleCard({ account, rule, onSave }: { account: Account; rule: Rule; onSave: (r: Rule) => void }) {
  const [r, setR] = useState<Rule>(rule);
  const [times, setTimes] = useState(rule.times.join(", "));
  useEffect(() => { setR(rule); setTimes(rule.times.join(", ")); }, [rule.enabled, rule.days.join(), rule.times.join(), rule.post_type, rule.approval, rule.send_to_client, rule.text_only_ok]); // eslint-disable-line react-hooks/exhaustive-deps
  const toggleDay = (d: number) => setR({ ...r, days: r.days.includes(d) ? r.days.filter((x) => x !== d) : [...r.days, d].sort() });
  return (
    <div className="panel" style={{ background: "var(--bg)" }}>
      <div className="row between">
        <b>{PLATFORMS[account.platform].label} · <span className="num">@{account.handle}</span></b>
        <label className={`check${r.enabled ? " on" : ""}`}>
          <input type="checkbox" checked={r.enabled} onChange={(e) => setR({ ...r, enabled: e.target.checked })} />
          {r.enabled ? "مفعّل" : "متوقف"}
        </label>
      </div>
      <div className="field" style={{ marginTop: 10 }}>
        <label>الأيام</label>
        <div className="row">
          {WEEKDAYS.map((w, d) => (
            <label key={d} className={`check${r.days.includes(d) ? " on" : ""}`}>
              <input type="checkbox" checked={r.days.includes(d)} onChange={() => toggleDay(d)} />{w}
            </label>
          ))}
        </div>
      </div>
      <div className="grid2">
        <div className="field">
          <label>الأوقات (مثال: 12:00, 19:30)</label>
          <input dir="ltr" value={times} onChange={(e) => setTimes(e.target.value)} />
        </div>
        <div className="field">
          <label>نوع المنشور</label>
          <select value={r.post_type} onChange={(e) => setR({ ...r, post_type: e.target.value as PostType })}>
            {(Object.keys(TYPE_LABEL) as PostType[]).map((t) => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}
          </select>
        </div>
      </div>
      <div className="row">
        <label className={`check${r.approval ? " on" : ""}`}>
          <input type="checkbox" checked={r.approval} onChange={(e) => setR({ ...r, approval: e.target.checked })} />يحتاج موافقة قبل النشر
        </label>
        {r.approval && (
          <label className={`check${r.send_to_client ? " on" : ""}`}>
            <input type="checkbox" checked={r.send_to_client ?? false} onChange={(e) => setR({ ...r, send_to_client: e.target.checked })} />الموافقة من العميل نفسه
          </label>
        )}
        {account.platform === "facebook" && (
          <label className={`check${r.text_only_ok ? " on" : ""}`}>
            <input type="checkbox" checked={r.text_only_ok} onChange={(e) => setR({ ...r, text_only_ok: e.target.checked })} />نص فقط إذا انتهت التصاميم
          </label>
        )}
      </div>
      {rule.last_note && <p className="hint" style={{ marginTop: 8 }}>آخر تشغيل: {rule.last_note}</p>}
      <div className="actions">
        <button
          className="btn primary"
          onClick={() => {
            const list = times.split(/[,،\s]+/).map((t) => t.trim()).filter((t) => /^\d{1,2}:\d{2}$/.test(t)).map((t) => t.padStart(5, "0"));
            onSave({ ...r, times: list.length ? list : ["19:00"] });
          }}
        >
          حفظ
        </button>
      </div>
    </div>
  );
}

function Uploader({ ctx, brandId, accounts, onDone, onError }: { ctx: Ctx; brandId: string; accounts: Account[]; onDone: (s: string) => void; onError: (s: string) => void }) {
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [busy, setBusy] = useState(false);
  const [bulk, setBulk] = useState("");
  const [mode, setMode] = useState<"library" | "dates">("library");
  const [picked, setPicked] = useState<string[]>([]);
  const [start, setStart] = useState(`${ymd(new Date(Date.now() + 86400000))}T19:00`);
  const [everyDays, setEveryDays] = useState(1);
  const [postType, setPostType] = useState<PostType>("post");
  const [sel, setSel] = useState<string[]>([]);
  const previews = useMemo(() => drafts.map((d) => URL.createObjectURL(d.file)), [drafts]);
  useEffect(() => () => previews.forEach((u) => URL.revokeObjectURL(u)), [previews]);

  const addFiles = (list: FileList | null) => {
    if (!list) return;
    const next = Array.from(list).map((file) => ({ key: crypto.randomUUID(), file, caption: "", when: "" }));
    setDrafts((d) => [...d, ...next].slice(0, 60));
  };
  const isImg = (d: Draft) => d.file.type.startsWith("image/");
  function makeCarousel() {
    const chosen = drafts.filter((d) => sel.includes(d.key));
    if (chosen.length < 2 || chosen.length > 10) return onError("اختر من 2 إلى 10 صور لتصير كاروسيل.");
    if (chosen.some((d) => !isImg(d) || d.extra?.length)) return onError("الكاروسيل هنا للصور فقط، ولا يمكن دمج كاروسيل بكاروسيل.");
    const head = chosen[0];
    const rest = chosen.slice(1);
    setDrafts((all) => all.filter((d) => !rest.some((r) => r.key === d.key)).map((d) => (d.key === head.key ? { ...d, extra: rest.map((r) => r.file) } : d)));
    setSel([]);
  }
  function splitCarousel(key: string) {
    setDrafts((all) => all.flatMap((d) => (d.key === key && d.extra ? [{ ...d, extra: undefined }, ...d.extra.map((file) => ({ key: crypto.randomUUID(), file, caption: "", when: "" }))] : [d])));
  }
  const setD = (key: string, patch: Partial<Draft>) => setDrafts((d) => d.map((x) => (x.key === key ? { ...x, ...patch } : x)));

  function applyBulk() {
    const parts = bulk.split(/\n\s*-{3,}\s*\n/).map((s) => s.trim());
    setDrafts((d) => d.map((x, i) => (parts[i] ? { ...x, caption: parts[i] } : x)));
  }
  async function importCsv(f: File | undefined) {
    if (!f) return;
    const rows = parseCsv(await f.text());
    let hit = 0;
    setDrafts((d) =>
      d.map((x) => {
        const row = rows.find((r) => r[0]?.trim().toLowerCase() === x.file.name.toLowerCase());
        if (!row) return x;
        hit++;
        const when = row[2]?.trim().replace(" ", "T") ?? "";
        return { ...x, caption: row[1] ?? x.caption, when: /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(when) ? when.slice(0, 16) : x.when };
      })
    );
    onDone(`تمت مطابقة ${hit} ملف من ملف CSV (العمود الأول: اسم الملف، الثاني: الكابشن، الثالث اختياري: التاريخ 2026-10-01 19:00).`);
  }

  async function submit() {
    if (drafts.length === 0) return;
    if (mode === "dates" && picked.length === 0) return onError("اختر حساباً واحداً على الأقل للجدولة المباشرة.");
    setBusy(true);
    try {
      const uploaded: { url: string; kind: "image" | "video"; d: Draft; extra: string[] }[] = [];
      for (const d of drafts) {
        const f = await toJpeg(d.file);
        const extra: string[] = [];
        for (const ex of d.extra ?? []) extra.push(await uploadMedia(ctx.org.id, await toJpeg(ex)));
        uploaded.push({ url: await uploadMedia(ctx.org.id, f), kind: f.type.startsWith("video/") ? "video" : "image", d, extra });
      }
      if (mode === "library") {
        const { error } = await supabase.from("media_library").insert(uploaded.map((u) => ({ org_id: ctx.org.id, brand_id: brandId, url: u.url, kind: u.kind, caption: u.d.caption.trim(), extra_urls: u.extra })));
        if (error) throw new Error(error.message);
        onDone(`أُضيف ${uploaded.length} تصميم إلى المكتبة. سينشرها الأوتوبايلوت حسب القواعد.`);
      } else {
        const rows: Record<string, unknown>[] = [];
        uploaded.forEach((u, i) => {
          const base = u.d.when ? new Date(u.d.when) : new Date(new Date(start).getTime() + i * everyDays * 86400000);
          for (const accId of picked) {
            rows.push({
              org_id: ctx.org.id, account_id: accId, caption: u.d.caption, post_type: postType, media_urls: [u.url, ...u.extra], media_url: u.url,
              scheduled_at: base.toISOString(), status: "scheduled",
            });
          }
        });
        const { error } = await supabase.from("posts").insert(rows);
        if (error) throw new Error(error.message);
        onDone(`تمت جدولة ${rows.length} منشور. ستراها في التقويم وتُنشر تلقائياً.`);
      }
      setDrafts([]);
      setSel([]);
      setBulk("");
    } catch (e) {
      onError(friendly((e as Error).message));
    }
    setBusy(false);
  }

  return (
    <div className="panel">
      <h3>ارفع التصاميم والكابشنات</h3>
      <p className="hint">اختر عدة صور أو فيديوهات دفعة واحدة. اكتب الكابشن تحت كل تصميم، أو الصق كل الكابشنات مفصولة بسطر فيه --- بنفس ترتيب التصاميم، أو ارفع ملف CSV.</p>
      <div className="row">
        <input type="file" multiple accept="image/*,video/*" onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} />
        <label className="btn sm">
          استيراد CSV
          <input type="file" accept=".csv,text/csv" hidden onChange={(e) => { importCsv(e.target.files?.[0]); e.target.value = ""; }} />
        </label>
      </div>

      {drafts.length > 0 && (
        <>
          <div className="field" style={{ marginTop: 12 }}>
            <label>لصق كل الكابشنات (افصل بينها بسطر ---)</label>
            <textarea value={bulk} onChange={(e) => setBulk(e.target.value)} />
            <button type="button" className="btn sm" style={{ alignSelf: "flex-start" }} onClick={applyBulk}>وزّع على التصاميم بالترتيب</button>
          </div>
          {sel.length > 0 && (
            <div className="row" style={{ margin: "10px 0" }}>
              <button type="button" className="btn primary sm" onClick={makeCarousel}>اجعل الـ {sel.length} المحددة كاروسيل واحد</button>
              <span className="hint">تصير منشوراً واحداً بعدة صور، والكابشن للأولى.</span>
            </div>
          )}
          <div className="items">
            {drafts.map((d, i) => (
              <div className="item" key={d.key}>
                {d.file.type.startsWith("video/") ? <video src={previews[i]} muted /> : <img src={previews[i]} alt={d.file.name} />}
                <div className="b">
                  {d.extra?.length ? (
                    <div className="row between"><span className="badge">كاروسيل · {d.extra.length + 1} صور</span><button type="button" className="btn sm" onClick={() => splitCarousel(d.key)}>فكّ</button></div>
                  ) : isImg(d) ? (
                    <label className={`check${sel.includes(d.key) ? " on" : ""}`}>
                      <input type="checkbox" checked={sel.includes(d.key)} onChange={() => setSel((s) => (s.includes(d.key) ? s.filter((x) => x !== d.key) : [...s, d.key]))} />ضمن كاروسيل
                    </label>
                  ) : null}
                  <textarea value={d.caption} placeholder="الكابشن (اختياري)" onChange={(e) => setD(d.key, { caption: e.target.value })} />
                  {mode === "dates" && <input className="inline" type="datetime-local" dir="ltr" value={d.when} onChange={(e) => setD(d.key, { when: e.target.value })} />}
                  <button className="btn sm danger" onClick={() => setDrafts(drafts.filter((x) => x.key !== d.key))}>إزالة</button>
                </div>
              </div>
            ))}
          </div>

          <div className="field" style={{ marginTop: 12 }}>
            <label>طريقة الاستخدام</label>
            <div className="seg">
              <button type="button" className={mode === "library" ? "on" : ""} onClick={() => setMode("library")}>أضف للمكتبة (الأوتوبايلوت يوزّعها)</button>
              <button type="button" className={mode === "dates" ? "on" : ""} onClick={() => setMode("dates")}>جدولة بتواريخ محددة</button>
            </div>
          </div>

          {mode === "dates" && (
            <div className="grid2">
              <div className="field">
                <label>الحسابات</label>
                <div className="row">
                  {accounts.map((a) => (
                    <label key={a.id} className={`check${picked.includes(a.id) ? " on" : ""}`}>
                      <input type="checkbox" checked={picked.includes(a.id)} onChange={() => setPicked((p) => (p.includes(a.id) ? p.filter((x) => x !== a.id) : [...p, a.id]))} />
                      {PLATFORMS[a.platform].label} @{a.handle}
                    </label>
                  ))}
                </div>
              </div>
              <div className="field">
                <label>النوع</label>
                <select value={postType} onChange={(e) => setPostType(e.target.value as PostType)}>
                  {(Object.keys(TYPE_LABEL) as PostType[]).map((t) => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}
                </select>
              </div>
              <div className="field">
                <label>أول تصميم ينزل في</label>
                <input type="datetime-local" dir="ltr" value={start} onChange={(e) => setStart(e.target.value)} />
              </div>
              <div className="field">
                <label>ثم كل كم يوم (للتصاميم بلا تاريخ خاص)</label>
                <input type="number" min={1} max={30} value={everyDays} onChange={(e) => setEveryDays(Math.max(1, Number(e.target.value) || 1))} />
              </div>
            </div>
          )}

          <div className="actions">
            <button className="btn primary" disabled={busy} onClick={submit}>
              {busy ? "جاري الرفع..." : mode === "library" ? `أضف ${drafts.length} للمكتبة` : `جدولة ${drafts.length} تصميم`}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
