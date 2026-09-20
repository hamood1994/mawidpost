"use client";

import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { PLATFORMS, WEEKDAYS, friendly } from "@/lib/shared";
import type { Ctx } from "./ctx";

interface P { id: string; text: string; url: string | null; thumb: string | null; time: string; likes: number; comments: number; shares: number; kind: string }
interface Data { handle: string; platform: string; followers: number | null; mediaCount: number | null; posts: P[]; history: { day: string; followers: number | null }[] }

export default function Analytics({ ctx }: { ctx: Ctx }) {
  const accs = ctx.accounts.filter((a) => a.status === "connected" && a.external_id);
  const [id, setId] = useState(accs[0]?.id ?? "");
  const [data, setData] = useState<Data | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!id) return;
    setBusy(true);
    setErr("");
    setData(null);
    api<Data>(`/api/analytics?accountId=${id}`).then(setData).catch((e) => setErr(friendly((e as Error).message))).finally(() => setBusy(false));
  }, [id]);

  const eng = (p: P) => p.likes + p.comments * 2 + p.shares * 3;
  const stats = useMemo(() => {
    if (!data) return null;
    const n = data.posts.length;
    const total = data.posts.reduce((s, p) => s + p.likes + p.comments + p.shares, 0);
    const avg = n ? Math.round(total / n) : 0;
    const grid: { sum: number; n: number }[][] = Array.from({ length: 7 }, () => Array.from({ length: 8 }, () => ({ sum: 0, n: 0 })));
    for (const p of data.posts) {
      const d = new Date(p.time);
      const cell = grid[d.getDay()][Math.floor(d.getHours() / 3)];
      cell.sum += eng(p);
      cell.n++;
    }
    let max = 0;
    grid.forEach((r) => r.forEach((c) => { if (c.n) max = Math.max(max, c.sum / c.n); }));
    return { n, avg, grid, max, top: [...data.posts].sort((a, b) => eng(b) - eng(a)).slice(0, 6) };
  }, [data]);

  if (accs.length === 0) return <div className="msg warn">اربط حساباً من «الإعدادات» لعرض التحليلات.</div>;

  return (
    <>
      <div className="row">
        <select className="inline" value={id} onChange={(e) => setId(e.target.value)}>
          {accs.map((a) => <option key={a.id} value={a.id}>{PLATFORMS[a.platform].label} · @{a.handle}</option>)}
        </select>
        {busy && <span style={{ color: "var(--muted)" }}>جاري التحميل…</span>}
      </div>
      {err && <div className="msg err">{err}</div>}
      {data && stats && (
        <>
          <div className="tiles">
            <div className="tile"><b className="num">{data.followers ?? "—"}</b><span>المتابعون</span></div>
            <div className="tile"><b className="num">{data.mediaCount ?? "—"}</b><span>عدد المنشورات</span></div>
            <div className="tile"><b className="num">{stats.n}</b><span>آخر منشورات محلّلة</span></div>
            <div className="tile"><b className="num">{stats.avg}</b><span>متوسط التفاعل للمنشور</span></div>
          </div>

          {data.history.length > 1 && <Spark rows={data.history.filter((h) => h.followers != null) as { day: string; followers: number }[]} />}

          <div className="panel">
            <h3>أفضل وقت للنشر</h3>
            <p className="hint">حسب تفاعل منشوراتك السابقة (بتوقيت جهازك). الأغمق = تفاعل أعلى.</p>
            <div className="heat">
              <div className="h" />
              {Array.from({ length: 8 }, (_, i) => <div key={i} className="h">{String(i * 3).padStart(2, "0")}h</div>)}
              {stats.grid.map((row, d) => (
                <div key={d} style={{ display: "contents" }}>
                  <div className="h" style={{ direction: "rtl" }}>{WEEKDAYS[d]}</div>
                  {row.map((c, i) => {
                    const v = c.n && stats.max ? c.sum / c.n / stats.max : 0;
                    return <div key={i} title={c.n ? `${c.n} منشور` : ""} style={{ background: c.n ? `color-mix(in srgb, var(--brand) ${Math.round(15 + v * 75)}%, var(--soft))` : undefined, color: v > 0.55 ? "var(--brand-ink)" : undefined }}>{c.n || ""}</div>;
                  })}
                </div>
              ))}
            </div>
          </div>

          <div className="panel posts-list">
            <h3>أفضل المنشورات</h3>
            <div className="list">
              {stats.top.map((p) => (
                <div key={p.id}>
                  <div className="row" style={{ flexWrap: "nowrap" }}>
                    {p.thumb && <img src={p.thumb} alt="" width={44} height={44} style={{ borderRadius: 8, objectFit: "cover" }} />}
                    <div>{p.url ? <a href={p.url} target="_blank" rel="noreferrer">{p.text.slice(0, 70) || "بدون نص"}</a> : p.text.slice(0, 70) || "بدون نص"}</div>
                  </div>
                  <span className="num" style={{ color: "var(--muted)" }}>♥ {p.likes} · 💬 {p.comments}{p.shares ? ` · ↗ ${p.shares}` : ""}</span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </>
  );
}

function Spark({ rows }: { rows: { day: string; followers: number }[] }) {
  const w = 600, h = 80;
  const vals = rows.map((r) => r.followers);
  const min = Math.min(...vals), max = Math.max(...vals);
  const pts = rows.map((r, i) => `${(i / (rows.length - 1)) * w},${h - ((r.followers - min) / Math.max(1, max - min)) * (h - 8) - 4}`).join(" ");
  return (
    <div className="panel">
      <h3>نمو المتابعين</h3>
      <svg viewBox={`0 0 ${w} ${h}`} width="100%" height="80" preserveAspectRatio="none" role="img" aria-label="نمو المتابعين">
        <polyline points={pts} fill="none" stroke="var(--brand)" strokeWidth="2" vectorEffect="non-scaling-stroke" />
      </svg>
    </div>
  );
}
