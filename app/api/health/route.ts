import { NextResponse } from "next/server";
export const runtime = "nodejs";
export async function GET() { return NextResponse.json({ status: "ok", app: "BOM FILTER V3", stack: "Next.js + Vercel + Supabase", time: new Date().toISOString() }); }
