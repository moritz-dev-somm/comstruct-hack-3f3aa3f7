import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { ArrowLeft, Check, Mail, Package, Truck, ClipboardCheck, PackageCheck, Loader2 } from "lucide-react";
import { useOrders, type Order, type OrderStatus } from "@/lib/orders";
import { formatEUR } from "@/lib/catalog";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/orders/$orderId/track")({
  component: TrackPage,
  head: () => ({ meta: [{ title: "Track order — comstruct" }] }),
});

type StepKey = "placed" | "accepted" | "preparing" | "shipped" | "received";
type StepState = "done" | "active" | "pending";

const STEPS: {
  key: StepKey;
  label: string;
  icon: typeof Check;
  description: (o: Order) => string;
}[] = [
  {
    key: "placed",
    label: "Order placed",
    icon: ClipboardCheck,
    description: (o) => `Purchase order ${o.id} created and submitted.`,
  },
  {
    key: "accepted",
    label: "Order accepted",
    icon: Mail,
    description: () =>
      "We've emailed the supplier with your purchase order. They'll confirm availability and pricing shortly — you'll see this step turn green as soon as they reply.",
  },
  {
    key: "preparing",
    label: "Order being prepared",
    icon: Package,
    description: () => "The supplier is picking and packing your items at their warehouse.",
  },
  {
    key: "shipped",
    label: "Order shipped",
    icon: Truck,
    description: () => "Your delivery is on its way to the site.",
  },
  {
    key: "received",
    label: "Order received",
    icon: PackageCheck,
    description: () => "Once everything has arrived on site, confirm receipt below.",
  },
];

function stateFor(status: OrderStatus): Record<StepKey, StepState> {
  // Pipeline mapping from order status → tracking steps.
  // "active" is the step currently in progress (next thing we're waiting on).
  switch (status) {
    case "draft":
    case "pending_pm":
    case "pending_central":
      return { placed: "done", accepted: "active", preparing: "pending", shipped: "pending", received: "pending" };
    case "approved":
      return { placed: "done", accepted: "done", preparing: "active", shipped: "pending", received: "pending" };
    case "ordered":
      return { placed: "done", accepted: "done", preparing: "done", shipped: "active", received: "pending" };
    case "delivered":
      return { placed: "done", accepted: "done", preparing: "done", shipped: "done", received: "active" };
    case "rejected":
      return { placed: "done", accepted: "pending", preparing: "pending", shipped: "pending", received: "pending" };
    case "rfq_in_progress":
      return { placed: "done", accepted: "done", preparing: "active", shipped: "pending", received: "pending" };
    case "rfq_failed":
      return { placed: "done", accepted: "active", preparing: "pending", shipped: "pending", received: "pending" };
    default:
      return { placed: "done", accepted: "pending", preparing: "pending", shipped: "pending", received: "pending" };
  }
}

function TrackPage() {
  const { orderId } = useParams({ from: "/orders/$orderId/track" });
  const { orders } = useOrders();
  const order = orders.find((o) => o.id === orderId);

  if (!order) {
    return (
      <div className="min-h-screen bg-background text-foreground">
        <Header />
        <main className="mx-auto max-w-2xl px-4 py-20 text-center">
          <p className="text-sm text-muted-foreground">Order not found.</p>
          <Link to="/orders" className="text-sm text-primary underline mt-4 inline-block">
            Back to orders
          </Link>
        </main>
      </div>
    );
  }

  const states = stateFor(order.status);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Header />
      <main className="mx-auto max-w-2xl px-4 py-6">
        <div className="rounded-lg border bg-card p-5">
          <div className="flex items-baseline justify-between gap-3 mb-1">
            <h1 className="text-lg font-semibold">{order.id}</h1>
            <span className="text-sm text-muted-foreground">{formatEUR(order.subtotal)}</span>
          </div>
          <p className="text-xs text-muted-foreground">
            {order.project} · {order.items.length} items · placed{" "}
            {new Date(order.createdAt).toLocaleString()}
          </p>
        </div>

        <ol className="mt-6 space-y-0 relative">
          {STEPS.map((step, idx) => {
            const s = states[step.key];
            const isLast = idx === STEPS.length - 1;
            const Icon = step.icon;
            return (
              <li key={step.key} className="relative flex gap-4 pb-6">
                {!isLast && (
                  <span
                    aria-hidden
                    className={cn(
                      "absolute left-5 top-10 bottom-0 w-px",
                      s === "done" ? "bg-primary" : "bg-border"
                    )}
                  />
                )}
                <div
                  className={cn(
                    "relative z-10 grid size-10 shrink-0 place-items-center rounded-full border-2",
                    s === "done" && "border-primary bg-primary text-primary-foreground",
                    s === "active" && "border-primary bg-background text-primary",
                    s === "pending" && "border-border bg-background text-muted-foreground"
                  )}
                >
                  {s === "done" ? (
                    <Check className="size-5" />
                  ) : s === "active" ? (
                    <Loader2 className="size-5 animate-spin" />
                  ) : (
                    <Icon className="size-5" />
                  )}
                </div>
                <div className="flex-1 pt-1">
                  <div className="flex items-center gap-2">
                    <h3
                      className={cn(
                        "font-medium text-sm",
                        s === "pending" && "text-muted-foreground"
                      )}
                    >
                      {step.label}
                    </h3>
                    {s === "active" && (
                      <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded-sm bg-primary/10 text-primary">
                        In progress
                      </span>
                    )}
                    {s === "done" && (
                      <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded-sm bg-primary/10 text-primary">
                        Done
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                    {step.description(order)}
                  </p>
                  {step.key === "received" && (
                    <button
                      type="button"
                      disabled
                      className="mt-3 inline-flex items-center gap-2 rounded-md border bg-muted/40 px-3 py-1.5 text-xs font-medium text-muted-foreground cursor-not-allowed"
                      title="Available once the delivery arrives on site"
                    >
                      <Check className="size-3.5" />
                      Confirm receipt
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ol>

        <div className="mt-4 flex gap-3">
          <Link
            to="/orders"
            className="text-sm text-muted-foreground hover:text-foreground underline"
          >
            View all orders
          </Link>
          <Link to="/" className="text-sm text-muted-foreground hover:text-foreground underline">
            Back to catalog
          </Link>
        </div>
      </main>
    </div>
  );
}

function Header() {
  return (
    <header className="sticky top-0 z-30 border-b bg-background/95 backdrop-blur">
      <div className="mx-auto max-w-2xl px-4 h-14 flex items-center gap-3">
        <Link
          to="/orders"
          className="grid size-9 place-items-center rounded-md hover:bg-accent"
          aria-label="Back"
        >
          <ArrowLeft className="size-5" />
        </Link>
        <div className="flex-1">
          <h1 className="font-semibold text-sm">Track order</h1>
          <p className="text-xs text-muted-foreground">Live status updates</p>
        </div>
      </div>
    </header>
  );
}
