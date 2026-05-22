import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import {
  Bot, RefreshCw, Mail, X, ChevronDown, ChevronRight, Send,
  Inbox as InboxIcon, CheckCircle2, AlertTriangle, XCircle, HelpCircle, Circle,
  Clock, UserRound, ShieldAlert, Database,
} from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ImportDatabaseTab } from "@/components/ImportDatabaseTab";
import {
  listInboxMessages,
  getInboxMessage,
  listNegotiationsForInbox,
  ensureAgentInbox,
  approveNegotiation,
  declineAndReplaceNegotiation,
  humanFollowupNegotiation,
} from "@/lib/supplier-agent.functions";

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
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(INBOX_KEY, JSON.stringify(v));
  } catch {
    /* ignore */
  }
}

type InboxMessage = {
  id: string;
  threadId: string | null;
  subject: string;
  from: string;
  to?: string[];
  receivedAt: string;
  preview: string;
  labels?: string[];
};

type Thread = {
  key: string;
  subject: string;
  messages: InboxMessage[];
  lastAt: string;
  supplierName: string;
  hasInbound: boolean;
  hasOutbound: boolean;
};

/** Strip Re:/Fwd: prefixes (in several common languages) for fallback grouping. */
function normalizeSubject(s: string): string {
  return s
    .replace(/^(\s*(re|fwd|fw|aw|wg|sv|rv|tr|res)\s*:\s*)+/i, "")
    .trim()
    .toLowerCase();
}

function parseEmail(s: string): { name: string; email: string } {
  const m = s.match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/);
  if (m) return { name: m[1].trim() || m[2], email: m[2].toLowerCase() };
  return { name: s.trim(), email: s.trim().toLowerCase() };
}

function isOutbound(msg: InboxMessage, inboxAddress: string): boolean {
  const inbox = inboxAddress.toLowerCase();
  if (parseEmail(msg.from).email === inbox) return true;
  // AgentMail tags outgoing mail; treat as a hint.
  return (msg.labels ?? []).some((l) => /^(sent|outbound|outgoing)$/i.test(l));
}

function buildThreads(messages: InboxMessage[], inboxAddress: string): Thread[] {
  const byKey = new Map<string, Thread>();
  for (const m of messages) {
    const key = m.threadId || `subj:${normalizeSubject(m.subject || "(no subject)")}`;
    const out = isOutbound(m, inboxAddress);
    let t = byKey.get(key);
    if (!t) {
      t = {
        key,
        subject: m.subject || "(no subject)",
        messages: [],
        lastAt: m.receivedAt,
        supplierName: "",
        hasInbound: false,
        hasOutbound: false,
      };
      byKey.set(key, t);
    }
    t.messages.push(m);
    if (m.receivedAt && (!t.lastAt || m.receivedAt > t.lastAt)) t.lastAt = m.receivedAt;
    if (!t.subject || normalizeSubject(t.subject) === "") t.subject = m.subject || t.subject;
    if (out) t.hasOutbound = true;
    else t.hasInbound = true;
  }

  for (const t of byKey.values()) {
    // Sort messages newest → oldest so the latest reply is always on top.
    t.messages.sort((a, b) => (a.receivedAt > b.receivedAt ? -1 : 1));
    // Supplier name = the first non-inbox party we see.
    const supplier = t.messages
      .map((m) => (isOutbound(m, inboxAddress) ? (m.to?.[0] ?? "") : m.from))
      .map(parseEmail)
      .find((p) => p.email && p.email !== inboxAddress.toLowerCase());
    t.supplierName = supplier?.name || supplier?.email || "Unknown supplier";
  }

  return Array.from(byKey.values()).sort((a, b) => (a.lastAt > b.lastAt ? -1 : 1));
}

type Verdict =
  | "fully_confirmed"
  | "confirmed_with_issue"
  | "declined"
  | "needs_clarification"
  | "unclear";

/** Operational status: what is happening right now with this negotiation. */
type NegStatus =
  | "sent"
  | "awaiting_reply"
  | "following_up"
  | "clarifying"
  | "answering_questions"
  | "confirmed"
  | "needs_user"
  | "declined_replaced";

type NegotiationFull = {
  id: string;
  order_id: string;
  project: string | null;
  thread_id: string | null;
  reply_message_id: string | null;
  message_id: string | null;
  last_reply_at: string | null;
  sent_at: string;
  status: NegStatus | string | null;
  supplier_name: string | null;
  supplier_email: string | null;
  supplier_language: string | null;
  subject: string | null;
  needs_user_reason: string | null;
  inbox_id: string | null;
  classification: {
    verdict?: Verdict;
    summary_en?: string;
    summary?: string;
    lead_time?: string | null;
    shipping_cost_eur?: number | null;
    last_action?: string;
    last_action_reason?: string | null;
  } | null;
};

const STATUS_META: Record<
  NegStatus,
  { label: string; cls: string; Icon: typeof CheckCircle2 }
> = {
  sent: {
    label: "Sent",
    cls: "border-border bg-muted text-muted-foreground",
    Icon: Send,
  },
  awaiting_reply: {
    label: "Waiting on supplier",
    cls: "border-border bg-muted text-muted-foreground",
    Icon: Clock,
  },
  following_up: {
    label: "Following up",
    cls: "border-sky-500/40 bg-sky-500/10 text-sky-700",
    Icon: Send,
  },
  clarifying: {
    label: "Clarifying",
    cls: "border-sky-500/40 bg-sky-500/10 text-sky-700",
    Icon: HelpCircle,
  },
  answering_questions: {
    label: "Answered questions",
    cls: "border-sky-500/40 bg-sky-500/10 text-sky-700",
    Icon: HelpCircle,
  },
  confirmed: {
    label: "Confirmed",
    cls: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700",
    Icon: CheckCircle2,
  },
  needs_user: {
    label: "Needs you",
    cls: "border-brand/40 bg-brand/10 text-brand",
    Icon: ShieldAlert,
  },
  declined_replaced: {
    label: "Sourced elsewhere",
    cls: "border-border bg-muted text-muted-foreground",
    Icon: XCircle,
  },
};

function statusOf(s: string | null | undefined): NegStatus {
  if (!s) return "sent";
  if (s in STATUS_META) return s as NegStatus;
  return "awaiting_reply";
}

function StatusPill({ status, size = "sm" }: { status: NegStatus; size?: "sm" | "md" }) {
  const m = STATUS_META[status];
  const h = size === "md" ? "h-6 text-[11px]" : "h-5 text-[10px]";
  return (
    <span className={`inline-flex items-center gap-1 px-2 ${h} rounded-full border font-semibold ${m.cls}`}>
      <m.Icon className="size-3" />
      {m.label}
    </span>
  );
}

/** Per-message annotation: was this inbound the trigger for the current verdict? */
const VERDICT_META: Record<Verdict, { label: string; cls: string; Icon: typeof CheckCircle2 }> = {
  fully_confirmed: {
    label: "Supplier confirmed",
    cls: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700",
    Icon: CheckCircle2,
  },
  confirmed_with_issue: {
    label: "Confirmed with issue",
    cls: "border-amber-500/40 bg-amber-500/10 text-amber-700",
    Icon: AlertTriangle,
  },
  declined: {
    label: "Supplier declined",
    cls: "border-destructive/40 bg-destructive/10 text-destructive",
    Icon: XCircle,
  },
  needs_clarification: {
    label: "Asked a question",
    cls: "border-sky-500/40 bg-sky-500/10 text-sky-700",
    Icon: HelpCircle,
  },
  unclear: {
    label: "Unclear reply",
    cls: "border-border bg-muted text-muted-foreground",
    Icon: Circle,
  },
};

function VerdictPill({ verdict }: { verdict: Verdict }) {
  const m = VERDICT_META[verdict];
  return (
    <span className={`inline-flex items-center gap-1 px-1.5 h-5 rounded-full border font-semibold text-[10px] ${m.cls}`}>
      <m.Icon className="size-3" />
      {m.label}
    </span>
  );
}



function AgentPage() {
  const [openId, setOpenId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const listFn = useServerFn(listInboxMessages);
  const getFn = useServerFn(getInboxMessage);
  const negFn = useServerFn(listNegotiationsForInbox);
  const ensureFn = useServerFn(ensureAgentInbox);

  // Hydrate from server (source of truth). Warm-start from localStorage
  // so a returning browser shows data instantly while the server revalidates.
  const inboxQ = useQuery({
    queryKey: ["agent-inbox-config"],
    queryFn: async () => {
      const r = await ensureFn({ data: {} });
      if (r.ok) saveInbox({ inboxId: r.inboxId, address: r.address });
      return r;
    },
    initialData: () => {
      const cached = loadInbox();
      return cached
        ? ({ ok: true as const, inboxId: cached.inboxId, address: cached.address })
        : undefined;
    },
    staleTime: 5 * 60_000,
  });

  const inbox: StoredInbox | null =
    inboxQ.data?.ok === true
      ? { inboxId: inboxQ.data.inboxId, address: inboxQ.data.address }
      : null;

  const messagesQ = useQuery({
    queryKey: ["agent-inbox", inbox?.inboxId],
    enabled: !!inbox,
    queryFn: () => listFn({ data: { inboxId: inbox!.inboxId, limit: 50 } }),
    refetchInterval: 15_000,
  });

  const negotiationsQ = useQuery({
    queryKey: ["agent-negotiations", inbox?.inboxId],
    enabled: !!inbox,
    queryFn: () => negFn({ data: { inboxId: inbox!.inboxId } }),
    refetchInterval: 15_000,
  });

  const messageMut = useMutation({
    mutationFn: (messageId: string) =>
      getFn({ data: { inboxId: inbox!.inboxId, messageId } }),
  });

  function openMessage(id: string) {
    setOpenId(id);
    messageMut.mutate(id);
  }

  const threads = useMemo<Thread[]>(() => {
    if (!inbox || messagesQ.data?.ok !== true) return [];
    return buildThreads(messagesQ.data.messages as InboxMessage[], inbox.address);
  }, [messagesQ.data, inbox]);

  // Map negotiations by thread_id (and by reply_message_id for per-msg verdicts).
  const negByThread = useMemo(() => {
    const m = new Map<string, NegotiationFull>();
    if (negotiationsQ.data?.ok !== true) return m;
    for (const n of negotiationsQ.data.negotiations as NegotiationFull[]) {
      if (n.thread_id) m.set(n.thread_id, n);
    }
    return m;
  }, [negotiationsQ.data]);

  const verdictByMessageId = useMemo(() => {
    const m = new Map<string, Verdict>();
    if (negotiationsQ.data?.ok !== true) return m;
    for (const n of negotiationsQ.data.negotiations as NegotiationFull[]) {
      const v = (n.classification?.verdict ?? null) as Verdict | null;
      if (v && n.reply_message_id) m.set(n.reply_message_id, v);
    }
    return m;
  }, [negotiationsQ.data]);

  // Queue: anything that needs the human to act now.
  const needsAttention = useMemo<NegotiationFull[]>(() => {
    if (negotiationsQ.data?.ok !== true) return [];
    return (negotiationsQ.data.negotiations as NegotiationFull[])
      .filter((n) => statusOf(n.status) === "needs_user")
      .sort((a, b) =>
        (b.last_reply_at || b.sent_at).localeCompare(a.last_reply_at || a.sent_at),
      );
  }, [negotiationsQ.data]);

  // Default: most recent thread expanded.
  const effectiveExpanded = (key: string, idx: number) =>
    key in expanded ? expanded[key] : idx === 0;


  return (
    <div className="p-6 lg:p-8 max-w-6xl space-y-6">
      <header>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Bot className="size-6 text-brand" />
          Supplier agent
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Email exchanges with suppliers, grouped by conversation.
        </p>
      </header>

      <NeedsAttentionQueue
        items={needsAttention}
        onChanged={() => {
          negotiationsQ.refetch();
          messagesQ.refetch();
        }}
      />

      <section className="rounded-xl border bg-card overflow-hidden">
        <div className="px-5 py-3 border-b flex items-center justify-between">
          <h2 className="font-semibold flex items-center gap-2">
            <Mail className="size-4" /> Conversations
          </h2>
          <div className="flex items-center gap-3">
            <Legend />
            <button
              onClick={() => messagesQ.refetch()}
              disabled={!inbox || messagesQ.isFetching}
              className="h-8 px-3 rounded-md border text-xs flex items-center gap-1.5 disabled:opacity-50"
            >
              <RefreshCw className={`size-3.5 ${messagesQ.isFetching ? "animate-spin" : ""}`} />
              Refresh
            </button>
          </div>
        </div>

        {!inbox && inboxQ.isLoading ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            Loading agent inbox…
          </div>
        ) : !inbox ? (
          <div className="p-8 text-center text-sm text-destructive">
            {inboxQ.data?.ok === false
              ? `Agent inbox unavailable: ${inboxQ.data.error}`
              : "No agent inbox configured yet."}
          </div>
        ) : messagesQ.data?.ok === false ? (
          <div className="p-8 text-center text-sm text-destructive">{messagesQ.data.error}</div>
        ) : threads.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            No conversations yet. Outgoing POs and supplier replies will appear here.
          </div>
        ) : (
          <ul className="divide-y">
            {threads.map((t, idx) => {
              const isOpen = effectiveExpanded(t.key, idx);
              const neg = negByThread.get(t.key);
              const status = neg ? statusOf(neg.status) : t.hasInbound ? "awaiting_reply" : "sent";
              return (
                <li key={t.key}>
                  <button
                    onClick={() => setExpanded((s) => ({ ...s, [t.key]: !isOpen }))}
                    className="w-full text-left px-5 py-3 hover:bg-muted/40 transition-colors flex items-start gap-3"
                  >
                    <span className="mt-0.5 text-muted-foreground">
                      {isOpen ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline justify-between gap-2">
                        <div className="font-semibold text-sm truncate">
                          {t.subject || "(no subject)"}
                        </div>
                        <div className="text-xs text-muted-foreground shrink-0 tabular-nums">
                          {t.lastAt ? new Date(t.lastAt).toLocaleString() : ""}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground flex-wrap">
                        <span className="truncate">{t.supplierName}</span>
                        <span className="text-muted-foreground/60">·</span>
                        <span className="tabular-nums">{t.messages.length} message{t.messages.length === 1 ? "" : "s"}</span>
                        <StatusPill status={status} size="md" />
                      </div>
                      {neg?.needs_user_reason && status === "needs_user" && (
                        <p className="mt-1 text-xs text-brand line-clamp-2">{neg.needs_user_reason}</p>
                      )}
                    </div>
                  </button>

                  {isOpen && (
                    <ol className="px-5 pb-4 space-y-2">
                      {t.messages.map((m) => {
                        const out = isOutbound(m, inbox.address);
                        const msgVerdict: Verdict | undefined = !out
                          ? verdictByMessageId.get(m.id) ??
                            (neg?.classification?.verdict &&
                            (neg.reply_message_id === m.id || !neg.reply_message_id)
                              ? (neg.classification.verdict as Verdict)
                              : undefined)
                          : undefined;
                        return (
                          <li key={m.id}>
                            <button
                              onClick={() => openMessage(m.id)}
                              className={`w-full text-left rounded-lg border px-3 py-2 transition-colors ${
                                out
                                  ? "ml-8 bg-muted/40 border-border hover:bg-muted/60"
                                  : "mr-8 bg-brand/5 border-brand/30 hover:bg-brand/10"
                              }`}
                            >
                              <div className="flex items-center justify-between gap-2">
                                <div className="flex items-center gap-2 min-w-0 flex-wrap">
                                  <span
                                    className={`inline-flex items-center gap-1 px-1.5 h-5 rounded-full text-[10px] font-semibold uppercase tracking-wide shrink-0 ${
                                      out
                                        ? "bg-foreground/10 text-foreground"
                                        : "bg-brand text-brand-foreground"
                                    }`}
                                  >
                                    {out ? <><Send className="size-3" /> Agent</> : <><InboxIcon className="size-3" /> Supplier</>}
                                  </span>
                                  {msgVerdict && <VerdictPill verdict={msgVerdict} />}
                                  <span className="text-xs truncate text-muted-foreground">
                                    {out ? `to ${m.to?.[0] ?? ""}` : `from ${m.from}`}
                                  </span>
                                </div>
                                <div className="text-[11px] text-muted-foreground shrink-0 tabular-nums">
                                  {m.receivedAt ? new Date(m.receivedAt).toLocaleString() : ""}
                                </div>
                              </div>
                              {m.preview && (
                                <p className="text-xs text-muted-foreground mt-1 line-clamp-2 whitespace-pre-wrap">
                                  {m.preview}
                                </p>
                              )}
                            </button>
                          </li>
                        );
                      })}
                    </ol>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>


      {openId && (
        <div
          className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
          onClick={() => setOpenId(null)}
        >
          <div
            className="bg-card rounded-xl border max-w-2xl w-full max-h-[85vh] overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-3 border-b flex items-center justify-between gap-3">
              <h3 className="font-semibold text-sm truncate">
                {messageMut.data?.ok ? messageMut.data.message.subject || "(no subject)" : "Loading…"}
              </h3>
              <button
                onClick={() => setOpenId(null)}
                className="h-8 w-8 rounded-md hover:bg-muted flex items-center justify-center"
              >
                <X className="size-4" />
              </button>
            </div>
            <div className="overflow-auto p-5 text-sm">
              {messageMut.isPending && (
                <div className="text-muted-foreground">Loading message…</div>
              )}
              {messageMut.data?.ok === false && (
                <div className="text-destructive">{messageMut.data.error}</div>
              )}
              {messageMut.data?.ok && (
                <>
                  <div className="text-xs text-muted-foreground space-y-0.5 mb-4 pb-4 border-b">
                    {inbox && (
                      <div className="mb-2">
                        {isOutbound(
                          {
                            id: messageMut.data.message.id,
                            threadId: messageMut.data.message.threadId,
                            subject: messageMut.data.message.subject,
                            from: messageMut.data.message.from,
                            to: messageMut.data.message.to,
                            receivedAt: messageMut.data.message.receivedAt,
                            preview: "",
                          },
                          inbox.address,
                        ) ? (
                          <span className="inline-flex items-center gap-1 px-2 h-5 rounded-full bg-foreground/10 text-foreground text-[10px] font-semibold uppercase tracking-wide">
                            <Send className="size-3" /> Sent by agent
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 h-5 rounded-full bg-brand text-brand-foreground text-[10px] font-semibold uppercase tracking-wide">
                            <InboxIcon className="size-3" /> Supplier reply
                          </span>
                        )}
                      </div>
                    )}
                    <div><span className="font-medium text-foreground">From:</span> {messageMut.data.message.from}</div>
                    {messageMut.data.message.to.length > 0 && (
                      <div><span className="font-medium text-foreground">To:</span> {messageMut.data.message.to.join(", ")}</div>
                    )}
                    {messageMut.data.message.receivedAt && (
                      <div><span className="font-medium text-foreground">Received:</span> {new Date(messageMut.data.message.receivedAt).toLocaleString()}</div>
                    )}
                  </div>
                  {messageMut.data.message.html ? (
                    <div
                      className="prose prose-sm max-w-none"
                      dangerouslySetInnerHTML={{ __html: messageMut.data.message.html }}
                    />
                  ) : (
                    <pre className="whitespace-pre-wrap font-sans text-sm">
                      {messageMut.data.message.text || "(empty)"}
                    </pre>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Legend() {
  return (
    <div className="hidden sm:flex items-center gap-3 text-[11px] text-muted-foreground">
      <span className="inline-flex items-center gap-1.5">
        <span className="inline-block size-2.5 rounded-sm bg-brand/40 border border-brand/40" />
        Supplier
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="inline-block size-2.5 rounded-sm bg-muted border" />
        Agent
      </span>
    </div>
  );
}

function NeedsAttentionQueue({
  items,
  onChanged,
}: {
  items: NegotiationFull[];
  onChanged: () => void;
}) {
  if (items.length === 0) return null;
  return (
    <section className="rounded-xl border border-brand/40 bg-brand/5 overflow-hidden">
      <div className="px-4 sm:px-5 py-3 border-b border-brand/30 flex items-center gap-2">
        <ShieldAlert className="size-4 text-brand" />
        <h2 className="font-semibold text-sm text-brand">
          Needs your attention
          <span className="ml-2 text-xs font-normal text-brand/80">
            {items.length} item{items.length === 1 ? "" : "s"}
          </span>
        </h2>
      </div>
      <ul className="divide-y divide-brand/20">
        {items.map((n) => (
          <NeedsAttentionRow key={n.id} neg={n} onChanged={onChanged} />
        ))}
      </ul>
    </section>
  );
}

function NeedsAttentionRow({
  neg,
  onChanged,
}: {
  neg: NegotiationFull;
  onChanged: () => void;
}) {
  const [showReply, setShowReply] = useState(false);
  const [draft, setDraft] = useState("");
  const qc = useQueryClient();

  const approveFn = useServerFn(approveNegotiation);
  const declineFn = useServerFn(declineAndReplaceNegotiation);
  const followupFn = useServerFn(humanFollowupNegotiation);

  const after = () => {
    qc.invalidateQueries({ queryKey: ["agent-negotiations"] });
    onChanged();
  };

  const approve = useMutation({
    mutationFn: () => approveFn({ data: { negotiationId: neg.id } }),
    onSuccess: after,
  });
  const decline = useMutation({
    mutationFn: () => declineFn({ data: { negotiationId: neg.id } }),
    onSuccess: after,
  });
  const followup = useMutation({
    mutationFn: () =>
      followupFn({ data: { negotiationId: neg.id, message: draft.trim() } }),
    onSuccess: () => {
      setDraft("");
      setShowReply(false);
      after();
    },
  });

  const busy = approve.isPending || decline.isPending || followup.isPending;
  const summary =
    neg.classification?.summary_en ||
    neg.classification?.summary ||
    neg.needs_user_reason ||
    "Supplier reply needs your review.";

  return (
    <li className="p-4 sm:p-5 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-semibold text-sm truncate">
            {neg.supplier_name || neg.supplier_email}
          </div>
          <div className="text-xs text-muted-foreground truncate">
            {neg.subject || `Order ${neg.order_id}`}
          </div>
        </div>
        <div className="text-[11px] text-muted-foreground shrink-0 tabular-nums">
          {neg.last_reply_at
            ? new Date(neg.last_reply_at).toLocaleString()
            : new Date(neg.sent_at).toLocaleString()}
        </div>
      </div>
      <p className="text-sm">{summary}</p>
      {neg.needs_user_reason && (
        <p className="text-xs text-brand">{neg.needs_user_reason}</p>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => approve.mutate()}
          disabled={busy}
          className="h-9 px-3 rounded-md bg-brand text-brand-foreground text-sm font-medium flex items-center gap-1.5 disabled:opacity-50"
        >
          <CheckCircle2 className="size-4" />
          Approve &amp; confirm
        </button>
        <button
          onClick={() => decline.mutate()}
          disabled={busy}
          className="h-9 px-3 rounded-md border border-border text-sm font-medium flex items-center gap-1.5 disabled:opacity-50"
        >
          <XCircle className="size-4" />
          Source elsewhere
        </button>
        <button
          onClick={() => setShowReply((s) => !s)}
          disabled={busy}
          className="h-9 px-3 rounded-md border border-border text-sm font-medium flex items-center gap-1.5 disabled:opacity-50"
        >
          <UserRound className="size-4" />
          Reply yourself
        </button>
      </div>

      {showReply && (
        <div className="space-y-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={4}
            placeholder="Write your reply to the supplier…"
            className="w-full text-sm rounded-md border border-border p-2 bg-background"
          />
          <div className="flex justify-end gap-2">
            <button
              onClick={() => {
                setShowReply(false);
                setDraft("");
              }}
              className="h-8 px-3 rounded-md border text-xs"
              disabled={busy}
            >
              Cancel
            </button>
            <button
              onClick={() => followup.mutate()}
              disabled={busy || draft.trim().length === 0}
              className="h-8 px-3 rounded-md bg-brand text-brand-foreground text-xs font-medium flex items-center gap-1.5 disabled:opacity-50"
            >
              <Send className="size-3.5" />
              Send reply
            </button>
          </div>
        </div>
      )}

      {(approve.data && !approve.data.ok) ||
      (decline.data && !decline.data.ok) ||
      (followup.data && !followup.data.ok) ? (
        <p className="text-xs text-destructive">
          {approve.data && !approve.data.ok && approve.data.error}
          {decline.data && !decline.data.ok && decline.data.error}
          {followup.data && !followup.data.ok && followup.data.error}
        </p>
      ) : null}
    </li>
  );
}

