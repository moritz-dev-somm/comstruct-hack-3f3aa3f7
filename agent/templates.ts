import type { Order } from "@/lib/orders";
import { formatEUR } from "@/lib/catalog";

/**
 * Email templates the supplier agent sends.
 * The AI-agent disclosure is kept short and compact per requirements.
 */

export type ComposedEmail = {
  subject: string;
  text: string;
  html: string;
};

const COMPANY = {
  name: "comstruct Bau GmbH",
  contact: "procurement@comstruct.example",
  phone: "+41 61 555 01 23",
  street: "Bahnhofstrasse 12",
  city: "4051 Basel, Switzerland",
  site: "Erlenmatt B3 site office, Basel, CH",
  agentName: "comstruct procurement agent",
};

const AGENT_DISCLOSURE_TEXT = `Sent automatically by ${COMPANY.name}'s AI procurement agent. Replies are routed to a human.`;
const AGENT_DISCLOSURE_HTML = `<p style="font-size:11px;color:#9ca3af;margin-top:14px"><em>${AGENT_DISCLOSURE_TEXT}</em></p>`;

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export type SupplierLanguage = "en" | "de" | "fr" | "it";

export type OrderEmailContext = {
  supplierName: string;
  items: Order["items"];
  subtotal: number;
  language?: SupplierLanguage;
};

type Strings = {
  subjectPrefix: string;
  greeting: (name: string) => string;
  intro: (project: string) => string;
  reference: string;
  buyer: string;
  deliverTo: string;
  items: string;
  estimatedSubtotal: string;
  exclVat: string;
  poAttached: string;
  pleaseTellUs: string;
  earliestDelivery: string;
  shippingCosts: string;
  flagDiscrepancy: string;
  needResponse: string;
  thanks: string;
  qty: string;
  item: string;
  unit: string;
  unitPrice: string;
  lineTotal: string;
  subtotalLabel: string;
};

const STRINGS: Record<SupplierLanguage, Strings> = {
  en: {
    subjectPrefix: "Purchase request",
    greeting: (n) => `Hello ${n} team,`,
    intro: (p) => `We would like to place the following order for project "${p}".`,
    reference: "Reference",
    buyer: "Buyer",
    deliverTo: "Deliver to",
    items: "Items",
    estimatedSubtotal: "Estimated subtotal",
    exclVat: "(excl. VAT, excl. shipping)",
    poAttached: "The full purchase order is attached as a PDF — please confirm it is correct.",
    pleaseTellUs: "Could you also let us know:",
    earliestDelivery: "The earliest delivery date you can commit to",
    shippingCosts: "Any shipping costs that are not already included",
    flagDiscrepancy:
      "If anything is unavailable, delayed, or differently priced, please flag it in your reply so we can route it to the right person quickly.",
    needResponse: "We need a response within 24 hours to keep the project on schedule.",
    thanks: "Thank you,",
    qty: "Qty",
    item: "Item",
    unit: "Unit",
    unitPrice: "Unit price",
    lineTotal: "Line total",
    subtotalLabel: "Subtotal",
  },
  de: {
    subjectPrefix: "Bestellanfrage",
    greeting: (n) => `Sehr geehrtes ${n}-Team,`,
    intro: (p) => `Wir möchten folgende Bestellung für das Projekt „${p}" aufgeben.`,
    reference: "Referenz",
    buyer: "Besteller",
    deliverTo: "Lieferadresse",
    items: "Positionen",
    estimatedSubtotal: "Voraussichtliche Zwischensumme",
    exclVat: "(exkl. MwSt., exkl. Versand)",
    poAttached: "Die vollständige Bestellung ist als PDF angehängt — bitte bestätigen Sie deren Richtigkeit.",
    pleaseTellUs: "Könnten Sie uns zusätzlich mitteilen:",
    earliestDelivery: "Den frühestmöglichen Liefertermin, den Sie zusichern können",
    shippingCosts: "Allfällige Versandkosten, die noch nicht enthalten sind",
    flagDiscrepancy:
      "Falls etwas nicht verfügbar, verzögert oder zu einem abweichenden Preis lieferbar ist, weisen Sie uns bitte in Ihrer Antwort darauf hin, damit wir es schnell an die richtige Person weiterleiten können.",
    needResponse: "Wir benötigen eine Antwort innerhalb von 24 Stunden, um den Projektplan einzuhalten.",
    thanks: "Vielen Dank,",
    qty: "Menge",
    item: "Artikel",
    unit: "Einheit",
    unitPrice: "Einzelpreis",
    lineTotal: "Gesamtpreis",
    subtotalLabel: "Zwischensumme",
  },
  fr: {
    subjectPrefix: "Demande d'achat",
    greeting: (n) => `Bonjour à l'équipe ${n},`,
    intro: (p) => `Nous souhaitons passer la commande suivante pour le projet « ${p} ».`,
    reference: "Référence",
    buyer: "Acheteur",
    deliverTo: "Livraison à",
    items: "Articles",
    estimatedSubtotal: "Sous-total estimé",
    exclVat: "(hors TVA, hors frais de port)",
    poAttached: "Le bon de commande complet est joint en PDF — merci de confirmer son exactitude.",
    pleaseTellUs: "Pourriez-vous également nous indiquer :",
    earliestDelivery: "La date de livraison la plus proche que vous pouvez garantir",
    shippingCosts: "Les éventuels frais de port non encore inclus",
    flagDiscrepancy:
      "Si un article est indisponible, retardé ou à un prix différent, merci de le signaler dans votre réponse afin que nous puissions le transmettre rapidement à la bonne personne.",
    needResponse: "Nous avons besoin d'une réponse sous 24 heures pour respecter le planning du projet.",
    thanks: "Merci,",
    qty: "Qté",
    item: "Article",
    unit: "Unité",
    unitPrice: "Prix unitaire",
    lineTotal: "Total ligne",
    subtotalLabel: "Sous-total",
  },
  it: {
    subjectPrefix: "Richiesta d'acquisto",
    greeting: (n) => `Salve team ${n},`,
    intro: (p) => `Vorremmo effettuare il seguente ordine per il progetto "${p}".`,
    reference: "Riferimento",
    buyer: "Acquirente",
    deliverTo: "Consegnare a",
    items: "Articoli",
    estimatedSubtotal: "Subtotale stimato",
    exclVat: "(IVA esclusa, spedizione esclusa)",
    poAttached: "L'ordine d'acquisto completo è allegato in PDF — vi preghiamo di confermarne la correttezza.",
    pleaseTellUs: "Potreste inoltre comunicarci:",
    earliestDelivery: "La data di consegna più rapida che potete garantire",
    shippingCosts: "Eventuali costi di spedizione non ancora inclusi",
    flagDiscrepancy:
      "Se qualcosa non è disponibile, è in ritardo o ha un prezzo diverso, vi preghiamo di segnalarlo nella risposta in modo da poterlo inoltrare rapidamente alla persona giusta.",
    needResponse: "Abbiamo bisogno di una risposta entro 24 ore per rispettare la pianificazione del progetto.",
    thanks: "Grazie,",
    qty: "Qtà",
    item: "Articolo",
    unit: "Unità",
    unitPrice: "Prezzo unitario",
    lineTotal: "Totale riga",
    subtotalLabel: "Subtotale",
  },
};

function renderTextBlock(s: Strings, order: Order, ctx: OrderEmailContext): string {
  const { supplierName, items, subtotal } = ctx;
  const lines = items.map(
    (i) => `- ${i.qty} × ${i.name} (${i.unit}) @ ${formatEUR(i.price)} → ${formatEUR(i.qty * i.price)}`,
  );
  return [
    s.greeting(supplierName),
    ``,
    s.intro(order.project),
    `${s.reference}: ${order.id}`,
    ``,
    `${s.buyer}:`,
    `  ${COMPANY.name}`,
    `  ${COMPANY.street}, ${COMPANY.city}`,
    `${s.deliverTo}:`,
    `  ${COMPANY.site}`,
    ``,
    `${s.items}:`,
    ...lines,
    ``,
    `${s.estimatedSubtotal}: ${formatEUR(subtotal)} ${s.exclVat}`,
    ``,
    s.poAttached,
    s.pleaseTellUs,
    `  - ${s.earliestDelivery}`,
    `  - ${s.shippingCosts}`,
    ``,
    s.flagDiscrepancy,
    ``,
    s.needResponse,
    ``,
    s.thanks,
    `${COMPANY.agentName}`,
    `${COMPANY.contact} · ${COMPANY.phone}`,
  ].join("\n");
}

function renderHtmlBlock(s: Strings, order: Order, ctx: OrderEmailContext): string {
  const { supplierName, items, subtotal } = ctx;
  const itemsHtml = items
    .map(
      (i) =>
        `<tr><td>${i.qty}</td><td>${escapeHtml(i.name)}</td><td>${escapeHtml(i.unit)}</td><td style="text-align:right">${formatEUR(i.price)}</td><td style="text-align:right">${formatEUR(i.qty * i.price)}</td></tr>`,
    )
    .join("");
  return `
  <p>${escapeHtml(s.greeting(supplierName))}</p>
  <p>${escapeHtml(s.intro(order.project))}<br/>
  ${escapeHtml(s.reference)}: <strong>${escapeHtml(order.id)}</strong></p>
  <table style="width:100%;margin:8px 0 12px 0;font-size:13px">
    <tr>
      <td style="vertical-align:top;width:50%">
        <div style="color:#6b7280;font-size:11px;text-transform:uppercase">${escapeHtml(s.buyer)}</div>
        <div><strong>${escapeHtml(COMPANY.name)}</strong></div>
        <div>${escapeHtml(COMPANY.street)}</div>
        <div>${escapeHtml(COMPANY.city)}</div>
      </td>
      <td style="vertical-align:top;width:50%">
        <div style="color:#6b7280;font-size:11px;text-transform:uppercase">${escapeHtml(s.deliverTo)}</div>
        <div><strong>Site: ${escapeHtml(order.project)}</strong></div>
        <div>${escapeHtml(COMPANY.site)}</div>
      </td>
    </tr>
  </table>
  <table style="border-collapse:collapse;width:100%;margin:12px 0">
    <thead><tr style="background:#f3f4f6">
      <th style="text-align:left;padding:6px">${escapeHtml(s.qty)}</th>
      <th style="text-align:left;padding:6px">${escapeHtml(s.item)}</th>
      <th style="text-align:left;padding:6px">${escapeHtml(s.unit)}</th>
      <th style="text-align:right;padding:6px">${escapeHtml(s.unitPrice)}</th>
      <th style="text-align:right;padding:6px">${escapeHtml(s.lineTotal)}</th>
    </tr></thead>
    <tbody>${itemsHtml}</tbody>
    <tfoot><tr><td colspan="4" style="text-align:right;padding:6px"><strong>${escapeHtml(s.subtotalLabel)}</strong></td>
      <td style="text-align:right;padding:6px"><strong>${formatEUR(subtotal)}</strong></td></tr></tfoot>
  </table>
  <p>${escapeHtml(s.poAttached)}</p>
  <p>${escapeHtml(s.pleaseTellUs)}</p>
  <ul>
    <li>${escapeHtml(s.earliestDelivery)}</li>
    <li>${escapeHtml(s.shippingCosts)}</li>
  </ul>
  <p>${escapeHtml(s.flagDiscrepancy)}<br/>
  ${escapeHtml(s.needResponse)}</p>
  <p>${escapeHtml(s.thanks)}<br/>
  ${escapeHtml(COMPANY.agentName)}<br/>
  ${escapeHtml(COMPANY.contact)} · ${escapeHtml(COMPANY.phone)}</p>`;
}

/**
 * Per-supplier order request. When the supplier's language is not English,
 * the email is bilingual: native language first, then English below.
 */
export function composeOrderEmail(order: Order, ctx: OrderEmailContext): ComposedEmail {
  const lang: SupplierLanguage = ctx.language ?? "en";
  const primary = STRINGS[lang];
  const english = STRINGS.en;
  const isBilingual = lang !== "en";

  const subjectBase = `${primary.subjectPrefix} — ${order.project} (${formatEUR(ctx.subtotal)})`;
  const subject = isBilingual
    ? `[${order.id}] ${subjectBase} / ${english.subjectPrefix} — ${order.project}`
    : `[${order.id}] ${subjectBase}`;

  const separator = "\n\n-------------------- English --------------------\n\n";
  const text =
    renderTextBlock(primary, order, ctx) +
    (isBilingual ? separator + renderTextBlock(english, order, ctx) : "") +
    `\n\n--\n${AGENT_DISCLOSURE_TEXT}`;

  const htmlSeparator = isBilingual
    ? `<hr style="margin:24px 0;border:none;border-top:1px solid #e5e7eb"/><p style="color:#6b7280;font-size:11px;text-transform:uppercase;letter-spacing:0.05em">English</p>`
    : "";
  const html = `
<div style="font-family:Helvetica,Arial,sans-serif;color:#161A1F;font-size:14px;line-height:1.55">
  ${renderHtmlBlock(primary, order, ctx)}
  ${htmlSeparator}
  ${isBilingual ? renderHtmlBlock(english, order, ctx) : ""}
  ${AGENT_DISCLOSURE_HTML}
</div>`;

  return { subject, text, html };
}

/** Confirmation reply sent when the supplier confirms everything cleanly. */
export function composeConfirmationEmail(
  order: Order,
  details: { leadTime?: string | null },
): ComposedEmail {
  const subject = `Re: [${order.id}] Order confirmed — thank you`;
  const eta = details.leadTime ? `Noted delivery: ${details.leadTime}.` : "";
  const text = [
    `Hello,`,
    ``,
    `Thank you for confirming order ${order.id}. We are treating this as`,
    `firmly placed on the terms in your reply.`,
    eta,
    ``,
    `Please send the dispatch note and invoice to ${COMPANY.contact} when`,
    `the goods leave your warehouse.`,
    ``,
    `Best regards,`,
    `${COMPANY.agentName}`,
    ``,
    `--`,
    AGENT_DISCLOSURE_TEXT,
  ].filter(Boolean).join("\n");
  const html = `<div style="font-family:Helvetica,Arial,sans-serif;color:#161A1F;font-size:14px;line-height:1.55">
    <p>Hello,</p>
    <p>Thank you for confirming order <strong>${escapeHtml(order.id)}</strong>. We are treating this as firmly placed on the terms in your reply.</p>
    ${eta ? `<p>${escapeHtml(eta)}</p>` : ""}
    <p>Please send the dispatch note and invoice to ${escapeHtml(COMPANY.contact)} when the goods leave your warehouse.</p>
    <p>Best regards,<br/>${escapeHtml(COMPANY.agentName)}</p>
    ${AGENT_DISCLOSURE_HTML}
  </div>`;
  return { subject, text, html };
}

/** Follow-up nudge when the supplier has gone quiet but we're not giving up yet. */
export function composeNudgeEmail(order: Order): ComposedEmail {
  const subject = `Re: [${order.id}] Friendly nudge — still need confirmation`;
  const text = [
    `Hello,`,
    ``,
    `Just following up on our request ${order.id} sent earlier. We have not yet`,
    `received a confirmation and the items are needed on site shortly.`,
    ``,
    `Could you let us know availability and earliest delivery date today?`,
    ``,
    `Thanks,`,
    `${COMPANY.agentName}`,
    ``,
    `--`,
    AGENT_DISCLOSURE_TEXT,
  ].join("\n");
  return { subject, text, html: `<p>${text.replace(/\n/g, "<br/>")}</p>` };
}
