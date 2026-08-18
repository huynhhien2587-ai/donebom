import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseServer";
import { processWorkbook, type BomData } from "@/lib/bom";

export const runtime = "nodejs";
export const maxDuration = 60;

const PREVIEW_ROWS = 8;
const MAX_FILE_BYTES = 50 * 1024 * 1024;

export async function POST(req: Request) {
  const admin = supabaseAdmin();
  const bucket = process.env.SUPABASE_BUCKET || "bom-files";
  let uploadedSourcePath: string | null = null;
  let uploadedResultPath: string | null = null;

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
    uploadedSourcePath = path;

    const { data, error } = await admin.storage.from(bucket).download(path);
    if (error || !data) throw new Error(error?.message || "Không tải được file từ Supabase.");

    const buffer = await data.arrayBuffer();
    if (buffer.byteLength > MAX_FILE_BYTES) throw new Error("File vượt giới hạn 50 MB.");

    const result: BomData = processWorkbook(buffer, filename);

    // QUAN TRỌNG: dữ liệu đầy đủ (có thể hàng chục nghìn dòng) được lưu
    // vào Supabase STORAGE dưới dạng 1 file JSON, KHÔNG ghi vào cột jsonb
    // của Postgres nữa. Ghi thẳng khối dữ liệu lớn vào Postgres dễ vượt
    // quá statement_timeout của DB (đây chính là nguyên nhân lỗi "canceling
    // statement due to statement timeout" trước đây). Storage xử lý file
    // lớn tốt hơn nhiều và không bị giới hạn thời gian như 1 câu lệnh SQL.
    uploadedResultPath = `results/${user.id}/${token}.json`;
    const resultBlob = new Blob([JSON.stringify(result)], { type: "application/json" });
    const { error: resultUploadError } = await admin.storage
      .from(bucket)
      .upload(uploadedResultPath, resultBlob, { contentType: "application/json", upsert: true });
    if (resultUploadError) throw new Error(`Lưu kết quả vào Storage thất bại: ${resultUploadError.message}`);

    // DB chỉ lưu thông tin nhẹ (không có "rows") -> ghi cực nhanh, không
    // bao giờ chạm statement_timeout dù file BOM lớn cỡ nào.
    const payload = {
      token,
      user_id: user.id,
      filename,
      total: result.total,
      columns_json: result.columns,
      groups_json: result.groups,
      result_path: uploadedResultPath,
      created_at: new Date().toISOString(),
    };
    const { error: dbError } = await admin.from("bom_jobs").upsert(payload, { onConflict: "token" });
    if (dbError) {
      // Ghi DB lỗi thì dọn luôn file result vừa tạo để tránh rác Storage.
      await admin.storage.from(bucket).remove([uploadedResultPath]).catch(() => {});
      throw new Error(`Lưu thông tin phiên vào Supabase thất bại: ${dbError.message}`);
    }

    // File BOM gốc đã đọc xong và không cần giữ lại trong Storage nữa.
    await admin.storage.from(bucket).remove([path]);

    // Chỉ trả về bản xem trước (tối đa PREVIEW_ROWS dòng) cho client, KHÔNG
    // dội toàn bộ hàng nghìn dòng qua mạng.
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
    if (uploadedSourcePath) {
      await admin.storage.from(bucket).remove([uploadedSourcePath]).catch(() => {});
    }
    if (uploadedResultPath) {
      await admin.storage.from(bucket).remove([uploadedResultPath]).catch(() => {});
    }
    return NextResponse.json({ error: e instanceof Error ? e.message : "Không xử lý được BOM." }, { status: 500 });
  }
}
