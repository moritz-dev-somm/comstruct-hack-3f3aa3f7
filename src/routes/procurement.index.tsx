import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Check, X } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { formatEUR } from "@/lib/catalog";
import { useOrders, PM, CENTRAL, type Order } from "@/lib/orders";
import { startNegotiationForOrder } from "@/lib/supplier-agent.functions";
import { StatusPill } from "./orders";

export const Route = createFileRoute("/procurement/")({
  component: ApprovalsInbox,
});


function ApprovalsInbox() {
  const { orders, approve, reject } = useOrders();
  const startNegotiation = useServerFn(startNegotiationForOrder);
  const pending = orders.filter(
    (o) => o.status === "pending_pm" || o.status === "pending_central",
  );
  const [activeId, setActiveId] = useState<string | null>(pending[0]?.id ?? null);
  const active = pending.find((o) => o.id === activeId) ?? null;
  const [reason, setReason] = useState("");
  const [rejecting, setRejecting] = useState(false);
  const [sending, setSending] = useState(false);


  return (
    <div className="p-6 lg:p-8 max-w-7xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Approvals inbox</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {pending.length} order{pending.length === 1 ? "" : "s"} waiting for sign-off.
          </p>
        </div>
      </div>

      {pending.length === 0 ? (
        <div className="rounded-xl border bg-card p-12 text-center text-muted-foreground">
          <Check className="size-10 mx-auto mb-3 text-emerald-500" />
          Inbox zero. No orders waiting for approval.
        </div>
      ) : (
        <div className="grid lg:grid-cols-[1fr_1.3fr] gap-4">
          <div className="rounded-xl border bg-card overflow-hidden">
            <div className="px-4 h-10 border-b bg-muted/40 text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center">
              Pending
            </div>
            <ul className="divide-y">
              {pending.map((o) => (
                <li key={o.id}>
                  <button
                    onClick={() => { setActiveId(o.id); setRejecting(false); setReason(""); }}
                    className={`w-full text-left px-4 py-3 hover:bg-accent/40 ${
                      activeId === o.id ? "bg-accent/60" : ""
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-mono font-semibold text-sm">{o.id}</span>
                      <span className="font-bold tabular-nums">{formatEUR(o.subtotal)}</span>
                    </div>
                    <div className="text-xs text-muted-foreground mt-1 flex items-center gap-2">
                      <span>{o.foreman}</span>
                      <span>·</span>
                      <span>{o.project}</span>
                    </div>
                    <div className="mt-1.5"><StatusPill status={o.status} /></div>
                  </button>
                </li>
              ))}
            </ul>
          </div>

          {active && (
            <div className="rounded-xl border bg-card flex flex-col">
              <div className="px-5 py-4 border-b flex items-start justify-between gap-3">
                <div>
                  <div className="font-mono font-semibold">{active.id}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    Submitted by {active.foreman} · {new Date(active.createdAt).toLocaleString()}
                  </div>
                </div>
                <StatusPill status={active.status} />
              </div>

              <div className="p-5 flex-1 space-y-4 overflow-y-auto">
                <div>
                  <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Line items</h4>
                  <table className="w-full text-sm">
                    <thead className="text-xs text-muted-foreground text-left">
                      <tr><th className="font-medium pb-1.5">Item</th><th className="font-medium pb-1.5">Cat</th><th className="font-medium pb-1.5 text-right">Qty</th><th className="font-medium pb-1.5 text-right">Unit</th><th className="font-medium pb-1.5 text-right">Total</th></tr>
                    </thead>
                    <tbody>
                      {active.items.map((i) => (
                        <tr key={i.productId} className="border-t">
                          <td className="py-1.5">{i.name}</td>
                          <td className="py-1.5 text-muted-foreground text-xs">{i.category}</td>
                          <td className="py-1.5 text-right tabular-nums">{i.qty}</td>
                          <td className="py-1.5 text-right tabular-nums text-muted-foreground">{formatEUR(i.price)}</td>
                          <td className="py-1.5 text-right tabular-nums font-semibold">{formatEUR(i.qty * i.price)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="rounded-md bg-muted/40 px-3 py-2 text-xs flex items-center justify-between">
                  <span className="text-muted-foreground">
                    Tier: <span className="font-semibold text-foreground">{active.tier === "pm" ? `PM approval — ${PM.name}` : `Central approval — ${CENTRAL.name}`}</span>
                  </span>
                  <span className="font-bold tabular-nums text-base">{formatEUR(active.subtotal)}</span>
                </div>
              </div>

              <div className="p-5 border-t space-y-3">
                {rejecting ? (
                  <>
                    <input
                      autoFocus
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      placeholder="Reason for rejection (required)"
                      className="w-full h-10 px-3 rounded-md border bg-background text-sm"
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={() => { setRejecting(false); setReason(""); }}
                        className="flex-1 h-10 rounded-md border text-sm font-medium hover:bg-accent"
                      >
                        Cancel
                      </button>
                      <button
                        disabled={!reason.trim()}
                        onClick={() => {
                          const approver = active.tier === "pm" ? PM.name : CENTRAL.name;
                          reject(active.id, approver, reason.trim());
                          toast.success(`${active.id} rejected`);
                          setActiveId(null);
                          setRejecting(false);
                          setReason("");
                        }}
                        className="flex-1 h-10 rounded-md bg-rose-600 text-white text-sm font-semibold disabled:opacity-40"
                      >
                        Confirm reject
                      </button>
                    </div>
                  </>
                ) : (
                  <div className="flex gap-2">
                    <button
                      onClick={() => setRejecting(true)}
                      className="flex-1 h-11 rounded-md border border-rose-500/40 text-rose-700 dark:text-rose-400 text-sm font-semibold hover:bg-rose-500/10 flex items-center justify-center gap-1.5"
                    >
                      <X className="size-4" /> Reject
                    </button>
                    <button
                      disabled={sending}
                      onClick={async () => {
                        const approver = active.tier === "pm" ? PM.name : CENTRAL.name;
                        const orderToSend = active;
                        setSending(true);
                        approve(orderToSend.id, approver);
                        const t = toast.loading(`${orderToSend.id}: contacting supplier…`);
                        try {
                          const res = (await startNegotiation({
                            data: {
                              order: {
                                id: orderToSend.id,
                                project: orderToSend.project,
                                subtotal: orderToSend.subtotal,
                                items: orderToSend.items.map((i) => ({
                                  productId: i.productId,
                                  name: i.name,
                                  qty: i.qty,
                                  price: i.price,
                                  unit: i.unit,
                                  category: i.category,
                                })),
                              },
                            },
                          })) as { ok: true; supplier: string } | { ok: false; error: string };
                          if (res?.ok) {
                            toast.success(`${orderToSend.id} approved · email sent to ${res.supplier}`, { id: t });
                          } else {
                            toast.error(`${orderToSend.id} approved but email failed: ${res?.error ?? "unknown error"}`, { id: t });
                          }
                        } catch (e) {
                          console.error("approve send email failed:", e);
                          toast.error(`${orderToSend.id} approved but email failed to start`, { id: t });
                        } finally {
                          setSending(false);
                          setActiveId(null);
                        }
                      }}
                      className="flex-1 h-11 rounded-md bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 disabled:opacity-50 flex items-center justify-center gap-1.5"
                    >
                      <Check className="size-4" /> {sending ? "Sending…" : "Approve & send"}
                    </button>

                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
