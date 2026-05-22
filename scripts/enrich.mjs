// Enrich products with descriptions, attributes, and use cases via OpenAI.
import { createClient } from "@supabase/supabase-js";

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

const MODEL = "gpt-5.4-mini";
const CONCURRENCY = 6;

const tool = {
  type: "function",
  function: {
    name: "save_product_info",
    description: "Save enriched product information",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        description: { type: "string", description: "1–2 sentence concise German product description for a construction site worker." },
        attributes: {
          type: "array",
          minItems: 4,
          maxItems: 12,
          description: "Category-relevant technical attributes as {key,value} pairs. snake_case keys, include units in the value (e.g. {key:'diameter', value:'4 mm'}, {key:'length', value:'40 mm'}, {key:'head_weight', value:'450 g'}, {key:'voltage', value:'18 V'}, {key:'norm', value:'EN 388'}). Choose attributes that genuinely apply to this product type.",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["key", "value"],
            properties: {
              key: { type: "string" },
              value: { type: "string" },
            },
          },
        },
        use_cases: {
          type: "array",
          minItems: 3,
          maxItems: 6,
          items: {
            type: "object",
            additionalProperties: false,
            required: ["scenario", "why"],
            properties: {
              scenario: { type: "string", description: "Short German scenario, e.g. 'Gipskarton an Holzlattung befestigen'." },
              why: { type: "string", description: "Short German reason why this product fits, e.g. 'Grobgewinde greift gut im Weichholz, TX20 verhindert Abrutschen.'" },
            },
          },
        },
      },
      required: ["description", "attributes", "use_cases"],
    },
  },
};

async function enrich(p) {
  const prompt = `Du bist Experte für Baustellenmaterial. Recherchiere das folgende Produkt und liefere strukturierte Informationen auf Deutsch.

Produkt:
- SKU: ${p.sku}
- Name: ${p.name}
- Kategorie: ${p.category}${p.source_category ? ` (Quelle: ${p.source_category})` : ""}
- Einheit: ${p.unit}
- Lieferant: ${p.supplier ?? "unbekannt"}
- Preis: ${p.price_eur} EUR

Erzeuge: (1) eine knappe Beschreibung, (2) relevante technische Attribute passend zur Produktart (Schraube → Antrieb, Durchmesser, Länge, Material, Kopfform; Hammer → Kopfgewicht, Stiel, Bauart; Bohrmaschine → Spannung, Leerlaufdrehzahl, Bohrfutter; PSA → Schutzklasse, Norm; Silikon → Volumen, Aushärtezeit, Untergrund), (3) 3–6 typische Anwendungsfälle auf der Baustelle mit kurzer Begründung, warum genau dieses Produkt passt.

Antworte ausschließlich über den Tool-Call save_product_info.`;

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [{ role: "user", content: prompt }],
      tools: [tool],
      tool_choice: { type: "function", function: { name: "save_product_info" } },
    }),
  });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  const data = await res.json();
  const call = data.choices?.[0]?.message?.tool_calls?.[0];
  if (!call) throw new Error("no tool call: " + JSON.stringify(data).slice(0, 400));
  const args = JSON.parse(call.function.arguments);

  const attrsObj = Array.isArray(args.attributes)
    ? Object.fromEntries(args.attributes.filter((a) => a && a.key).map((a) => [a.key, a.value]))
    : (args.attributes || {});
  const mergedAttrs = { ...(p.attributes || {}), ...attrsObj };
  const { error } = await sb.from("products").update({
    description: args.description,
    attributes: mergedAttrs,
    use_cases: args.use_cases,
    enriched_at: new Date().toISOString(),
  }).eq("sku", p.sku);
  if (error) throw error;
  return args;
}

const arg = process.argv[2];
let query = sb.from("products").select("*").order("category").order("sku");
if (arg === "--missing") query = query.is("enriched_at", null);
const { data: products, error } = await query;
if (error) throw error;
console.log(`Enriching ${products.length} products...`);

let done = 0, failed = 0;
async function worker(items) {
  for (const p of items) {
    try {
      const r = await enrich(p);
      done++;
      console.log(`[${done}/${products.length}] ${p.sku} ${p.name} — ${r.use_cases.length} use cases`);
    } catch (e) {
      failed++;
      console.error(`FAIL ${p.sku}: ${e.message}`);
    }
  }
}
const chunks = Array.from({ length: CONCURRENCY }, () => []);
products.forEach((p, i) => chunks[i % CONCURRENCY].push(p));
await Promise.all(chunks.map(worker));
console.log(`Done. ${done} ok, ${failed} failed.`);
