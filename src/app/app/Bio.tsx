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

  const brand = ctx.brands.find((b) => b.id === ctx.brandId) ?? ctx.brands[0];
  const brandId = brand?.id;

  useEffect(() => {
    setSlug(""); setBio(""); setAvatar(null); setLinks([{ title: "", url: "" }]); setMsg(null);
    setTitle(brand?.name ?? ctx.org.name);
    if (!brandId) return;
    supabase.from("bio_pages").select("*").eq("brand_id", brandId).maybeSingle().then(({ data }) => {
      if (!data) return;
      setSlug(data.slug); setTitle(data.title); setBio(data.bio); setAvatar(data.avatar_url);
      setLinks((data.links as Link[]).length ? data.links : [{ title: "", url: "" }]);
    });
  }, [brandId, brand?.name, ctx.org.name]);

  if (!ctx.isAdmin) return <div className="msg warn">صفحة الروابط يديرها المالك والمدير.</div>;
  const setL = (i: number, p: Partial<Link>) => setLinks(links.map((l, j) => (j === i ? { ...l, ...p } : l)));

  async function save() {
    const clean = links.filter((l) => l.title.trim() && /^https?:\/\//i.test(l.url.trim())).map((l) => ({ title: l.title.trim(), url: l.url.trim() }));
    const { error } = await supabase.from("bio_pages").upsert({ org_id: ctx.org.id, brand_id: brandId, slug: slug.trim().toLowerCase(), title, bio, avatar_url: avatar, links: clean, updated_at: new Date().toISOString() }, { onConflict: "brand_id" });
    setMsg(error ? { t: "err", s: friendly(error.message.includes("check") ? "الرابط: حروف إنجليزية صغيرة وأرقام وشرطة، 3 أحرف على الأقل." : error.message) } : { t: "ok", s: "تم الحفظ." });
  }

  return (
    <div className="panel">
      <h3>صفحة الروابط: {brand?.name}</h3>
      <p className="hint">صفحة عامة خاصة بهذا العميل، تضع رابطها في بايو إنستغرامه. اختر عميلاً آخر من القائمة بالأعلى لصفحته.</p>
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
        <button className="btn primary" onClick={save} disabled={slug.trim().length < 3 || !brandId}>حفظ</button>
        {slug && <a className="btn" href={`/l/${slug}`} target="_blank" rel="noreferrer">فتح الصفحة</a>}
      </div>
    </div>
  );
}
