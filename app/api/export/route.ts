import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseServer";
import { makeAllWorkbook, makeWorkbook, safeSheet, type BomData } from "@/lib/bom";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const { token, kind, group } = await req.json();
    const admin = supabaseAdmin();
    const bucket = process.env.SUPABASE_BUCKET || "bom-files";
    const { data: { user } } = await admin.auth.getUser(req.headers.get("Authorization")?.replace("Bearer ", "") || "");
    if (!user) return NextResponse.json({ error: "Bạn cần đăng nhập." }, { status: 401 });

    const { data: job, error } = await admin
      .from("bom_jobs")
      .select("result_path")
      .eq("token", token)
      .eq("user_id", user.id)
      .single();
    if (error || !job?.result_path) throw new Error("Không tìm thấy phiên BOM. Hãy phân tích lại file.");

    // Dữ liệu đầy đủ (rows) nằm trong Storage, không phải trong Postgres.
    const { data: resultFile, error: downloadError } = await admin.storage.from(bucket).download(job.result_path);
    if (downloadError || !resultFile) throw new Error("Không tải được dữ liệu BOM đã lưu. Hãy phân tích lại file.");
    const data = JSON.parse(await resultFile.text()) as BomData;

    let out: Buffer, filename: string;
    if (kind === "all") {
      out = makeAllWorkbook(data); filename = "BOM_XUONG_TAT_CA.xlsx";
    } else {
      if (!group || !data.groups.some(g => g.name === group)) throw new Error("Không tìm thấy xưởng.");
      const rows = data.rows.filter(r => Array.isArray(r.__GROUPS__) && (r.__GROUPS__ as string[]).includes(group));
      out = makeWorkbook(rows, data.columns);
      filename = `${safeSheet(group)}.xlsx`;
    }
    return new NextResponse(new Uint8Array(out), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Không thể xuất Excel." }, { status: 500 });
  }
}
