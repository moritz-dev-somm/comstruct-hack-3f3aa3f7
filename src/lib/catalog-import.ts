import Papa from "papaparse";
import * as XLSX from "xlsx";

export type ColumnTarget =
  | "sku"
  | "name"
  | "price_eur"
  | "unit"
  | "category"
  | "supplier"
  | "description"
  | "ignore";

export type Mapping = Record<string, ColumnTarget>;

export type NormalizedRow = {
  sku: string;
  name: string;
  price_eur: number;
  unit: string;
  category: string;
  supplier: string | null;
  description: string | null;
};

export type TabularParse = {
  kind: "tabular";
  headers: string[];
  rows: string[][];
};

export type PdfParse = {
  kind: "pdf";
  text: string;
};

export type ParseResult = TabularParse | PdfParse;

/* -------------------------------------------------------------------------- */
/*  File → headers/rows or text                                               */
/* -------------------------------------------------------------------------- */

export async function parseFile(file: File): Promise<ParseResult> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".csv")) return parseCsv(file);
  if (name.endsWith(".xlsx") || name.endsWith(".xls")) return parseXlsx(file);
  if (name.endsWith(".pdf")) return parsePdf(file);
  // fall back on mime sniff
  if (file.type === "application/pdf") return parsePdf(file);
  if (file.type === "text/csv") return parseCsv(file);
  if (
    file.type === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
    file.type === "application/vnd.ms-excel"
  ) {
    return parseXlsx(file);
  }
  throw new Error(`Unsupported file type: ${file.name}`);
}

async function parseCsv(file: File): Promise<TabularParse> {
  const text = await file.text();
  const result = Papa.parse<string[]>(text, {
    skipEmptyLines: true,
  });
  const rows = (result.data as string[][]).filter((r) => r.some((c) => c && String(c).trim() !== ""));
  if (rows.length === 0) throw new Error("CSV is empty");
  const headers = rows[0].map((h) => String(h ?? "").trim());
  return { kind: "tabular", headers, rows: rows.slice(1).map((r) => r.map((c) => String(c ?? ""))) };
}

async function parseXlsx(file: File): Promise<TabularParse> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) throw new Error("Workbook has no sheets");
  const sheet = wb.Sheets[sheetName];
  const aoa = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "" });
  const rows = (aoa as unknown[][])
    .map((r) => r.map((c) => (c == null ? "" : String(c))))
    .filter((r) => r.some((c) => c.trim() !== ""));
  if (rows.length === 0) throw new Error("Sheet is empty");
  const headers = rows[0].map((h) => h.trim());
  return { kind: "tabular", headers, rows: rows.slice(1) };
}

async function parsePdf(file: File): Promise<PdfParse> {
  // Dynamic import keeps the heavy worker bundle out of initial load
  const pdfjs = await import("pdfjs-dist");
  // Use the bundled worker via CDN fallback (worker URL must be set in browsers)
  // We use the workerless legacy build by setting workerSrc to a data URL is fragile;
  // pdfjs-dist v5 supports running without a worker via `disableWorker`.
  // pdfjs-dist v5 supports a worker URL via GlobalWorkerOptions
  const opts = (pdfjs as unknown as { GlobalWorkerOptions?: { workerSrc: string } })
    .GlobalWorkerOptions;
  if (opts) {
    opts.workerSrc = new URL(
      "pdfjs-dist/build/pdf.worker.min.mjs",
      import.meta.url,
    ).toString();
  }


  const data = new Uint8Array(await file.arrayBuffer());
  const loadingTask = pdfjs.getDocument({ data });
  const pdf = await loadingTask.promise;
  let fullText = "";
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const pageText = content.items
      .map((it) => (typeof (it as { str?: unknown }).str === "string" ? (it as { str: string }).str : ""))
      .filter(Boolean)
      .join(" ");
    fullText += pageText + "\n\n";
  }
  return { kind: "pdf", text: fullText.trim() };
}

/* -------------------------------------------------------------------------- */
/*  Mapping helpers                                                           */
/* -------------------------------------------------------------------------- */

/** Apply a column mapping to all data rows to produce normalized products. */
export function applyMapping(
  headers: string[],
  rows: string[][],
  mapping: Mapping,
): NormalizedRow[] {
  const idx: Partial<Record<ColumnTarget, number>> = {};
  headers.forEach((h, i) => {
    const target = mapping[h];
    if (target && target !== "ignore" && idx[target] === undefined) idx[target] = i;
  });

  const out: NormalizedRow[] = [];
  for (const row of rows) {
    const sku = (idx.sku !== undefined ? row[idx.sku] : "").trim();
    const name = (idx.name !== undefined ? row[idx.name] : "").trim();
    if (!sku || !name) continue;
    const priceRaw = idx.price_eur !== undefined ? row[idx.price_eur] : "";
    const price = parsePrice(priceRaw);
    out.push({
      sku,
      name,
      price_eur: price,
      unit: (idx.unit !== undefined ? row[idx.unit] : "").trim() || "Stk",
      category: (idx.category !== undefined ? row[idx.category] : "").trim() || "Other",
      supplier: idx.supplier !== undefined ? row[idx.supplier]?.trim() || null : null,
      description: idx.description !== undefined ? row[idx.description]?.trim() || null : null,
    });
  }
  return out;
}

function parsePrice(raw: string): number {
  if (!raw) return 0;
  // Handle European "1.234,56" and English "1,234.56" formats
  const cleaned = String(raw)
    .replace(/[^\d,.\-]/g, "")
    .trim();
  if (!cleaned) return 0;
  // If contains both . and , — assume the last one is decimal sep
  if (cleaned.includes(",") && cleaned.includes(".")) {
    const lastComma = cleaned.lastIndexOf(",");
    const lastDot = cleaned.lastIndexOf(".");
    if (lastComma > lastDot) {
      // German format: . = thousands, , = decimal
      return Number(cleaned.replace(/\./g, "").replace(",", "."));
    }
    return Number(cleaned.replace(/,/g, ""));
  }
  if (cleaned.includes(",")) {
    // Either thousands or decimal — assume decimal if 1-2 digits after
    const parts = cleaned.split(",");
    if (parts[1] && parts[1].length <= 2) return Number(cleaned.replace(",", "."));
    return Number(cleaned.replace(/,/g, ""));
  }
  return Number(cleaned);
}
