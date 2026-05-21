import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type UseCase = { scenario: string; why: string };

export type Product = {
  sku: string;
  name: string;
  category: string;
  sourceCategory: string | null;
  unit: string;
  price: number;
  supplier: string | null;
  consumable: string | null;
  hazardous: boolean;
  storageLocation: string | null;
  typicalSite: string | null;
  attributes: Record<string, unknown>;
  keywords: string[];
  description: string | null;
  useCases: UseCase[];
  enrichedAt: string | null;
  imageUrl: string | null;
};

export const SITE_CATEGORIES = [
  "Fasteners",
  "Safety",
  "Hand Tools",
  "Power & Light",
  "Sealing",
  "Cut & Drill",
  "Abrasives",
  "Measuring",
  "Anchors",
  "Other",
] as const;

type Row = {
  sku: string;
  name: string;
  name_en: string | null;
  category: string;
  source_category: string | null;
  unit: string;
  unit_en: string | null;
  price_eur: number | string;
  supplier: string | null;
  consumable: string | null;
  hazardous: boolean;
  storage_location: string | null;
  typical_site: string | null;
  attributes: Record<string, unknown> | null;
  keywords: string[] | null;
  keywords_en: string[] | null;
  description: string | null;
  description_en: string | null;
  use_cases: UseCase[] | null;
  use_cases_en: UseCase[] | null;
  enriched_at: string | null;
};

export function rowToProduct(r: Row): Product {
  return {
    sku: r.sku,
    name: r.name_en ?? r.name,
    category: r.category,
    sourceCategory: r.source_category,
    unit: r.unit_en ?? r.unit,
    price: typeof r.price_eur === "string" ? parseFloat(r.price_eur) : r.price_eur,
    supplier: r.supplier,
    consumable: r.consumable,
    hazardous: r.hazardous,
    storageLocation: r.storage_location,
    typicalSite: r.typical_site,
    attributes: r.attributes ?? {},
    keywords: (r.keywords_en && r.keywords_en.length > 0 ? r.keywords_en : r.keywords) ?? [],
    description: r.description_en ?? r.description,
    useCases: (r.use_cases_en && r.use_cases_en.length > 0 ? r.use_cases_en : r.use_cases) ?? [],
    enrichedAt: r.enriched_at,
  };
}


export async function fetchProducts(): Promise<Product[]> {
  const { data, error } = await supabase
    .from("products")
    .select("*")
    .order("sku", { ascending: true })
    .limit(2000);
  if (error) throw error;
  return (data as Row[]).map(rowToProduct);
}

export function useProducts() {
  return useQuery({
    queryKey: ["products"],
    queryFn: fetchProducts,
    staleTime: 30_000,
  });
}

export function findProductMentions(text: string, products: Product[]): string[] {
  const lower = text.toLowerCase();
  const found: string[] = [];
  for (const p of products) {
    if (lower.includes(p.sku.toLowerCase()) || lower.includes(p.name.toLowerCase())) {
      if (!found.includes(p.sku)) found.push(p.sku);
    }
  }
  return found;
}

export function formatEUR(n: number): string {
  return `€${n.toFixed(2)}`;
}
