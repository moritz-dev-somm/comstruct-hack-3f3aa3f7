import type { Order } from "@/lib/orders";
import { formatEUR } from "@/lib/catalog";

/**
 * Email templates the supplier agent sends.
 * All copy explicitly discloses that an AI agent is the sender (legal/UX
 * requirement for autonomous communication).
 */

export type ComposedEmail = {
  subject: string;
  text: string;
  html: string;
};

const COMPANY = {
  name: "comstruct GmbH",
  contact: "procurement@comstruct.example",
  phone: "+41 00 000 00 00",
  address: "Erlenmatt B3 site office, Basel, CH",
  agentName: "comstruct procurement agent",
};

const AGENT_DISCLOSURE_TEXT =
  `This email was sent automatically by an AI procurement agent acting on behalf of ${COMPANY.name}. ` +
  `Replies to this address are read and processed by the agent; a human reviews anything that needs attention.`;

const AGENT_DISCLOSURE_HTML =
  `<p style="font-size:12px;color:#6b7280;border-top:1px solid #e5e7eb;padding-top:8px;margin-top:16px"><em>${AGENT_DISCLOSURE_TEXT}</em></p>`;

export function composeOrderEmail(order: Order): ComposedEmail {
  const lines = order.items.map(
    (i) => `- ${i.qty} × ${i.name} (${i.unit}) @ ${formatEUR(i.price)} → ${formatEUR(i.qty * i.price)}`,
  );

  const subject = `[${order.id}] Purchase request — ${order.project} (${formatEUR(order.subtotal)})`;

  const text = [
    `Hello,`,
    ``,
    `(Automated message — see disclosure at the bottom.)`,
    ``,
    `We would like to place the following order for project "${order.project}".`,
    `Reference: ${order.id}`,
    ``,
    `Items:`,
    ...lines,
    ``,
    `Estimated subtotal: ${formatEUR(order.subtotal)} (excl. VAT, excl. shipping)`,
    ``,
    `Please reply confirming:`,
    `  1. That you can fulfil every line at the prices above`,
    `  2. The earliest expected delivery date to our site (${COMPANY.address})`,
    `  3. Shipping cost (if any)`,
    `  4. Your order reference / quote number`,
    ``,
    `If anything is unavailable, delayed, or differently priced, please state`,
    `it clearly in your reply so we can route it to the right person quickly.`,
    ``,
    `We need a response within 24 hours to keep the project on schedule.`,
    ``,
    `Thank you,`,
    `${COMPANY.agentName}`,
    `${COMPANY.contact} · ${COMPANY.phone}`,
    ``,
    `---`,
    AGENT_DISCLOSURE_TEXT,
  ].join("\n");

  const itemsHtml = order.items
    .map(
      (i) =>
        `<tr><td>${i.qty}</td><td>${escapeHtml(i.name)}</td><td>${escapeHtml(i.unit)}</td><td style="text-align:right">${formatEUR(i.price)}</td><td style="text-align:right">${formatEUR(i.qty * i.price)}</td></tr>`,
    )
    .join("");

  const html = `
<div style="font-family:Helvetica,Arial,sans-serif;color:#161A1F;font-size:14px;line-height:1.55">
  <p>Hello,</p>
  <p>We would like to place the following order for project <strong>${escapeHtml(order.project)}</strong>.<br/>
  Reference: <strong>${order.id}</strong></p>
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
      <td style="text-align:right;padding:6px"><strong>${formatEUR(order.subtotal)}</strong></td></tr></tfoot>
  </table>
  <p>Please reply confirming:</p>
  <ol>
    <li>That you can fulfil every line at the prices above</li>
    <li>The <strong>earliest expected delivery date</strong> to our site (${escapeHtml(COMPANY.address)})</li>
    <li>Shipping cost (if any)</li>
    <li>Your order reference / quote number</li>
  </ol>
  <p>If anything is unavailable, delayed, or differently priced, please state it clearly in your reply.<br/>
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
    `---`,
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
    `---`,
    AGENT_DISCLOSURE_TEXT,
  ].join("\n");
  return { subject, text, html: `<p>${text.replace(/\n/g, "<br/>")}</p>` };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
