import { createFileRoute } from "@tanstack/react-router";

/**
 * Catalog import helper — calls OpenAI directly (no Lovable AI Gateway).
 *
 * Modes:
 *  - "map"     CSV/XLSX header → field mapping
 *  - "pdf"     Extract structured rows from PDF text
 *  - "enrich"  Fill DB fields not present in the source file (translations,
 *              descriptions, keywords, use cases) for a batch of rows
 */

type ColumnTarget =
  | "sku"
  | "name"
  | "price_eur"
  | "unit"
  | "category"
  | "supplier"
  | "description"
  | "ignore";

type Mapping = Record<string, ColumnTarget>;

type ExtractedRow = {
  sku: string;
  name: string;
  price_eur: number;
  unit: string;
  category: string;
  supplier?: string;
  description?: string;
};

type EnrichInput = {
  sku: string;
  name: string;
  category: string;
  unit: string;
  supplier?: string | null;
  description?: string | null;
};

type EnrichOutput = {
  sku: string;
  name_en: string;
  description: string;
  description_en: string;
  unit_en: string;
  keywords: string[];
  keywords_en: string[];
  use_cases: string[];
  use_cases_en: string[];
};

const OPENAI_URL = "https://api.openai.com/v1/chat/completions";
const MODEL = "gpt-5.4-mini";

async function callOpenAI(body: unknown) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY missing");
  const res = await fetch(OPENAI_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`OpenAI ${res.status}: ${txt.slice(0, 400)}`);
  }
  return res.json() as Promise<{
    choices: Array<{
      message: {
        content?: string | null;
        tool_calls?: Array<{ function: { name: string; arguments: string } }>;
      };
    }>;
  }>;
}

async function aiMapColumns(headers: string[], sample: string[][]): Promise<Mapping> {
  const tool = {
    type: "function" as const,
    function: {
      name: "map_columns",
      description:
        "Map each spreadsheet header to a normalized product field. Use 'ignore' for headers that don't fit.",
      parameters: {
        type: "object",
        properties: {
          mapping: {
            type: "object",
            description:
              "Keys = original headers, values one of: sku, name, price_eur, unit, category, supplier, description, ignore.",
            additionalProperties: {
              type: "string",
              enum: ["sku", "name", "price_eur", "unit", "category", "supplier", "description", "ignore"],
            },
          },
        },
        required: ["mapping"],
        additionalProperties: false,
      },
    },
  };

  const data = await callOpenAI({
    model: MODEL,
    messages: [
      {
        role: "system",
        content:
          "You map supplier-catalog spreadsheet columns to a normalized product schema. Headers may be German or English. Be conservative: only map a header if you're confident; otherwise return 'ignore'.",
      },
      {
        role: "user",
        content: `Headers: ${JSON.stringify(headers)}\n\nSample rows (first ${sample.length}):\n${sample
          .map((r) => JSON.stringify(r))
          .join("\n")}`,
      },
    ],
    tools: [tool],
    tool_choice: { type: "function", function: { name: "map_columns" } },
  });

  const call = data.choices?.[0]?.message?.tool_calls?.[0];
  if (!call) throw new Error("AI returned no tool call for mapping");
  const parsed = JSON.parse(call.function.arguments) as { mapping: Mapping };
  return parsed.mapping ?? {};
}

async function aiExtractFromPdfText(text: string, fileName: string): Promise<ExtractedRow[]> {
  const tool = {
    type: "function" as const,
    function: {
      name: "extract_products",
      description: "Extract a list of product rows from a supplier PDF catalog.",
      parameters: {
        type: "object",
        properties: {
          rows: {
            type: "array",
            items: {
              type: "object",
              properties: {
                sku: { type: "string" },
                name: { type: "string" },
                price_eur: { type: "number" },
                unit: { type: "string" },
                category: { type: "string" },
                supplier: { type: "string" },
                description: { type: "string" },
              },
              required: ["sku", "name", "price_eur", "unit", "category"],
              additionalProperties: false,
            },
          },
        },
        required: ["rows"],
        additionalProperties: false,
      },
    },
  };

  const trimmed = text.slice(0, 60_000);

  const data = await callOpenAI({
    model: MODEL,
    messages: [
      {
        role: "system",
        content:
          "You extract structured product rows from supplier PDF catalogs. Output one row per distinct article. Skip headers/footers. Be precise with SKUs and prices. Required fields (sku, name, price_eur, unit, category) must always be filled — infer a sensible category from context.",
      },
      { role: "user", content: `File: ${fileName}\n\nPDF text:\n${trimmed}` },
    ],
    tools: [tool],
    tool_choice: { type: "function", function: { name: "extract_products" } },
  });

  const call = data.choices?.[0]?.message?.tool_calls?.[0];
  if (!call) throw new Error("AI returned no tool call for extraction");
  const parsed = JSON.parse(call.function.arguments) as { rows: ExtractedRow[] };
  return parsed.rows ?? [];
}

async function aiEnrichRows(rows: EnrichInput[]): Promise<EnrichOutput[]> {
  if (rows.length === 0) return [];
  const tool = {
    type: "function" as const,
    function: {
      name: "enrich_products",
      description:
        "For each input product, fill missing catalog fields: German + English translations, a short marketing description, unit translation, search keywords, and typical construction-site use cases.",
      parameters: {
        type: "object",
        properties: {
          rows: {
            type: "array",
            items: {
              type: "object",
              properties: {
                sku: { type: "string", description: "Echo the input SKU exactly" },
                name_en: { type: "string", description: "English product name" },
                description: { type: "string", description: "1-2 sentence German product description" },
                description_en: { type: "string", description: "1-2 sentence English product description" },
                unit_en: { type: "string", description: "Unit of measure in English (e.g. piece, m, kg, box)" },
                keywords: {
                  type: "array",
                  items: { type: "string" },
                  description: "5-10 German search keywords / synonyms a foreman might say",
                },
                keywords_en: {
                  type: "array",
                  items: { type: "string" },
                  description: "5-10 English search keywords / synonyms",
                },
                use_cases: {
                  type: "array",
                  items: { type: "string" },
                  description: "2-5 short German construction-site use-case phrases",
                },
                use_cases_en: {
                  type: "array",
                  items: { type: "string" },
                  description: "2-5 short English construction-site use-case phrases",
                },
              },
              required: [
                "sku",
                "name_en",
                "description",
                "description_en",
                "unit_en",
                "keywords",
                "keywords_en",
                "use_cases",
                "use_cases_en",
              ],
              additionalProperties: false,
            },
          },
        },
        required: ["rows"],
        additionalProperties: false,
      },
    },
  };

  const data = await callOpenAI({
    model: MODEL,
    messages: [
      {
        role: "system",
        content:
          "You enrich construction-supply catalog rows. Be concise, accurate, and use professional construction terminology. Always preserve the input SKU verbatim. Output one entry per input row, in the same order.",
      },
      {
        role: "user",
        content: `Enrich these ${rows.length} products. If the input description is present, refine it rather than discard it.\n\n${JSON.stringify(rows, null, 2)}`,
      },
    ],
    tools: [tool],
    tool_choice: { type: "function", function: { name: "enrich_products" } },
  });

  const call = data.choices?.[0]?.message?.tool_calls?.[0];
  if (!call) throw new Error("AI returned no tool call for enrichment");
  const parsed = JSON.parse(call.function.arguments) as { rows: EnrichOutput[] };
  return parsed.rows ?? [];
}

export const Route = createFileRoute("/api/catalog-import")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const body = (await request.json()) as
            | { mode: "map"; headers: string[]; sample: string[][] }
            | { mode: "pdf"; text: string; fileName: string }
            | { mode: "enrich"; rows: EnrichInput[] };

          if (body.mode === "map") {
            if (!Array.isArray(body.headers) || body.headers.length === 0) {
              return Response.json({ error: "headers required" }, { status: 400 });
            }
            const mapping = await aiMapColumns(body.headers, body.sample ?? []);
            return Response.json({ mapping });
          }

          if (body.mode === "pdf") {
            if (!body.text || body.text.trim().length < 20) {
              return Response.json(
                { error: "PDF appears to be empty or scanned — no extractable text. Try Excel/CSV instead." },
                { status: 422 },
              );
            }
            const rows = await aiExtractFromPdfText(body.text, body.fileName ?? "catalog.pdf");
            return Response.json({ rows });
          }

          if (body.mode === "enrich") {
            if (!Array.isArray(body.rows) || body.rows.length === 0) {
              return Response.json({ rows: [] });
            }
            if (body.rows.length > 25) {
              return Response.json({ error: "Send at most 25 rows per enrich call" }, { status: 400 });
            }
            const enriched = await aiEnrichRows(body.rows);
            return Response.json({ rows: enriched });
          }

          return Response.json({ error: "unknown mode" }, { status: 400 });
        } catch (e) {
          const msg = e instanceof Error ? e.message : "Unknown error";
          console.error("catalog-import error:", msg);
          return Response.json({ error: msg }, { status: 500 });
        }
      },
    },
  },
});
