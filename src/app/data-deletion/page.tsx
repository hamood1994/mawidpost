import Link from "next/link";
import { CONTACT_EMAIL, LAST_UPDATED, SITE_NAME } from "@/lib/site";

export const metadata = { title: "حذف البيانات | Data Deletion" };

export default function DataDeletion() {
  return (
    <main className="doc">
      <p><Link href="/">← {SITE_NAME}</Link></p>
      <h1>حذف البيانات</h1>
      <p className="muted">آخر تحديث: {LAST_UPDATED}</p>
      <p>يمكنك حذف بياناتك من {SITE_NAME} بإحدى الطريقتين:</p>
      <h2>1. فصل حساب اجتماعي</h2>
      <p>من داخل التطبيق افصل حساب إنستغرام أو فيسبوك، فنحذف رمز الوصول الخاص به. ويمكنك أيضاً إلغاء صلاحية التطبيق من: فيسبوك ← الإعدادات ← التطبيقات ومواقع الويب، ومن إنستغرام ← الإعدادات ← التطبيقات ومواقع الويب.</p>
      <h2>2. حذف الحساب وكل البيانات</h2>
      <p>أرسل طلباً من البريد المسجّل في حسابك إلى <span dir="ltr">{CONTACT_EMAIL}</span> بعنوان &quot;حذف بياناتي&quot;. سنحذف حسابك وشركتك ومنشوراتك وملفاتك وأي رموز وصول خلال 30 يوماً ونؤكد لك بالبريد.</p>

      <hr />

      <h1 dir="ltr">Data Deletion</h1>
      <div dir="ltr" lang="en">
        <p>You can delete your data from {SITE_NAME} in either of two ways:</p>
        <h2>1. Disconnect a social account</h2>
        <p>In the app, disconnect the Instagram or Facebook account and we delete its access token. You can also revoke the app from Facebook: Settings, Apps and Websites, and from Instagram: Settings, Apps and Websites.</p>
        <h2>2. Delete your account and all data</h2>
        <p>Email {CONTACT_EMAIL} from the address registered on your account with the subject &quot;Delete my data&quot;. We will delete your account, company, posts, files and any access tokens within 30 days and confirm by email.</p>
      </div>
    </main>
  );
}
