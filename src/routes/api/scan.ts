import { createFileRoute } from "@tanstack/react-router";
import "@tanstack/react-start";

/**
 * Image scan / classification endpoint.
 *
 * Accepts a base64 data URL of a captured photo and asks a multimodal model
 * to either decode a barcode/QR code or classify the product / product class
 * visible in the image. Returns a small structured JSON the client can turn
 * into a chat prompt for the main assistant.
 */

type ScanResult = {
  kind: "barcode" | "product" | "category" | "unknown";
  /** Decoded barcode/QR string when kind === "barcode". */
  code?: string;
  /** Best-guess specific product name (e.g. "Stanley FatMax claw hammer"). */
  product?: string;
  /** Best-guess product class (e.g. "claw hammer", "safety glasses"). */
  category?: string;
  /** One-sentence description of what's in the image. */
  description?: string;
  /** 0..1 confidence the model has in its identification. */
  confidence?: number;
};

const SCAN_TOOL = {
  type: "function" as const,
  function: {
    name: "report_scan",
    description:
      "Report what was detected in the image. Pick exactly one `kind`. " +
      "Use `barcode` only when a barcode or QR code is clearly readable. " +
      "Use `product` when you can identify a specific product (brand/model). " +
      "Use `category` when you can identify the type of item but not the exact product (e.g. 'claw hammer'). " +
      "Use `unknown` when nothing relevant is visible.",
    parameters: {
      type: "object",
      properties: {
        kind: { type: "string", enum: ["barcode", "product", "category", "unknown"] },
        code: { type: "string", description: "Decoded barcode/QR value. Only when kind=barcode." },
        product: { type: "string", description: "Specific product name when known." },
        category: { type: "string", description: "Product class / type (e.g. 'claw hammer')." },
        description: { type: "string", description: "Short factual description of what's visible." },
        confidence: { type: "number", description: "0..1" },
      },
      required: ["kind"],
      additionalProperties: false,
    },
  },
};

const SYSTEM = `You are a vision assistant for a construction-materials ordering app.
Look at the user's photo and call the report_scan tool with what you see.

Priorities:
1. If a barcode or QR code is clearly visible AND legible, decode it and set kind="barcode".
2. Otherwise, identify the most prominent object. If you recognize a specific product, set kind="product".
3. If you only recognize the type of item (e.g. hammer, drill bit, safety glasses), set kind="category".
4. If nothing construction-related or no clear object is visible, set kind="unknown".

Be honest about confidence. Never invent a barcode you cannot actually read.`;

export const Route = createFileRoute("/api/scan")({
  server: {
    handlers: {
      POST: async ({ request }: { request: Request }) => {
        try {
          const body = (await request.json().catch(() => ({}))) as { image?: string };
          const image = body.image;
          if (!image || typeof image !== "string" || !image.startsWith("data:image/")) {
            return new Response(JSON.stringify({ error: "Missing or invalid `image` (data URL)." }), {
              status: 400,
              headers: { "Content-Type": "application/json" },
            });
          }

          const apiKey = process.env.LOVABLE_API_KEY;
          if (!apiKey) {
            return new Response(JSON.stringify({ error: "AI not configured" }), {
              status: 500,
              headers: { "Content-Type": "application/json" },
            });
          }

          const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${apiKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: "openai/gpt-5-mini",
              messages: [
                { role: "system", content: SYSTEM },
                {
                  role: "user",
                  content: [
                    { type: "text", text: "Analyse this photo and call report_scan." },
                    { type: "image_url", image_url: { url: image } },
                  ],
                },
              ],
              tools: [SCAN_TOOL],
              tool_choice: { type: "function", function: { name: "report_scan" } },
            }),
          });

          if (!resp.ok) {
            const text = await resp.text();
            console.error("scan gateway error", resp.status, text);
            if (resp.status === 429) {
              return new Response(JSON.stringify({ error: "Rate limit, please try again shortly." }), {
                status: 429,
                headers: { "Content-Type": "application/json" },
              });
            }
            if (resp.status === 402) {
              return new Response(JSON.stringify({ error: "AI credits exhausted." }), {
                status: 402,
                headers: { "Content-Type": "application/json" },
              });
            }
            return new Response(JSON.stringify({ error: "AI gateway error" }), {
              status: 500,
              headers: { "Content-Type": "application/json" },
            });
          }

          const data = await resp.json();
          const call = data?.choices?.[0]?.message?.tool_calls?.[0];
          let parsed: ScanResult = { kind: "unknown" };
          if (call?.function?.arguments) {
            try {
              parsed = JSON.parse(call.function.arguments) as ScanResult;
            } catch {
              // ignore
            }
          }

          return new Response(JSON.stringify(parsed), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        } catch (e) {
          console.error("scan error", e);
          return new Response(
            JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
            { status: 500, headers: { "Content-Type": "application/json" } },
          );
        }
      },
    },
  },
});
