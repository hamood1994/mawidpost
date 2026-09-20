"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { friendly } from "@/lib/shared";

export default function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const router = useRouter();
  const [msg, setMsg] = useState("جاري قبول الدعوة...");
  const [bad, setBad] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      if (!data.session) return router.replace(`/auth?mode=signup&next=${encodeURIComponent(`/invite/${token}`)}`);
      const { error } = await supabase.rpc("accept_invite", { invite_token: token });
      if (error) { setBad(true); setMsg(friendly(error.message)); }
      else router.replace("/app");
    });
  }, [token, router]);

  return (
    <main className="center">
      <div className="card">
        <h1>دعوة للانضمام</h1>
        <div className={`msg ${bad ? "err" : "ok"}`}>{msg}</div>
        {bad && <button className="btn" onClick={async () => { await supabase.auth.signOut(); router.replace(`/auth?next=${encodeURIComponent(`/invite/${token}`)}`); }}>تسجيل الدخول ببريد آخر</button>}
      </div>
    </main>
  );
}
