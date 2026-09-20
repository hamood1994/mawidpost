import Link from "next/link";
import { CONTACT_EMAIL, LAST_UPDATED, OPERATOR, SITE_NAME } from "@/lib/site";

export const metadata = { title: "سياسة الخصوصية | Privacy Policy" };

export default function Privacy() {
  return (
    <main className="doc">
      <p><Link href="/">← {SITE_NAME}</Link></p>
      <h1>سياسة الخصوصية</h1>
      <p className="muted">آخر تحديث: {LAST_UPDATED}</p>

      <h2>من نحن</h2>
      <p>{SITE_NAME} خدمة لجدولة ونشر المحتوى على وسائل التواصل الاجتماعي وإدارته، تشغّلها {OPERATOR}. للتواصل: <span dir="ltr">{CONTACT_EMAIL}</span>.</p>

      <h2>البيانات التي نجمعها</h2>
      <p>بيانات الحساب (البريد الإلكتروني وكلمة المرور المشفّرة)، واسم شركتك ومساحة العمل، والمحتوى الذي تنشئه (النصوص والصور والفيديو ومواعيد النشر)، وعند ربط حساب إنستغرام أو فيسبوك: معرّف الحساب أو الصفحة واسمها ورمز الوصول الذي تمنحه Meta. وقد نقرأ إحصاءات حساباتك المرتبطة (مثل التفاعل والوصول) لعرضها لك عند تفعيل هذه الميزة.</p>

      <h2>كيف نستخدمها</h2>
      <p>نستخدم البيانات فقط لتقديم الخدمة: نشر منشوراتك في الموعد الذي تحدده، وعرض التقويم والتقارير، وتأمين حسابك. لا نبيع بياناتك، ولا نستخدمها للإعلانات، ولا نشاركها مع أي جهة سوى مزوّدي البنية التقنية الذين نعتمد عليهم لتشغيل الخدمة (قاعدة البيانات والاستضافة).</p>

      <h2>بيانات منصات Meta</h2>
      <p>نطلب فقط الصلاحيات اللازمة لكل ميزة، ونستخدم البيانات التي تصل إلينا من Meta لتقديم الميزة التي طلبتها فقط. تُحفَظ رموز الوصول على الخادم فقط ولا تُعرض في المتصفح. يمكنك في أي وقت فصل الحساب من {SITE_NAME}، أو إلغاء صلاحية التطبيق من إعدادات فيسبوك أو إنستغرام.</p>

      <h2>الاحتفاظ والحذف</h2>
      <p>نحتفظ ببياناتك ما دام حسابك فعّالاً. عند فصل حساب اجتماعي نحذف رمز الوصول الخاص به. يمكنك طلب حذف حسابك وكل بياناتك كما هو موضّح في صفحة <Link href="/data-deletion">حذف البيانات</Link>، وننفّذ الطلب خلال 30 يوماً.</p>

      <h2>الأمان</h2>
      <p>نعزل بيانات كل شركة عن الأخرى على مستوى قاعدة البيانات، ونستخدم اتصالاً مشفّراً (HTTPS) دائماً.</p>

      <h2>حقوقك</h2>
      <p>يمكنك طلب نسخة من بياناتك أو تصحيحها أو حذفها بمراسلتنا على <span dir="ltr">{CONTACT_EMAIL}</span>.</p>

      <hr />

      <h1 dir="ltr">Privacy Policy</h1>
      <div dir="ltr" lang="en">
        <p className="muted">Last updated: {LAST_UPDATED}</p>
        <h2>Who we are</h2>
        <p>{SITE_NAME} is a service for scheduling, publishing and managing social media content, operated by {OPERATOR}. Contact: {CONTACT_EMAIL}.</p>
        <h2>Data we collect</h2>
        <p>Account data (email address and a hashed password), your company/workspace name, the content you create (captions, images, video, schedules), and, when you connect an Instagram or Facebook account, the account or Page ID and name and the access token granted by Meta. When enabled, we may also read insights of your connected accounts (such as reach and engagement) to show them to you.</p>
        <h2>How we use it</h2>
        <p>We use data only to provide the service: publishing your posts at the time you choose, showing your calendar and reports, and securing your account. We do not sell your data, do not use it for advertising, and do not share it with anyone except the infrastructure providers we rely on to run the service (database and hosting).</p>
        <h2>Meta platform data</h2>
        <p>We request only the permissions needed for each feature and use data received from Meta only to provide the feature you requested. Access tokens are stored on the server only and are never exposed to the browser. You can disconnect an account in {SITE_NAME} at any time, or revoke the app in your Facebook or Instagram settings.</p>
        <h2>Retention and deletion</h2>
        <p>We keep your data while your account is active. When you disconnect a social account we delete its access token. You can request deletion of your account and all data as described on the <Link href="/data-deletion">data deletion</Link> page; we complete requests within 30 days.</p>
        <h2>Security</h2>
        <p>Each company&apos;s data is isolated at the database level, and all connections use HTTPS.</p>
        <h2>Your rights</h2>
        <p>You may request a copy, correction or deletion of your data by emailing {CONTACT_EMAIL}.</p>
      </div>
    </main>
  );
}
