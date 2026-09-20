"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { uploadMedia } from "@/lib/api";
import { friendly, toJpeg } from "@/lib/shared";
import type { Ctx } from "./ctx";

interface Link { title: string; url: string }

export default function Bio({ ctx }: { ctx: Ctx }) {
  const [slug, setSlug] = useState("");
  const [title, setTitle] = useState("");
  const [bio, setBio] = useState("");
  const [avatar, setAvatar] = useState<string | null>(null);
  const [links, setLinks] = useState<Link[]>([{ title: "", url: "" }]);
  const [msg, setMsg] = useState<{ t: "ok" | "err"; s: string } | null>(null);

  useEffect(() => {
    supabase.from("bio_pages").select("*").eq("org_id", ctx.org.id).maybeSingle().then(({ data }) => {
      if (!data) return setTitle(ctx.org.name);
      setSlug(data.slug); setTitle(data.title); setBio(data.bio); setAvatar(data.avatar_url);
      setLinks((data.links as Link[]).length ? data.links : [{ title: "", url: "" }]);
    });
  }, [ctx.org.id, ctx.org.name]);

  if (!ctx.isAdmin) return <div className="msg warn">صفحة الروابط يديرها المالك والمدير.</div>;
  const setL = (i: number, p: Partial<Link>) => setLinks(links.map((l, j) => (j === i ? { ...l, ...p } : l)));

  async function save() {
    const clean = links.filter((l) => l.title.trim() && /^https?:\/\//i.test(l.url.trim())).map((l) => ({ title: l.title.trim(), url: l.url.trim() }));
    const { error } = await supabase.from("bio_pages").upsert({ org_id: ctx.org.id, slug: slug.trim().toLowerCase(), title, bio, avatar_url: avatar, links: clean, updated_at: new Date().toISOString() }, { onConflict: "org_id" });
    setMsg(error ? { t: "err", s: friendly(error.message.includes("check") ? "الرابط: حروف إنجليزية صغيرة وأرقام وشرطة، 3 أحرف على الأقل." : error.message) } : { t: "ok", s: "تم الحفظ." });
  }

  return (
    <div className="panel">
      <h3>صفحة الروابط (Link in bio)</h3>
      <p className="hint">صفحة عامة تضع رابطها في بايو إنستغرام.</p>
      {msg && <div className={`msg ${msg.t}`}>{msg.s}</div>}
      <div className="grid2">
        <div className="field"><label>الرابط: mawidpost.com/l/</label><input dir="ltr" value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="my-brand" /></div>
        <div className="field"><label>الاسم</label><input value={title} onChange={(e) => setTitle(e.target.value)} /></div>
      </div>
      <div className="field"><label>نبذة</label><textarea value={bio} onChange={(e) => setBio(e.target.value)} /></div>
      <div className="field">
        <label>الصورة</label>
        {avatar && <img src={avatar} alt="" width={64} height={64} style={{ borderRadius: "50%", objectFit: "cover" }} />}
        <input type="file" accept="image/*" onChange={async (e) => { const f = e.target.files?.[0]; if (f) setAvatar(await uploadMedia(ctx.org.id, await toJpeg(f))); }} />
      </div>
      <label style={{ fontSize: 12.5, color: "var(--muted)" }}>الروابط</label>
      {links.map((l, i) => (
        <div className="row" key={i} style={{ marginBottom: 6 }}>
          <input className="inline" placeholder="العنوان" value={l.title} onChange={(e) => setL(i, { title: e.target.value })} />
          <input className="inline" dir="ltr" style={{ flex: 1 }} placeholder="https://" value={l.url} onChange={(e) => setL(i, { url: e.target.value })} />
          <button className="btn sm danger" onClick={() => setLinks(links.filter((_, j) => j !== i))}>×</button>
        </div>
      ))}
      <div className="actions" style={{ justifyContent: "flex-start" }}>
        <button className="btn" onClick={() => setLinks([...links, { title: "", url: "" }])}>+ رابط</button>
        <button className="btn primary" onClick={save} disabled={slug.trim().length < 3}>حفظ</button>
        {slug && <a className="btn" href={`/l/${slug}`} target="_blank" rel="noreferrer">فتح الصفحة</a>}
      </div>
    </div>
  );
}
