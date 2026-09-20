import Link from "next/link";
import { CONTACT_EMAIL, LAST_UPDATED, OPERATOR, SITE_NAME } from "@/lib/site";

export const metadata = { title: "شروط الاستخدام | Terms of Service" };

export default function Terms() {
  return (
    <main className="doc">
      <p><Link href="/">← {SITE_NAME}</Link></p>
      <h1>شروط الاستخدام</h1>
      <p className="muted">آخر تحديث: {LAST_UPDATED}</p>

      <h2>الخدمة</h2>
      <p>{SITE_NAME} أداة لجدولة ونشر المحتوى على حساباتك في وسائل التواصل الاجتماعي، تشغّلها {OPERATOR}. باستخدامك للخدمة توافق على هذه الشروط.</p>
      <h2>حسابك</h2>
      <p>أنت مسؤول عن سرية بيانات دخولك وعن كل نشاط يتم عبر حسابك. يجب أن تكون مخوّلاً بإدارة الحسابات الاجتماعية التي تربطها.</p>
      <h2>المحتوى والالتزام بقواعد المنصات</h2>
      <p>أنت مسؤول عن المحتوى الذي تنشره، ويجب أن يلتزم بالقانون وبشروط Meta وTikTok وأي منصة تنشر عليها. يُمنع استخدام الخدمة للبريد المزعج أو المحتوى المضلّل أو المخالف.</p>
      <h2>التوفر والتغييرات</h2>
      <p>نسعى لتوفير الخدمة باستمرار لكننا لا نضمن عدم انقطاعها، وقد تتأثر بتغييرات تجريها المنصات الاجتماعية. قد نعدّل الخدمة أو هذه الشروط، وسنبلغك بالتغييرات الجوهرية.</p>
      <h2>الإنهاء</h2>
      <p>يمكنك إيقاف استخدام الخدمة وحذف حسابك في أي وقت، وقد نعلّق الحسابات المخالفة لهذه الشروط.</p>
      <h2>حدود المسؤولية</h2>
      <p>تُقدَّم الخدمة كما هي، ولا نتحمل مسؤولية الخسائر غير المباشرة الناتجة عن استخدامها، ضمن ما يسمح به القانون.</p>
      <h2>التواصل</h2>
      <p><span dir="ltr">{CONTACT_EMAIL}</span></p>

      <hr />

      <h1 dir="ltr">Terms of Service</h1>
      <div dir="ltr" lang="en">
        <p className="muted">Last updated: {LAST_UPDATED}</p>
        <h2>The service</h2>
        <p>{SITE_NAME} is a tool for scheduling and publishing content to your social media accounts, operated by {OPERATOR}. By using the service you agree to these terms.</p>
        <h2>Your account</h2>
        <p>You are responsible for keeping your login details secret and for all activity through your account. You must be authorised to manage any social account you connect.</p>
        <h2>Content and platform rules</h2>
        <p>You are responsible for the content you publish, which must comply with the law and with the terms of Meta, TikTok and any other platform you publish to. Spam, misleading or unlawful content is not allowed.</p>
        <h2>Availability and changes</h2>
        <p>We aim to keep the service available but do not guarantee uninterrupted operation; it may be affected by changes made by social platforms. We may update the service or these terms and will notify you of material changes.</p>
        <h2>Termination</h2>
        <p>You may stop using the service and delete your account at any time. We may suspend accounts that violate these terms.</p>
        <h2>Limitation of liability</h2>
        <p>The service is provided &quot;as is&quot;, and to the extent permitted by law we are not liable for indirect losses arising from its use.</p>
        <h2>Contact</h2>
        <p>{CONTACT_EMAIL}</p>
      </div>
    </main>
  );
}
