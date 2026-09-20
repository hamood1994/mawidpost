import Link from "next/link";
import SiteShell from "@/components/SiteShell";

export const metadata = { title: "الباقات | موعد بوست", description: "باقات موعد بوست للوكالات: Starter وGrowth وScale." };

const plans = [
  { name: "Starter", desc: "للبداية وتجربة النظام", accounts: "3", members: "1", posts: "30 منشوراً لكل حساب", ai: "5", approvals: false },
  { name: "Growth", desc: "للوكالات النامية", accounts: "10", members: "3", posts: "180 منشوراً لكل حساب", ai: "50", approvals: true, hot: true },
  { name: "Scale", desc: "للوكالات الكبيرة", accounts: "30", members: "10", posts: "بدون حد", ai: "100", approvals: true },
];

export default function Pricing() {
  return (
    <SiteShell>
      <section className="s-sec">
        <div className="s-wrap">
          <h1 className="s-h1">الباقات</h1>
          <p className="s-sub">ابدأ بتجربة مجانية 14 يوماً على باقة Starter بدون بطاقة ائتمان، ثم اختر الباقة المناسبة لحجم وكالتك. الأسعار النهائية تُحدَّد عند التواصل معنا، وأي باقة يمكن ترقيتها لاحقاً.</p>
          <div className="s-grid three">
            {plans.map((p) => (
              <div key={p.name} className={`s-card plan${p.hot ? " hot" : ""}`}>
                {p.hot && <span className="s-pill">الأكثر طلباً</span>}
                <h3>{p.name}</h3>
                <p className="muted">{p.desc}</p>
                <ul className="s-list">
                  <li>{p.accounts} حسابات اجتماعية</li>
                  <li>{p.members} {p.members === "1" ? "عضو فريق" : "أعضاء فريق"}</li>
                  <li>{p.posts}</li>
                  <li>{p.ai} رصيد اقتراحات ذكاء اصطناعي</li>
                  <li>{p.approvals ? "سير موافقات وبوابة عميل" : "بدون سير موافقات"}</li>
                  <li>عملاء (بوابة العميل) لا يُحتسبون من الأعضاء</li>
                </ul>
                <Link className={`btn${p.hot ? " primary" : ""}`} href="/auth?mode=signup">ابدأ بهذه الباقة</Link>
              </div>
            ))}
          </div>
          <p className="s-note" style={{ textAlign: "center" }}>تحتاج شيئاً مخصصاً؟ <Link href="/contact" style={{ textDecoration: "underline" }}>تواصل معنا</Link>.</p>
        </div>
      </section>
    </SiteShell>
  );
}
