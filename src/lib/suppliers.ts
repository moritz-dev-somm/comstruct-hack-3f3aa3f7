import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { SupplierContact } from "./po-pdf";

export type SupplierRow = {
  name: string;
  email: string | null;
  phone: string | null;
  language: string | null;
};

export async function fetchSuppliers(): Promise<SupplierRow[]> {
  const { data, error } = await supabase
    .from("suppliers")
    .select("name,email,phone,language")
    .order("name");
  if (error) throw error;
  return (data ?? []) as SupplierRow[];
}

export function useSuppliers() {
  return useQuery({
    queryKey: ["suppliers"],
    queryFn: fetchSuppliers,
    staleTime: 60_000,
  });
}

/** Lower-cased name → contact map for fast lookup from PDF generator. */
export function supplierContactMap(rows: SupplierRow[] | undefined): Map<string, SupplierContact> {
  const m = new Map<string, SupplierContact>();
  for (const r of rows ?? []) {
    m.set(r.name.toLowerCase(), {
      name: r.name,
      email: r.email,
      phone: r.phone,
    });
  }
  return m;
}
