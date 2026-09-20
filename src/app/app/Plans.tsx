"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { Post } from "@/lib/shared";
import type { Ctx } from "./ctx";
import { PlanProgress } from "./ClientPortal";

/** Staff view: edit the monthly content plan of a client and read what the client sent. */
export default function Plans({ ctx }: { ctx: Ctx }) {
  const brand = ctx.brands.find((b) => b.id === ctx.brandId) ?? ctx.brands[0];
  const [month, setMonth] = useState(() => { const n = new Date(); return new Date(n.getFullYear(), n.getMonth(), 1); });
  const [posts, setPosts] = useState<Post[]>([]);
  const [uploads, setUploads] = useState<{ id: string; url: string | null; note: string; author_email: string | null; created_at: string }[]>([]);

  const ids = ctx.allAccounts.filter((a) => a.brand_id === brand?.id).map((a) => a.id);
  useEffect(() => {
    if (!brand) return;
    const from = new Date(month.getFullYear(), month.getMonth(), 1).toISOString();
    const to = new Date(month.getFullYear(), month.getMonth() + 1, 1).toISOString();
    if (ids.length) supabase.from("posts").select("id, post_type, status, account_id, scheduled_at").in("account_id", ids).gte("scheduled_at", from).lt("scheduled_at", to).then((r) => setPosts((r.data as unknown as Post[]) ?? []));
    else setPosts([]);
    supabase.from("client_uploads").select("id, url, note, author_email, created_at").eq("brand_id", brand.id).order("created_at", { ascending: false }).limit(40).then((r) => setUploads((r.data as typeof uploads) ?? []));
  }, [brand?.id, month, ids.join()]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!brand) return <div className="msg warn">أنشئ براند أولاً من «الإعدادات».</div>;
  return (
    <>
      <div className="msg ok" style={{ background: "var(--soft)", color: "var(--ink)" }}>خطة العميل: <b>{brand.name}</b>. غيّر العميل من القائمة أعلى الصفحة.</div>
      <PlanProgress ctx={ctx} brandId={brand.id} month={month} posts={posts} onMonth={setMonth} editable />
      <div className="panel">
        <h3>ما أرسله العميل</h3>
        {uploads.length === 0 && <p className="hint">لا يوجد بعد.</p>}
        <div className="items">
          {uploads.map((u) => (
            <div className="item" key={u.id}>
              {u.url && <a href={u.url} target="_blank" rel="noreferrer"><img src={u.url} alt="" /></a>}
              <div className="b"><span>{u.note || "—"}</span><small className="num" style={{ color: "var(--muted)" }}>{u.author_email} · {new Date(u.created_at).toLocaleDateString("en-GB")}</small></div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
