import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type RfqStatus = "open" | "decided" | "escalated";

export type RfqRow = {
  id: string;
  order_id: string;
  status: RfqStatus | string;
  deadline_at: string;
  invited_suppliers: string[];
  dominant_category: string | null;
  winner_supplier: string | null;
  winner_total_eur: number | null;
  decided_at: string | null;
  escalation_reason: string | null;
  created_at: string;
};

export type RfqQuoteRow = {
  id: string;
  rfq_id: string;
  supplier_name: string;
  supplier_email: string | null;
  status: "pending" | "quoted" | "declined" | "send_failed" | "unanswered" | string;
  unit_price_eur: number | null;
  line_total_eur: number | null;
  shipping_cost_eur: number | null;
  total_eur: number | null;
  lead_time_days: number | null;
  raw_reply_excerpt: string | null;
  received_at: string | null;
};

/**
 * Latest RFQ (if any) for each given order id, kept in sync via realtime
 * + an 8s polling fallback (matches the existing negotiations hook).
 */
export function useRfqsByOrder(orderIds: string[]): Record<string, { rfq: RfqRow; quotes: RfqQuoteRow[] }> {
  const [map, setMap] = useState<Record<string, { rfq: RfqRow; quotes: RfqQuoteRow[] }>>({});
  const key = orderIds.slice().sort().join("|");

  useEffect(() => {
    if (!orderIds.length) {
      setMap({});
      return;
    }
    let cancelled = false;

    const load = async () => {
      const { data: rfqs } = await supabase
        .from("rfqs")
        .select("*")
        .in("order_id", orderIds)
        .order("created_at", { ascending: false });
      if (cancelled || !rfqs) return;

      // Keep newest per order_id.
      const byOrder = new Map<string, RfqRow>();
      for (const r of rfqs as RfqRow[]) {
        if (!byOrder.has(r.order_id)) byOrder.set(r.order_id, r);
      }
      if (byOrder.size === 0) {
        setMap({});
        return;
      }
      const rfqIds = Array.from(byOrder.values()).map((r) => r.id);
      const { data: quotes } = await supabase
        .from("rfq_quotes")
        .select("*")
        .in("rfq_id", rfqIds);
      const byRfq = new Map<string, RfqQuoteRow[]>();
      for (const q of ((quotes ?? []) as RfqQuoteRow[])) {
        (byRfq.get(q.rfq_id) ?? byRfq.set(q.rfq_id, []).get(q.rfq_id)!).push(q);
      }
      const next: Record<string, { rfq: RfqRow; quotes: RfqQuoteRow[] }> = {};
      for (const [orderId, rfq] of byOrder) {
        next[orderId] = { rfq, quotes: byRfq.get(rfq.id) ?? [] };
      }
      setMap(next);
    };

    load();
    const t = setInterval(load, 8000);
    const channel = supabase
      .channel(`rfqs-${key}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "rfqs" }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "rfq_quotes" }, () => load())
      .subscribe();

    return () => {
      cancelled = true;
      clearInterval(t);
      supabase.removeChannel(channel);
    };
  }, [key]);

  return map;
}
