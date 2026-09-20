"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { api, uploadMedia } from "@/lib/api";
import { PLATFORMS, TYPE_LABEL, friendly, toJpeg, ymd, type PostType } from "@/lib/shared";
import type { Ctx } from "./ctx";

interface Saved { id: string; title: string; body: string }
interface Tags { id: string; name: string; tags: string }

export default function Composer({ ctx, day, onClose, onSaved }: { ctx: Ctx; day: Date; onClose: () => void; onSaved: () => void }) {
  const usable = ctx.accounts.filter((a) => a.status === "connected" && a.platform !== "tiktok");
  const [picked, setPicked] = useState<string[]>(usable[0] ? [usable[0].id] : []);
  const [postType, setPostType] = useState<PostType>("post");
  const [caption, setCaption] = useState("");
  const [firstComment, setFirstComment] = useState("");
  const [when, setWhen] = useState(() => {
    const d = new Date(day);
    d.setHours(10, 0, 0, 0);
    return ymd(d) + "T10:00";
  });
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState<Saved[]>([]);
  const [tags, setTags] = useState<Tags[]>([]);
  const [aiOpen, setAiOpen] = useState(false);
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiOut, setAiOut] = useState<string[]>([]);
  const [aiBusy, setAiBusy] = useState(false);

  const isEditor = ctx.org.role === "editor";
  const previews = useMemo(() => files.map((f) => ({ name: f.name, url: URL.createObjectURL(f), video: f.type.startsWith("video/") })), [files]);
  useEffect(() => () => previews.forEach((p) => URL.revokeObjectURL(p.url)), [previews]);

  useEffect(() => {
    supabase.from("saved_captions").select("id, title, body").eq("org_id", ctx.org.id).order("created_at", { ascending: false }).then((r) => setSaved((r.data as Saved[]) ?? []));
    supabase.from("hashtag_groups").select("id, name, tags").eq("org_id", ctx.org.id).order("created_at", { ascending: false }).then((r) => setTags((r.data as Tags[]) ?? []));
  }, [ctx.org.id]);

  function pick(list: FileList | null) {
    if (!list) return;
    setFiles(postType === "post" ? [...files, ...Array.from(list)].slice(0, 10) : Array.from(list).slice(0, 1));
  }
  function changeType(t: PostType) {
    setPostType(t);
    if (t !== "post") setFiles((f) => f.slice(0, 1));
  }
  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  async function suggest() {
    setAiBusy(true);
    setError("");
    try {
      const first = usable.find((a) => picked.includes(a.id));
      const brand = ctx.brands.find((b) => b.id === (first?.brand_id ?? ctx.brandId));
      const r = await api<{ text: string }>("/api/ai", {
        body: {
          orgId: ctx.org.id,
          kind: "caption",
          platform: first?.platform,
          tone: brand?.tone,
          lang: brand?.language,
          prompt: `${brand ? `النشاط: ${brand.name} ${brand.industry}. ${brand.description}\n` : ""}${aiPrompt}`,
        },
      });
      setAiOut(r.text.split(/\n-{3,}\n/).map((s) => s.trim()).filter(Boolean));
    } catch (e) {
      setError(friendly((e as Error).message));
    }
    setAiBusy(false);
  }

  async function save(mode: "draft" | "go") {
    setError("");
    if (mode === "go") {
      if (picked.length === 0) return setError("اختر حساباً واحداً على الأقل.");
      if (postType !== "post" && files.length === 0) return setError("الستوري والريلز يحتاجان صورة أو فيديو.");
      if (postType === "reel" && !files[0]?.type.startsWith("video/")) return setError("الريلز يجب أن يكون فيديو.");
      if (postType === "post" && files.length === 0 && !caption.trim()) return setError("أضف نصاً أو صورة.");
      const noText = usable.filter((a) => picked.includes(a.id) && a.platform === "instagram");
      if (noText.length && files.length === 0) return setError("إنستغرام يحتاج صورة أو فيديو.");
    }
    setBusy(true);
    try {
      const urls: string[] = [];
      for (const f of files) urls.push(await uploadMedia(ctx.org.id, await toJpeg(f)));
      const status = mode === "draft" ? "draft" : isEditor ? "pending" : "scheduled";
      const targets = picked.length ? picked : [null];
      const rows = targets.map((accId) => ({
        org_id: ctx.org.id,
        account_id: accId,
        caption,
        first_comment: firstComment.trim() || null,
        post_type: postType,
        media_urls: urls,
        media_url: urls[0] ?? null,
        scheduled_at: new Date(when).toISOString(),
        status,
      }));
      const { error: err } = await supabase.from("posts").insert(rows);
      if (err) throw new Error(err.message);
      onSaved();
    } catch (e) {
      setError(friendly((e as Error).message));
    }
    setBusy(false);
  }

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal wide" onClick={(e) => e.stopPropagation()}>
        <h3>منشور جديد</h3>
        {error && <div className="msg err">{error}</div>}
        {usable.length === 0 && <div className="msg warn">لا توجد حسابات مربوطة. اربط حسابات Meta من تبويب «الإعدادات».</div>}

        <div className="field">
          <label>الحسابات</label>
          <div className="row">
            {usable.map((a) => (
              <label key={a.id} className={`check${picked.includes(a.id) ? " on" : ""}`}>
                <input type="checkbox" checked={picked.includes(a.id)} onChange={() => toggle(a.id)} />
                {PLATFORMS[a.platform].label} · <span className="num">@{a.handle}</span>
              </label>
            ))}
          </div>
        </div>

        <div className="field">
          <label>النوع</label>
          <div className="seg">
            {(Object.keys(TYPE_LABEL) as PostType[]).map((t) => (
              <button key={t} type="button" className={postType === t ? "on" : ""} onClick={() => changeType(t)}>{TYPE_LABEL[t]}</button>
            ))}
          </div>
        </div>

        <div className="field">
          <label htmlFor="media">{postType === "post" ? "الصور / الفيديو (حتى 10)" : postType === "story" ? "صورة أو فيديو الستوري" : "فيديو الريلز"}</label>
          <input id="media" type="file" accept={postType === "reel" ? "video/*" : "image/*,video/*"} multiple={postType === "post"} onChange={(e) => { pick(e.target.files); e.target.value = ""; }} />
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

        {postType !== "story" && (
          <div className="field">
            <div className="row between">
              <label htmlFor="caption">النص</label>
              <div className="row">
                {saved.length > 0 && (
                  <select className="inline" value="" onChange={(e) => { const s = saved.find((x) => x.id === e.target.value); if (s) setCaption(s.body); }}>
                    <option value="">نص محفوظ…</option>
                    {saved.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
                  </select>
                )}
                {tags.length > 0 && (
                  <select className="inline" value="" onChange={(e) => { const t = tags.find((x) => x.id === e.target.value); if (t) setCaption((c) => `${c}${c ? "\n\n" : ""}${t.tags}`); }}>
                    <option value="">+ هاشتاقات…</option>
                    {tags.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                )}
                <button type="button" className="btn sm" onClick={() => setAiOpen(!aiOpen)}>اقتراح بالذكاء الاصطناعي</button>
              </div>
            </div>
            <textarea id="caption" value={caption} onChange={(e) => setCaption(e.target.value)} />
            {aiOpen && (
              <div className="panel" style={{ marginTop: 8 }}>
                <div className="row">
                  <input className="inline" style={{ flex: 1 }} placeholder="عن ماذا المنشور؟ مثلاً: عرض نهاية الأسبوع على القهوة" value={aiPrompt} onChange={(e) => setAiPrompt(e.target.value)} />
                  <button type="button" className="btn sm primary" disabled={aiBusy || !aiPrompt.trim()} onClick={suggest}>{aiBusy ? "..." : "اقترح"}</button>
                </div>
                {aiOut.map((o, i) => (
                  <div key={i} style={{ marginTop: 8 }}>
                    <p style={{ whiteSpace: "pre-wrap", margin: "0 0 4px" }}>{o}</p>
                    <button type="button" className="btn sm" onClick={() => { setCaption(o); setAiOpen(false); }}>استخدم هذا</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {postType === "post" && (
          <div className="field">
            <label htmlFor="fc">أول تعليق (اختياري، مناسب للهاشتاقات)</label>
            <input id="fc" value={firstComment} onChange={(e) => setFirstComment(e.target.value)} />
          </div>
        )}

        <div className="field">
          <label htmlFor="when">موعد النشر</label>
          <input id="when" type="datetime-local" dir="ltr" value={when} onChange={(e) => setWhen(e.target.value)} />
        </div>

        {isEditor && <div className="msg warn">أنت محرّر: المنشور يُرسل للموافقة قبل جدولته.</div>}

        <div className="actions">
          <button className="btn" onClick={onClose} disabled={busy}>إلغاء</button>
          <button className="btn" onClick={() => save("draft")} disabled={busy}>حفظ كمسودة</button>
          <button className="btn primary" onClick={() => save("go")} disabled={busy || !when}>
            {busy ? "جاري الرفع..." : isEditor ? "إرسال للموافقة" : "جدولة"}
          </button>
        </div>
      </div>
    </div>
  );
}
