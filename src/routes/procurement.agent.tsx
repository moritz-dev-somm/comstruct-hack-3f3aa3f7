import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import {
  Bot, RefreshCw, Mail, X, ChevronDown, ChevronRight, Send,
  Inbox as InboxIcon, CheckCircle2, AlertTriangle, XCircle, HelpCircle, Circle,
} from "lucide-react";
import {
  listInboxMessages,
  getInboxMessage,
  listNegotiationsForInbox,
  ensureAgentInbox,
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

type VerdictInfo = {
  verdict: Verdict;
  replyMessageId: string | null;
  lastReplyAt: string | null;
};

type NegotiationLite = {
  id: string;
  thread_id: string | null;
  reply_message_id: string | null;
  last_reply_at: string | null;
  classification: { verdict?: Verdict } | null;
};

const VERDICT_META: Record<Verdict, { label: string; cls: string; Icon: typeof CheckCircle2 }> = {
  fully_confirmed: {
    label: "Approved",
    cls: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700",
    Icon: CheckCircle2,
  },
  confirmed_with_issue: {
    label: "Partial",
    cls: "border-amber-500/40 bg-amber-500/10 text-amber-700",
    Icon: AlertTriangle,
  },
  declined: {
    label: "Declined",
    cls: "border-destructive/40 bg-destructive/10 text-destructive",
    Icon: XCircle,
  },
  needs_clarification: {
    label: "Question",
    cls: "border-sky-500/40 bg-sky-500/10 text-sky-700",
    Icon: HelpCircle,
  },
  unclear: {
    label: "Unclear",
    cls: "border-border bg-muted text-muted-foreground",
    Icon: Circle,
  },
};

function VerdictPill({ verdict, size = "sm" }: { verdict: Verdict; size?: "sm" | "md" }) {
  const m = VERDICT_META[verdict];
  const h = size === "md" ? "h-6 text-[11px]" : "h-5 text-[10px]";
  return (
    <span className={`inline-flex items-center gap-1 px-1.5 ${h} rounded-full border font-semibold ${m.cls}`}>
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

  // Map: latest classification per AgentMail thread_id, and per reply_message_id.
  const verdictByThread = useMemo(() => {
    const m = new Map<string, VerdictInfo>();
    if (negotiationsQ.data?.ok !== true) return m;
    for (const n of negotiationsQ.data.negotiations as NegotiationLite[]) {
      const v = (n.classification?.verdict ?? null) as Verdict | null;
      if (!v) continue;
      const info: VerdictInfo = {
        verdict: v,
        replyMessageId: n.reply_message_id ?? null,
        lastReplyAt: n.last_reply_at ?? null,
      };
      if (n.thread_id) m.set(n.thread_id, info);
    }
    return m;
  }, [negotiationsQ.data]);

  const verdictByMessageId = useMemo(() => {
    const m = new Map<string, Verdict>();
    if (negotiationsQ.data?.ok !== true) return m;
    for (const n of negotiationsQ.data.negotiations as NegotiationLite[]) {
      const v = (n.classification?.verdict ?? null) as Verdict | null;
      if (v && n.reply_message_id) m.set(n.reply_message_id, v);
    }
    return m;
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

        {!inbox ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            No agent inbox configured yet.
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
              const threadVerdict = verdictByThread.get(t.key);
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
                        {threadVerdict ? (
                          <VerdictPill verdict={threadVerdict.verdict} size="md" />
                        ) : t.hasInbound ? (
                          <span className="ml-1 inline-flex items-center gap-1 px-1.5 h-5 rounded-full border border-brand/30 bg-brand/10 text-brand text-[10px] font-medium">
                            <InboxIcon className="size-3" /> Reply
                          </span>
                        ) : t.hasOutbound ? (
                          <span className="ml-1 inline-flex items-center gap-1 px-1.5 h-5 rounded-full border text-[10px] font-medium text-muted-foreground">
                            <Send className="size-3" /> Awaiting reply
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </button>

                  {isOpen && (
                    <ol className="px-5 pb-4 space-y-2">
                      {t.messages.map((m) => {
                        const out = isOutbound(m, inbox.address);
                        // Tag inbound (supplier) messages with their verdict when
                        // we have a classification for that specific reply, or
                        // fall back to the thread-level verdict for the latest one.
                        const msgVerdict: Verdict | undefined =
                          !out
                            ? verdictByMessageId.get(m.id) ??
                              (threadVerdict && (threadVerdict.replyMessageId === m.id || !threadVerdict.replyMessageId)
                                ? threadVerdict.verdict
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
