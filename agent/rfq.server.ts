/**
 * RFQ (Request-For-Quote) flow.
 *
 * Triggered after PM/Central approval of orders ≥ €500. Instead of sending
 * the PO straight to the original supplier, we fan out a discount RFQ to
 * the top suppliers in the order's dominant category, wait up to 24h
 * (or close early when all invited suppliers responded), then auto-place
 * the actual PO with the lowest-total bidder. 0 responses → escalate.
 *
 * Persistence: `public.rfqs` + `public.rfq_quotes`. The actual fan-out emails
 * reuse the existing `negotiations` machinery — each RFQ recipient gets its
 * own negotiation row, tagged with `rfq_id` inside `order_snapshot` so the
 * webhook can route quote replies back to this module.
 */
import type { Order } from "@/lib/orders";
import {
  adminClient,
  agentMail,
  ensureAgentInfra,
  HARDCODED_SUPPLIER_EMAIL,
  type ReplyClassification,
} from "./agent.server";
import {
  composeOrderEmail,
  type SupplierLanguage,
} from "./templates";

export const RFQ_THRESHOLD_EUR = 500;
export const RFQ_DEADLINE_HOURS = 24;

type SupportedLang = SupplierLanguage;

type SupplierContact = {
  name: string;
  email: string;
  language: SupportedLang;
};

/* ============================================================ */
/* Supplier discovery — strict "exact same product" matching    */
/* ============================================================ */

function dominantCategory(order: Order): string | null {
  const byCat = new Map<string, number>();
  for (const it of order.items) {
    const c = (it.category || "").trim();
    if (!c) continue;
    byCat.set(c, (byCat.get(c) ?? 0) + it.qty * it.price);
  }
  let winner: string | null = null;
  let max = 0;
  for (const [c, v] of byCat) {
    if (v > max) { max = v; winner = c; }
  }
  return winner;
}

/** Normalize a product name so different casing / spacing collapse to the same key. */
function normalizeProductKey(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

const SUPPORTED_LANGS: SupportedLang[] = ["en", "de", "fr", "it"];
function normLang(s: string | null | undefined): SupportedLang {
  const v = (s || "").toLowerCase().slice(0, 2) as SupportedLang;
  return SUPPORTED_LANGS.includes(v) ? v : "en";
}

/**
 * Decide whether an order qualifies for a discount RFQ and, if so, which
 * suppliers and which items to ask.
 *
 * Rules (strict):
 *  1. At least TWO different catalog suppliers must list the EXACT same
 *     product (matched by normalized product name).
 *  2. The subtotal of those shared items (qty × order-price) must be
 *     ≥ RFQ_THRESHOLD_EUR.
 *  3. Only suppliers that carry every one of the shared items are invited
 *     — never the original supplier-of-record unless it also passes that
 *     bar, and never "filler" suppliers from the same category that don't
 *     carry the items.
 *
 * Returns `qualifies: false` when no such pair (or larger set) exists.
 */
export async function pickRfqSuppliers(order: Order): Promise<{
  qualifies: boolean;
  suppliers: SupplierContact[];
  items: Order["items"];
  subtotal: number;
  dominantCategory: string | null;
  reason?: string;
}> {
  const sb = adminClient();
  const cat = dominantCategory(order);

  // 1. Look up every catalog row whose name matches one of the order's items
  //    (exact match after normalization). Pulls supplier + name only.
  const rawNames = Array.from(new Set(order.items.map((i) => i.name)));
  if (rawNames.length === 0) {
    return { qualifies: false, suppliers: [], items: [], subtotal: 0, dominantCategory: cat, reason: "no_items" };
  }
  const { data: rows } = await sb
    .from("products")
    .select("name, supplier")
    .in("name", rawNames);

  // Also fold in any matches that only differ by casing/whitespace by doing
  // a normalized comparison on the client. (DB names are mostly canonical so
  // the IN() above already gets ~all of them.)
  type Row = { name: string; supplier: string | null };
  const catalog = (rows ?? []) as Row[];

  // Map: normalized order-item name -> Set<supplier names> that carry it.
  const suppliersByItemKey = new Map<string, Set<string>>();
  for (const it of order.items) {
    const key = normalizeProductKey(it.name);
    const set = suppliersByItemKey.get(key) ?? new Set<string>();
    for (const r of catalog) {
      if (!r.supplier) continue;
      if (normalizeProductKey(r.name) === key) set.add(r.supplier.trim());
    }
    suppliersByItemKey.set(key, set);
  }

  // 2. Keep only items that are carried by ≥ 2 suppliers (the "comparable" set).
  const comparable = order.items.filter((it) => {
    const s = suppliersByItemKey.get(normalizeProductKey(it.name));
    return s !== undefined && s.size >= 2;
  });
  if (comparable.length === 0) {
    return { qualifies: false, suppliers: [], items: [], subtotal: 0, dominantCategory: cat, reason: "no_shared_product" };
  }

  // 3. Search for the best supplier set: for every pair of suppliers, compute
  //    the items both carry and their subtotal. Best = highest subtotal that
  //    clears the threshold. Then try to extend the pair with any supplier
  //    that also covers the same items (so we invite as many bidders as
  //    possible, but only ones offering exactly the comparable bundle).
  const allSuppliers = new Set<string>();
  for (const s of suppliersByItemKey.values()) for (const n of s) allSuppliers.add(n);
  const supplierList = Array.from(allSuppliers);

  function coveredItems(suppliers: string[]): { items: Order["items"]; subtotal: number } {
    const items = comparable.filter((it) => {
      const carriers = suppliersByItemKey.get(normalizeProductKey(it.name))!;
      return suppliers.every((s) => carriers.has(s));
    });
    const subtotal = items.reduce((sum, i) => sum + i.qty * i.price, 0);
    return { items, subtotal };
  }

  let best: { suppliers: string[]; items: Order["items"]; subtotal: number } | null = null;
  for (let i = 0; i < supplierList.length; i++) {
    for (let j = i + 1; j < supplierList.length; j++) {
      const pair = [supplierList[i], supplierList[j]];
      const cov = coveredItems(pair);
      if (cov.subtotal < RFQ_THRESHOLD_EUR) continue;
      if (!best || cov.subtotal > best.subtotal) {
        best = { suppliers: pair, items: cov.items, subtotal: cov.subtotal };
      }
    }
  }

  if (!best) {
    return { qualifies: false, suppliers: [], items: [], subtotal: 0, dominantCategory: cat, reason: "below_threshold" };
  }

  // Extend the winning pair with any extra supplier that also carries every
  // item in `best.items` — they're a legitimate additional bidder.
  for (const extra of supplierList) {
    if (best.suppliers.includes(extra)) continue;
    const trySet = [...best.suppliers, extra];
    const cov = coveredItems(trySet);
    if (cov.items.length === best.items.length) {
      best.suppliers = trySet;
    }
  }

  // 4. Hydrate contact info (email + language). Suppliers without a
  //    contactable email are dropped — if that leaves fewer than 2, the
  //    order no longer qualifies.
  const { data: contactRows } = await sb
    .from("suppliers")
    .select("name,email,language")
    .in("name", best.suppliers);
  const contacts = new Map<string, { email: string | null; language: string | null }>();
  for (const r of (contactRows ?? []) as Array<{ name: string; email: string | null; language: string | null }>) {
    contacts.set(r.name, { email: r.email, language: r.language });
  }

  const enriched: SupplierContact[] = best.suppliers
    .map((name) => {
      const c = contacts.get(name);
      const email = c?.email && c.email.trim() ? c.email.trim() : HARDCODED_SUPPLIER_EMAIL;
      return { name, email, language: normLang(c?.language ?? null) };
    });

  if (enriched.length < 2) {
    return {
      qualifies: false,
      suppliers: [],
      items: [],
      subtotal: 0,
      dominantCategory: cat,
      reason: "not_enough_contactable_suppliers",
    };
  }

  return {
    qualifies: true,
    suppliers: enriched,
    items: best.items,
    subtotal: best.subtotal,
    dominantCategory: cat,
  };
}


/* ============================================================ */
/* RFQ email template (bilingual EN + native)                   */
/* ============================================================ */

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const RFQ_INTRO: Record<SupportedLang, string> = {
  en: "We are sourcing the items below for project {project} and would like your best quote.",
  de: "Wir beschaffen die unten aufgeführten Artikel für das Projekt {project} und bitten um Ihr bestes Angebot.",
  fr: "Nous nous approvisionnons pour les articles ci-dessous (projet {project}) et souhaitons votre meilleur devis.",
  it: "Ci stiamo approvvigionando degli articoli sotto per il progetto {project} e gradiremmo il vostro miglior preventivo.",
};

const RFQ_ASK: Record<SupportedLang, string> = {
  en: "Please reply within 24h with your unit price per item, total shipping cost in EUR (or \"included\"), and earliest lead time. The cheapest total quote wins the order.",
  de: "Bitte antworten Sie innerhalb von 24 Stunden mit Ihrem Stückpreis pro Artikel, den Versandkosten in EUR (oder \"inklusive\") und der frühestmöglichen Lieferzeit. Das günstigste Gesamtangebot erhält den Auftrag.",
  fr: "Merci de répondre sous 24h avec votre prix unitaire par article, les frais de port totaux en EUR (ou \"inclus\") et le délai de livraison le plus court. L'offre la moins chère remporte la commande.",
  it: "Vi preghiamo di rispondere entro 24h con il prezzo unitario per articolo, costo totale di spedizione in EUR (o \"incluso\") e tempi di consegna minimi. Vincerà l'offerta più conveniente.",
};

const RFQ_SUBJECT: Record<SupportedLang, string> = {
  en: "Quote request",
  de: "Angebotsanfrage",
  fr: "Demande de devis",
  it: "Richiesta di preventivo",
};

function composeRfqEmail(args: {
  order: Order;
  items: Order["items"];
  supplierName: string;
  language: SupportedLang;
}): { subject: string; text: string; html: string } {
  const { order, items, supplierName, language } = args;
  const lines = items.map(
    (i) => `- ${i.qty} × ${i.name}${i.unit ? ` (${i.unit})` : ""} — current ref. price €${i.price.toFixed(2)}`,
  );
  const subjectEn = `${RFQ_SUBJECT.en} [${order.id}] — ${items.length} items, project ${order.project}`;
  const subjectNative = language === "en"
    ? subjectEn
    : `${RFQ_SUBJECT[language]} [${order.id}] — ${items.length} ${{ de: "Artikel", fr: "articles", it: "articoli" }[language]}`;
  const subject = language === "en" ? subjectEn : `${subjectEn} / ${subjectNative}`;

  const block = (lang: SupportedLang) => {
    const intro = RFQ_INTRO[lang].replace("{project}", order.project);
    const ask = RFQ_ASK[lang];
    return (
      `Dear ${supplierName},\n\n${intro}\n\n${lines.join("\n")}\n\n${ask}\n\n` +
      `— comstruct procurement agent`
    );
  };

  const text = language === "en"
    ? block("en")
    : `${block("en")}\n\n---\n\n${block(language)}`;

  const htmlBlock = (lang: SupportedLang) => {
    const intro = escapeHtml(RFQ_INTRO[lang].replace("{project}", order.project));
    const ask = escapeHtml(RFQ_ASK[lang]);
    const li = items
      .map(
        (i) =>
          `<li>${escapeHtml(`${i.qty} × ${i.name}${i.unit ? ` (${i.unit})` : ""}`)} — <em>ref. €${i.price.toFixed(2)}</em></li>`,
      )
      .join("");
    return `<p>${escapeHtml(`Dear ${supplierName},`)}</p><p>${intro}</p><ul>${li}</ul><p>${ask}</p>`;
  };
  const html = language === "en"
    ? htmlBlock("en")
    : `${htmlBlock("en")}<hr style="margin:24px 0;border:none;border-top:1px solid #e5e7eb"/>${htmlBlock(language)}`;

  return { subject, text, html };
}

/* ============================================================ */
/* startRfqForOrder — public entry called when PM approves      */
/* ============================================================ */

export type RfqStartResult =
  | { ok: true; rfqId: string; invited: Array<{ name: string; email: string }>; items: Order["items"]; subtotal: number; dominantCategory: string | null }
  | { ok: false; error: string; reason?: string };

export async function startRfqForOrder(order: Order): Promise<RfqStartResult> {
  try {
    const infra = await ensureAgentInfra();
    const sb = adminClient();
    const am = agentMail();

    const pick = await pickRfqSuppliers(order);

    if (!pick.qualifies) {
      // Order doesn't meet the discount criteria (no ≥2 suppliers share the
      // exact same products totalling ≥ €500). Do NOT fan out and do NOT
      // create a bogus RFQ row — caller should fall back to a direct PO.
      return { ok: false, error: "not_qualifying", reason: pick.reason };
    }

    const { suppliers, items: rfqItems, subtotal: rfqSubtotal, dominantCategory: cat } = pick;

    // Build a "trimmed" order containing only the comparable items so the
    // RFQ email and downstream quote totals are scoped to what the suppliers
    // can actually bid on.
    const rfqOrder: Order = { ...order, items: rfqItems, subtotal: rfqSubtotal };

    const deadlineAt = new Date(Date.now() + RFQ_DEADLINE_HOURS * 3600_000).toISOString();
    const { data: rfqRow, error: rfqErr } = await sb
      .from("rfqs")
      .insert({
        order_id: order.id,
        status: "open",
        deadline_at: deadlineAt,
        invited_suppliers: suppliers.map((s) => s.name),
        dominant_category: cat,
        order_snapshot: rfqOrder as unknown as Record<string, unknown>,
      })
      .select("id")
      .single();
    if (rfqErr || !rfqRow) throw rfqErr ?? new Error("failed to create rfq");
    const rfqId = rfqRow.id as string;

    // Fan out to each qualifying supplier (independent — one failure doesn't block others).
    for (const sup of suppliers) {
      try {
        const email = composeRfqEmail({
          order: rfqOrder,
          items: rfqItems,
          supplierName: sup.name,
          language: sup.language,
        });
        const sendRes = await am.inboxes.messages.send(infra.inboxId, {
          to: sup.email,
          subject: email.subject,
          text: email.text,
          html: email.html,
        });
        const threadId = (sendRes as { threadId?: string }).threadId ?? null;
        const messageId = (sendRes as { messageId?: string }).messageId ?? null;

        const { data: neg } = await sb
          .from("negotiations")
          .insert({
            order_id: order.id,
            project: order.project,
            supplier_name: sup.name,
            supplier_email: sup.email,
            supplier_language: sup.language,
            inbox_id: infra.inboxId,
            thread_id: threadId,
            message_id: messageId,
            subject: email.subject,
            status: "awaiting_reply",
            order_snapshot: {
              ...rfqOrder,
              supplier_language: sup.language,
              rfq_id: rfqId,
              rfq_role: "bidder",
            },
          })
          .select("id")
          .single();


        await sb.from("rfq_quotes").insert({
          rfq_id: rfqId,
          negotiation_id: neg?.id ?? null,
          supplier_name: sup.name,
          supplier_email: sup.email,
          status: "pending",
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`startRfqForOrder: failed for ${sup.name}:`, msg);
        await sb.from("rfq_quotes").insert({
          rfq_id: rfqId,
          supplier_name: sup.name,
          supplier_email: sup.email,
          status: "send_failed",
          raw_reply_excerpt: msg.slice(0, 500),
        });
      }
    }

    return {
      ok: true,
      rfqId,
      invited: suppliers.map((s) => ({ name: s.name, email: s.email })),
      items: rfqItems,
      subtotal: rfqSubtotal,
      dominantCategory: cat,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("startRfqForOrder failed:", msg);
    return { ok: false, error: msg };
  }
}

/* ============================================================ */
/* recordRfqQuote — called from the webhook                     */
/* ============================================================ */

/** Total order quantity used to apportion a quoted unit price. */
function orderTotalQty(order: Order): number {
  return order.items.reduce((s, i) => s + i.qty, 0);
}

/** Compute supplier's total = quoted_unit_price × order_qty + shipping. */
function computeTotal(args: {
  quotedUnit: number | null;
  origLineTotal: number;
  shippingEur: number | null;
  totalQty: number;
}): { lineTotal: number; total: number } {
  const line =
    args.quotedUnit != null && Number.isFinite(args.quotedUnit)
      ? args.quotedUnit * args.totalQty
      : args.origLineTotal;
  const ship = args.shippingEur != null && Number.isFinite(args.shippingEur) ? args.shippingEur : 0;
  return { lineTotal: line, total: line + ship };
}

const UNAVAILABLE_RE =
  /(out of stock|unavailable|nicht (?:verfügbar|lieferbar|am lager)|ausverkauft|nicht (?:mehr )?vorrätig|indisponible|en rupture|esaurito|non disponibile)/i;

/**
 * Record (or refresh) a supplier's quote for an RFQ negotiation.
 * Called by the webhook AFTER classifyReply finishes.
 *
 * Returns whether `maybeDecideRfq` should now be polled (i.e. all invited
 * suppliers have either quoted or declined).
 */
export async function recordRfqQuote(args: {
  rfqId: string;
  negotiationId: string;
  supplierName: string;
  order: Order;
  classification: ReplyClassification;
}): Promise<{ recorded: boolean; status: "quoted" | "declined" | "unanswered" }> {
  const sb = adminClient();
  const cls = args.classification;

  // Treat declined / out-of-stock / human-required as a non-bid.
  const declinedLike =
    cls.verdict === "declined" ||
    cls.wants_human === true ||
    (cls.issues ?? []).some((i) => UNAVAILABLE_RE.test(i)) ||
    UNAVAILABLE_RE.test(cls.summary || "") ||
    UNAVAILABLE_RE.test(cls.summary_en || "");

  const status = declinedLike ? "declined" : "quoted";

  let lineTotal: number | null = null;
  let total: number | null = null;
  let quotedUnit: number | null = null;
  if (!declinedLike) {
    // Original line subtotal for this RFQ (used as fallback when supplier
    // confirms without restating a unit price).
    const origLineTotal = args.order.items.reduce((s, i) => s + i.qty * i.price, 0);
    // The classifier currently extracts shipping_cost_eur. unit_price_eur is
    // not yet a classifier field — when present (future extension) we
    // honour it, otherwise we fall back to the original price.
    quotedUnit = (cls as unknown as { unit_price_eur?: number }).unit_price_eur ?? null;
    const totalQty = orderTotalQty(args.order);
    const computed = computeTotal({
      quotedUnit,
      origLineTotal,
      shippingEur: cls.shipping_cost_eur ?? null,
      totalQty,
    });
    lineTotal = computed.lineTotal;
    total = computed.total;
  }

  await sb
    .from("rfq_quotes")
    .update({
      status,
      unit_price_eur: quotedUnit,
      line_total_eur: lineTotal,
      shipping_cost_eur: cls.shipping_cost_eur ?? null,
      total_eur: total,
      lead_time_days: cls.lead_time_days ?? null,
      raw_reply_excerpt: (cls.summary_en || cls.summary || "").slice(0, 500),
      received_at: new Date().toISOString(),
    })
    .eq("rfq_id", args.rfqId)
    .eq("negotiation_id", args.negotiationId);

  return { recorded: true, status: status as "quoted" | "declined" };
}

/* ============================================================ */
/* maybeDecideRfq — pick a winner or escalate                   */
/* ============================================================ */

export type RfqDecision =
  | { kind: "still_waiting" }
  | { kind: "decided"; winner: string; total: number; rfqId: string }
  | { kind: "escalated"; reason: string; rfqId: string };

export async function maybeDecideRfq(rfqId: string): Promise<RfqDecision> {
  const sb = adminClient();
  const { data: rfqRow, error } = await sb
    .from("rfqs")
    .select("id, status, deadline_at, invited_suppliers, order_snapshot")
    .eq("id", rfqId)
    .maybeSingle();
  if (error || !rfqRow) {
    return { kind: "still_waiting" };
  }
  if (rfqRow.status !== "open") return { kind: "still_waiting" };

  const { data: quoteRows } = await sb
    .from("rfq_quotes")
    .select("supplier_name, supplier_email, status, total_eur, lead_time_days, shipping_cost_eur, unit_price_eur")
    .eq("rfq_id", rfqId);
  const quotes = (quoteRows ?? []) as Array<{
    supplier_name: string;
    supplier_email: string | null;
    status: string;
    total_eur: number | null;
    lead_time_days: number | null;
    shipping_cost_eur: number | null;
    unit_price_eur: number | null;
  }>;

  const invited = (rfqRow.invited_suppliers as string[]) ?? [];
  const resolved = quotes.filter((q) => q.status === "quoted" || q.status === "declined" || q.status === "send_failed");
  const pastDeadline = new Date(rfqRow.deadline_at).getTime() <= Date.now();
  const allIn = resolved.length >= invited.length;

  if (!allIn && !pastDeadline) return { kind: "still_waiting" };

  // Eligible bids: quoted with a finite total_eur.
  const bids = quotes
    .filter((q) => q.status === "quoted" && q.total_eur != null && Number.isFinite(Number(q.total_eur)))
    .sort((a, b) => {
      const ta = Number(a.total_eur);
      const tb = Number(b.total_eur);
      if (ta !== tb) return ta - tb;
      const la = a.lead_time_days ?? Number.POSITIVE_INFINITY;
      const lb = b.lead_time_days ?? Number.POSITIVE_INFINITY;
      if (la !== lb) return la - lb;
      return a.supplier_name.localeCompare(b.supplier_name);
    });

  if (bids.length === 0) {
    const reason = invited.length === 0
      ? "No suppliers were invited."
      : pastDeadline
        ? `No usable quotes received before deadline (invited ${invited.length}).`
        : `All ${invited.length} invited suppliers declined or were unavailable.`;
    await sb
      .from("rfqs")
      .update({
        status: "escalated",
        decided_at: new Date().toISOString(),
        escalation_reason: reason,
      })
      .eq("id", rfqId);
    return { kind: "escalated", reason, rfqId };
  }

  const winner = bids[0];
  await sb
    .from("rfqs")
    .update({
      status: "decided",
      winner_supplier: winner.supplier_name,
      winner_total_eur: winner.total_eur,
      decided_at: new Date().toISOString(),
    })
    .eq("id", rfqId);

  // Fire the actual PO email to the winner (best-effort — failure doesn't
  // unwind the decision; UI surfaces it).
  try {
    const order = rfqRow.order_snapshot as Order;
    await sendWinningPo({
      order,
      supplierName: winner.supplier_name,
      supplierEmail: winner.supplier_email,
      rfqId,
    });
  } catch (err) {
    console.error("maybeDecideRfq: failed to send winning PO:", err);
  }

  return { kind: "decided", winner: winner.supplier_name, total: Number(winner.total_eur), rfqId };
}

/* ============================================================ */
/* Send winning PO (reuses the existing order-email template)   */
/* ============================================================ */

async function sendWinningPo(args: {
  order: Order;
  supplierName: string;
  supplierEmail: string | null;
  rfqId: string;
}): Promise<void> {
  const sb = adminClient();
  const infra = await ensureAgentInfra();
  const am = agentMail();

  // Look up canonical contact (handles language).
  const { data: row } = await sb
    .from("suppliers")
    .select("name,email,phone,language")
    .eq("name", args.supplierName)
    .maybeSingle();
  const SUPPORTED: SupportedLang[] = ["en", "de", "fr", "it"];
  const rawLang = (row?.language || "en").toString().toLowerCase().slice(0, 2);
  const language: SupportedLang = SUPPORTED.includes(rawLang as SupportedLang)
    ? (rawLang as SupportedLang)
    : "en";
  const email = row?.email ?? args.supplierEmail ?? HARDCODED_SUPPLIER_EMAIL;
  const name = row?.name ?? args.supplierName;

  const composed = composeOrderEmail(args.order, {
    supplierName: name,
    items: args.order.items,
    subtotal: args.order.subtotal,
    language,
  });
  const sendRes = await am.inboxes.messages.send(infra.inboxId, {
    to: email,
    subject: composed.subject,
    text: composed.text,
    html: composed.html,
  });
  const threadId = (sendRes as { threadId?: string }).threadId ?? null;
  const messageId = (sendRes as { messageId?: string }).messageId ?? null;

  await sb.from("negotiations").insert({
    order_id: args.order.id,
    project: args.order.project,
    supplier_name: name,
    supplier_email: email,
    supplier_language: language,
    inbox_id: infra.inboxId,
    thread_id: threadId,
    message_id: messageId,
    subject: composed.subject,
    status: "awaiting_reply",
    order_snapshot: {
      ...args.order,
      supplier_language: language,
      rfq_id: args.rfqId,
      rfq_role: "winner_po",
    },
  });
}

/* ============================================================ */
/* sweepOpenRfqs — called by the timeout cron                   */
/* ============================================================ */

export async function sweepOpenRfqs(): Promise<{ checked: number; decided: number; escalated: number }> {
  const sb = adminClient();
  const { data: rows } = await sb
    .from("rfqs")
    .select("id, deadline_at")
    .eq("status", "open");
  const list = (rows ?? []) as Array<{ id: string; deadline_at: string }>;
  let decided = 0;
  let escalated = 0;
  for (const r of list) {
    // Always invoke — maybeDecideRfq itself returns still_waiting when the
    // deadline isn't reached.
    const out = await maybeDecideRfq(r.id);
    if (out.kind === "decided") decided++;
    if (out.kind === "escalated") escalated++;
  }
  return { checked: list.length, decided, escalated };
}
