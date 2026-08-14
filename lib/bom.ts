import * as XLSX from "xlsx";

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
  const original = value == null ? "" : String(value).trim();
  const s = norm(value);
  if (!s) return "";
  for (const [name, keys] of GROUP_RULES) {
    for (const key of keys) {
      const nk = norm(key);
      if (nk && (s === nk || (nk.length >= 3 && s.includes(nk)))) return name;
    }
  }
  return original;
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

function findLocationColumn(raw: unknown[][]) {
  const needles = ["VỊ TRÍ CẤP VẬT TƯ", "VI TRI CAP VAT TU", "VỊ TRÍ CẤP", "VI TRI CAP", "VỊ TRÍ", "VI TRI"];
  for (let i = 0; i < Math.min(raw.length, 100); i++) {
    for (let j = 0; j < raw[i].length; j++) {
      const text = String(raw[i][j] ?? "").toUpperCase().trim();
      if (needles.some(n => norm(n) === norm(text) || norm(n) && norm(text).includes(norm(n)))) {
        return { headerIdx: i, colIdx: j };
      }
    }
  }
  throw new Error("Không tìm thấy cột 'VỊ TRÍ CẤP VẬT TƯ'. Hãy kiểm tra sheet/header của BOM.");
}

export type BomData = {
  filename: string;
  sheet: string;
  headerIdx: number;
  locCol: string;
  columns: string[];
  rows: Record<string, string | number | boolean>[];
  groups: { name: string; count: number }[];
  total: number;
};

export function processWorkbook(buffer: ArrayBuffer, filename: string): BomData {
  const wb = XLSX.read(buffer, { type: "array", cellDates: false, raw: true });
  if (!wb.SheetNames.length) throw new Error("File Excel không có sheet nào.");
  const sheet = findSheet(wb);
  const ws = wb.Sheets[sheet];
  const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "", raw: true }) as unknown[][];
  const { headerIdx, colIdx } = findLocationColumn(raw);
  const rowsRaw = raw.slice(headerIdx + 1);
  const headerRaw = raw[headerIdx] || [];
  const seen: Record<string, number> = {};
  const columns = headerRaw.map((v, i) => {
    let name = String(v ?? "").trim();
    if (!name || name.toLowerCase().startsWith("unnamed")) name = `CỘT_${i + 1}`;
    seen[name] = (seen[name] || 0) + 1;
    if (seen[name] > 1) name = `${name}_${seen[name]}`;
    return name;
  });
  if (colIdx >= columns.length) throw new Error("Không xác định được cột VỊ TRÍ CẤP VẬT TƯ.");

  const locCol = columns[colIdx];
  const rows = rowsRaw
    .filter(r => r.some(v => String(v ?? "").trim() !== ""))
    .map(r => {
      const obj: Record<string, string | number | boolean> = {};
      columns.forEach((c, i) => obj[c] = cleanCell(r[i]));
      obj.__GROUP__ = groupOf(r[colIdx]);
      return obj;
    })
    .filter(r => String(r.__GROUP__ || "") !== "");

  if (!rows.length) throw new Error("Đã đọc BOM nhưng không tìm thấy dòng thuộc các xưởng đã cấu hình.");

  const groups: { name: string; count: number }[] = [];
  const countMap = new Map<string, number>();
  for (const r of rows) countMap.set(String(r.__GROUP__), (countMap.get(String(r.__GROUP__)) || 0) + 1);
  for (const [name, count] of countMap) groups.push({ name, count });

  return { filename, sheet, headerIdx, locCol, columns, rows, groups, total: rows.length };
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
    const rows = data.rows.filter(r => r.__GROUP__ === g.name);
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
