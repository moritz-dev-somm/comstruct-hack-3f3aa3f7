import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Bot, RefreshCw, Mail, X } from "lucide-react";
import {
  listInboxMessages,
  getInboxMessage,
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

type InboxMessage = {
  id: string;
  subject: string;
  from: string;
  receivedAt: string;
  preview: string;
};

function AgentPage() {
  const [inbox] = useState<StoredInbox | null>(() => loadInbox());
  const [openId, setOpenId] = useState<string | null>(null);

  const listFn = useServerFn(listInboxMessages);
  const getFn = useServerFn(getInboxMessage);

  const messagesQ = useQuery({
    queryKey: ["agent-inbox", inbox?.inboxId],
    enabled: !!inbox,
    queryFn: () => listFn({ data: { inboxId: inbox!.inboxId, limit: 25 } }),
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

  return (
    <div className="p-6 lg:p-8 max-w-6xl space-y-6">
      <header>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Bot className="size-6 text-brand" />
          Supplier agent
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Tracks supplier replies for outgoing orders.
        </p>
      </header>

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
            No agent inbox configured yet.
          </div>
        ) : messagesQ.data?.ok === false ? (
          <div className="p-8 text-center text-sm text-red-600">{messagesQ.data.error}</div>
        ) : !messagesQ.data?.messages?.length ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            No messages yet. Replies from suppliers will appear here.
          </div>
        ) : (
          <ul className="divide-y">
            {messagesQ.data.messages.map((m: InboxMessage) => (
              <li key={m.id}>
                <button
                  onClick={() => openMessage(m.id)}
                  className="w-full text-left px-5 py-3 text-sm hover:bg-muted/50 transition-colors"
                >
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
                </button>
              </li>
            ))}
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
                <div className="text-red-600">{messageMut.data.error}</div>
              )}
              {messageMut.data?.ok && (
                <>
                  <div className="text-xs text-muted-foreground space-y-0.5 mb-4 pb-4 border-b">
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
