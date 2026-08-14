"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";

const MAX_FILE_MB = 50;

type Result = {
  token: string;
  filename: string;
  sheet: string;
  headerIdx: number;
  locCol: string;
  columns: string[];
  previewRows: Record<string, unknown>[];
  groups: { name: string; count: number }[];
  total: number;
};

export default function BomFilter() {
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function handleAnalyze() {
    if (!file) return setMessage("Vui lòng chọn file Excel BOM.");
    const ext = "." + (file.name.split(".").pop() || "").toLowerCase();
    if (![".xlsx", ".xlsm", ".xls"].includes(ext)) return setMessage("Chỉ hỗ trợ .xlsx, .xlsm, .xls.");
    if (file.size > MAX_FILE_MB * 1024 * 1024) {
      return setMessage(`File vượt giới hạn ${MAX_FILE_MB} MB. Vui lòng chọn file nhỏ hơn.`);
    }

    setBusy(true); setMessage("Đang xác thực phiên đăng nhập...");
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { location.href = "/auth"; return; }

      const token = crypto.randomUUID();
      // Path gắn theo user_id để khớp với RLS policy trên Storage — mỗi user
      // chỉ upload/đọc/xoá được file nằm trong thư mục của chính mình.
      const path = `uploads/${session.user.id}/${token}${ext}`;

      setMessage("Đang tải BOM lên Supabase...");
      const { error: uploadError } = await supabase.storage.from("bom-files").upload(path, file, {
        contentType: file.type || "application/octet-stream",
        upsert: false,
      });
      if (uploadError) throw uploadError;

      setMessage("Đang phân tích BOM...");
      const res = await fetch("/api/process", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ path, filename: file.name, token }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Không xử lý được BOM.");
      setResult(json);
      setMessage("Phân tích hoàn tất.");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Có lỗi xảy ra.");
    } finally { setBusy(false); }
  }

  async function download(kind: "all" | "group", group?: string) {
    if (!result) return;
    setBusy(true); setMessage("Đang tạo file Excel...");
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { location.href = "/auth"; return; }
      const res = await fetch("/api/export", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ token: result.token, kind, group }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || "Không thể xuất Excel.");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url;
      a.download = kind === "all" ? "BOM_XUONG_TAT_CA.xlsx" : `${group || "XUONG"}.xlsx`;
      a.click(); URL.revokeObjectURL(url);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Có lỗi khi xuất.");
    } finally { setBusy(false); }
  }

  return (
    <main className="app">
      <header className="topbar">
        <div><div className="brand">BOM <span>FILTER</span><em>V3</em></div><div className="subtitle">Next.js · Vercel · Supabase</div></div>
        <div className="status"><i /> {busy ? "ĐANG XỬ LÝ" : "SẴN SÀNG"}<button className="logout" onClick={()=>location.href="/history"}>Lịch sử</button><button className="logout" onClick={async()=>{await supabase.auth.signOut();location.href="/auth"}}>Đăng xuất</button></div>
      </header>
      {message && <div className="alert">⚡ <span>{message}</span></div>}
      <section className="hero">
        <div className="step"><span>01</span> NẠP FILE BOM</div>
        <p>Chọn Excel. V3 tự tìm sheet, nhận diện <b>VỊ TRÍ CẤP VẬT TƯ</b> và phân loại theo xưởng.</p>
        <label className={"drop " + (file ? "selected" : "")}>
          <input type="file" accept=".xlsx,.xlsm,.xls" onChange={e => setFile(e.target.files?.[0] || null)} />
          <div className="file-icon">↑</div>
          <strong>{file ? file.name : "CHỌN FILE BOM"}</strong>
          <small>{file ? `${(file.size / 1024 / 1024).toFixed(2)} MB · Sẵn sàng phân tích` : `Excel .xlsx · .xlsm · .xls · Tối đa ${MAX_FILE_MB}MB`}</small>
        </label>
        <button className="primary" disabled={!file || busy} onClick={handleAnalyze}>{busy ? "⏳ ĐANG XỬ LÝ..." : "⚡ PHÂN TÍCH BOM"}</button>
      </section>

      {result && <section className="results">
        <div className="result-head"><div><div className="step"><span>02</span> KẾT QUẢ PHÂN LOẠI</div><h1>{result.filename}</h1><div className="meta">Sheet: <b>{result.sheet}</b> · Header dòng <b>{result.headerIdx + 1}</b> · Cột: <b>{result.locCol}</b></div></div>
        <button className="all" onClick={() => download("all")}>⇩ XUẤT TẤT CẢ</button></div>
        <section className="stats"><div><b>{result.total.toLocaleString("vi-VN")}</b><span>TỔNG DÒNG</span></div><div><b>{result.groups.length}</b><span>NHÓM XƯỞNG</span></div><div><b>XLSX</b><span>ĐẦU RA</span></div></section>
        <section className="groups"><div className="section-title">CHỌN XƯỞNG ĐỂ TẢI FILE</div><div className="grid">{result.groups.map(g => <button className="group" key={g.name} onClick={() => download("group", g.name)}><div className="gicon">↓</div><div className="gtext"><strong>{g.name}</strong><small>{g.count.toLocaleString("vi-VN")} dòng vật tư</small></div><div className="xlsx">XLSX</div></button>)}</div></section>
        <section className="preview"><div className="section-title">XEM NHANH {result.previewRows.length} DÒNG ĐẦU</div><div className="table-wrap"><table><thead><tr>{result.columns.map(c => <th key={c}>{c}</th>)}</tr></thead><tbody>{result.previewRows.map((r, i) => <tr key={i}>{result.columns.map(c => <td key={c}>{String(r[c] ?? "")}</td>)}</tr>)}</tbody></table></div></section>
      </section>}
      <footer>BOM FILTER V3 · Chạy trên Vercel · File lưu tại Supabase · Android/PC chỉ cần trình duyệt</footer>
    </main>
  );
}
