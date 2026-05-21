import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Bot, Inbox as InboxIcon, Send, RefreshCw, Mail } from "lucide-react";
import {
  ensureAgentInbox,
  listInboxMessages,
  sendOrderEmail,
} from "@/lib/supplier-agent.functions";
import { useOrders } from "@/lib/orders";
import { formatEUR } from "@/lib/catalog";

/**
 * Supplier-negotiation agent — base UI.
 *
 * - Provisions (or recalls) an AgentMail inbox for the agent.
 * - Lets the user pick an approved/ordered order and a supplier email, then
 *   fire off the placeholder order email.
 * - Shows the inbox so we can watch replies land.
 *
 * The reply classification + condition engine (agent/conditions.ts)
 * is ready to wire in once we have a persistence layer for Negotiation
 * records and a way to trigger polls (cron or webhook).
 */

export const Route = createFileRoute("/procurement/agent")({
  component: AgentPage,
});

const INBOX_KEY = "comstruct-agent-inbox-v1";

type StoredInbox = { inboxId: string; address: string };

function loadInbox(): StoredInbox | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(INBOX_KEY);
    return raw ? (JSON.parse(raw) as StoredInbox) : null;
  } catch {
    return null;
  }
}

function saveInbox(v: StoredInbox) {
  localStorage.setItem(INBOX_KEY, JSON.stringify(v));
}

function AgentPage() {
  const { orders } = useOrders();
  const qc = useQueryClient();
  const [inbox, setInbox] = useState<StoredInbox | null>(() => loadInbox());
  const [orderId, setOrderId] = useState<string>(orders[0]?.id ?? "");
  const [supplierName, setSupplierName] = useState("ACME Bauhandel AG");
  const [supplierEmail, setSupplierEmail] = useState("");
  const [username, setUsername] = useState("comstruct-procurement");

  const ensureFn = useServerFn(ensureAgentInbox);
  const sendFn = useServerFn(sendOrderEmail);
  const listFn = useServerFn(listInboxMessages);

  const ensureMut = useMutation({
    mutationFn: () => ensureFn({ data: { username: username || undefined } }),
    onSuccess: (res) => {
      if (res.ok) {
        const next = { inboxId: res.inboxId, address: res.address };
        saveInbox(next);
        setInbox(next);
      }
    },
  });

  const sendMut = useMutation({
    mutationFn: async () => {
      if (!inbox) throw new Error("No inbox yet");
      const order = orders.find((o) => o.id === orderId);
      if (!order) throw new Error("Pick an order");
      return sendFn({
        data: {
          inboxId: inbox.inboxId,
          supplierEmail,
          supplierName,
          order: {
            id: order.id,
            project: order.project,
            subtotal: order.subtotal,
            items: order.items.map((i) => ({
              productId: i.productId,
              name: i.name,
              qty: i.qty,
              price: i.price,
              unit: i.unit,
              category: i.category,
            })),
          },
        },
      });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["agent-inbox"] }),
  });

  const messagesQ = useQuery({
    queryKey: ["agent-inbox", inbox?.inboxId],
    enabled: !!inbox,
    queryFn: () => listFn({ data: { inboxId: inbox!.inboxId, limit: 25 } }),
    refetchInterval: 15_000,
  });

  return (
    <div className="p-6 lg:p-8 max-w-6xl space-y-6">
      <header>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Bot className="size-6 text-brand" />
          Supplier agent
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Emails suppliers, tracks replies, escalates when things go sideways.
          Base scaffolding — conditions and timeouts will plug in here.
        </p>
      </header>

      {/* Inbox setup */}
      <section className="rounded-xl border bg-card p-5 space-y-3">
        <h2 className="font-semibold flex items-center gap-2">
          <InboxIcon className="size-4" /> Agent inbox
        </h2>
        {inbox ? (
          <div className="text-sm">
            <div className="text-muted-foreground">Inbox ID</div>
            <code className="text-xs">{inbox.inboxId}</code>
            <div className="text-muted-foreground mt-2">Address</div>
            <code className="text-xs">{inbox.address}</code>
          </div>
        ) : (
          <div className="flex flex-wrap items-end gap-2">
            <label className="text-sm">
              <div className="text-xs text-muted-foreground mb-1">Inbox handle (placeholder)</div>
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="h-9 px-3 rounded-md border bg-background text-sm w-64"
                placeholder="comstruct-procurement"
              />
            </label>
            <button
              onClick={() => ensureMut.mutate()}
              disabled={ensureMut.isPending}
              className="h-9 px-4 rounded-md bg-brand text-brand-foreground text-sm font-medium disabled:opacity-50"
            >
              {ensureMut.isPending ? "Creating…" : "Provision inbox"}
            </button>
          </div>
        )}
        {ensureMut.data && !ensureMut.data.ok && (
          <p className="text-xs text-red-600">{ensureMut.data.error}</p>
        )}
      </section>

      {/* Send order email */}
      <section className="rounded-xl border bg-card p-5 space-y-3">
        <h2 className="font-semibold flex items-center gap-2">
          <Send className="size-4" /> Send order email
        </h2>
        <div className="grid sm:grid-cols-2 gap-3">
          <label className="text-sm">
            <div className="text-xs text-muted-foreground mb-1">Order</div>
            <select
              value={orderId}
              onChange={(e) => setOrderId(e.target.value)}
              className="h-9 px-2 rounded-md border bg-background text-sm w-full"
            >
              <option value="">— pick an order —</option>
              {orders.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.id} · {o.project} · {formatEUR(o.subtotal)}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <div className="text-xs text-muted-foreground mb-1">Supplier name</div>
            <input
              value={supplierName}
              onChange={(e) => setSupplierName(e.target.value)}
              className="h-9 px-3 rounded-md border bg-background text-sm w-full"
            />
          </label>
          <label className="text-sm sm:col-span-2">
            <div className="text-xs text-muted-foreground mb-1">Supplier email</div>
            <input
              type="email"
              value={supplierEmail}
              onChange={(e) => setSupplierEmail(e.target.value)}
              placeholder="orders@supplier.example"
              className="h-9 px-3 rounded-md border bg-background text-sm w-full"
            />
          </label>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => sendMut.mutate()}
            disabled={!inbox || !orderId || !supplierEmail || sendMut.isPending}
            className="h-9 px-4 rounded-md bg-brand text-brand-foreground text-sm font-medium disabled:opacity-50"
          >
            {sendMut.isPending ? "Sending…" : "Send placeholder order email"}
          </button>
          {sendMut.data?.ok && (
            <span className="text-xs text-green-600">
              Sent at {new Date(sendMut.data.sentAt).toLocaleTimeString()}
            </span>
          )}
          {sendMut.data && !sendMut.data.ok && (
            <span className="text-xs text-red-600">{sendMut.data.error}</span>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          Copy is placeholder — see <code>agent/templates.ts</code>.
          A 24h SLA timer + nudge/abort logic lives in{" "}
          <code>agent/conditions.ts</code>, ready to wire in.
        </p>
      </section>

      {/* Inbox view */}
      <section className="rounded-xl border bg-card overflow-hidden">
        <div className="px-5 py-3 border-b flex items-center justify-between">
          <h2 className="font-semibold flex items-center gap-2">
            <Mail className="size-4" /> Inbox
          </h2>
          <button
            onClick={() => messagesQ.refetch()}
            disabled={!inbox || messagesQ.isFetching}
            className="h-8 px-3 rounded-md border text-xs flex items-center gap-1.5 disabled:opacity-50"
          >
            <RefreshCw className={`size-3.5 ${messagesQ.isFetching ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>
        {!inbox ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            Provision an inbox above to start receiving supplier replies.
          </div>
        ) : messagesQ.data?.ok === false ? (
          <div className="p-8 text-center text-sm text-red-600">{messagesQ.data.error}</div>
        ) : !messagesQ.data?.messages?.length ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            No messages yet. Replies from suppliers will appear here.
          </div>
        ) : (
          <ul className="divide-y">
            {messagesQ.data.messages.map((m: { id: string; subject: string; from: string; receivedAt: string; preview: string }) => (
              <li key={m.id} className="px-5 py-3 text-sm">
                <div className="flex items-baseline justify-between gap-2">
                  <div className="font-medium truncate">{m.subject || "(no subject)"}</div>
                  <div className="text-xs text-muted-foreground shrink-0">
                    {m.receivedAt ? new Date(m.receivedAt).toLocaleString() : ""}
                  </div>
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">from {m.from}</div>
                {m.preview && (
                  <p className="text-xs text-muted-foreground mt-1 line-clamp-2 whitespace-pre-wrap">
                    {m.preview}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
