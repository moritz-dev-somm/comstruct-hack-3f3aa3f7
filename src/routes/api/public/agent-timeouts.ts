import { createFileRoute } from "@tanstack/react-router";
import { adminClient } from "@agent/agent.server";

/**
 * Periodic sweep: any negotiation waiting on the supplier for >24h
 * with no inbound reply gets flipped to status="needs_user" so it
 * surfaces in the "Needs your attention" queue.
 *
 * Called by pg_cron (no signed payload — public route, idempotent).
 */
export const Route = createFileRoute("/api/public/agent-timeouts")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apiKey = request.headers.get("apikey");
        const expected = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_PUBLISHABLE_KEY;
        if (expected && apiKey !== expected) {
          return new Response("Unauthorized", { status: 401 });
        }

        const sb = adminClient();
        const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

        const WAITING = [
          "sent",
          "awaiting_reply",
          "clarifying",
          "following_up",
          "answering_questions",
        ];

        const { data: rows, error } = await sb
          .from("negotiations")
          .select("id, status, sent_at, last_reply_at, last_progress_at, supplier_name")
          .in("status", WAITING);
        if (error) {
          console.error("agent-timeouts: query failed", error);
          return new Response(JSON.stringify({ ok: false, error: error.message }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }

        const stale = (rows ?? []).filter((r) => {
          const row = r as {
            last_progress_at: string | null;
            last_reply_at: string | null;
            sent_at: string;
          };
          // Reset the 24h clock only on replies that actually moved the
          // negotiation forward. Falls back to last_reply_at (for rows
          // written before last_progress_at existed) then sent_at.
          const ref = row.last_progress_at || row.last_reply_at || row.sent_at;
          return ref && ref < cutoff;
        });

        let flipped = 0;
        for (const row of stale) {
          const r = row as { id: string; supplier_name: string | null };
          const { error: upErr } = await sb
            .from("negotiations")
            .update({
              status: "needs_user",
              needs_user_reason: `No progress from ${r.supplier_name ?? "supplier"} for 24h.`,
              last_progress_at: new Date().toISOString(),
            })
            .eq("id", r.id);
          if (!upErr) flipped++;
        }

        return new Response(
          JSON.stringify({ ok: true, scanned: rows?.length ?? 0, flipped }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      },
      GET: async () => new Response("ok", { status: 200 }),
    },
  },
});
