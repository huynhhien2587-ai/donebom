import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseServer";
import { processWorkbook, type BomData } from "@/lib/bom";

export const runtime = "nodejs";
export const maxDuration = 60;

const PREVIEW_ROWS = 8;
const MAX_FILE_BYTES = 50 * 1024 * 1024;

export async function POST(req: Request) {
  const admin = supabaseAdmin();
  let storagePath: string | null = null;
  try {
    const { path, filename, token } = await req.json();
    if (!path || !filename || !token) {
      return NextResponse.json({ error: "Thiếu thông tin file." }, { status: 400 });
    }

    const { data: { user } } = await admin.auth.getUser(
      req.headers.get("Authorization")?.replace("Bearer ", "") || ""
    );
    if (!user) return NextResponse.json({ error: "Bạn cần đăng nhập." }, { status: 401 });

    // Bắt buộc file phải nằm đúng thư mục uploads/{user_id}/... để khớp RLS
    // và tránh việc xử lý nhầm file của người khác nếu path bị giả mạo.
    const expectedPrefix = `uploads/${user.id}/`;
    if (!String(path).startsWith(expectedPrefix)) {
      return NextResponse.json({ error: "Đường dẫn file không hợp lệ." }, { status: 403 });
    }
    storagePath = path;

    const { data, error } = await admin.storage
      .from(process.env.SUPABASE_BUCKET || "bom-files")
      .download(path);
    if (error || !data) throw new Error(error?.message || "Không tải được file từ Supabase.");

    const buffer = await data.arrayBuffer();
    if (buffer.byteLength > MAX_FILE_BYTES) throw new Error("File vượt giới hạn 50 MB.");

    const result: BomData = processWorkbook(buffer, filename);

    const payload = {
      token,
      user_id: user.id,
      source_path: path,
      filename,
      total: result.total,
      result,
      created_at: new Date().toISOString(),
    };
    const { error: dbError } = await admin.from("bom_jobs").upsert(payload, { onConflict: "token" });
    if (dbError) throw new Error(`Lưu kết quả Supabase thất bại: ${dbError.message}`);

    // File gốc đã được đọc và lưu kết quả vào DB, không cần giữ trong Storage
    // nữa -> dọn ngay để tránh phình dung lượng bucket theo thời gian.
    await admin.storage.from(process.env.SUPABASE_BUCKET || "bom-files").remove([path]);

    // Chỉ trả về bản xem trước (tối đa PREVIEW_ROWS dòng) cho client, KHÔNG
    // dội toàn bộ hàng nghìn dòng qua mạng — dữ liệu đầy đủ đã nằm trong
    // Supabase và sẽ được dùng lại khi export qua /api/export.
    return NextResponse.json({
      token,
      filename: result.filename,
      sheet: result.sheet,
      headerIdx: result.headerIdx,
      locCol: result.locCol,
      columns: result.columns,
      groups: result.groups,
      total: result.total,
      previewRows: result.rows.slice(0, PREVIEW_ROWS),
    });
  } catch (e) {
    // Nếu xử lý lỗi giữa chừng, vẫn cố dọn file tạm để không rác Storage.
    if (storagePath) {
      await admin.storage.from(process.env.SUPABASE_BUCKET || "bom-files").remove([storagePath]).catch(() => {});
    }
    return NextResponse.json({ error: e instanceof Error ? e.message : "Không xử lý được BOM." }, { status: 500 });
  }
}
