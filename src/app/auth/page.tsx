"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { configured, supabase } from "@/lib/supabase";

function AuthForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [mode, setMode] = useState<"signin" | "signup">(params.get("mode") === "signup" ? "signup" : "signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    if (mode === "signup") {
      const { data, error } = await supabase.auth.signUp({ email, password });
      if (error) setError(error.message);
      else if (data.session) router.replace("/app");
      else setNotice("أرسلنا رابط تأكيد إلى بريدك. افتحه ثم سجّل الدخول.");
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) setError("البريد الإلكتروني أو كلمة المرور غير صحيحة.");
      else router.replace("/app");
    }
    setBusy(false);
  }

  return (
    <main className="center">
      <form className="card" onSubmit={submit}>
        <h1>{mode === "signup" ? "إنشاء حساب" : "تسجيل الدخول"}</h1>
        <p className="sub">{mode === "signup" ? "ابدأ بإدارة محتوى شركتك" : "أهلاً بعودتك"}</p>

        {!configured && (
          <div className="msg warn">لم يتم ربط قاعدة البيانات بعد. أضف مفاتيح Supabase في ملف .env.local ثم أعد تشغيل الموقع.</div>
        )}
        {error && <div className="msg err">{error}</div>}
        {notice && <div className="msg ok">{notice}</div>}

        <div className="field">
          <label htmlFor="email">البريد الإلكتروني</label>
          <input id="email" type="email" dir="ltr" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="password">كلمة المرور</label>
          <input id="password" type="password" dir="ltr" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>

        <button className="btn primary" style={{ width: "100%" }} disabled={busy || !configured}>
          {busy ? "لحظة..." : mode === "signup" ? "إنشاء الحساب" : "دخول"}
        </button>

        <p className="sub" style={{ marginTop: 14, marginBottom: 0 }}>
          {mode === "signup" ? "عندك حساب؟" : "ما عندك حساب؟"}{" "}
          <a
            href="#"
            onClick={(e) => {
              e.preventDefault();
              setMode(mode === "signup" ? "signin" : "signup");
              setError("");
              setNotice("");
            }}
          >
            {mode === "signup" ? "سجّل الدخول" : "أنشئ حساباً"}
          </a>
        </p>
        <p className="sub" style={{ marginTop: 8, marginBottom: 0 }}>
          <Link href="/">العودة للرئيسية</Link>
        </p>
      </form>
    </main>
  );
}

export default function AuthPage() {
  return (
    <Suspense fallback={null}>
      <AuthForm />
    </Suspense>
  );
}
