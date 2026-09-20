"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { ROLE_LABEL, friendly, type Role } from "@/lib/shared";
import type { Ctx } from "./ctx";

interface M { user_id: string; email: string; role: Role }
interface Inv { id: string; email: string; role: string; token: string; accepted_at: string | null }

export default function Team({ ctx }: { ctx: Ctx }) {
  const [members, setMembers] = useState<M[]>([]);
  const [invites, setInvites] = useState<Inv[]>([]);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"admin" | "editor">("editor");
  const [msg, setMsg] = useState<{ t: "ok" | "err"; s: string } | null>(null);
  const isOwner = ctx.org.role === "owner";

  const load = async () => {
    const m = await supabase.rpc("org_members", { o: ctx.org.id });
    setMembers((m.data as M[]) ?? []);
    if (ctx.isAdmin) {
      const i = await supabase.from("invites").select("id, email, role, token, accepted_at").eq("org_id", ctx.org.id).is("accepted_at", null).order("created_at", { ascending: false });
      setInvites((i.data as Inv[]) ?? []);
    }
  };
  useEffect(() => { load(); }, [ctx.org.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const link = (t: string) => `${location.origin}/invite/${t}`;
  const fail = (e: { message: string } | null) => setMsg(e ? { t: "err", s: friendly(e.message) } : null);

  return (
    <>
      {msg && <div className={`msg ${msg.t}`}>{msg.s}</div>}
      <div className="panel">
        <h3>الفريق ({members.length}/{ctx.plan?.max_members ?? "—"})</h3>
        <p className="hint">المالك والمدير ينشران ويوافقان. المحرّر يكتب ويرسل للموافقة فقط.</p>
        <div className="list">
          {members.map((m) => (
            <div key={m.user_id}>
              <span className="num">{m.email}</span>
              <span className="row">
                {isOwner && m.role !== "owner" ? (
                  <select className="inline" value={m.role} onChange={async (e) => { const { error } = await supabase.rpc("set_member_role", { o: ctx.org.id, uid: m.user_id, new_role: e.target.value }); fail(error); load(); }}>
                    <option value="admin">{ROLE_LABEL.admin}</option>
                    <option value="editor">{ROLE_LABEL.editor}</option>
                  </select>
                ) : <span className="badge">{ROLE_LABEL[m.role]}</span>}
                {ctx.isAdmin && m.role !== "owner" && (
                  <button className="btn sm danger" onClick={async () => { const { error } = await supabase.rpc("remove_member", { o: ctx.org.id, uid: m.user_id }); fail(error); load(); }}>إزالة</button>
                )}
              </span>
            </div>
          ))}
        </div>
      </div>

      {ctx.isAdmin && (
        <div className="panel">
          <h3>دعوة عضو</h3>
          <p className="hint">ننشئ رابط دعوة تنسخه وترسله له. يجب أن يسجّل بنفس البريد.</p>
          <div className="row">
            <input className="inline" type="email" dir="ltr" placeholder="email@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
            <select className="inline" value={role} onChange={(e) => setRole(e.target.value as "admin" | "editor")}>
              <option value="editor">{ROLE_LABEL.editor}</option>
              <option value="admin">{ROLE_LABEL.admin}</option>
            </select>
            <button className="btn primary" disabled={!email.trim()} onClick={async () => {
              const { data, error } = await supabase.from("invites").insert({ org_id: ctx.org.id, email: email.trim().toLowerCase(), role }).select("token").single();
              if (error) return fail(error);
              await navigator.clipboard?.writeText(link(data!.token)).catch(() => {});
              setMsg({ t: "ok", s: "تم إنشاء الدعوة ونُسخ الرابط. أرسله للعضو." });
              setEmail("");
              load();
            }}>إنشاء دعوة</button>
          </div>
          <div className="list" style={{ marginTop: 10 }}>
            {invites.map((i) => (
              <div key={i.id}>
                <span className="num">{i.email} · {ROLE_LABEL[i.role as Role]}</span>
                <span className="row">
                  <button className="btn sm" onClick={async () => { await navigator.clipboard?.writeText(link(i.token)).catch(() => {}); setMsg({ t: "ok", s: "نُسخ الرابط." }); }}>نسخ الرابط</button>
                  <button className="btn sm danger" onClick={async () => { await supabase.from("invites").delete().eq("id", i.id); load(); }}>إلغاء</button>
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
