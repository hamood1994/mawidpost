import { NextResponse } from "next/server";
import { admin } from "@/lib/server/admin";
import { runAutopilot } from "@/lib/server/autopilot";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const r = await runAutopilot(admin(), { maxPerRule: 3 });
  return NextResponse.json(r);
}
