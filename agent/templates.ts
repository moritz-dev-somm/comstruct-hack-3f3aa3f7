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

export type OrderEmailContext = {
  supplierName: string;
  items: Order["items"];
  subtotal: number;
};

/**
 * Per-supplier order request. If the cart spans multiple suppliers, the caller
 * builds one of these per supplier — each with the subset of items that goes
 * to that company.
 */
export function composeOrderEmail(order: Order, ctx: OrderEmailContext): ComposedEmail {
  const { supplierName, items, subtotal } = ctx;
  const lines = items.map(
    (i) => `- ${i.qty} × ${i.name} (${i.unit}) @ ${formatEUR(i.price)} → ${formatEUR(i.qty * i.price)}`,
  );

  const subject = `[${order.id}] Purchase request — ${order.project} (${formatEUR(subtotal)})`;

  const text = [
    `Hello ${supplierName} team,`,
    ``,
    `We would like to place the following order for project "${order.project}".`,
    `Reference: ${order.id}`,
    ``,
    `Buyer:`,
    `  ${COMPANY.name}`,
    `  ${COMPANY.street}, ${COMPANY.city}`,
    `Deliver to:`,
    `  ${COMPANY.site}`,
    ``,
    `Items:`,
    ...lines,
    ``,
    `Estimated subtotal: ${formatEUR(subtotal)} (excl. VAT, excl. shipping)`,
    ``,
    `The full purchase order is attached as a PDF — please confirm it is correct.`,
    `Could you also let us know:`,
    `  - The earliest delivery date you can commit to`,
    `  - Any shipping costs that are not already included`,
    ``,
    `If anything is unavailable, delayed, or differently priced, please flag it`,
    `in your reply so we can route it to the right person quickly.`,
    ``,
    `We need a response within 24 hours to keep the project on schedule.`,
    ``,
    `Thank you,`,
    `${COMPANY.agentName}`,
    `${COMPANY.contact} · ${COMPANY.phone}`,
    ``,
    `--`,
    AGENT_DISCLOSURE_TEXT,
  ].join("\n");

  const itemsHtml = items
    .map(
      (i) =>
        `<tr><td>${i.qty}</td><td>${escapeHtml(i.name)}</td><td>${escapeHtml(i.unit)}</td><td style="text-align:right">${formatEUR(i.price)}</td><td style="text-align:right">${formatEUR(i.qty * i.price)}</td></tr>`,
    )
    .join("");

  const html = `
<div style="font-family:Helvetica,Arial,sans-serif;color:#161A1F;font-size:14px;line-height:1.55">
  <p>Hello ${escapeHtml(supplierName)} team,</p>
  <p>We would like to place the following order for project <strong>${escapeHtml(order.project)}</strong>.<br/>
  Reference: <strong>${order.id}</strong></p>
  <table style="width:100%;margin:8px 0 12px 0;font-size:13px">
    <tr>
      <td style="vertical-align:top;width:50%">
        <div style="color:#6b7280;font-size:11px;text-transform:uppercase">Buyer</div>
        <div><strong>${escapeHtml(COMPANY.name)}</strong></div>
        <div>${escapeHtml(COMPANY.street)}</div>
        <div>${escapeHtml(COMPANY.city)}</div>
      </td>
      <td style="vertical-align:top;width:50%">
        <div style="color:#6b7280;font-size:11px;text-transform:uppercase">Deliver to</div>
        <div><strong>Site: ${escapeHtml(order.project)}</strong></div>
        <div>${escapeHtml(COMPANY.site)}</div>
      </td>
    </tr>
  </table>
  <table style="border-collapse:collapse;width:100%;margin:12px 0">
    <thead><tr style="background:#f3f4f6">
      <th style="text-align:left;padding:6px">Qty</th>
      <th style="text-align:left;padding:6px">Item</th>
      <th style="text-align:left;padding:6px">Unit</th>
      <th style="text-align:right;padding:6px">Unit price</th>
      <th style="text-align:right;padding:6px">Line total</th>
    </tr></thead>
    <tbody>${itemsHtml}</tbody>
    <tfoot><tr><td colspan="4" style="text-align:right;padding:6px"><strong>Subtotal</strong></td>
      <td style="text-align:right;padding:6px"><strong>${formatEUR(subtotal)}</strong></td></tr></tfoot>
  </table>
  <p>The full purchase order is attached as a PDF — please confirm it is correct, and let us know:</p>
  <ul>
    <li>The <strong>earliest delivery date</strong> you can commit to</li>
    <li>Any <strong>shipping costs</strong> that are not already included</li>
  </ul>
  <p>If anything is unavailable, delayed, or differently priced, please flag it in your reply so we can route it to the right person quickly.<br/>
  We need a response within <strong>24 hours</strong> to keep the project on schedule.</p>
  <p>Thank you,<br/>
  ${escapeHtml(COMPANY.agentName)}<br/>
  ${escapeHtml(COMPANY.contact)} · ${escapeHtml(COMPANY.phone)}</p>
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
