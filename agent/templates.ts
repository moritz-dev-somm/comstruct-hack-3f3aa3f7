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

/* ----- Targeted follow-up for missing PO checklist fields ----- */

export type ChecklistField = "delivery_date" | "shipping_cost";

type FollowupStrings = {
  subject: string;
  greeting: string;
  intro: (orderId: string) => string;
  outro: string;
  sign: string;
  bullets: Record<ChecklistField, string>;
};

const FOLLOWUP_STRINGS: Record<SupplierLanguage, FollowupStrings> = {
  en: {
    subject: "Quick follow-up — missing details",
    greeting: "Hello,",
    intro: (id) =>
      `Thank you for confirming order ${id}. To finalise it on our side, could you confirm the following point${"s"} we asked about in the original request:`,
    outro:
      "A one-line reply is enough — no need to repeat the rest of the order.",
    sign: "Thanks,",
    bullets: {
      delivery_date: "Earliest delivery date you can commit to",
      shipping_cost: "Shipping costs (or confirm shipping is included)",
    },
  },
  de: {
    subject: "Kurze Rückfrage — fehlende Angaben",
    greeting: "Guten Tag,",
    intro: (id) =>
      `Vielen Dank für die Bestätigung der Bestellung ${id}. Für den finalen Abschluss benötigen wir noch folgende Angabe(n) aus unserer ursprünglichen Anfrage:`,
    outro: "Eine kurze Rückmeldung genügt — die übrigen Punkte müssen nicht wiederholt werden.",
    sign: "Vielen Dank,",
    bullets: {
      delivery_date: "Frühestmöglicher Liefertermin, den Sie zusichern können",
      shipping_cost: "Versandkosten (oder Bestätigung, dass der Versand inbegriffen ist)",
    },
  },
  fr: {
    subject: "Petite relance — informations manquantes",
    greeting: "Bonjour,",
    intro: (id) =>
      `Merci pour la confirmation de la commande ${id}. Pour finaliser de notre côté, pourriez-vous nous confirmer le(s) point(s) suivant(s) demandés dans la requête initiale :`,
    outro: "Une réponse en une ligne suffit — inutile de répéter le reste de la commande.",
    sign: "Merci,",
    bullets: {
      delivery_date: "Date de livraison la plus proche que vous pouvez garantir",
      shipping_cost: "Frais de port (ou confirmation que le port est inclus)",
    },
  },
  it: {
    subject: "Breve sollecito — informazioni mancanti",
    greeting: "Salve,",
    intro: (id) =>
      `Grazie per aver confermato l'ordine ${id}. Per finalizzarlo dalla nostra parte, potreste confermare il/i seguente/i punto/i richiesto/i nella richiesta iniziale:`,
    outro: "È sufficiente una breve risposta — non serve ripetere il resto dell'ordine.",
    sign: "Grazie,",
    bullets: {
      delivery_date: "Data di consegna più rapida che potete garantire",
      shipping_cost: "Costi di spedizione (oppure conferma che la spedizione è inclusa)",
    },
  },
};

function renderFollowupBlock(
  s: FollowupStrings,
  orderId: string,
  missing: ChecklistField[],
): string {
  const bullets = missing.map((f) => `- ${s.bullets[f]}`).join("\n");
  return [
    s.greeting,
    ``,
    s.intro(orderId),
    bullets,
    ``,
    s.outro,
    ``,
    s.sign,
    `${COMPANY.agentName}`,
    `${COMPANY.contact} · ${COMPANY.phone}`,
  ].join("\n");
}

function renderFollowupHtml(
  s: FollowupStrings,
  orderId: string,
  missing: ChecklistField[],
): string {
  const bullets = missing.map((f) => `<li>${escapeHtml(s.bullets[f])}</li>`).join("");
  return `
    <p>${escapeHtml(s.greeting)}</p>
    <p>${escapeHtml(s.intro(orderId))}</p>
    <ul>${bullets}</ul>
    <p>${escapeHtml(s.outro)}</p>
    <p>${escapeHtml(s.sign)}<br/>${escapeHtml(COMPANY.agentName)}<br/>${escapeHtml(COMPANY.contact)} · ${escapeHtml(COMPANY.phone)}</p>`;
}

/**
 * Targeted follow-up reply asking only for the specific PO fields that the
 * supplier did not answer (delivery date / shipping cost). Bilingual when the
 * supplier language is not English.
 */
export function composeFollowupEmail(
  order: Order,
  missing: ChecklistField[],
  language: SupplierLanguage = "en",
): ComposedEmail {
  const safeMissing = missing.filter(
    (f) => f === "delivery_date" || f === "shipping_cost",
  );
  const primary = FOLLOWUP_STRINGS[language];
  const english = FOLLOWUP_STRINGS.en;
  const isBilingual = language !== "en";

  const subject = isBilingual
    ? `Re: [${order.id}] ${primary.subject} / ${english.subject}`
    : `Re: [${order.id}] ${primary.subject}`;

  const separator = "\n\n-------------------- English --------------------\n\n";
  const text =
    renderFollowupBlock(primary, order.id, safeMissing) +
    (isBilingual ? separator + renderFollowupBlock(english, order.id, safeMissing) : "") +
    `\n\n--\n${AGENT_DISCLOSURE_TEXT}`;

  const htmlSeparator = isBilingual
    ? `<hr style="margin:24px 0;border:none;border-top:1px solid #e5e7eb"/><p style="color:#6b7280;font-size:11px;text-transform:uppercase;letter-spacing:0.05em">English</p>`
    : "";
  const html = `
<div style="font-family:Helvetica,Arial,sans-serif;color:#161A1F;font-size:14px;line-height:1.55">
  ${renderFollowupHtml(primary, order.id, safeMissing)}
  ${htmlSeparator}
  ${isBilingual ? renderFollowupHtml(english, order.id, safeMissing) : ""}
  ${AGENT_DISCLOSURE_HTML}
</div>`;

  return { subject, text, html };
}

/* ============================================================
   Additional outbound composers used by the inbound policy layer.
   All bilingual when supplier language is not English.
   ============================================================ */

type SimpleStrings = {
  subject: string;
  greeting: string;
  body: (orderId: string) => string;
  sign: string;
};

function renderSimple(s: SimpleStrings, orderId: string): string {
  return [s.greeting, ``, s.body(orderId), ``, s.sign, COMPANY.agentName, `${COMPANY.contact} · ${COMPANY.phone}`].join("\n");
}
function renderSimpleHtml(s: SimpleStrings, orderId: string): string {
  return `<p>${escapeHtml(s.greeting)}</p><p>${escapeHtml(s.body(orderId))}</p><p>${escapeHtml(s.sign)}<br/>${escapeHtml(COMPANY.agentName)}<br/>${escapeHtml(COMPANY.contact)} · ${escapeHtml(COMPANY.phone)}</p>`;
}

function bilingual(
  order: Order,
  language: SupplierLanguage,
  subjectFor: (s: SimpleStrings) => string,
  byLang: Record<SupplierLanguage, SimpleStrings>,
): ComposedEmail {
  const primary = byLang[language];
  const english = byLang.en;
  const isBi = language !== "en";
  const subject = isBi
    ? `Re: [${order.id}] ${subjectFor(primary)} / ${subjectFor(english)}`
    : `Re: [${order.id}] ${subjectFor(primary)}`;
  const sep = "\n\n-------------------- English --------------------\n\n";
  const text =
    renderSimple(primary, order.id) +
    (isBi ? sep + renderSimple(english, order.id) : "") +
    `\n\n--\n${AGENT_DISCLOSURE_TEXT}`;
  const htmlSep = isBi
    ? `<hr style="margin:24px 0;border:none;border-top:1px solid #e5e7eb"/><p style="color:#6b7280;font-size:11px;text-transform:uppercase;letter-spacing:0.05em">English</p>`
    : "";
  const html = `<div style="font-family:Helvetica,Arial,sans-serif;color:#161A1F;font-size:14px;line-height:1.55">${renderSimpleHtml(primary, order.id)}${htmlSep}${isBi ? renderSimpleHtml(english, order.id) : ""}${AGENT_DISCLOSURE_HTML}</div>`;
  return { subject, text, html };
}

/* ---------- Clarification request ---------- */
const CLARIFY: Record<SupplierLanguage, SimpleStrings> = {
  en: {
    subject: "Clarification needed",
    greeting: "Hello,",
    body: (id) =>
      `Thank you for your reply on order ${id}. We were not able to determine clearly whether you can fulfil the order, or what changes you propose. Could you confirm in one short line whether you accept the order as sent, and flag any delays, price changes, or unavailable items?`,
    sign: "Thanks,",
  },
  de: {
    subject: "Klärung benötigt",
    greeting: "Guten Tag,",
    body: (id) =>
      `Vielen Dank für Ihre Antwort zur Bestellung ${id}. Wir konnten nicht eindeutig erkennen, ob Sie die Bestellung wie versendet annehmen oder welche Änderungen Sie vorschlagen. Könnten Sie uns kurz bestätigen, ob die Bestellung angenommen wird, und allfällige Verzögerungen, Preisänderungen oder nicht verfügbare Artikel angeben?`,
    sign: "Vielen Dank,",
  },
  fr: {
    subject: "Clarification nécessaire",
    greeting: "Bonjour,",
    body: (id) =>
      `Merci pour votre réponse concernant la commande ${id}. Nous n'avons pas pu déterminer clairement si vous pouvez l'honorer telle quelle ou quelles modifications vous proposez. Pourriez-vous nous confirmer en une ligne si la commande est acceptée et signaler tout retard, changement de prix ou article indisponible ?`,
    sign: "Merci,",
  },
  it: {
    subject: "Chiarimento necessario",
    greeting: "Salve,",
    body: (id) =>
      `Grazie per la risposta sull'ordine ${id}. Non siamo riusciti a capire chiaramente se potete evadere l'ordine così come inviato o quali modifiche proponete. Potreste confermarci in una riga se l'ordine è accettato e segnalare eventuali ritardi, variazioni di prezzo o articoli non disponibili?`,
    sign: "Grazie,",
  },
};
export function composeClarificationRequestEmail(order: Order, language: SupplierLanguage = "en"): ComposedEmail {
  return bilingual(order, language, (s) => s.subject, CLARIFY);
}

/* ---------- Decline acknowledgment ---------- */
const DECLINE: Record<SupplierLanguage, SimpleStrings> = {
  en: {
    subject: "Order will be sourced elsewhere — thanks",
    greeting: "Hello,",
    body: (id) =>
      `Thank you for letting us know about order ${id}. We will source these items elsewhere this time and will keep you on file for future requests. We appreciate the quick reply.`,
    sign: "Best regards,",
  },
  de: {
    subject: "Bestellung wird anderweitig beschafft — vielen Dank",
    greeting: "Guten Tag,",
    body: (id) =>
      `Vielen Dank für die Rückmeldung zur Bestellung ${id}. Wir werden die Artikel dieses Mal anderweitig beschaffen und behalten Sie für künftige Anfragen gerne im Auge. Besten Dank für die schnelle Antwort.`,
    sign: "Mit freundlichen Grüssen,",
  },
  fr: {
    subject: "Commande approvisionnée ailleurs — merci",
    greeting: "Bonjour,",
    body: (id) =>
      `Merci pour votre retour concernant la commande ${id}. Nous nous approvisionnerons ailleurs cette fois et garderons votre contact pour de futures demandes. Merci pour votre réponse rapide.`,
    sign: "Cordialement,",
  },
  it: {
    subject: "Ordine acquistato altrove — grazie",
    greeting: "Salve,",
    body: (id) =>
      `Grazie per la risposta sull'ordine ${id}. Per questa volta ci approvvigioneremo altrove e vi terremo a riferimento per future richieste. Grazie per la risposta rapida.`,
    sign: "Cordiali saluti,",
  },
};
export function composeDeclineAckEmail(order: Order, language: SupplierLanguage = "en"): ComposedEmail {
  return bilingual(order, language, (s) => s.subject, DECLINE);
}

/* ---------- Issues acknowledgment (routing to procurement) ---------- */
const ISSUES: Record<SupplierLanguage, SimpleStrings> = {
  en: {
    subject: "Received — routing to procurement",
    greeting: "Hello,",
    body: (id) =>
      `Thank you for your reply on order ${id}. We have noted the points you raised and are routing them to our procurement team for review. We will follow up shortly with a decision.`,
    sign: "Best regards,",
  },
  de: {
    subject: "Antwort erhalten — wird an den Einkauf weitergeleitet",
    greeting: "Guten Tag,",
    body: (id) =>
      `Vielen Dank für Ihre Antwort zur Bestellung ${id}. Wir haben die genannten Punkte notiert und leiten sie zur Prüfung an unseren Einkauf weiter. Eine Rückmeldung folgt in Kürze.`,
    sign: "Mit freundlichen Grüssen,",
  },
  fr: {
    subject: "Bien reçu — transmis aux achats",
    greeting: "Bonjour,",
    body: (id) =>
      `Merci pour votre réponse concernant la commande ${id}. Nous avons noté les points soulevés et les transmettons à notre service achats pour examen. Nous reviendrons vers vous très prochainement.`,
    sign: "Cordialement,",
  },
  it: {
    subject: "Ricevuto — inoltrato all'ufficio acquisti",
    greeting: "Salve,",
    body: (id) =>
      `Grazie per la risposta sull'ordine ${id}. Abbiamo preso nota dei punti segnalati e li stiamo inoltrando al nostro ufficio acquisti per valutazione. Vi ricontatteremo a breve.`,
    sign: "Cordiali saluti,",
  },
};
export function composeIssuesAckEmail(order: Order, language: SupplierLanguage = "en"): ComposedEmail {
  return bilingual(order, language, (s) => s.subject, ISSUES);
}

/* ---------- Answer supplier's questions from PO data ---------- */
const ANSWER_HEAD: Record<SupplierLanguage, { subject: string; greeting: string; intro: (id: string) => string; sign: string }> = {
  en: { subject: "Answers to your questions", greeting: "Hello,", intro: (id) => `Thanks for your reply on order ${id}. Here are the answers to your questions:`, sign: "Best regards," },
  de: { subject: "Antworten auf Ihre Fragen", greeting: "Guten Tag,", intro: (id) => `Vielen Dank für Ihre Antwort zur Bestellung ${id}. Hier die Antworten auf Ihre Fragen:`, sign: "Mit freundlichen Grüssen," },
  fr: { subject: "Réponses à vos questions", greeting: "Bonjour,", intro: (id) => `Merci pour votre réponse concernant la commande ${id}. Voici les réponses à vos questions :`, sign: "Cordialement," },
  it: { subject: "Risposte alle vostre domande", greeting: "Salve,", intro: (id) => `Grazie per la risposta sull'ordine ${id}. Di seguito le risposte alle vostre domande:`, sign: "Cordiali saluti," },
};

export type QuestionAnswer = { question: string; answer: string };

export function composeAnswerQuestionsEmail(
  order: Order,
  qa: QuestionAnswer[],
  language: SupplierLanguage = "en",
): ComposedEmail {
  const primary = ANSWER_HEAD[language];
  const english = ANSWER_HEAD.en;
  const isBi = language !== "en";

  const subject = isBi
    ? `Re: [${order.id}] ${primary.subject} / ${english.subject}`
    : `Re: [${order.id}] ${primary.subject}`;

  const block = (s: typeof primary) => {
    const lines = qa.map((p) => `Q: ${p.question}\nA: ${p.answer}`).join("\n\n");
    return [s.greeting, ``, s.intro(order.id), ``, lines, ``, s.sign, COMPANY.agentName, `${COMPANY.contact} · ${COMPANY.phone}`].join("\n");
  };
  const blockHtml = (s: typeof primary) => {
    const items = qa
      .map((p) => `<li><div><strong>${escapeHtml(p.question)}</strong></div><div>${escapeHtml(p.answer)}</div></li>`)
      .join("");
    return `<p>${escapeHtml(s.greeting)}</p><p>${escapeHtml(s.intro(order.id))}</p><ul>${items}</ul><p>${escapeHtml(s.sign)}<br/>${escapeHtml(COMPANY.agentName)}<br/>${escapeHtml(COMPANY.contact)} · ${escapeHtml(COMPANY.phone)}</p>`;
  };

  const sep = "\n\n-------------------- English --------------------\n\n";
  const text = block(primary) + (isBi ? sep + block(english) : "") + `\n\n--\n${AGENT_DISCLOSURE_TEXT}`;
  const htmlSep = isBi
    ? `<hr style="margin:24px 0;border:none;border-top:1px solid #e5e7eb"/><p style="color:#6b7280;font-size:11px;text-transform:uppercase;letter-spacing:0.05em">English</p>`
    : "";
  const html = `<div style="font-family:Helvetica,Arial,sans-serif;color:#161A1F;font-size:14px;line-height:1.55">${blockHtml(primary)}${htmlSep}${isBi ? blockHtml(english) : ""}${AGENT_DISCLOSURE_HTML}</div>`;

  return { subject, text, html };
}

/**
 * Build factual answers from order + company context for the LLM-classified
 * answerable_questions. We keep this template-based to avoid hallucinated
 * prices or dates — the LLM only picked the questions; we picked the facts.
 */
export function buildAnswersFromOrder(order: Order, questions: string[]): QuestionAnswer[] {
  const lower = (s: string) => s.toLowerCase();
  const facts: Array<{ match: RegExp; answer: string }> = [
    { match: /vat|tva|mwst|iva|tax id|ust|uid/i, answer: `Buyer: ${COMPANY.name}, ${COMPANY.street}, ${COMPANY.city}. (VAT ID on request — contact ${COMPANY.contact}.)` },
    { match: /deliver|delivery address|liefer|livraison|consegna|ship to|site address|adresse/i, answer: `Deliver to: ${COMPANY.site}.` },
    { match: /payment|zahlung|paiement|pagamento|invoice|rechnung|facture|fattura/i, answer: `Standard payment terms: 30 days net. Send invoice to ${COMPANY.contact}.` },
    { match: /contact|ansprech|téléphone|telefono|phone|email/i, answer: `Contact: ${COMPANY.agentName}, ${COMPANY.contact}, ${COMPANY.phone}.` },
    { match: /project|projekt|projet|progetto|reference|referenz/i, answer: `Project: ${order.project}. Reference: ${order.id}.` },
    { match: /items?|positionen|articles?|articoli|line items|skus?|quantit/i, answer: `Items (qty × name @ unit price):\n${order.items.map((i) => `  - ${i.qty} × ${i.name} @ ${i.price}`).join("\n")}\nSubtotal: ${order.subtotal} EUR (excl. VAT, excl. shipping).` },
  ];
  return questions.map((q) => {
    const fact = facts.find((f) => f.match.test(lower(q)));
    return { question: q, answer: fact ? fact.answer : `We are checking this internally and will follow up shortly.` };
  });
}
