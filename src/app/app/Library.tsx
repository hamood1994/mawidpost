"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { friendly } from "@/lib/shared";
import type { Ctx } from "./ctx";

interface Saved { id: string; title: string; body: string }
interface Tags { id: string; name: string; tags: string }

export default function Library({ ctx }: { ctx: Ctx }) {
  const [caps, setCaps] = useState<Saved[]>([]);
  const [tags, setTags] = useState<Tags[]>([]);
  const [t, setT] = useState(""), [b, setB] = useState(""), [n, setN] = useState(""), [g, setG] = useState("");
  const [err, setErr] = useState("");
  const load = async () => {
    const [c, h] = await Promise.all([
      supabase.from("saved_captions").select("id, title, body").eq("org_id", ctx.org.id).order("created_at", { ascending: false }),
      supabase.from("hashtag_groups").select("id, name, tags").eq("org_id", ctx.org.id).order("created_at", { ascending: false }),
    ]);
    setCaps((c.data as Saved[]) ?? []);
    setTags((h.data as Tags[]) ?? []);
  };
  useEffect(() => { load(); }, [ctx.org.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const run = async (p: PromiseLike<{ error: { message: string } | null }>) => { const { error } = await p; setErr(error ? friendly(error.message) : ""); load(); };

  return (
    <>
      {err && <div className="msg err">{err}</div>}
      <div className="grid2">
        <div className="panel">
          <h3>نصوص محفوظة</h3>
          <p className="hint">قوالب جاهزة تختارها عند كتابة منشور.</p>
          <div className="field"><label>العنوان</label><input value={t} onChange={(e) => setT(e.target.value)} /></div>
          <div className="field"><label>النص</label><textarea value={b} onChange={(e) => setB(e.target.value)} /></div>
          <button className="btn primary" disabled={!t.trim() || !b.trim()} onClick={async () => { await run(supabase.from("saved_captions").insert({ org_id: ctx.org.id, title: t.trim(), body: b })); setT(""); setB(""); }}>حفظ</button>
          <div className="list" style={{ marginTop: 12 }}>
            {caps.map((c) => (
              <div key={c.id}><span><b>{c.title}</b><br /><span style={{ color: "var(--muted)" }}>{c.body.slice(0, 60)}</span></span><button className="btn sm danger" onClick={() => run(supabase.from("saved_captions").delete().eq("id", c.id))}>حذف</button></div>
            ))}
          </div>
        </div>
        <div className="panel">
          <h3>مجموعات هاشتاقات</h3>
          <p className="hint">مثال: #قهوة #الكويت #كافيه</p>
          <div className="field"><label>الاسم</label><input value={n} onChange={(e) => setN(e.target.value)} /></div>
          <div className="field"><label>الهاشتاقات</label><textarea value={g} onChange={(e) => setG(e.target.value)} /></div>
          <button className="btn primary" disabled={!n.trim() || !g.trim()} onClick={async () => { await run(supabase.from("hashtag_groups").insert({ org_id: ctx.org.id, name: n.trim(), tags: g.trim() })); setN(""); setG(""); }}>حفظ</button>
          <div className="list" style={{ marginTop: 12 }}>
            {tags.map((c) => (
              <div key={c.id}><span><b>{c.name}</b><br /><span style={{ color: "var(--muted)" }}>{c.tags.slice(0, 60)}</span></span><button className="btn sm danger" onClick={() => run(supabase.from("hashtag_groups").delete().eq("id", c.id))}>حذف</button></div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
