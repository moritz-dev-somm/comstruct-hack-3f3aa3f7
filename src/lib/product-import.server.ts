// Server-only helpers for the product database import feature.
// Parses Excel/CSV/PDF files into product rows and enriches them via OpenAI.

import * as XLSX from "xlsx";
import Papa from "papaparse";

const OPENAI_URL = "https://api.openai.com/v1/chat/completions";
const ENRICH_MODEL = "gpt-5.4-mini";

export type ParsedRow = {
  name: string;
  sku?: string | null;
  category?: string | null;
  unit?: string | null;
  price_eur?: number | null;
  supplier?: string | null;
  description?: string | null;
};

const FIELD_ALIASES: Record<keyof ParsedRow, string[]> = {
  name: ["name", "product", "product_name", "name_de", "name_en", "bezeichnung", "artikel", "artikelname", "title"],
  sku: ["sku", "artikelnummer", "art_nr", "artnr", "code", "product_code", "id", "ref", "reference"],
  category: ["category", "kategorie", "type", "typ", "group", "gruppe"],
  unit: ["unit", "einheit", "uom", "measure"],
  price_eur: ["price", "preis", "price_eur", "eur", "amount", "cost", "stueckpreis", "unit_price"],
  supplier: ["supplier", "lieferant", "vendor", "brand", "marke", "manufacturer", "hersteller"],
  description: ["description", "beschreibung", "desc", "details", "notes"],
};

function normalizeKey(k: string): string {
  return k.toLowerCase().replace(/[\s\-./]+/g, "_").replace(/[^a-z0-9_]/g, "");
}

function mapRow(raw: Record<string, unknown>): ParsedRow | null {
  const normalized: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(raw)) normalized[normalizeKey(k)] = v;

  const pick = (key: keyof ParsedRow): unknown => {
    for (const alias of FIELD_ALIASES[key]) {
      if (alias in normalized && normalized[alias] != null && normalized[alias] !== "") {
        return normalized[alias];
      }
    }
    return null;
  };

  const name = pick("name");
  if (!name || typeof name !== "string" && typeof name !== "number") return null;
  const nameStr = String(name).trim();
  if (!nameStr) return null;

  const priceRaw = pick("price_eur");
  let price: number | null = null;
  if (priceRaw != null) {
    const n = typeof priceRaw === "number" ? priceRaw : parseFloat(String(priceRaw).replace(/[^\d.,-]/g, "").replace(",", "."));
    if (Number.isFinite(n)) price = n;
  }

  const toStr = (v: unknown) => (v == null ? null : String(v).trim() || null);

  return {
    name: nameStr,
    sku: toStr(pick("sku")),
    category: toStr(pick("category")),
    unit: toStr(pick("unit")),
    price_eur: price,
    supplier: toStr(pick("supplier")),
    description: toStr(pick("description")),
  };
}

function decodeBase64(base64: string): Uint8Array {
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

export function parseExcel(base64: string): ParsedRow[] {
  const bytes = decodeBase64(base64);
  const wb = XLSX.read(bytes, { type: "array" });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) return [];
  const sheet = wb.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: null });
  return rows.map(mapRow).filter((r): r is ParsedRow => r !== null);
}

export function parseCsv(base64: string): ParsedRow[] {
  const bin = atob(base64);
  const text = new TextDecoder("utf-8").decode(new Uint8Array([...bin].map((c) => c.charCodeAt(0))));
  const result = Papa.parse<Record<string, unknown>>(text, {
    header: true,
    skipEmptyLines: true,
    dynamicTyping: true,
  });
  return (result.data || []).map(mapRow).filter((r): r is ParsedRow => r !== null);
}

export async function parsePdfWithLLM(base64: string): Promise<ParsedRow[]> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY missing");

  const tool = {
    type: "function",
    function: {
      name: "save_products",
      description: "Save extracted product rows from the PDF supplier catalog.",
      parameters: {
        type: "object",
        additionalProperties: false,
        required: ["rows"],
        properties: {
          rows: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["name"],
              properties: {
                name: { type: "string" },
                sku: { type: "string" },
                category: { type: "string" },
                unit: { type: "string" },
                price_eur: { type: "number" },
                supplier: { type: "string" },
                description: { type: "string" },
              },
            },
          },
        },
      },
    },
  };

  const res = await fetch(OPENAI_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: ENRICH_MODEL,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "Extract every product listed in this supplier catalog PDF into structured rows. Include SKU, price (EUR), unit, category, and supplier when visible. Return as many rows as the document contains.",
            },
            {
              type: "file",
              file: { filename: "catalog.pdf", file_data: `data:application/pdf;base64,${base64}` },
            },
          ],
        },
      ],
      tools: [tool],
      tool_choice: { type: "function", function: { name: "save_products" } },
    }),
  });

  if (!res.ok) throw new Error(`PDF extract failed: ${res.status} ${await res.text()}`);
  const data = await res.json();
  const call = data.choices?.[0]?.message?.tool_calls?.[0];
  if (!call) return [];
  const args = JSON.parse(call.function.arguments);
  const rows = (args.rows as ParsedRow[]) || [];
  return rows.filter((r) => r && r.name).map((r) => ({
    name: String(r.name).trim(),
    sku: r.sku ? String(r.sku).trim() : null,
    category: r.category ? String(r.category).trim() : null,
    unit: r.unit ? String(r.unit).trim() : null,
    price_eur: typeof r.price_eur === "number" ? r.price_eur : null,
    supplier: r.supplier ? String(r.supplier).trim() : null,
    description: r.description ? String(r.description).trim() : null,
  }));
}

const SITE_CATEGORIES = [
  "Fasteners", "Safety", "Hand Tools", "Power & Light", "Sealing",
  "Cut & Drill", "Abrasives", "Measuring", "Anchors", "Other",
];

export type EnrichedRow = {
  name: string;
  name_en: string;
  category: string;
  source_category: string | null;
  unit: string;
  unit_en: string;
  price_eur: number;
  supplier: string | null;
  description: string;
  description_en: string;
  keywords: string[];
  keywords_en: string[];
  attributes: Record<string, string>;
  use_cases: { scenario: string; why: string }[];
  use_cases_en: { scenario: string; why: string }[];
};

const enrichTool = {
  type: "function",
  function: {
    name: "save_product_info",
    description: "Save enriched product information",
    parameters: {
      type: "object",
      additionalProperties: false,
      required: [
        "category", "name_de", "name_en", "unit_de", "unit_en",
        "description_de", "description_en",
        "keywords_de", "keywords_en", "attributes",
        "use_cases_de", "use_cases_en",
      ],
      properties: {
        category: { type: "string", enum: SITE_CATEGORIES },
        name_de: { type: "string" },
        name_en: { type: "string" },
        unit_de: { type: "string", description: "German unit, e.g. Stk, m, kg, Pkg" },
        unit_en: { type: "string", description: "English unit, e.g. pcs, m, kg, pack" },
        description_de: { type: "string", description: "1-2 German sentences for a construction worker" },
        description_en: { type: "string", description: "1-2 English sentences for a construction worker" },
        keywords_de: { type: "array", items: { type: "string" }, minItems: 3, maxItems: 10 },
        keywords_en: { type: "array", items: { type: "string" }, minItems: 3, maxItems: 10 },
        attributes: {
          type: "array",
          minItems: 3, maxItems: 10,
          items: {
            type: "object", additionalProperties: false,
            required: ["key", "value"],
            properties: { key: { type: "string" }, value: { type: "string" } },
          },
        },
        use_cases_de: {
          type: "array", minItems: 2, maxItems: 5,
          items: {
            type: "object", additionalProperties: false,
            required: ["scenario", "why"],
            properties: { scenario: { type: "string" }, why: { type: "string" } },
          },
        },
        use_cases_en: {
          type: "array", minItems: 2, maxItems: 5,
          items: {
            type: "object", additionalProperties: false,
            required: ["scenario", "why"],
            properties: { scenario: { type: "string" }, why: { type: "string" } },
          },
        },
      },
    },
  },
};

export async function enrichRow(row: ParsedRow): Promise<EnrichedRow> {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) throw new Error("LOVABLE_API_KEY missing");

  const prompt = `You are a construction-materials expert. Enrich the following product so it can be added to a job-site catalog.

Raw product:
- Name: ${row.name}
- Source SKU: ${row.sku ?? "(none)"}
- Source category: ${row.category ?? "(none)"}
- Unit: ${row.unit ?? "(none)"}
- Price (EUR): ${row.price_eur ?? "(none)"}
- Supplier: ${row.supplier ?? "(none)"}
- Description: ${row.description ?? "(none)"}

Map the category to ONE of: ${SITE_CATEGORIES.join(", ")}. Generate German + English name, unit, description, keywords, technical attributes (with units in the value), and 2-5 typical on-site use cases. Use the source description as ground truth when provided.

Reply ONLY via the save_product_info tool call.`;

  const res = await fetch(LOVABLE_AI_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: ENRICH_MODEL,
      messages: [{ role: "user", content: prompt }],
      tools: [enrichTool],
      tool_choice: { type: "function", function: { name: "save_product_info" } },
    }),
  });
  if (!res.ok) throw new Error(`Enrich failed: ${res.status} ${await res.text()}`);
  const data = await res.json();
  const call = data.choices?.[0]?.message?.tool_calls?.[0];
  if (!call) throw new Error("Enrich: no tool call");
  const args = JSON.parse(call.function.arguments);

  const attrsObj: Record<string, string> = {};
  for (const a of args.attributes ?? []) if (a?.key) attrsObj[a.key] = String(a.value ?? "");
  if (row.sku) attrsObj.source_sku = row.sku;

  return {
    name: args.name_de || row.name,
    name_en: args.name_en || row.name,
    category: args.category || "Other",
    source_category: row.category ?? null,
    unit: args.unit_de || row.unit || "Stk",
    unit_en: args.unit_en || row.unit || "pcs",
    price_eur: typeof row.price_eur === "number" && Number.isFinite(row.price_eur) ? row.price_eur : 0,
    supplier: row.supplier ?? null,
    description: args.description_de || row.description || "",
    description_en: args.description_en || row.description || "",
    keywords: args.keywords_de ?? [],
    keywords_en: args.keywords_en ?? [],
    attributes: attrsObj,
    use_cases: args.use_cases_de ?? [],
    use_cases_en: args.use_cases_en ?? [],
  };
}

export function buildNamespacedSku(batchId: string, originalSku: string | null | undefined, index: number): string {
  const prefix = `IMP-${batchId.slice(0, 8)}`;
  const base = (originalSku || `R${index + 1}`).toString().trim().replace(/\s+/g, "-").slice(0, 40);
  return `${prefix}-${base}`;
}

export async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<Array<{ ok: true; value: R } | { ok: false; error: string }>> {
  const results: Array<{ ok: true; value: R } | { ok: false; error: string }> = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (true) {
      const idx = cursor++;
      if (idx >= items.length) return;
      try {
        results[idx] = { ok: true, value: await fn(items[idx], idx) };
      } catch (e) {
        results[idx] = { ok: false, error: e instanceof Error ? e.message : String(e) };
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}
