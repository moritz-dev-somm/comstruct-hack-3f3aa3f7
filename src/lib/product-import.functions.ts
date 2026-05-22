import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  parseExcel,
  parseCsv,
  parsePdfWithLLM,
  enrichRow,
  buildNamespacedSku,
  mapWithConcurrency,
  type ParsedRow,
} from "./product-import.server";

const parseInput = z.object({
  filename: z.string().min(1).max(255),
  mimeType: z.string().max(255).optional().nullable(),
  base64: z.string().min(1).max(8_000_000), // ~6MB binary
});

export const parseImportFile = createServerFn({ method: "POST" })
  .inputValidator((d) => parseInput.parse(d))
  .handler(async ({ data }) => {
    const lower = data.filename.toLowerCase();
    let rows: ParsedRow[] = [];
    try {
      if (lower.endsWith(".csv")) {
        rows = parseCsv(data.base64);
      } else if (lower.endsWith(".xlsx") || lower.endsWith(".xls")) {
        rows = parseExcel(data.base64);
      } else if (lower.endsWith(".pdf")) {
        rows = await parsePdfWithLLM(data.base64);
      } else {
        return { ok: false as const, error: "Unsupported file type. Use .xlsx, .xls, .csv, or .pdf." };
      }
    } catch (e) {
      return { ok: false as const, error: e instanceof Error ? e.message : String(e) };
    }
    return { ok: true as const, rows };
  });

const rowSchema = z.object({
  name: z.string().min(1).max(500),
  sku: z.string().max(200).nullable().optional(),
  category: z.string().max(200).nullable().optional(),
  unit: z.string().max(50).nullable().optional(),
  price_eur: z.number().finite().nullable().optional(),
  supplier: z.string().max(200).nullable().optional(),
  description: z.string().max(4000).nullable().optional(),
});

const commitInput = z.object({
  filename: z.string().min(1).max(255),
  mimeType: z.string().max(255).optional().nullable(),
  rows: z.array(rowSchema).min(1).max(500),
});

export const commitImport = createServerFn({ method: "POST" })
  .inputValidator((d) => commitInput.parse(d))
  .handler(async ({ data }) => {
    const { data: importRow, error: importErr } = await supabaseAdmin
      .from("product_imports")
      .insert({
        filename: data.filename,
        mime_type: data.mimeType ?? null,
        row_count: 0,
        status: "processing",
      })
      .select("id")
      .single();
    if (importErr || !importRow) {
      return { ok: false as const, error: importErr?.message ?? "Failed to create import record" };
    }
    const batchId = importRow.id;

    const enriched = await mapWithConcurrency(data.rows, 4, async (row) => enrichRow(row));

    const insertPayload = enriched
      .map((r, i) => {
        if (!r.ok) return null;
        const v = r.value;
        return {
          sku: buildNamespacedSku(batchId, data.rows[i].sku ?? null, i),
          name: v.name,
          name_en: v.name_en,
          category: v.category,
          source_category: v.source_category,
          unit: v.unit,
          unit_en: v.unit_en,
          price_eur: v.price_eur,
          supplier: v.supplier,
          description: v.description,
          description_en: v.description_en,
          keywords: v.keywords,
          keywords_en: v.keywords_en,
          attributes: v.attributes,
          use_cases: v.use_cases,
          use_cases_en: v.use_cases_en,
          enriched_at: new Date().toISOString(),
          import_batch_id: batchId,
          import_source_filename: data.filename,
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);

    const failed = enriched.filter((r) => !r.ok).length;
    let inserted = 0;

    if (insertPayload.length > 0) {
      const { error: insErr, count } = await supabaseAdmin
        .from("products")
        .insert(insertPayload, { count: "exact" });
      if (insErr) {
        await supabaseAdmin
          .from("product_imports")
          .update({ status: "failed", error: insErr.message, row_count: 0 })
          .eq("id", batchId);
        return { ok: false as const, error: insErr.message };
      }
      inserted = count ?? insertPayload.length;
    }

    await supabaseAdmin
      .from("product_imports")
      .update({
        status: failed === data.rows.length ? "failed" : "completed",
        row_count: inserted,
        error: failed > 0 ? `${failed} row(s) failed to enrich.` : null,
      })
      .eq("id", batchId);

    return { ok: true as const, batchId, inserted, failed };
  });

export const listImports = createServerFn({ method: "GET" }).handler(async () => {
  const { data, error } = await supabaseAdmin
    .from("product_imports")
    .select("id, filename, mime_type, row_count, status, error, created_at")
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) return { ok: false as const, error: error.message };
  return { ok: true as const, imports: data ?? [] };
});

const deleteInput = z.object({ id: z.string().uuid() });

export const deleteImport = createServerFn({ method: "POST" })
  .inputValidator((d) => deleteInput.parse(d))
  .handler(async ({ data }) => {
    const { error: delProdErr, count } = await supabaseAdmin
      .from("products")
      .delete({ count: "exact" })
      .eq("import_batch_id", data.id);
    if (delProdErr) return { ok: false as const, error: delProdErr.message };

    const { error: delImpErr } = await supabaseAdmin
      .from("product_imports")
      .delete()
      .eq("id", data.id);
    if (delImpErr) return { ok: false as const, error: delImpErr.message };

    return { ok: true as const, deleted: count ?? 0 };
  });
