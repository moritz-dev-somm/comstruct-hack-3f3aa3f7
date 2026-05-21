import type { Order } from "@/lib/orders";
import { formatEUR } from "@/lib/catalog";

/**
 * Email templates the supplier agent sends.
 *
 * Conventions:
 * - All emails are short.
 * - When the supplier's language is not English, the email is bilingual:
 *   ENGLISH FIRST, then the supplier's native language.
 * - The clarification email re-uses the original PO's checklist questions
 *   so the fallback wording matches what we first asked.
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

export type SupplierLanguage = "en" | "de" | "fr" | "it";

const DISCLOSURE: Record<SupplierLanguage, string> = {
  en: `Sent automatically by ${COMPANY.name}'s AI procurement agent.`,
  de: `Automatisch gesendet vom KI-Beschaffungsagenten der ${COMPANY.name}.`,
  fr: `Envoyé automatiquement par l'agent IA d'approvisionnement de ${COMPANY.name}.`,
  it: `Inviato automaticamente dall'agente IA per gli acquisti di ${COMPANY.name}.`,
};
const disclosureHtml = (text: string) =>
  `<p style="font-size:11px;color:#9ca3af;margin-top:14px"><em>${escapeHtml(text)}</em></p>`;

const SEP_TEXT = "\n\n-------------------- ";
const SEP_TEXT_END = " --------------------\n\n";
const SEP_HTML = (label: string) =>
  `<hr style="margin:24px 0;border:none;border-top:1px solid #e5e7eb"/><p style="color:#6b7280;font-size:11px;text-transform:uppercase;letter-spacing:0.05em">${label}</p>`;

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const LANG_LABEL: Record<SupplierLanguage, string> = {
  en: "English",
  de: "Deutsch",
  fr: "Français",
  it: "Italiano",
};

/**
 * Assemble a bilingual email with English ALWAYS first, then the supplier's
 * native language below. When the supplier language is English we just emit
 * the English block once. The agent disclosure is rendered in BOTH languages,
 * once under each block, so each half is self-contained.
 */
function assembleBilingual(args: {
  language: SupplierLanguage;
  subjectEn: string;
  subjectNative: string;
  textEn: string;
  textNative: string;
  htmlEn: string;
  htmlNative: string;
}): ComposedEmail {
  const isBi = args.language !== "en";
  const discEn = DISCLOSURE.en;
  const discNative = DISCLOSURE[args.language];
  const subject = isBi ? `${args.subjectEn} / ${args.subjectNative}` : args.subjectEn;
  const text = isBi
    ? args.textEn +
      `\n\n--\n${discEn}` +
      SEP_TEXT +
      LANG_LABEL[args.language] +
      SEP_TEXT_END +
      args.textNative +
      `\n\n--\n${discNative}`
    : args.textEn + `\n\n--\n${discEn}`;
  const html = `
<div style="font-family:Helvetica,Arial,sans-serif;color:#161A1F;font-size:14px;line-height:1.55">
  ${args.htmlEn}
  ${disclosureHtml(discEn)}
  ${isBi ? SEP_HTML(LANG_LABEL[args.language]) : ""}
  ${isBi ? args.htmlNative : ""}
  ${isBi ? disclosureHtml(discNative) : ""}
</div>`;
  return { subject, text, html };
}

/* ============================================================
   1. Initial purchase-order request
   ============================================================ */

export type OrderEmailContext = {
  supplierName: string;
  items: Order["items"];
  subtotal: number;
  language?: SupplierLanguage;
};

type OrderStrings = {
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

const ORDER_STRINGS: Record<SupplierLanguage, OrderStrings> = {
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
      "If anything is unavailable, delayed, or differently priced, please flag it in your reply.",
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
    poAttached:
      "Die vollständige Bestellung ist als PDF angehängt — bitte bestätigen Sie deren Richtigkeit.",
    pleaseTellUs: "Könnten Sie uns zusätzlich mitteilen:",
    earliestDelivery: "Den frühestmöglichen Liefertermin, den Sie zusichern können",
    shippingCosts: "Allfällige Versandkosten, die noch nicht enthalten sind",
    flagDiscrepancy:
      "Falls etwas nicht verfügbar, verzögert oder zu einem abweichenden Preis lieferbar ist, weisen Sie uns bitte in Ihrer Antwort darauf hin.",
    needResponse:
      "Wir benötigen eine Antwort innerhalb von 24 Stunden, um den Projektplan einzuhalten.",
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
      "Si un article est indisponible, retardé ou à un prix différent, merci de le signaler dans votre réponse.",
    needResponse:
      "Nous avons besoin d'une réponse sous 24 heures pour respecter le planning du projet.",
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
    poAttached:
      "L'ordine d'acquisto completo è allegato in PDF — vi preghiamo di confermarne la correttezza.",
    pleaseTellUs: "Potreste inoltre comunicarci:",
    earliestDelivery: "La data di consegna più rapida che potete garantire",
    shippingCosts: "Eventuali costi di spedizione non ancora inclusi",
    flagDiscrepancy:
      "Se qualcosa non è disponibile, è in ritardo o ha un prezzo diverso, vi preghiamo di segnalarlo nella risposta.",
    needResponse:
      "Abbiamo bisogno di una risposta entro 24 ore per rispettare la pianificazione del progetto.",
    thanks: "Grazie,",
    qty: "Qtà",
    item: "Articolo",
    unit: "Unità",
    unitPrice: "Prezzo unitario",
    lineTotal: "Totale riga",
    subtotalLabel: "Subtotale",
  },
};

function renderOrderText(s: OrderStrings, order: Order, ctx: OrderEmailContext): string {
  const { supplierName, items, subtotal } = ctx;
  const lines = items.map(
    (i) =>
      `- ${i.qty} × ${i.name} (${i.unit}) @ ${formatEUR(i.price)} → ${formatEUR(i.qty * i.price)}`,
  );
  return [
    s.greeting(supplierName),
    ``,
    s.intro(order.project),
    `${s.reference}: ${order.id}`,
    ``,
    `${s.buyer}: ${COMPANY.name}, ${COMPANY.street}, ${COMPANY.city}`,
    `${s.deliverTo}: ${COMPANY.site}`,
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
    s.needResponse,
    ``,
    s.thanks,
    `${COMPANY.agentName}`,
    `${COMPANY.contact} · ${COMPANY.phone}`,
  ].join("\n");
}

function renderOrderHtml(s: OrderStrings, order: Order, ctx: OrderEmailContext): string {
  const { supplierName, items, subtotal } = ctx;
  const itemsHtml = items
    .map(
      (i) =>
        `<tr><td>${i.qty}</td><td>${escapeHtml(i.name)}</td><td>${escapeHtml(i.unit)}</td><td style="text-align:right">${formatEUR(i.price)}</td><td style="text-align:right">${formatEUR(i.qty * i.price)}</td></tr>`,
    )
    .join("");
  return `
  <p>${escapeHtml(s.greeting(supplierName))}</p>
  <p>${escapeHtml(s.intro(order.project))}<br/>${escapeHtml(s.reference)}: <strong>${escapeHtml(order.id)}</strong></p>
  <table style="width:100%;margin:8px 0 12px 0;font-size:13px">
    <tr>
      <td style="vertical-align:top;width:50%">
        <div style="color:#6b7280;font-size:11px;text-transform:uppercase">${escapeHtml(s.buyer)}</div>
        <div><strong>${escapeHtml(COMPANY.name)}</strong></div>
        <div>${escapeHtml(COMPANY.street)}, ${escapeHtml(COMPANY.city)}</div>
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
  <p>${escapeHtml(s.flagDiscrepancy)}<br/>${escapeHtml(s.needResponse)}</p>
  <p>${escapeHtml(s.thanks)}<br/>${escapeHtml(COMPANY.agentName)}<br/>${escapeHtml(COMPANY.contact)} · ${escapeHtml(COMPANY.phone)}</p>`;
}

export function composeOrderEmail(order: Order, ctx: OrderEmailContext): ComposedEmail {
  const lang: SupplierLanguage = ctx.language ?? "en";
  const en = ORDER_STRINGS.en;
  const native = ORDER_STRINGS[lang];
  return assembleBilingual({
    language: lang,
    subjectEn: `[${order.id}] ${en.subjectPrefix} — ${order.project} (${formatEUR(ctx.subtotal)})`,
    subjectNative: `${native.subjectPrefix} — ${order.project}`,
    textEn: renderOrderText(en, order, ctx),
    textNative: renderOrderText(native, order, ctx),
    htmlEn: renderOrderHtml(en, order, ctx),
    htmlNative: renderOrderHtml(native, order, ctx),
  });
}

/* ============================================================
   2. Confirmation (short)
   ============================================================ */

const CONFIRM: Record<
  SupplierLanguage,
  { subject: string; body: (id: string, eta: string) => string }
> = {
  en: {
    subject: "Order confirmed — thank you",
    body: (id, eta) =>
      `Thank you for confirming order ${id}. We are treating it as firmly placed.${eta ? ` ${eta}` : ""} Please send the dispatch note and invoice to ${COMPANY.contact}.`,
  },
  de: {
    subject: "Bestellung bestätigt — vielen Dank",
    body: (id, eta) =>
      `Vielen Dank für die Bestätigung der Bestellung ${id}. Wir betrachten sie als fest erteilt.${eta ? ` ${eta}` : ""} Bitte senden Sie Lieferschein und Rechnung an ${COMPANY.contact}.`,
  },
  fr: {
    subject: "Commande confirmée — merci",
    body: (id, eta) =>
      `Merci pour la confirmation de la commande ${id}. Elle est considérée comme fermement passée.${eta ? ` ${eta}` : ""} Merci d'envoyer le bordereau et la facture à ${COMPANY.contact}.`,
  },
  it: {
    subject: "Ordine confermato — grazie",
    body: (id, eta) =>
      `Grazie per aver confermato l'ordine ${id}. Lo consideriamo fermamente piazzato.${eta ? ` ${eta}` : ""} Inviate bolla e fattura a ${COMPANY.contact}.`,
  },
};

function etaLine(lang: SupplierLanguage, leadTime: string | null | undefined): string {
  if (!leadTime) return "";
  switch (lang) {
    case "de":
      return `Liefertermin notiert: ${leadTime}.`;
    case "fr":
      return `Livraison notée : ${leadTime}.`;
    case "it":
      return `Consegna annotata: ${leadTime}.`;
    default:
      return `Noted delivery: ${leadTime}.`;
  }
}

function renderConfirmText(
  s: (typeof CONFIRM)["en"],
  greeting: string,
  sign: string,
  orderId: string,
  eta: string,
): string {
  return [greeting, ``, s.body(orderId, eta), ``, sign, COMPANY.agentName].join("\n");
}
function renderConfirmHtml(
  s: (typeof CONFIRM)["en"],
  greeting: string,
  sign: string,
  orderId: string,
  eta: string,
): string {
  return `<p>${escapeHtml(greeting)}</p><p>${escapeHtml(s.body(orderId, eta))}</p><p>${escapeHtml(sign)}<br/>${escapeHtml(COMPANY.agentName)}</p>`;
}

const GREETING: Record<SupplierLanguage, string> = {
  en: "Hello,",
  de: "Guten Tag,",
  fr: "Bonjour,",
  it: "Salve,",
};
const SIGN: Record<SupplierLanguage, string> = {
  en: "Best regards,",
  de: "Mit freundlichen Grüssen,",
  fr: "Cordialement,",
  it: "Cordiali saluti,",
};

export function composeConfirmationEmail(
  order: Order,
  details: { leadTime?: string | null },
  language: SupplierLanguage = "en",
): ComposedEmail {
  const en = CONFIRM.en;
  const native = CONFIRM[language];
  const etaEn = etaLine("en", details.leadTime);
  const etaNative = etaLine(language, details.leadTime);
  return assembleBilingual({
    language,
    subjectEn: `Re: [${order.id}] ${en.subject}`,
    subjectNative: native.subject,
    textEn: renderConfirmText(en, GREETING.en, SIGN.en, order.id, etaEn),
    textNative: renderConfirmText(native, GREETING[language], SIGN[language], order.id, etaNative),
    htmlEn: renderConfirmHtml(en, GREETING.en, SIGN.en, order.id, etaEn),
    htmlNative: renderConfirmHtml(native, GREETING[language], SIGN[language], order.id, etaNative),
  });
}

/* ============================================================
   3. Nudge (silent supplier) — only used by the manual nudge fn
   ============================================================ */

const NUDGE: Record<
  SupplierLanguage,
  { subject: string; body: (id: string) => string; sign: string }
> = {
  en: {
    subject: "Friendly nudge — still need confirmation",
    body: (id) =>
      `Just following up on our request ${id}. Could you confirm availability and earliest delivery date today?`,
    sign: "Thanks,",
  },
  de: {
    subject: "Freundliche Erinnerung — Bestätigung noch ausstehend",
    body: (id) =>
      `Wir kommen kurz auf unsere Anfrage ${id} zurück. Können Sie heute Verfügbarkeit und frühestmöglichen Liefertermin bestätigen?`,
    sign: "Vielen Dank,",
  },
  fr: {
    subject: "Petite relance — confirmation toujours attendue",
    body: (id) =>
      `Petit rappel concernant notre demande ${id}. Pouvez-vous confirmer aujourd'hui la disponibilité et la date de livraison la plus proche ?`,
    sign: "Merci,",
  },
  it: {
    subject: "Cortese sollecito — conferma ancora necessaria",
    body: (id) =>
      `Un breve sollecito sulla nostra richiesta ${id}. Potete confermare oggi disponibilità e data di consegna più rapida?`,
    sign: "Grazie,",
  },
};

export function composeNudgeEmail(order: Order, language: SupplierLanguage = "en"): ComposedEmail {
  const en = NUDGE.en;
  const native = NUDGE[language];
  const block = (s: (typeof NUDGE)["en"], greeting: string) =>
    [greeting, ``, s.body(order.id), ``, s.sign, COMPANY.agentName].join("\n");
  const blockHtml = (s: (typeof NUDGE)["en"], greeting: string) =>
    `<p>${escapeHtml(greeting)}</p><p>${escapeHtml(s.body(order.id))}</p><p>${escapeHtml(s.sign)}<br/>${escapeHtml(COMPANY.agentName)}</p>`;
  return assembleBilingual({
    language,
    subjectEn: `Re: [${order.id}] ${en.subject}`,
    subjectNative: native.subject,
    textEn: block(en, GREETING.en),
    textNative: block(native, GREETING[language]),
    htmlEn: blockHtml(en, GREETING.en),
    htmlNative: blockHtml(native, GREETING[language]),
  });
}

/* ============================================================
   4. Targeted follow-up — only the still-missing checklist items
   ============================================================ */

export type ChecklistField = "delivery_date" | "shipping_cost";

type FollowupStrings = {
  subject: string;
  intro: (orderId: string) => string;
  sign: string;
  bullets: Record<ChecklistField, string>;
};

const FOLLOWUP_STRINGS: Record<SupplierLanguage, FollowupStrings> = {
  en: {
    subject: "Quick follow-up — missing details",
    intro: (id) =>
      `Thank you for confirming order ${id}. Could you also confirm the following from our original request?`,
    sign: "Thanks,",
    bullets: {
      delivery_date: "Earliest delivery date you can commit to",
      shipping_cost: "Shipping costs",
    },
  },
  de: {
    subject: "Kurze Rückfrage — fehlende Angaben",
    intro: (id) =>
      `Vielen Dank für die Bestätigung der Bestellung ${id}. Können Sie zusätzlich folgende Angabe(n) aus unserer ursprünglichen Anfrage bestätigen?`,
    sign: "Vielen Dank,",
    bullets: {
      delivery_date: "Frühestmöglicher Liefertermin, den Sie zusichern können",
      shipping_cost: "Versandkosten",
    },
  },
  fr: {
    subject: "Petite relance — informations manquantes",
    intro: (id) =>
      `Merci pour la confirmation de la commande ${id}. Pourriez-vous également nous confirmer le(s) point(s) suivant(s) de notre demande initiale ?`,
    sign: "Merci,",
    bullets: {
      delivery_date: "Date de livraison la plus proche que vous pouvez garantir",
      shipping_cost: "Frais de port",
    },
  },
  it: {
    subject: "Breve sollecito — informazioni mancanti",
    intro: (id) =>
      `Grazie per aver confermato l'ordine ${id}. Potreste confermare anche il/i seguente/i punto/i della nostra richiesta iniziale?`,
    sign: "Grazie,",
    bullets: {
      delivery_date: "Data di consegna più rapida che potete garantire",
      shipping_cost: "Costi di spedizione",
    },
  },
};

function renderFollowupText(
  s: FollowupStrings,
  greeting: string,
  orderId: string,
  missing: ChecklistField[],
): string {
  return [
    greeting,
    ``,
    s.intro(orderId),
    ...missing.map((f) => `- ${s.bullets[f]}`),
    ``,
    s.sign,
    COMPANY.agentName,
  ].join("\n");
}
function renderFollowupHtml(
  s: FollowupStrings,
  greeting: string,
  orderId: string,
  missing: ChecklistField[],
): string {
  const bullets = missing.map((f) => `<li>${escapeHtml(s.bullets[f])}</li>`).join("");
  return `<p>${escapeHtml(greeting)}</p><p>${escapeHtml(s.intro(orderId))}</p><ul>${bullets}</ul><p>${escapeHtml(s.sign)}<br/>${escapeHtml(COMPANY.agentName)}</p>`;
}

export function composeFollowupEmail(
  order: Order,
  missing: ChecklistField[],
  language: SupplierLanguage = "en",
): ComposedEmail {
  const safe = missing.filter((f) => f === "delivery_date" || f === "shipping_cost");
  const list = safe.length ? safe : (["delivery_date", "shipping_cost"] as ChecklistField[]);
  const en = FOLLOWUP_STRINGS.en;
  const native = FOLLOWUP_STRINGS[language];
  return assembleBilingual({
    language,
    subjectEn: `Re: [${order.id}] ${en.subject}`,
    subjectNative: native.subject,
    textEn: renderFollowupText(en, GREETING.en, order.id, list),
    textNative: renderFollowupText(native, GREETING[language], order.id, list),
    htmlEn: renderFollowupHtml(en, GREETING.en, order.id, list),
    htmlNative: renderFollowupHtml(native, GREETING[language], order.id, list),
  });
}

/* ============================================================
   5. Clarification request — uses unclear_points; if none, falls
   back to the still-pending checklist items from the original PO.
   ============================================================ */

type ClarifyStrings = {
  subject: string;
  intro: (id: string) => string;
  sign: string;
};
const CLARIFY: Record<SupplierLanguage, ClarifyStrings> = {
  en: {
    subject: "Clarification needed",
    intro: (id) => `Thanks for your reply on order ${id}. Could you confirm the following:`,
    sign: "Thanks,",
  },
  de: {
    subject: "Klärung benötigt",
    intro: (id) =>
      `Vielen Dank für Ihre Antwort zur Bestellung ${id}. Können Sie folgendes bestätigen:`,
    sign: "Vielen Dank,",
  },
  fr: {
    subject: "Clarification nécessaire",
    intro: (id) =>
      `Merci pour votre réponse concernant la commande ${id}. Pourriez-vous confirmer ce qui suit :`,
    sign: "Merci,",
  },
  it: {
    subject: "Chiarimento necessario",
    intro: (id) => `Grazie per la risposta sull'ordine ${id}. Potreste confermare quanto segue:`,
    sign: "Grazie,",
  },
};

function checklistBullet(lang: SupplierLanguage, field: ChecklistField): string {
  return ORDER_STRINGS[lang][field === "delivery_date" ? "earliestDelivery" : "shippingCosts"];
}

function renderClarifyText(
  s: ClarifyStrings,
  greeting: string,
  orderId: string,
  bullets: string[],
): string {
  return [
    greeting,
    ``,
    s.intro(orderId),
    ...bullets.map((b) => `- ${b}`),
    ``,
    s.sign,
    COMPANY.agentName,
  ].join("\n");
}
function renderClarifyHtml(
  s: ClarifyStrings,
  greeting: string,
  orderId: string,
  bullets: string[],
): string {
  return `<p>${escapeHtml(greeting)}</p><p>${escapeHtml(s.intro(orderId))}</p><ul>${bullets.map((b) => `<li>${escapeHtml(b)}</li>`).join("")}</ul><p>${escapeHtml(s.sign)}<br/>${escapeHtml(COMPANY.agentName)}</p>`;
}

export function composeClarificationRequestEmail(
  order: Order,
  language: SupplierLanguage = "en",
  points: string[] = [],
  pendingChecklist: ChecklistField[] = ["delivery_date", "shipping_cost"],
  pointsEn: string[] = [],
): ComposedEmail {
  const cleanedNative = points.map((p) => p.trim()).filter(Boolean);
  const cleanedEn = pointsEn.map((p) => p.trim()).filter(Boolean);
  const bulletsNative = cleanedNative.length
    ? cleanedNative
    : pendingChecklist.map((f) => checklistBullet(language, f));
  const bulletsEn = cleanedEn.length
    ? cleanedEn
    : cleanedNative.length && language === "en"
      ? cleanedNative
      : pendingChecklist.map((f) => checklistBullet("en", f));
  return assembleBilingual({
    language,
    subjectEn: `Re: [${order.id}] ${CLARIFY.en.subject}`,
    subjectNative: CLARIFY[language].subject,
    textEn: renderClarifyText(CLARIFY.en, GREETING.en, order.id, bulletsEn),
    textNative: renderClarifyText(CLARIFY[language], GREETING[language], order.id, bulletsNative),
    htmlEn: renderClarifyHtml(CLARIFY.en, GREETING.en, order.id, bulletsEn),
    htmlNative: renderClarifyHtml(CLARIFY[language], GREETING[language], order.id, bulletsNative),
  });
}

/* ============================================================
   6. Decline ack ("sourcing elsewhere") — ONLY sent on human cmd
   ============================================================ */

type SimpleStrings = {
  subject: string;
  body: (id: string) => string;
};

function renderSimpleText(s: SimpleStrings, greeting: string, sign: string, id: string): string {
  return [greeting, ``, s.body(id), ``, sign, COMPANY.agentName].join("\n");
}
function renderSimpleHtml(s: SimpleStrings, greeting: string, sign: string, id: string): string {
  return `<p>${escapeHtml(greeting)}</p><p>${escapeHtml(s.body(id))}</p><p>${escapeHtml(sign)}<br/>${escapeHtml(COMPANY.agentName)}</p>`;
}

const DECLINE: Record<SupplierLanguage, SimpleStrings> = {
  en: {
    subject: "Order will be sourced elsewhere — thanks",
    body: (id) =>
      `Thanks for the reply on order ${id}. We will source these items elsewhere this time and keep you on file for future requests.`,
  },
  de: {
    subject: "Bestellung wird anderweitig beschafft — vielen Dank",
    body: (id) =>
      `Vielen Dank für die Rückmeldung zur Bestellung ${id}. Wir beschaffen die Artikel dieses Mal anderweitig und behalten Sie für künftige Anfragen gerne im Auge.`,
  },
  fr: {
    subject: "Commande approvisionnée ailleurs — merci",
    body: (id) =>
      `Merci pour votre retour concernant la commande ${id}. Nous nous approvisionnerons ailleurs cette fois et garderons votre contact pour de futures demandes.`,
  },
  it: {
    subject: "Ordine acquistato altrove — grazie",
    body: (id) =>
      `Grazie per la risposta sull'ordine ${id}. Per questa volta ci approvvigioneremo altrove e vi terremo a riferimento per future richieste.`,
  },
};

export function composeDeclineAckEmail(
  order: Order,
  language: SupplierLanguage = "en",
): ComposedEmail {
  return assembleBilingual({
    language,
    subjectEn: `Re: [${order.id}] ${DECLINE.en.subject}`,
    subjectNative: DECLINE[language].subject,
    textEn: renderSimpleText(DECLINE.en, GREETING.en, SIGN.en, order.id),
    textNative: renderSimpleText(DECLINE[language], GREETING[language], SIGN[language], order.id),
    htmlEn: renderSimpleHtml(DECLINE.en, GREETING.en, SIGN.en, order.id),
    htmlNative: renderSimpleHtml(DECLINE[language], GREETING[language], SIGN[language], order.id),
  });
}

/* ============================================================
   7. Issues acknowledged — kept for compatibility, currently
   unused by the policy (handed off to human instead).
   ============================================================ */

const ISSUES: Record<SupplierLanguage, SimpleStrings> = {
  en: {
    subject: "Received — reviewing internally",
    body: (id) =>
      `Thanks for your reply on order ${id}. We have noted the points you raised and will come back to you shortly.`,
  },
  de: {
    subject: "Antwort erhalten — interne Prüfung läuft",
    body: (id) =>
      `Vielen Dank für Ihre Antwort zur Bestellung ${id}. Wir haben die genannten Punkte notiert und melden uns in Kürze.`,
  },
  fr: {
    subject: "Bien reçu — en cours d'examen",
    body: (id) =>
      `Merci pour votre réponse concernant la commande ${id}. Nous avons noté les points soulevés et reviendrons vers vous très prochainement.`,
  },
  it: {
    subject: "Ricevuto — in valutazione",
    body: (id) =>
      `Grazie per la risposta sull'ordine ${id}. Abbiamo preso nota dei punti segnalati e vi ricontatteremo a breve.`,
  },
};

export function composeIssuesAckEmail(
  order: Order,
  language: SupplierLanguage = "en",
): ComposedEmail {
  return assembleBilingual({
    language,
    subjectEn: `Re: [${order.id}] ${ISSUES.en.subject}`,
    subjectNative: ISSUES[language].subject,
    textEn: renderSimpleText(ISSUES.en, GREETING.en, SIGN.en, order.id),
    textNative: renderSimpleText(ISSUES[language], GREETING[language], SIGN[language], order.id),
    htmlEn: renderSimpleHtml(ISSUES.en, GREETING.en, SIGN.en, order.id),
    htmlNative: renderSimpleHtml(ISSUES[language], GREETING[language], SIGN[language], order.id),
  });
}

/* ============================================================
   8. Answer supplier's questions from PO data
   ============================================================ */

const ANSWER_HEAD: Record<SupplierLanguage, { subject: string; intro: (id: string) => string }> = {
  en: {
    subject: "Answers to your questions",
    intro: (id) => `Thanks for your reply on order ${id}. Here are the answers to your questions:`,
  },
  de: {
    subject: "Antworten auf Ihre Fragen",
    intro: (id) =>
      `Vielen Dank für Ihre Antwort zur Bestellung ${id}. Hier die Antworten auf Ihre Fragen:`,
  },
  fr: {
    subject: "Réponses à vos questions",
    intro: (id) =>
      `Merci pour votre réponse concernant la commande ${id}. Voici les réponses à vos questions :`,
  },
  it: {
    subject: "Risposte alle vostre domande",
    intro: (id) =>
      `Grazie per la risposta sull'ordine ${id}. Di seguito le risposte alle vostre domande:`,
  },
};

export type QuestionAnswer = { question: string; answer: string };

export function composeAnswerQuestionsEmail(
  order: Order,
  qa: QuestionAnswer[],
  language: SupplierLanguage = "en",
): ComposedEmail {
  const block = (s: (typeof ANSWER_HEAD)["en"], greeting: string, sign: string) => {
    const lines = qa.map((p) => `Q: ${p.question}\nA: ${p.answer}`).join("\n\n");
    return [greeting, ``, s.intro(order.id), ``, lines, ``, sign, COMPANY.agentName].join("\n");
  };
  const blockHtml = (s: (typeof ANSWER_HEAD)["en"], greeting: string, sign: string) => {
    const items = qa
      .map(
        (p) =>
          `<li><div><strong>${escapeHtml(p.question)}</strong></div><div>${escapeHtml(p.answer)}</div></li>`,
      )
      .join("");
    return `<p>${escapeHtml(greeting)}</p><p>${escapeHtml(s.intro(order.id))}</p><ul>${items}</ul><p>${escapeHtml(sign)}<br/>${escapeHtml(COMPANY.agentName)}</p>`;
  };
  return assembleBilingual({
    language,
    subjectEn: `Re: [${order.id}] ${ANSWER_HEAD.en.subject}`,
    subjectNative: ANSWER_HEAD[language].subject,
    textEn: block(ANSWER_HEAD.en, GREETING.en, SIGN.en),
    textNative: block(ANSWER_HEAD[language], GREETING[language], SIGN[language]),
    htmlEn: blockHtml(ANSWER_HEAD.en, GREETING.en, SIGN.en),
    htmlNative: blockHtml(ANSWER_HEAD[language], GREETING[language], SIGN[language]),
  });
}

export function buildAnswersFromOrder(order: Order, questions: string[]): QuestionAnswer[] {
  const lower = (s: string) => s.toLowerCase();
  const facts: Array<{ match: RegExp; answer: string }> = [
    {
      match: /vat|tva|mwst|iva|tax id|ust|uid/i,
      answer: `Buyer: ${COMPANY.name}, ${COMPANY.street}, ${COMPANY.city}. (VAT ID on request — contact ${COMPANY.contact}.)`,
    },
    {
      match: /deliver|delivery address|liefer|livraison|consegna|ship to|site address|adresse/i,
      answer: `Deliver to: ${COMPANY.site}.`,
    },
    {
      match: /payment|zahlung|paiement|pagamento|invoice|rechnung|facture|fattura/i,
      answer: `Standard payment terms: 30 days net. Send invoice to ${COMPANY.contact}.`,
    },
    {
      match: /contact|ansprech|téléphone|telefono|phone|email/i,
      answer: `Contact: ${COMPANY.agentName}, ${COMPANY.contact}, ${COMPANY.phone}.`,
    },
    {
      match: /project|projekt|projet|progetto|reference|referenz/i,
      answer: `Project: ${order.project}. Reference: ${order.id}.`,
    },
    {
      match: /items?|positionen|articles?|articoli|line items|skus?|quantit/i,
      answer: `Items (qty × name @ unit price):\n${order.items.map((i) => `  - ${i.qty} × ${i.name} @ ${i.price}`).join("\n")}\nSubtotal: ${order.subtotal} EUR (excl. VAT, excl. shipping).`,
    },
  ];
  return questions.map((q) => {
    const fact = facts.find((f) => f.match.test(lower(q)));
    return {
      question: q,
      answer: fact ? fact.answer : `We are checking this internally and will follow up shortly.`,
    };
  });
}

/* ============================================================
   9. Free-text human reply (used by the "needs you" UI)
   ============================================================ */

const HUMAN_SUBJECT: Record<SupplierLanguage, string> = {
  en: "Procurement follow-up",
  de: "Beschaffung — Rückfrage",
  fr: "Achats — suivi",
  it: "Acquisti — seguito",
};

/**
 * Free-text human reply. The caller must pass the message in BOTH English
 * and the supplier's native language (see `translateForSupplier` in
 * `agent.server.ts`) so the email is always bilingual, like every other
 * agent-sent template.
 */
export function composeHumanReplyEmail(
  order: Order,
  parts: { messageEn: string; messageNative: string },
  language: SupplierLanguage = "en",
): ComposedEmail {
  const block = (msg: string, sign: string) =>
    `${msg}\n\n${sign}\n${COMPANY.agentName}\n${COMPANY.contact} · ${COMPANY.phone}`;
  const blockHtml = (msg: string, sign: string) =>
    `<p>${escapeHtml(msg).replace(/\n/g, "<br/>")}</p><p>${escapeHtml(sign)}<br/>${escapeHtml(COMPANY.agentName)}<br/>${escapeHtml(COMPANY.contact)} · ${escapeHtml(COMPANY.phone)}</p>`;
  return assembleBilingual({
    language,
    subjectEn: `Re: [${order.id}] ${HUMAN_SUBJECT.en}`,
    subjectNative: HUMAN_SUBJECT[language],
    textEn: block(parts.messageEn, SIGN.en),
    textNative: block(parts.messageNative, SIGN[language]),
    htmlEn: blockHtml(parts.messageEn, SIGN.en),
    htmlNative: blockHtml(parts.messageNative, SIGN[language]),
  });
}
