export type Platform = "instagram" | "facebook" | "tiktok";
export type Status = "draft" | "pending" | "scheduled" | "publishing" | "published" | "failed";
export type PostType = "post" | "story" | "reel";
export type Role = "owner" | "admin" | "editor" | "client";

export interface Org { id: string; name: string; plan: string; role: Role; suspended?: boolean; trial_ends_at?: string | null }
export interface Account { id: string; platform: Platform; handle: string; status: string; external_id: string | null; avatar_url: string | null; brand_id: string | null }
export interface Post {
  id: string; org_id: string; account_id: string | null; caption: string; first_comment: string | null;
  scheduled_at: string; status: Status; post_type: PostType; media_urls: string[];
  error: string | null; published_at: string | null; external_id: string | null; autopilot?: boolean; for_client?: boolean;
}
export interface Brand {
  id: string; name: string; industry: string; description: string; audience: string;
  tone: string; language: string; avoid: string; default_hashtags: string;
}
export interface Plan {
  id: string; name: string; sort: number; max_accounts: number; max_members: number;
  max_posts_per_account: number | null; ai_credits: number; approvals: boolean;
  max_brands: number; autopilot_posts: number;
}

export const PLATFORMS: Record<Platform, { label: string; color: string }> = {
  instagram: { label: "إنستغرام", color: "var(--instagram)" },
  facebook: { label: "فيسبوك", color: "var(--facebook)" },
  tiktok: { label: "تيك توك", color: "var(--tiktok)" },
};
export const STATUS_LABEL: Record<Status, string> = {
  draft: "مسودة",
  pending: "بانتظار الموافقة",
  scheduled: "مجدول",
  publishing: "جاري النشر",
  published: "تم النشر",
  failed: "فشل النشر",
};
export const TYPE_LABEL: Record<PostType, string> = { post: "منشور", story: "ستوري", reel: "ريلز" };
export const ROLE_LABEL: Record<Role, string> = { owner: "مالك", admin: "مدير", editor: "محرّر", client: "عميل" };
export const WEEKDAYS = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];

export const isVideo = (u: string) => /\.(mp4|mov|m4v|webm)(\?|$)/i.test(u);
export const pad = (n: number) => String(n).padStart(2, "0");
export const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const hm = (iso: string) => new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
export const toLocalInput = (d: Date) => `${ymd(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`;

/** Turns database/server error text into a friendly Arabic message. */
export function friendly(message: string): string {
  const m = message || "";
  if (m.includes("plan_limit_posts")) return "وصلت لحد المنشورات الشهري لهذا الحساب حسب خطتك.";
  if (m.includes("plan_limit_accounts")) return "وصلت لحد عدد الحسابات في خطتك.";
  if (m.includes("plan_limit_members")) return "وصلت لحد عدد الأعضاء في خطتك.";
  if (m.includes("editors_must_submit")) return "المحرّر يرسل المنشور للموافقة ولا يجدوله مباشرة.";
  if (m.includes("invite_email_mismatch")) return "هذه الدعوة لبريد آخر. سجّل الدخول بالبريد الذي وصلته عليه الدعوة.";
  if (m.includes("not_pending")) return "هذا المنشور لم يعد بانتظار الموافقة.";
  if (m.includes("forbidden")) return "ليس لديك صلاحية لهذا الإجراء.";
  if (m.includes("invite_invalid")) return "الدعوة غير صالحة أو استُخدمت من قبل.";
  if (m.includes("duplicate key") && m.includes("slug")) return "هذا الرابط مستخدم، اختر اسماً آخر.";
  return m || "حدث خطأ غير متوقع.";
}

/** Instagram only accepts JPEG images: convert PNG/WebP/etc. in the browser before upload. */
export async function toJpeg(file: File): Promise<File> {
  if (!file.type.startsWith("image/") || file.type === "image/jpeg") return file;
  try {
    const bmp = await createImageBitmap(file);
    const canvas = document.createElement("canvas");
    canvas.width = bmp.width;
    canvas.height = bmp.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bmp, 0, 0);
    const blob: Blob | null = await new Promise((r) => canvas.toBlob(r, "image/jpeg", 0.92));
    if (!blob) return file;
    return new File([blob], file.name.replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg" });
  } catch {
    return file;
  }
}

export interface ThemeItem { title: string; note: string }
export interface BrandPlan {
  id?: string; org_id: string; brand_id: string; month: string; notes: string;
  target_posts: number; target_reels: number; target_stories: number; themes: ThemeItem[];
}
export const firstOfMonth = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-01`;
export const arMonth = (d: Date) => new Intl.DateTimeFormat("ar-KW-u-nu-latn", { month: "long", year: "numeric" }).format(d);
