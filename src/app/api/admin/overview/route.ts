import { NextResponse } from "next/server";
import { admin, fail, requirePlatformAdmin } from "@/lib/server/admin";

export const dynamic = "force-dynamic";

interface OrgOut {
  id: string; name: string; plan: string; suspended: boolean; trial_ends_at: string | null; created_at: string; owner_email: string;
  staff: number; clients: number; accounts: number; posts_month: number; published_month: number; failed_month: number;
}

export async function GET(req: Request) {
  try {
    await requirePlatformAdmin(req);
    const db = admin();
    const now = new Date();
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();

    const [orgs, members, accounts, posts, plans, users, failed] = await Promise.all([
      db.from("organizations").select("id, name, plan, suspended, trial_ends_at, created_at").order("created_at", { ascending: false }),
      db.from("members").select("org_id, user_id, role"),
      db.from("social_accounts").select("org_id, platform, status"),
      db.from("posts").select("org_id, status").gte("scheduled_at", monthStart).limit(50000),
      db.from("plans").select("id, name").order("sort"),
      db.auth.admin.listUsers({ page: 1, perPage: 1000 }),
      db.from("posts").select("id, org_id, error, scheduled_at").eq("status", "failed").order("scheduled_at", { ascending: false }).limit(15),
    ]);

    const emailOf = new Map<string, string>();
    for (const u of users.data?.users ?? []) emailOf.set(u.id, u.email ?? "");

    const rows: OrgOut[] = (orgs.data ?? []).map((o: { id: string; name: string; plan: string; suspended: boolean; trial_ends_at: string | null; created_at: string }) => {
      const ms = (members.data ?? []).filter((m: { org_id: string }) => m.org_id === o.id) as { user_id: string; role: string }[];
      const ps = (posts.data ?? []).filter((p: { org_id: string }) => p.org_id === o.id) as { status: string }[];
      return {
        ...o,
        owner_email: emailOf.get(ms.find((m) => m.role === "owner")?.user_id ?? "") ?? "",
        staff: ms.filter((m) => m.role !== "client").length,
        clients: ms.filter((m) => m.role === "client").length,
        accounts: (accounts.data ?? []).filter((a: { org_id: string }) => a.org_id === o.id).length,
        posts_month: ps.length,
        published_month: ps.filter((p) => p.status === "published").length,
        failed_month: ps.filter((p) => p.status === "failed").length,
      };
    });

    const orgName = new Map(rows.map((r) => [r.id, r.name]));
    return NextResponse.json({
      totals: {
        orgs: rows.length,
        users: users.data?.users.length ?? 0,
        accounts: accounts.data?.length ?? 0,
        connected: (accounts.data ?? []).filter((a: { status: string }) => a.status === "connected").length,
        published_month: rows.reduce((s, r) => s + r.published_month, 0),
        failed_month: rows.reduce((s, r) => s + r.failed_month, 0),
      },
      orgs: rows,
      plans: plans.data ?? [],
      failures: (failed.data ?? []).map((f: { id: string; org_id: string; error: string | null; scheduled_at: string }) => ({ ...f, org: orgName.get(f.org_id) ?? "" })),
    });
  } catch (e) {
    return fail(e);
  }
}
