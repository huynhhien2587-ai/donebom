import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseServer";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const admin = supabaseAdmin();
  const token = req.headers.get("Authorization")?.replace("Bearer ", "") || "";
  const { data: { user } } = await admin.auth.getUser(token);
  if (!user) return NextResponse.json({ error: "Bạn cần đăng nhập." }, { status: 401 });

  // Chỉ chọn các cột cần cho danh sách lịch sử (không kéo cột "result" —
  // vốn có thể chứa hàng nghìn dòng BOM cho mỗi bản ghi).
  const { data, error } = await admin
    .from("bom_jobs")
    .select("token, filename, created_at, total")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(30);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ items: data || [] });
}
