import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type NegotiationStatus =
  | "sent"
  | "awaiting_reply"
  | "confirmed"
  | "needs_user"
  | "declined";

export type NegotiationClassification = {
  verdict?:
    | "fully_confirmed"
    | "confirmed_with_issue"
    | "declined"
    | "needs_clarification"
    | "unclear";
  summary_en?: string;
  summary?: string;
  last_action?: string;
  last_action_reason?: string | null;
  lead_time?: string | null;
  shipping_cost_eur?: number | null;
} | null;

export type NegotiationRow = {
  id: string;
  order_id: string;
  supplier_name: string;
  subject: string | null;
  status: NegotiationStatus | string;
  needs_user_reason: string | null;
  sent_at: string;
  last_reply_at: string | null;
  confirmed_at: string | null;
  reply_excerpt: string | null;
  classification: NegotiationClassification;
  delivery_date_iso: string | null;
  delivery_date_iso_end: string | null;
  delivery_date_confidence: "high" | "medium" | "low" | "unresolved" | null;
  delivery_date_raw: string | null;
  delivery_date_needs_clarification: boolean | null;
  reject_reason: string | null;
  failover_of: string | null;
  failover_attempt: number | null;
};

/**
 * Fetch negotiations for the given orderIds and keep them in sync via
 * postgres_changes realtime + a short polling fallback. Returns a map keyed by
 * `order_id` so consumers can derive per-order supplier state cheaply.
 */
export function useNegotiationsByOrder(orderIds: string[]): Record<string, NegotiationRow[]> {
  const [byOrder, setByOrder] = useState<Record<string, NegotiationRow[]>>({});
  const key = orderIds.slice().sort().join("|");

  useEffect(() => {
    if (!orderIds.length) {
      setByOrder({});
      return;
    }
    let cancelled = false;

    const load = async () => {
      const { data, error } = await supabase
        .from("negotiations")
        .select(
          "id, order_id, supplier_name, subject, status, needs_user_reason, sent_at, last_reply_at, confirmed_at, reply_excerpt, classification, delivery_date_iso, delivery_date_iso_end, delivery_date_confidence, delivery_date_raw, delivery_date_needs_clarification, reject_reason, failover_of, failover_attempt",
        )
        .in("order_id", orderIds);
      if (cancelled || error || !data) return;
      const map: Record<string, NegotiationRow[]> = {};
      for (const row of data as NegotiationRow[]) {
        (map[row.order_id] ||= []).push(row);
      }
      setByOrder(map);
    };

    load();
    const interval = setInterval(load, 8000);

    const channel = supabase
      .channel(`negotiations-${key}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "negotiations" },
        () => load(),
      )
      .subscribe();

    return () => {
      cancelled = true;
      clearInterval(interval);
      supabase.removeChannel(channel);
    };
  }, [key]);

  return byOrder;
}
