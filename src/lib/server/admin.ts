import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

/** Service-role client. Server only: bypasses row-level security. Never import from client components. */
export function admin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new HttpError(500, "الخادم غير مهيّأ (SUPABASE_SERVICE_ROLE_KEY)");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export function fail(e: unknown) {
  if (e instanceof HttpError) return NextResponse.json({ error: e.message }, { status: e.status });
  const msg = e instanceof Error ? e.message : String(e);
  console.error("[api]", msg);
  return NextResponse.json({ error: msg }, { status: 500 });
}

export const siteUrl = () => process.env.SITE_URL || "https://mawidpost.com";

export interface AuthedUser {
  id: string;
  email: string;
}

/** Validates the Supabase access token sent by the browser as `Authorization: Bearer ...`. */
export async function requireUser(req: Request): Promise<AuthedUser> {
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) throw new HttpError(401, "سجّل الدخول أولاً");
  const { data, error } = await admin().auth.getUser(token);
  if (error || !data.user) throw new HttpError(401, "انتهت الجلسة، سجّل الدخول من جديد");
  return { id: data.user.id, email: data.user.email ?? "" };
}

export type Role = "owner" | "admin" | "editor" | "client";

export async function requireRole(userId: string, orgId: string, roles: Role[]): Promise<Role> {
  const { data } = await admin().from("members").select("role").eq("org_id", orgId).eq("user_id", userId).maybeSingle();
  const role = data?.role as Role | undefined;
  if (!role || !roles.includes(role)) throw new HttpError(403, "ليس لديك صلاحية لهذا الإجراء");
  return role;
}

/** Editors and clients only see brands they were assigned; owners/admins see all. */
export async function requireBrandAccess(userId: string, orgId: string, brandId: string | null, roles: Role[]): Promise<Role> {
  const role = await requireRole(userId, orgId, roles);
  if (role === "owner" || role === "admin") return role;
  const { data } = await admin().from("member_brands").select("brand_id").eq("org_id", orgId).eq("user_id", userId).eq("brand_id", brandId ?? "").maybeSingle();
  if (!data) throw new HttpError(403, "ليس لديك صلاحية على هذا العميل");
  return role;
}

/** Platform super-admin (the MawidPost operator). */
export async function requirePlatformAdmin(req: Request): Promise<AuthedUser> {
  const user = await requireUser(req);
  const { data } = await admin().from("platform_admins").select("user_id").eq("user_id", user.id).maybeSingle();
  if (!data) throw new HttpError(403, "هذه الصفحة لمشغّل المنصة فقط");
  return user;
}
