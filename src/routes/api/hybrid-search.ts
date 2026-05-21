import { createFileRoute } from "@tanstack/react-router";
import "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";

/**
 * End-of-chat hybrid search.
 *
 * Flow:
 *  1) Receive the accumulated chat history.
 *  2) Ask the LLM (via tool-calling) to extract:
 *       - extracted_category
 *       - extracted_keywords
 *       - semantic_search_string
 *  3) Embed `semantic_search_string` (1536-dim, OpenAI compatible).
 *  4) Call the `hybrid_search_materials_cheap_first` Postgres RPC.
 *  5) Return rows + extracted metadata to the client.
 *
 * This route does NOT touch /api/chat — the live conversation stream is
 * untouched; this is invoked only on the explicit "Search" trigger.
 */

type ChatMsg = { role: "user" | "assistant" | "system" | "tool"; content: string };

const CATEGORIES = [
  "Fasteners",
  "Safety",
  "Power & Light",
  "Hand Tools",
  "Anchors",
  "Sealing",
  "Measuring",
  "Other",
] as const;

function sbClient() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key =
    process.env.SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error("Supabase env missing");
  return createClient(url, key, { auth: { persistSession: false } });
}

type Extracted = {
  extracted_category: string | null;
  extracted_keywords: string[];
  semantic_search_string: string;
};

async function extractFromChat(messages: ChatMsg[]): Promise<Extracted> {
  const openaiKey = process.env.OPENAI_API_KEY;
  const useOpenAI = !!openaiKey;
  const apiKey = useOpenAI ? openaiKey! : process.env.LOVABLE_API_KEY;
  if (!apiKey) throw new Error("Missing LOVABLE_API_KEY or OPENAI_API_KEY");
  const url = useOpenAI
    ? "https://api.openai.com/v1/chat/completions"
    : "https://ai.gateway.lovable.dev/v1/chat/completions";
  const model = useOpenAI ? "gpt-5.4-mini" : "openai/gpt-5.4-mini";

  const systemPrompt = `You analyze a construction site procurement chat between a foreman and an assistant. Distill what the foreman ultimately needs to BUY. Be concise and technical — no conversational filler.

Return ONE call to extract_search_terms with:
  - extracted_category: ONE of ${CATEGORIES.map((c) => `"${c}"`).join(", ")}, or null if unclear.
  - extracted_keywords: array of short technical terms taken from the conversation (sizes like "3.5x35", "1.5mm", materials, standards, finishes, brands). Lowercase, deduplicated, max 12.
  - semantic_search_string: a clean one-line query describing what to buy (e.g. "drywall screws 3.5x35 phosphated for metal stud", "EN 388 cut-resistant work gloves size L"). No greetings, no questions.`;

  const tools = [
    {
      type: "function",
      function: {
        name: "extract_search_terms",
        description: "Extract structured search terms from the chat transcript.",
        parameters: {
          type: "object",
          properties: {
            extracted_category: {
              type: ["string", "null"],
              enum: [...CATEGORIES, null],
            },
            extracted_keywords: {
              type: "array",
              items: { type: "string" },
              maxItems: 12,
            },
            semantic_search_string: { type: "string" },
          },
          required: ["extracted_keywords", "semantic_search_string"],
          additionalProperties: false,
        },
      },
    },
  ];

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        ...messages.map((m) => ({ role: m.role, content: m.content })),
        { role: "user", content: "Now extract search terms by calling extract_search_terms." },
      ],
      tools,
      tool_choice: { type: "function", function: { name: "extract_search_terms" } },
    }),
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`Extraction failed: ${res.status} ${txt.slice(0, 200)}`);
  }
  const json = await res.json();
  const call = json.choices?.[0]?.message?.tool_calls?.[0];
  if (!call?.function?.arguments) {
    throw new Error("No extraction returned");
  }
  const parsed = JSON.parse(call.function.arguments);
  const category = typeof parsed.extracted_category === "string" ? parsed.extracted_category : null;
  return {
    extracted_category:
      category && (CATEGORIES as readonly string[]).includes(category) ? category : null,
    extracted_keywords: Array.isArray(parsed.extracted_keywords)
      ? parsed.extracted_keywords.map((s: unknown) => String(s).trim()).filter(Boolean)
      : [],
    semantic_search_string: String(parsed.semantic_search_string ?? "").trim(),
  };
}

async function embed(text: string): Promise<number[]> {
  // Lovable AI Gateway supports OpenAI 3-small at 1536 dims natively.
  const openaiKey = process.env.OPENAI_API_KEY;
  const useOpenAI = !!openaiKey;
  const apiKey = useOpenAI ? openaiKey! : process.env.LOVABLE_API_KEY;
  if (!apiKey) throw new Error("Missing LOVABLE_API_KEY or OPENAI_API_KEY");
  const url = useOpenAI
    ? "https://api.openai.com/v1/embeddings"
    : "https://ai.gateway.lovable.dev/v1/embeddings";
  const model = useOpenAI ? "text-embedding-3-small" : "openai/text-embedding-3-small";

  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model, input: text, dimensions: 1536 }),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`Embedding failed: ${res.status} ${txt.slice(0, 200)}`);
  }
  const json = await res.json();
  const vec = json.data?.[0]?.embedding;
  if (!Array.isArray(vec)) throw new Error("Bad embedding payload");
  return vec as number[];
}

export const Route = createFileRoute("/api/hybrid-search")({
  server: {
    handlers: {
      POST: async ({ request }: { request: Request }) => {
        try {
          const body = await request.json().catch(() => ({}));
          const messages: ChatMsg[] = Array.isArray(body.messages) ? body.messages : [];
          if (messages.length === 0) {
            return Response.json({ error: "messages required" }, { status: 400 });
          }

          let extracted: Extracted;
          try {
            extracted = await extractFromChat(messages);
          } catch (e) {
            console.error("extractFromChat failed, falling back", e);
            extracted = { extracted_category: null, extracted_keywords: [], semantic_search_string: "" };
          }
          // Fallback: if extractor returned nothing usable, build a query from
          // the user's own messages so we still surface something.
          if (!extracted.semantic_search_string) {
            const userText = messages
              .filter((m) => m.role === "user")
              .map((m) => m.content)
              .join(" ")
              .trim()
              .slice(0, 400);
            if (!userText) {
              return Response.json({ error: "messages required" }, { status: 400 });
            }
            extracted = { ...extracted, semantic_search_string: userText };
          }

          const embedding = await embed(extracted.semantic_search_string);

          const sb = sbClient();
          const { data, error } = await sb.rpc("hybrid_search_materials_cheap_first", {
            user_embedding: embedding as unknown as string,
            category_filter: null,
            keyword_filters:
              extracted.extracted_keywords.length > 0 ? extracted.extracted_keywords : null,
            match_count: 10,
          });

          if (error) {
            console.error("hybrid_search_materials RPC error", error);
            return Response.json({ error: error.message }, { status: 500 });
          }

          return Response.json({
            extracted,
            results: data ?? [],
          });
        } catch (e) {
          console.error("hybrid-search error", e);
          const msg = e instanceof Error ? e.message : "Unknown error";
          return Response.json({ error: msg }, { status: 500 });
        }
      },
    },
  },
});
