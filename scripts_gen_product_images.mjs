// Generate small thumbnail images for each product and upload to Supabase storage.
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const LOVABLE_API_KEY = process.env.LOVABLE_API_KEY;

if (!SUPABASE_URL || !SERVICE_KEY || !LOVABLE_API_KEY) {
  console.error("Missing env", { SUPABASE_URL: !!SUPABASE_URL, SERVICE_KEY: !!SERVICE_KEY, LOVABLE_API_KEY: !!LOVABLE_API_KEY });
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

const { data: products, error } = await supabase
  .from("products")
  .select("id, sku, name_en, name, category, description_en")
  .is("image_url", null)
  .order("sku");

if (error) { console.error(error); process.exit(1); }
console.log(`Generating for ${products.length} products`);

async function genImage(prompt) {
  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash-image",
      messages: [{ role: "user", content: prompt }],
      modalities: ["image", "text"],
    }),
  });
  if (!res.ok) throw new Error(`AI ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const url = data.choices?.[0]?.message?.images?.[0]?.image_url?.url;
  if (!url) throw new Error("No image returned: " + JSON.stringify(data).slice(0, 300));
  const b64 = url.split(",")[1];
  return Buffer.from(b64, "base64");
}

let ok = 0, fail = 0;
for (const p of products) {
  const name = p.name_en || p.name;
  const prompt = `Photorealistic studio product photo of a single "${name}" (${p.category}, construction/hardware item). Centered, on a clean white seamless background, soft even lighting, sharp focus, no text, no logos, no people, no props. Small thumbnail composition.`;
  try {
    const buf = await genImage(prompt);
    const path = `${p.sku}.png`;
    const up = await supabase.storage.from("product-images").upload(path, buf, {
      contentType: "image/png", upsert: true,
    });
    if (up.error) throw up.error;
    const { data: pub } = supabase.storage.from("product-images").getPublicUrl(path);
    const { error: uerr } = await supabase.from("products").update({ image_url: pub.publicUrl }).eq("id", p.id);
    if (uerr) throw uerr;
    ok++;
    console.log(`[${ok + fail}/${products.length}] OK ${p.sku} ${name}`);
  } catch (e) {
    fail++;
    console.error(`[${ok + fail}/${products.length}] FAIL ${p.sku} ${name}:`, e.message);
  }
}
console.log(`Done: ${ok} ok, ${fail} fail`);
