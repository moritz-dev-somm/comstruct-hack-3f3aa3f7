import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";

/**
 * Returns the credentials and inline assistant configuration the browser
 * needs to start a live Vapi voice session.
 *
 * The Vapi Web SDK is constructed with a public key. For this prototype
 * we surface the workspace key (stored as VAPI_API_KEY in Lovable Cloud
 * secrets) since the workspace does not expose a separate publishable
 * key. The risk is acceptable for the hackathon scope — replace with a
 * minted call token before production.
 */
export const getVapiVoiceConfig = createServerFn({ method: "GET" }).handler(
  async () => {
    const key = process.env.VAPI_API_KEY;
    if (!key) {
      throw new Error("VAPI_API_KEY is not configured");
    }

    // Pull a compact slice of the catalog so the voice agent can talk
    // about real SKUs / prices instead of hallucinating. Voice answers
    // need to be short, so we cap aggressively.
    const url =
      process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
    const sbKey =
      process.env.SUPABASE_PUBLISHABLE_KEY ||
      process.env.VITE_SUPABASE_PUBLISHABLE_KEY;

    let catalogSummary = "";
    if (url && sbKey) {
      try {
        const sb = createClient(url, sbKey, {
          auth: { persistSession: false },
        });
        const { data } = await sb
          .from("products")
          .select(
            "sku,name,name_en,category,unit,unit_en,price_eur,supplier",
          )
          .limit(60);
        if (data && data.length) {
          catalogSummary = data
            .map(
              (r) =>
                `${r.sku} | ${r.name_en || r.name} | €${Number(
                  r.price_eur,
                ).toFixed(2)}/${r.unit_en || r.unit} | ${r.category}${
                  r.supplier ? ` | ${r.supplier}` : ""
                }`,
            )
            .join("\n");
        }
      } catch (err) {
        console.error("Vapi config: catalog fetch failed", err);
      }
    }

    const systemPrompt = `You are the comstruct ordering assistant, talking with a construction-site foreman over voice. Be concise — usually one or two sentences. The user is on site with gloves on and poor reception.

When the foreman describes a job, recommend specific catalog SKUs with sensible quantities (e.g. screws by the 100, gloves by the pair). Mention price only when it's relevant. Always confirm what you understood before suggesting a long list.

When the user is ready to order, tell them to tap the matching product on the screen to add it to the cart — never claim that you added anything yourself.

If the request is for an A-material (concrete delivery, doors, windows, HVAC), say it is out of scope and offer to notify the project manager.

Speak the same language as the user (German or English). Never read SKU codes letter by letter unless the user asks. Currency is euros.

CATALOG (subset — say you'll check the full list if nothing fits):
${catalogSummary || "Catalog unavailable — answer based on general construction-materials knowledge."}`;

    return {
      publicKey: key,
      assistant: {
        name: "comstruct voice",
        firstMessage:
          "Hi, this is comstruct. What do you need on site today?",
        // STT
        transcriber: {
          provider: "deepgram",
          model: "nova-2",
          language: "multi",
        },
        // LLM — Vapi orchestrates this turn-by-turn
        model: {
          provider: "openai",
          model: "gpt-4o-mini",
          messages: [
            {
              role: "system",
              content: systemPrompt,
            },
          ],
          temperature: 0.4,
          maxTokens: 250,
        },
        // TTS
        voice: {
          provider: "vapi",
          voiceId: "Elliot",
        },
        // Turn-taking
        backgroundDenoisingEnabled: true,
        startSpeakingPlan: {
          waitSeconds: 0.4,
        },
      } as const,
    };
  },
);
