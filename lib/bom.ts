import * as XLSX from "xlsx";

// ===== CHẾ ĐỘ 1 (MẶC ĐỊNH THẬT): "QUY TRÌNH GIA CÔNG" NHIỀU CỘT =====
// BOM thực tế có 1 khu vực header dạng bảng, mỗi cột là 1 xưởng
// (THCK, X. HÀN, X. SƠN, Dây điện, Lắp ráp, Kho, CPS, PDI...).
// Một dòng vật tư CÓ THỂ đi qua NHIỀU xưởng cùng lúc — cột nào có giá trị
// (thường là số thứ tự công đoạn: 1, 2, 3...) nghĩa là dòng đó CÓ đi qua
// xưởng ở cột đó. Chỉ những cột khớp với PROCESS_COLUMN_RULES dưới đây
// mới được coi là "xưởng sản xuất" cần tách BOM; các cột khác trong cùng
// khu vực (ví dụ Kho, CPS, THCK) bị bỏ qua vì không phải xưởng gia công.
const PROCESS_COLUMN_RULES: [string, string[]][] = [
  ["XƯỞNG HÀN (XH)", ["XHÀN", "XHAN", "XƯỞNGHÀN", "XUONGHAN"]],
  ["XƯỞNG SƠN", ["XSƠN", "XSON", "XƯỞNGSƠN", "XUONGSON"]],
  ["LẮP RÁP (LR)", ["LẮPRÁP", "LAPRAP", "XLẮPRÁP", "XLAPRAP"]],
  ["GIA CÔNG DÂY ĐIỆN", ["DÂYĐIỆN", "DAYDIEN", "GCDÂYĐIỆN", "GCDAYDIEN"]],
  ["GIA CÔNG CƠ KHÍ (GCCK)", ["GCCK", "GIACÔNGCƠKHÍ", "GIACONGCOKHI"]],
  ["PDI", ["PDI"]],
];

// ===== CHẾ ĐỘ 2 (DỰ PHÒNG): 1 CỘT "VỊ TRÍ CẤP VẬT TƯ" DUY NHẤT =====
// Dùng khi file BOM không có bảng "QUY TRÌNH GIA CÔNG" nhiều cột như trên,
// mà chỉ có 1 cột ghi thẳng mã xưởng cho mỗi dòng.
export const GROUP_RULES: [string, string[]][] = [
  ["XƯỞNG HÀN (XH)", ["XHÀN", "XHAN", "XƯỞNGHÀN", "XUONGHAN", "XH"]],
  ["LẮP RÁP (LR)", ["XLR", "LẮPRÁP", "LAPRAP", "XLRAP", "LR"]],
  ["XƯỞNG SƠN", ["X.SƠN", "XSON", "XƯỞNGSƠN", "XUONGSON", "SƠN"]],
  ["GIA CÔNG CƠ KHÍ (GCCK)", ["GCCK", "GIACÔNGCƠKHÍ", "GIACONGCOKHI"]],
  ["GIA CÔNG DÂY ĐIỆN", ["GCDÂYĐIỆN", "GCDAYDIEN", "GIACÔNGDÂYĐIỆN", "GIACONGDAYDIEN"]],
  ["PDI", ["PDI"]],
];

export function norm(value: unknown) {
  if (value === null || value === undefined) return "";
  return String(value).toUpperCase().trim().replace(/[\s.\-_/,:;|\\]+/g, "");
}

export function groupOf(value: unknown) {
  const s = norm(value);
  if (!s) return "";
  for (const [name, keys] of GROUP_RULES) {
    for (const key of keys) {
      const nk = norm(key);
      if (nk && (s === nk || (nk.length >= 3 && s.includes(nk)))) return name;
    }
  }
  // Không khớp xưởng nào đã cấu hình -> loại bỏ (không tạo "nhóm rác").
  return "";
}

function cleanCell(v: unknown): string | number | boolean {
  if (v === null || v === undefined) return "";
  if (typeof v === "number" || typeof v === "boolean") return v;
  return String(v);
}

function findSheet(workbook: XLSX.WorkBook, wanted = "ĐỊNH MỨC") {
  for (const s of workbook.SheetNames) if (norm(s) === norm(wanted)) return s;
  for (const s of workbook.SheetNames) {
    const ns = norm(s);
    if (ns.includes("BOM") || ns.includes("DINHMUC") || ns.includes("MUC")) return s;
  }
  return workbook.SheetNames[0];
}

function buildColumns(headerRaw: unknown[]) {
  const seen: Record<string, number> = {};
  return headerRaw.map((v, i) => {
    let name = String(v ?? "").trim();
    if (!name || name.toLowerCase().startsWith("unnamed")) name = `CỘT_${i + 1}`;
    seen[name] = (seen[name] || 0) + 1;
    if (seen[name] > 1) name = `${name}_${seen[name]}`;
    return name;
  });
}

// Quét các dòng đầu file tìm dòng header có >=2 cột khớp tên xưởng đã
// cấu hình (X.HÀN, X.SƠN, Lắp ráp, Dây điện, GCCK, PDI). Dòng có nhiều cột
// khớp nhất được chọn làm dòng header của bảng "QUY TRÌNH GIA CÔNG".
function findProcessColumnsHeader(raw: unknown[][]) {
  let best: { headerIdx: number; colMap: Map<number, string> } | null = null;
  const scanRows = Math.min(raw.length, 30);
  for (let i = 0; i < scanRows; i++) {
    const row = raw[i] || [];
    const colMap = new Map<number, string>();
    for (let j = 0; j < row.length; j++) {
      const s = norm(row[j]);
      if (!s) continue;
      for (const [name, keys] of PROCESS_COLUMN_RULES) {
        let matched = false;
        for (const key of keys) {
          const nk = norm(key);
          if (nk && (s === nk || (nk.length >= 3 && s.includes(nk)))) { matched = true; break; }
        }
        if (matched) { colMap.set(j, name); break; }
      }
    }
    if (colMap.size >= 2 && (!best || colMap.size > best.colMap.size)) {
      best = { headerIdx: i, colMap };
    }
  }
  return best;
}

function findLocationColumn(raw: unknown[][]) {
  const needles = ["VỊ TRÍ CẤP VẬT TƯ", "VI TRI CAP VAT TU", "VỊ TRÍ CẤP", "VI TRI CAP", "VỊ TRÍ", "VI TRI"];
  for (let i = 0; i < Math.min(raw.length, 100); i++) {
    for (let j = 0; j < raw[i].length; j++) {
      const text = String(raw[i][j] ?? "").toUpperCase().trim();
      if (needles.some(n => norm(n) === norm(text) || (norm(n) && norm(text).includes(norm(n))))) {
        return { headerIdx: i, colIdx: j };
      }
    }
  }
  return null;
}

export type BomData = {
  filename: string;
  sheet: string;
  headerIdx: number;
  locCol: string;
  columns: string[];
  rows: Record<string, string | number | boolean | string[]>[];
  groups: { name: string; count: number }[];
  total: number;
};

function buildFromProcessColumns(
  raw: unknown[][],
  processHeader: { headerIdx: number; colMap: Map<number, string> },
  sheet: string,
  filename: string
): BomData {
  const { headerIdx, colMap } = processHeader;
  const headerRaw = raw[headerIdx] || [];
  const columns = buildColumns(headerRaw);
  const rowsRaw = raw.slice(headerIdx + 1);

  const rows = rowsRaw
    .filter(r => r.some(v => String(v ?? "").trim() !== ""))
    .map(r => {
      const obj: Record<string, string | number | boolean | string[]> = {};
      columns.forEach((c, i) => (obj[c] = cleanCell(r[i])));
      const groupsForRow: string[] = [];
      for (const [colIdx, groupName] of colMap) {
        if (String(r[colIdx] ?? "").trim() !== "" && !groupsForRow.includes(groupName)) {
          groupsForRow.push(groupName);
        }
      }
      obj.__GROUPS__ = groupsForRow;
      return obj;
    })
    .filter(r => Array.isArray(r.__GROUPS__) && (r.__GROUPS__ as string[]).length > 0);

  if (!rows.length) {
    throw new Error(
      "Đã đọc BOM nhưng không tìm thấy dòng nào thuộc các xưởng đã cấu hình (X.HÀN, X.SƠN, Lắp ráp, Dây điện, GCCK, PDI). Kiểm tra lại khu vực 'QUY TRÌNH GIA CÔNG' trong file."
    );
  }

  const countMap = new Map<string, number>();
  for (const r of rows) for (const g of r.__GROUPS__ as string[]) countMap.set(g, (countMap.get(g) || 0) + 1);
  const groups: { name: string; count: number }[] = [];
  for (const [name, count] of countMap) groups.push({ name, count });

  return {
    filename,
    sheet,
    headerIdx,
    locCol: "QUY TRÌNH GIA CÔNG (nhiều cột xưởng)",
    columns,
    rows,
    groups,
    total: rows.length,
  };
}

function buildFromLocationColumn(raw: unknown[][], sheet: string, filename: string): BomData {
  const found = findLocationColumn(raw);
  if (!found) {
    throw new Error(
      "Không tìm thấy bảng 'QUY TRÌNH GIA CÔNG' (nhiều cột xưởng) lẫn cột 'VỊ TRÍ CẤP VẬT TƯ'. Hãy kiểm tra lại sheet/header của BOM."
    );
  }
  const { headerIdx, colIdx } = found;
  const headerRaw = raw[headerIdx] || [];
  const columns = buildColumns(headerRaw);
  if (colIdx >= columns.length) throw new Error("Không xác định được cột VỊ TRÍ CẤP VẬT TƯ.");
  const locCol = columns[colIdx];
  const rowsRaw = raw.slice(headerIdx + 1);

  const rows = rowsRaw
    .filter(r => r.some(v => String(v ?? "").trim() !== ""))
    .map(r => {
      const obj: Record<string, string | number | boolean | string[]> = {};
      columns.forEach((c, i) => (obj[c] = cleanCell(r[i])));
      const g = groupOf(r[colIdx]);
      obj.__GROUPS__ = g ? [g] : [];
      return obj;
    })
    .filter(r => Array.isArray(r.__GROUPS__) && (r.__GROUPS__ as string[]).length > 0);

  if (!rows.length) throw new Error("Đã đọc BOM nhưng không tìm thấy dòng thuộc các xưởng đã cấu hình.");

  const countMap = new Map<string, number>();
  for (const r of rows) for (const g of r.__GROUPS__ as string[]) countMap.set(g, (countMap.get(g) || 0) + 1);
  const groups: { name: string; count: number }[] = [];
  for (const [name, count] of countMap) groups.push({ name, count });

  return { filename, sheet, headerIdx, locCol, columns, rows, groups, total: rows.length };
}

export function processWorkbook(buffer: ArrayBuffer, filename: string): BomData {
  const wb = XLSX.read(buffer, { type: "array", cellDates: false, raw: true });
  if (!wb.SheetNames.length) throw new Error("File Excel không có sheet nào.");
  const sheet = findSheet(wb);
  const ws = wb.Sheets[sheet];
  const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "", raw: true }) as unknown[][];

  // Ưu tiên bảng "QUY TRÌNH GIA CÔNG" nhiều cột (đúng với cấu trúc BOM
  // thực tế của bạn). Nếu không tìm thấy, dùng phương án dự phòng: 1 cột
  // "VỊ TRÍ CẤP VẬT TƯ" duy nhất (BOM dạng cũ/khác).
  const processHeader = findProcessColumnsHeader(raw);
  if (processHeader) return buildFromProcessColumns(raw, processHeader, sheet, filename);
  return buildFromLocationColumn(raw, sheet, filename);
}

export function makeWorkbook(rows: Record<string, unknown>[], columns: string[]) {
  const cleanRows = rows.map(r => {
    const out: Record<string, unknown> = {};
    for (const c of columns) out[c] = r[c] ?? "";
    return out;
  });
  const ws = XLSX.utils.json_to_sheet(cleanRows, { header: columns });
  ws["!freeze"] = { xSplit: 0, ySplit: 1 };
  ws["!autofilter"] = { ref: XLSX.utils.encode_range({ s: { c: 0, r: 0 }, e: { c: Math.max(columns.length - 1, 0), r: cleanRows.length } }) };
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "DATA");
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

export function makeAllWorkbook(data: BomData) {
  const wb = XLSX.utils.book_new();
  for (const g of data.groups) {
    const rows = data.rows.filter(r => Array.isArray(r.__GROUPS__) && (r.__GROUPS__ as string[]).includes(g.name));
    const ws = XLSX.utils.json_to_sheet(rows.map(r => {
      const out: Record<string, unknown> = {};
      for (const c of data.columns) out[c] = r[c] ?? "";
      return out;
    }), { header: data.columns });
    XLSX.utils.book_append_sheet(wb, ws, safeSheet(g.name));
  }
  const summary = XLSX.utils.json_to_sheet(data.groups.map(g => ({ "Xưởng": g.name, "Số dòng": g.count })));
  XLSX.utils.book_append_sheet(wb, summary, "TỔNG HỢP");
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

export function safeSheet(name: string) {
  return String(name).replace(/[:\\/?*\[\]]/g, "_").slice(0, 31) || "XUONG";
}
