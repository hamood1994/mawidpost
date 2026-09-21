"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { PLATFORMS, STATUS_LABEL, TYPE_LABEL, friendly, isVideo, toLocalInput, type Post } from "@/lib/shared";
import type { Ctx } from "./ctx";

interface Comment { id: string; author_email: string | null; body: string; created_at: string; internal: boolean }

export default function PostModal({ ctx, post, onClose, onChanged }: { ctx: Ctx; post: Post; onClose: () => void; onChanged: () => void }) {
  const acc = ctx.allAccounts.find((a) => a.id === post.account_id);
  const editable = post.status !== "published" && post.status !== "publishing";
  const [caption, setCaption] = useState(post.caption);
  const [when, setWhen] = useState(toLocalInput(new Date(post.scheduled_at)));
  const [comments, setComments] = useState<Comment[]>([]);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const loadComments = () =>
    supabase.from("post_comments").select("id, author_email, body, created_at, internal").eq("post_id", post.id).order("created_at").then((r) => setComments((r.data as Comment[]) ?? []));
  useEffect(() => { loadComments(); }, [post.id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function update(patch: Record<string, unknown>) {
    setBusy(true);
    setError("");
    const { error: err } = await supabase.from("posts").update(patch).eq("id", post.id);
    setBusy(false);
    if (err) return setError(friendly(err.message));
    onChanged();
  }
  async function addComment(body: string) {
    if (!body.trim()) return;
    await supabase.from("post_comments").insert({ post_id: post.id, org_id: ctx.org.id, author_email: ctx.email, body: body.trim(), internal: true });
    setNote("");
    loadComments();
  }

  const changed = caption !== post.caption || new Date(when).toISOString() !== new Date(post.scheduled_at).toISOString();
  const isEditor = ctx.org.role === "editor";
  const brand = ctx.brands.find((b) => b.id === acc?.brand_id);
  const chain = brand?.client_approval !== false; // manager approves first, then the client

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal wide" onClick={(e) => e.stopPropagation()}>
        <h3>
          {TYPE_LABEL[post.post_type]} · <span className={`badge ${post.status}`}>{STATUS_LABEL[post.status]}</span> {post.autopilot && <span className="badge">⚡ أوتوبايلوت</span>}
        </h3>
        {error && <div className="msg err">{error}</div>}
        {post.status === "failed" && post.error && <div className="msg err">{post.error}</div>}
        {post.status === "pending" && <div className="msg warn">{post.for_client ? "بانتظار موافقة العميل." : chain ? "بانتظار موافقة المدير، ثم يُرسل للعميل." : "بانتظار موافقة المالك أو المدير."}</div>}
        {post.media_urls.length > 0 && (
          <div className="media-grid">
            {post.media_urls.map((u) => (isVideo(u) ? <video key={u} src={u} controls /> : <img key={u} src={u} alt="" />))}
          </div>
        )}
        <p style={{ color: "var(--muted)", margin: "0 0 8px" }}>
          {acc ? `${PLATFORMS[acc.platform].label} · @${acc.handle}` : "بدون حساب"}
          {post.status === "published" && post.external_id && <> · <span className="num">{post.external_id}</span></>}
        </p>

        {editable ? (
          <>
            <div className="field">
              <label>النص</label>
              <textarea value={caption} onChange={(e) => setCaption(e.target.value)} />
            </div>
            <div className="field">
              <label>الموعد</label>
              <input type="datetime-local" dir="ltr" value={when} onChange={(e) => setWhen(e.target.value)} />
            </div>
          </>
        ) : (
          <p style={{ whiteSpace: "pre-wrap" }}>{post.caption || "بدون نص"}</p>
        )}

        <div className="field">
          <label>الملاحظات (ملاحظاتك داخلية ولا يراها العميل)</label>
          {comments.map((c) => (
            <div key={c.id} style={{ fontSize: 13, marginBottom: 6 }}>
              <span style={{ color: "var(--muted)" }}>{c.author_email ?? "—"}{c.internal ? " (داخلي)" : " (مرئي للعميل)"}: </span>{c.body}
            </div>
          ))}
          <div className="row">
            <input className="inline" style={{ flex: 1 }} value={note} onChange={(e) => setNote(e.target.value)} placeholder="اكتب ملاحظة…" />
            <button className="btn sm" onClick={() => addComment(note)}>إرسال</button>
          </div>
        </div>

        <div className="actions" style={{ flexWrap: "wrap" }}>
          <button className="btn danger" disabled={busy || post.status === "publishing"} onClick={async () => { await supabase.from("posts").delete().eq("id", post.id); onChanged(); }}>حذف</button>
          {(post.status === "pending" || post.status === "draft") && ctx.isAdmin && post.account_id && !post.for_client && (
            <button className="btn" disabled={busy} onClick={() => update({ status: "pending", for_client: true, caption, scheduled_at: new Date(when).toISOString() })}>أرسل للعميل للموافقة</button>
          )}
          {post.status === "pending" && ctx.isAdmin && (
            <>
              <button className="btn" disabled={busy} onClick={async () => { if (note.trim()) await addComment(note); await update({ status: "draft", for_client: false }); }}>رفض (مسودة)</button>
              {chain && !post.for_client ? (
                <>
                  <button className="btn" disabled={busy} title="للبراندات اللي ما إلها عميل" onClick={() => update({ status: "scheduled", caption, scheduled_at: new Date(when).toISOString() })}>جدولة بدون العميل</button>
                  <button className="btn primary" disabled={busy} onClick={() => update({ for_client: true, caption, scheduled_at: new Date(when).toISOString() })}>موافقة وإرسال للعميل</button>
                </>
              ) : (
                <button className="btn primary" disabled={busy} onClick={() => update({ status: "scheduled", caption, scheduled_at: new Date(when).toISOString() })}>موافقة وجدولة</button>
              )}
            </>
          )}
          {post.status === "failed" && !isEditor && (
            <button className="btn" disabled={busy} onClick={() => update({ status: "scheduled", attempts: 0, error: null, scheduled_at: new Date().toISOString() })}>إعادة المحاولة الآن</button>
          )}
          {post.status === "draft" && (
            <button className="btn primary" disabled={busy || !post.account_id} onClick={() => update({ status: isEditor ? "pending" : "scheduled", caption, scheduled_at: new Date(when).toISOString() })}>
              {isEditor ? "إرسال للموافقة" : "جدولة"}
            </button>
          )}
          {editable && changed && post.status !== "draft" && (
            <button className="btn primary" disabled={busy} onClick={() => update({ caption, scheduled_at: new Date(when).toISOString(), ...(isEditor && post.status === "scheduled" ? { status: "pending" } : {}) })}>حفظ التعديل</button>
          )}
          <button className="btn" onClick={onClose}>إغلاق</button>
        </div>
      </div>
    </div>
  );
}
