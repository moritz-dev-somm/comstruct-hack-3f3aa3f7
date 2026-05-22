import { createFileRoute } from "@tanstack/react-router";

/**
 * Catalog import helper.
 *
 * Two modes:
 *  - mode: "map"  → input { headers, sample } → output { mapping }
 *      Used for CSV/XLSX. Client parses rows, sends a few sample rows, server asks
 *      Gemini which column corresponds to sku / name / price / unit / category / supplier.
 *
 *  - mode: "pdf"  → input { text, fileName } → output { rows: ProductRow[] }
 *      Used for PDFs (text already extracted on the client via pdfjs-dist).
 *      Gemini reads the raw text and emits structured product rows directly.
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

const GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";
const MODEL = "google/gemini-2.5-flash";

async function callGateway(body: unknown) {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) throw new Error("LOVABLE_API_KEY missing");
  const res = await fetch(GATEWAY, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`AI gateway ${res.status}: ${txt.slice(0, 300)}`);
  }
  return res.json() as Promise<{
    choices: Array<{
      message: {
        content?: string | null;
        tool_calls?: Array<{
          function: { name: string; arguments: string };
        }>;
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
              "Object where keys are the original headers and values are one of: sku, name, price_eur, unit, category, supplier, description, ignore.",
            additionalProperties: {
              type: "string",
              enum: [
                "sku",
                "name",
                "price_eur",
                "unit",
                "category",
                "supplier",
                "description",
                "ignore",
              ],
            },
          },
        },
        required: ["mapping"],
        additionalProperties: false,
      },
    },
  };

  const data = await callGateway({
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
                sku: { type: "string", description: "Supplier SKU / article number" },
                name: { type: "string" },
                price_eur: { type: "number", description: "Unit price in EUR (number only)" },
                unit: { type: "string", description: "Unit of measure, e.g. Stk, m, kg, box" },
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

  // Cap input to keep latency manageable
  const trimmed = text.slice(0, 60_000);

  const data = await callGateway({
    model: MODEL,
    messages: [
      {
        role: "system",
        content:
          "You extract structured product rows from supplier PDF catalogs. Output one row per distinct article. Skip headers/footers. Be precise with SKUs and prices. If price is per pack, still use the listed price. If a field is missing, omit the optional ones; required fields (sku, name, price_eur, unit, category) must be filled — infer a sensible category from context.",
      },
      {
        role: "user",
        content: `File: ${fileName}\n\nPDF text:\n${trimmed}`,
      },
    ],
    tools: [tool],
    tool_choice: { type: "function", function: { name: "extract_products" } },
  });

  const call = data.choices?.[0]?.message?.tool_calls?.[0];
  if (!call) throw new Error("AI returned no tool call for extraction");
  const parsed = JSON.parse(call.function.arguments) as { rows: ExtractedRow[] };
  return parsed.rows ?? [];
}

export const Route = createFileRoute("/api/catalog-import")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const body = (await request.json()) as
            | { mode: "map"; headers: string[]; sample: string[][] }
            | { mode: "pdf"; text: string; fileName: string };

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
                {
                  error:
                    "PDF appears to be empty or scanned — no extractable text. Try Excel/CSV instead.",
                },
                { status: 422 },
              );
            }
            const rows = await aiExtractFromPdfText(body.text, body.fileName ?? "catalog.pdf");
            return Response.json({ rows });
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
