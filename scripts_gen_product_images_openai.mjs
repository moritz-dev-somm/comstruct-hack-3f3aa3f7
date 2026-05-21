// Generate product thumbnails via OpenAI gpt-image-1 (low quality) and upload to Supabase.
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

if (!SUPABASE_URL || !SERVICE_KEY || !OPENAI_API_KEY) {
  console.error("Missing env", {
    SUPABASE_URL: !!SUPABASE_URL,
    SERVICE_KEY: !!SERVICE_KEY,
    OPENAI_API_KEY: !!OPENAI_API_KEY,
  });
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

const { data: products, error } = await supabase
  .from("products")
  .select("id, sku, name_en, name, category, description_en")
  .is("image_url", null)
  .order("sku");

if (error) { console.error(error); process.exit(1); }
console.log(`Generating for ${products.length} products via gpt-image-1 (low quality)`);

async function genImage(prompt) {
  const res = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "gpt-image-1",
      prompt,
      n: 1,
      size: "1024x1024",
      quality: "low",
    }),
  });
  if (!res.ok) throw new Error(`OpenAI ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  const b64 = data.data?.[0]?.b64_json;
  if (!b64) throw new Error("No image returned: " + JSON.stringify(data).slice(0, 300));
  return Buffer.from(b64, "base64");
}

async function processOne(p, idx, total) {
  const name = p.name_en || p.name;
  const prompt = `Photorealistic studio product photo of a single "${name}" (${p.category}, construction or hardware item). Centered, clean seamless white background, soft even lighting, sharp focus, no text, no logos, no people, no props. Catalog thumbnail composition.`;
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
    console.log(`[${idx}/${total}] OK  ${p.sku} ${name}`);
    return true;
  } catch (e) {
    console.error(`[${idx}/${total}] FAIL ${p.sku} ${name}: ${e.message}`);
    return false;
  }
}

// Concurrency pool
const CONCURRENCY = 4;
let cursor = 0, ok = 0, fail = 0;
const total = products.length;

await Promise.all(
  Array.from({ length: CONCURRENCY }, async () => {
    while (true) {
      const i = cursor++;
      if (i >= total) return;
      const success = await processOne(products[i], i + 1, total);
      if (success) ok++; else fail++;
    }
  })
);

console.log(`Done: ${ok} ok, ${fail} fail`);
