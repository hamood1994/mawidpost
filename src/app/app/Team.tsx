"use client";

import { useEffect, useState, type ReactElement } from "react";
import { supabase } from "@/lib/supabase";
import { ROLE_LABEL, friendly, type Role } from "@/lib/shared";
import type { Ctx } from "./ctx";

interface M { user_id: string; email: string; role: Role; brand_ids: string[] }
interface Inv { id: string; email: string; role: string; token: string; brand_ids: string[] }

export default function Team({ ctx }: { ctx: Ctx }) {
  const [members, setMembers] = useState<M[]>([]);
  const [invites, setInvites] = useState<Inv[]>([]);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"admin" | "editor" | "client">("editor");
  const [brandIds, setBrandIds] = useState<string[]>([]);
  const [editing, setEditing] = useState<M | null>(null);
  const [msg, setMsg] = useState<{ t: "ok" | "err"; s: string } | null>(null);
  const isOwner = ctx.org.role === "owner";
  const brandName = (id: string) => ctx.brands.find((b) => b.id === id)?.name ?? "—";

  const load = async () => {
    const m = await supabase.rpc("org_members", { o: ctx.org.id });
    setMembers((m.data as M[]) ?? []);
    const i = await supabase.from("invites").select("id, email, role, token, brand_ids").eq("org_id", ctx.org.id).is("accepted_at", null).order("created_at", { ascending: false });
    setInvites((i.data as Inv[]) ?? []);
  };
  useEffect(() => { load(); }, [ctx.org.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const link = (t: string) => `${location.origin}/invite/${t}`;
  const fail = (e: { message: string } | null) => setMsg(e ? { t: "err", s: friendly(e.message) } : null);
  const needsBrands = role !== "admin";
  const staff = members.filter((m) => m.role !== "client").length;

  const toggle = (list: string[], id: string) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);

  function BrandPicker({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
    return (
      <div className="row">
        {ctx.brands.map((b) => (
          <label key={b.id} className={`check${value.includes(b.id) ? " on" : ""}`}>
            <input type="checkbox" checked={value.includes(b.id)} onChange={() => onChange(toggle(value, b.id))} />{b.name}
          </label>
        ))}
      </div>
    );
  }

  return (
    <>
      {msg && <div className={`msg ${msg.t}`}>{msg.s}</div>}
      <div className="panel">
        <h3>الفريق والعملاء (موظفون {staff}/{ctx.plan?.max_members ?? "—"} · العملاء بلا حد)</h3>
        <p className="hint">المدير يرى كل العملاء. المحرّر يرى العملاء الذين تحدّدهم له فقط. العميل يدخل بوابته ويرى براندَه فقط.</p>
        <div className="list">
          {members.map((m) => (
            <div key={m.user_id}>
              <span>
                <span className="num">{m.email}</span>
                {m.role !== "owner" && m.role !== "admin" && (
                  <><br /><span style={{ color: "var(--muted)", fontSize: 12.5 }}>{m.brand_ids.length ? m.brand_ids.map(brandName).join("، ") : "لا يرى أي عميل بعد"}</span></>
                )}
              </span>
              <span className="row">
                {isOwner && m.role !== "owner" ? (
                  <select className="inline" value={m.role} onChange={async (e) => { const { error } = await supabase.rpc("set_member_role", { o: ctx.org.id, uid: m.user_id, new_role: e.target.value }); fail(error); load(); }}>
                    <option value="admin">{ROLE_LABEL.admin}</option>
                    <option value="editor">{ROLE_LABEL.editor}</option>
                    <option value="client">{ROLE_LABEL.client}</option>
                  </select>
                ) : <span className="badge">{ROLE_LABEL[m.role]}</span>}
                {m.role !== "owner" && m.role !== "admin" && <button className="btn sm" onClick={() => setEditing(m)}>العملاء</button>}
                {m.role !== "owner" && (
                  <button className="btn sm danger" onClick={async () => { if (!confirm(`إزالة ${m.email}؟`)) return; const { error } = await supabase.rpc("remove_member", { o: ctx.org.id, uid: m.user_id }); fail(error); load(); }}>إزالة</button>
                )}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="panel">
        <h3>دعوة موظف أو عميل</h3>
        <p className="hint">ننشئ رابط دعوة تنسخه وترسله (واتساب أو بريد). يجب أن يسجّل بنفس البريد.</p>
        <div className="row">
          <input className="inline" type="email" dir="ltr" placeholder="email@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
          <select className="inline" value={role} onChange={(e) => setRole(e.target.value as "admin" | "editor" | "client")}>
            <option value="editor">{ROLE_LABEL.editor} (موظف)</option>
            <option value="admin">{ROLE_LABEL.admin} (يرى كل شيء)</option>
            <option value="client">{ROLE_LABEL.client} (بوابة العميل)</option>
          </select>
        </div>
        {needsBrands && (
          <div className="field" style={{ marginTop: 10 }}>
            <label>{role === "client" ? "براند هذا العميل" : "العملاء الذين يراهم"}</label>
            <BrandPicker value={brandIds} onChange={setBrandIds} />
          </div>
        )}
        <button className="btn primary" disabled={!email.trim() || (needsBrands && brandIds.length === 0)} onClick={async () => {
          const { data, error } = await supabase.from("invites").insert({ org_id: ctx.org.id, email: email.trim().toLowerCase(), role, brand_ids: needsBrands ? brandIds : [] }).select("token").single();
          if (error) return fail(error);
          await navigator.clipboard?.writeText(link(data!.token)).catch(() => {});
          setMsg({ t: "ok", s: "تم إنشاء الدعوة ونُسخ الرابط. أرسله للشخص." });
          setEmail(""); setBrandIds([]);
          load();
        }}>إنشاء دعوة</button>
        <div className="list" style={{ marginTop: 10 }}>
          {invites.map((i) => (
            <div key={i.id}>
              <span><span className="num">{i.email}</span> · {ROLE_LABEL[i.role as Role]}{i.brand_ids?.length ? ` · ${i.brand_ids.map(brandName).join("، ")}` : ""}</span>
              <span className="row">
                <button className="btn sm" onClick={async () => { await navigator.clipboard?.writeText(link(i.token)).catch(() => {}); setMsg({ t: "ok", s: "نُسخ الرابط." }); }}>نسخ الرابط</button>
                <button className="btn sm danger" onClick={async () => { await supabase.from("invites").delete().eq("id", i.id); load(); }}>إلغاء</button>
              </span>
            </div>
          ))}
        </div>
      </div>

      {editing && (
        <EditBrands ctx={ctx} m={editing} Picker={BrandPicker} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} onError={(e) => fail(e)} />
      )}
    </>
  );
}

function EditBrands({ ctx, m, Picker, onClose, onSaved, onError }: {
  ctx: Ctx; m: M; Picker: (p: { value: string[]; onChange: (v: string[]) => void }) => ReactElement;
  onClose: () => void; onSaved: () => void; onError: (e: { message: string } | null) => void;
}) {
  const [ids, setIds] = useState<string[]>(m.brand_ids);
  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>العملاء الذين يراهم {m.email}</h3>
        <Picker value={ids} onChange={setIds} />
        <div className="actions">
          <button className="btn" onClick={onClose}>إلغاء</button>
          <button className="btn primary" onClick={async () => { const { error } = await supabase.rpc("set_member_brands", { o: ctx.org.id, uid: m.user_id, ids }); if (error) onError(error); else onSaved(); }}>حفظ</button>
        </div>
      </div>
    </div>
  );
}
