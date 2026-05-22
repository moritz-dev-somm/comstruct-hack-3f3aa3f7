/**
 * Server-fn entry points for the RFQ flow. UI calls these; the heavy
 * lifting lives in `agent/rfq.server.ts`.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { startRfqForOrder, maybeDecideRfq, sweepOpenRfqs } from "@agent/rfq.server";
import { adminClient } from "@agent/agent.server";
import type { Order } from "@/lib/orders";

const itemShape = z.object({
  productId: z.string().optional(),
  name: z.string(),
  qty: z.number(),
  price: z.number(),
  unit: z.string().optional(),
  category: z.string().optional(),
  supplier: z.string().nullable().optional(),
});

const orderShape = z.object({
  id: z.string(),
  project: z.string(),
  subtotal: z.number(),
  items: z.array(itemShape),
});

/** Triggered when PM approves an order whose subtotal is ≥ RFQ threshold. */
export const startOrderRfq = createServerFn({ method: "POST" })
  .inputValidator(z.object({ order: orderShape }))
  .handler(async ({ data }) => {
    const order = data.order as unknown as Order;
    return await startRfqForOrder(order);
  });

type RfqDto = {
  id: string;
  order_id: string;
  status: string;
  deadline_at: string;
  invited_suppliers: string[];
  dominant_category: string | null;
  winner_supplier: string | null;
  winner_total_eur: number | null;
  decided_at: string | null;
  escalation_reason: string | null;
  created_at: string;
};
type QuoteDto = {
  id: string;
  supplier_name: string;
  supplier_email: string | null;
  status: string;
  unit_price_eur: number | null;
  line_total_eur: number | null;
  shipping_cost_eur: number | null;
  total_eur: number | null;
  lead_time_days: number | null;
  raw_reply_excerpt: string | null;
  received_at: string | null;
};

/** Read-side: full RFQ state (header + per-supplier quotes) for one order. */
export const getRfqForOrder = createServerFn({ method: "POST" })
  .inputValidator(z.object({ orderId: z.string().min(1) }))
  .handler(async ({ data }): Promise<{ rfq: RfqDto | null; quotes: QuoteDto[] }> => {
    const sb = adminClient();
    const { data: rfq } = await sb
      .from("rfqs")
      .select(
        "id, order_id, status, deadline_at, invited_suppliers, dominant_category, winner_supplier, winner_total_eur, decided_at, escalation_reason, created_at",
      )
      .eq("order_id", data.orderId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!rfq) return { rfq: null, quotes: [] };

    const { data: quotes } = await sb
      .from("rfq_quotes")
      .select(
        "id, supplier_name, supplier_email, status, unit_price_eur, line_total_eur, shipping_cost_eur, total_eur, lead_time_days, raw_reply_excerpt, received_at",
      )
      .eq("rfq_id", (rfq as RfqDto).id);
    return { rfq: rfq as RfqDto, quotes: (quotes ?? []) as QuoteDto[] };
  });

/** Force a decision attempt — used by webhook + tests. */
export const decideRfq = createServerFn({ method: "POST" })
  .inputValidator(z.object({ rfqId: z.string().min(1) }))
  .handler(async ({ data }) => {
    return await maybeDecideRfq(data.rfqId);
  });

/** Cron-callable sweep over open RFQs. */
export const sweepRfqs = createServerFn({ method: "POST" }).handler(async () => {
  return await sweepOpenRfqs();
});
