import Link from "next/link";
import type { ReactNode } from "react";
import { CONTACT_EMAIL, SITE_NAME } from "@/lib/site";

export default function SiteShell({ children }: { children: ReactNode }) {
  return (
    <div className="site">
      <header className="s-head">
        <div className="s-wrap s-bar">
          <Link href="/" className="s-brand">
            <span className="logo">م</span>
            <strong>موعد بوست</strong>
          </Link>
          <nav className="s-nav" aria-label="القائمة الرئيسية">
            <Link href="/#features">المزايا</Link>
            <Link href="/#how">كيف يعمل</Link>
            <Link href="/pricing">الباقات</Link>
            <Link href="/#faq">الأسئلة</Link>
            <Link href="/contact">تواصل معنا</Link>
          </nav>
          <div className="s-cta">
            <Link className="btn" href="/auth">دخول</Link>
            <Link className="btn primary" href="/auth?mode=signup">ابدأ الآن</Link>
          </div>
        </div>
      </header>
      {children}
      <footer className="s-foot">
        <div className="s-wrap s-foot-grid">
          <div>
            <div className="s-brand"><span className="logo">م</span><strong>موعد بوست</strong></div>
            <p className="muted">منصة عربية لجدولة ونشر محتوى العملاء لشركات التسويق والوكالات.</p>
          </div>
          <div>
            <h4>المنتج</h4>
            <Link href="/#features">المزايا</Link>
            <Link href="/pricing">الباقات</Link>
            <Link href="/#faq">الأسئلة الشائعة</Link>
          </div>
          <div>
            <h4>قانوني</h4>
            <Link href="/terms">الشروط والأحكام</Link>
            <Link href="/privacy">سياسة الخصوصية</Link>
            <Link href="/data-deletion">حذف البيانات</Link>
          </div>
          <div>
            <h4>تواصل</h4>
            <Link href="/contact">صفحة التواصل</Link>
            <span dir="ltr">{CONTACT_EMAIL}</span>
          </div>
        </div>
        <div className="s-wrap s-copy">© {new Date().getFullYear()} {SITE_NAME}. جميع الحقوق محفوظة.</div>
      </footer>
    </div>
  );
}
