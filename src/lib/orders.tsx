import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { CartItem } from "./cart";

/**
 * Layered on top of the existing chat-first app per the master prompt:
 * - 3-tier approval (auto / PM / Central) based on subtotal.
 * - Persistent order list in localStorage, shared by foreman (/orders)
 *   and procurement (/procurement) views.
 * - Status pipeline mirrors the prompt: draft → pending → approved
 *   → ordered → delivered. Pending is split internally into pending_pm
 *   and pending_central so the procurement inbox knows the right approver.
 */

export type ApprovalTier = "auto" | "pm" | "central";

export type OrderStatus =
  | "draft"
  | "pending_pm"
  | "pending_central"
  | "approved"
  | "ordered"
  | "delivered"
  | "rejected";

export type OrderEvent = {
  at: string; // ISO
  label: string; // human readable
  actor?: string;
};

export type Order = {
  id: string; // ORD-####
  createdAt: string;
  foreman: string;
  project: string;
  items: CartItem[];
  subtotal: number;
  tier: ApprovalTier;
  status: OrderStatus;
  approver?: string;
  rejectionReason?: string;
  history: OrderEvent[];
};

export const FOREMAN = {
  name: "Marco Bianchi",
  project: "Erlenmatt B3",
};
export const PM = { name: "Sarah Weber", role: "Project Manager" };
export const CENTRAL = { name: "Thomas Keller", role: "Central Procurement" };

/** Tier thresholds — EUR, matching the master prompt's CHF tiers. */
export const TIER_THRESHOLDS = {
  pm: 200,
  central: 2000,
} as const;

export function tierFor(subtotal: number): ApprovalTier {
  if (subtotal < TIER_THRESHOLDS.pm) return "auto";
  if (subtotal < TIER_THRESHOLDS.central) return "pm";
  return "central";
}

export function tierApprover(tier: ApprovalTier): string | undefined {
  if (tier === "pm") return PM.name;
  if (tier === "central") return CENTRAL.name;
  return undefined;
}

export function tierLabel(tier: ApprovalTier): string {
  if (tier === "auto") return "Auto-approved";
  if (tier === "pm") return `Needs PM approval — ${PM.name}`;
  return `Needs central approval — ${CENTRAL.name}`;
}

export const STATUS_META: Record<
  OrderStatus,
  { label: string; tone: "neutral" | "amber" | "green" | "blue" | "teal" | "red" }
> = {
  draft: { label: "Draft", tone: "neutral" },
  pending_pm: { label: "Pending PM", tone: "amber" },
  pending_central: { label: "Pending Central", tone: "amber" },
  approved: { label: "Approved", tone: "green" },
  ordered: { label: "Ordered", tone: "blue" },
  delivered: { label: "Delivered", tone: "teal" },
  rejected: { label: "Rejected", tone: "red" },
};

type OrdersCtx = {
  orders: Order[];
  /**
   * Create one Order per distinct supplier in the cart. Items without a
   * supplier are grouped under a single "Unassigned" order. Each order
   * gets its own ID, subtotal, tier and status — this mirrors procurement
   * reality (one PO per supplier).
   */
  createFromCart: (items: CartItem[]) => Order[];
  approve: (id: string, actor: string) => void;
  reject: (id: string, actor: string, reason: string) => void;
  advanceToDelivered: (id: string) => void;
};

const Ctx = createContext<OrdersCtx | null>(null);
const KEY = "comstruct-orders-v1";

function load(): Order[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return seedDemo();
    const parsed = JSON.parse(raw) as Order[];
    if (!Array.isArray(parsed) || parsed.length === 0) return seedDemo();
    return parsed;
  } catch {
    return seedDemo();
  }
}

/** A couple of pre-existing orders so the procurement view has content on first load. */
function seedDemo(): Order[] {
  const now = Date.now();
  const mk = (mins: number) => new Date(now - mins * 60_000).toISOString();
  const demo: Order[] = [
    {
      id: "ORD-2841",
      createdAt: mk(60 * 28),
      foreman: FOREMAN.name,
      project: FOREMAN.project,
      items: [
        { productId: "DEMO-1", name: "Drywall screws 3.5×35 (box of 500)", qty: 2, price: 8.9, category: "Fasteners", unit: "box" },
        { productId: "DEMO-2", name: "Safety gloves L", qty: 4, price: 4.8, category: "Safety", unit: "pair" },
      ],
      subtotal: 2 * 8.9 + 4 * 4.8,
      tier: "auto",
      status: "delivered",
      history: [
        { at: mk(60 * 28), label: "Submitted", actor: FOREMAN.name },
        { at: mk(60 * 28 - 1), label: "Auto-approved" },
        { at: mk(60 * 27), label: "PO sent to supplier" },
        { at: mk(60 * 4), label: "Delivered to site" },
      ],
    },
    {
      id: "ORD-2845",
      createdAt: mk(180),
      foreman: FOREMAN.name,
      project: FOREMAN.project,
      items: [
        { productId: "DEMO-3", name: "Drill bit set HSS 1–10mm", qty: 6, price: 34.9, category: "Hand Tools", unit: "set" },
        { productId: "DEMO-4", name: "Cable ties 200mm (bag of 100)", qty: 5, price: 6.2, category: "Other", unit: "bag" },
      ],
      subtotal: 6 * 34.9 + 5 * 6.2,
      tier: "pm",
      status: "pending_pm",
      approver: PM.name,
      history: [
        { at: mk(180), label: "Submitted", actor: FOREMAN.name },
        { at: mk(180), label: `Routed to ${PM.name} for approval` },
      ],
    },
  ];
  return demo;
}

function nextOrderId(orders: Order[]): string {
  const nums = orders
    .map((o) => parseInt(o.id.replace("ORD-", ""), 10))
    .filter((n) => Number.isFinite(n));
  const max = nums.length ? Math.max(...nums) : 2840;
  return `ORD-${max + 1}`;
}

export function OrdersProvider({ children }: { children: ReactNode }) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setOrders(load());
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem(KEY, JSON.stringify(orders));
  }, [orders, hydrated]);

  const createFromCart = useCallback<OrdersCtx["createFromCart"]>((items) => {
    // Group items by supplier (case-insensitive, trimmed). Items without
    // a supplier land in a single "Unassigned" bucket so they still get
    // routed somewhere visible.
    const groups = new Map<string, { display: string; items: CartItem[] }>();
    for (const it of items) {
      const display = (it.supplier && it.supplier.trim()) || "Unassigned";
      const key = display.toLowerCase();
      const g = groups.get(key) ?? { display, items: [] };
      g.items.push(it);
      groups.set(key, g);
    }

    const now = new Date().toISOString();
    let created: Order[] = [];
    setOrders((prev) => {
      let running = prev;
      const newOnes: Order[] = [];
      // Sort by supplier display for stable IDs across a single submission.
      const sortedGroups = Array.from(groups.values()).sort((a, b) =>
        a.display.localeCompare(b.display),
      );
      for (const g of sortedGroups) {
        const subtotal = g.items.reduce((s, i) => s + i.qty * i.price, 0);
        const tier = tierFor(subtotal);
        const history: OrderEvent[] = [
          { at: now, label: "Submitted", actor: FOREMAN.name },
        ];
        let status: OrderStatus;
        if (tier === "auto") {
          history.push({ at: now, label: "Auto-approved" });
          history.push({ at: now, label: `PO sent to ${g.display}` });
          status = "ordered";
        } else if (tier === "pm") {
          history.push({ at: now, label: `Routed to ${PM.name} for approval` });
          status = "pending_pm";
        } else {
          history.push({ at: now, label: `Routed to ${CENTRAL.name} for approval` });
          status = "pending_central";
        }
        const order: Order = {
          id: nextOrderId(running),
          createdAt: now,
          foreman: FOREMAN.name,
          project: FOREMAN.project,
          items: g.items.map((i) => ({ ...i })),
          subtotal,
          tier,
          status,
          approver: tierApprover(tier),
          history,
        };
        running = [order, ...running];
        newOnes.push(order);
      }
      created = newOnes;
      return running;
    });
    return created;
  }, []);

  const approve = useCallback<OrdersCtx["approve"]>((id, actor) => {
    setOrders((prev) =>
      prev.map((o) => {
        if (o.id !== id) return o;
        const now = new Date().toISOString();
        return {
          ...o,
          status: "ordered",
          history: [
            ...o.history,
            { at: now, label: "Approved", actor },
            { at: now, label: "PO sent to supplier" },
          ],
        };
      }),
    );
  }, []);

  const reject = useCallback<OrdersCtx["reject"]>((id, actor, reason) => {
    setOrders((prev) =>
      prev.map((o) => {
        if (o.id !== id) return o;
        const now = new Date().toISOString();
        return {
          ...o,
          status: "rejected",
          rejectionReason: reason,
          history: [...o.history, { at: now, label: `Rejected: ${reason}`, actor }],
        };
      }),
    );
  }, []);

  const advanceToDelivered = useCallback<OrdersCtx["advanceToDelivered"]>((id) => {
    setOrders((prev) =>
      prev.map((o) => {
        if (o.id !== id) return o;
        const now = new Date().toISOString();
        return {
          ...o,
          status: "delivered",
          history: [...o.history, { at: now, label: "Delivered to site" }],
        };
      }),
    );
  }, []);

  const value = useMemo<OrdersCtx>(
    () => ({ orders, createFromCart, approve, reject, advanceToDelivered }),
    [orders, createFromCart, approve, reject, advanceToDelivered],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useOrders() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useOrders outside OrdersProvider");
  return c;
}
