import SiteShell from "@/components/SiteShell";
import { CONTACT_EMAIL } from "@/lib/site";

export const metadata = { title: "تواصل معنا | موعد بوست" };

export default function Contact() {
  return (
    <SiteShell>
      <section className="s-sec">
        <div className="s-wrap narrow">
          <h1 className="s-h1">تواصل معنا</h1>
          <p className="s-sub">للأسئلة، أو طلب عرض، أو الدعم الفني، راسلنا وسنرد في أقرب وقت.</p>
          <div className="s-card">
            <h3>البريد الإلكتروني</h3>
            <p><a href={`mailto:${CONTACT_EMAIL}`} dir="ltr" style={{ textDecoration: "underline" }}>{CONTACT_EMAIL}</a></p>
            <h3>طلبات الخصوصية وحذف البيانات</h3>
            <p>راجع صفحة <a href="/data-deletion" style={{ textDecoration: "underline" }}>حذف البيانات</a>.</p>
          </div>
        </div>
      </section>
    </SiteShell>
  );
}
