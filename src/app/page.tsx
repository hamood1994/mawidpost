import Link from "next/link";

export default function Home() {
  return (
    <main className="center">
      <div className="hero">
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
          <span className="logo">م</span>
          <strong>موعد بوست</strong>
        </div>
        <h1>جدولة ونشر محتوى عملائك من مكان واحد</h1>
        <p>
          اربط حسابات إنستغرام وفيسبوك وتيك توك، خطّط لمنشوراتك على تقويم واحد، ودَع المنصة تنشرها في
          موعدها.
        </p>
        <div className="row">
          <Link className="btn primary" href="/auth?mode=signup">
            ابدأ مجاناً
          </Link>
          <Link className="btn" href="/auth">
            تسجيل الدخول
          </Link>
        </div>
      </div>
    </main>
  );
}
