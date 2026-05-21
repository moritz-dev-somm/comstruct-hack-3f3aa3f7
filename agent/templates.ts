import type { Order } from "@/lib/orders";
import { formatEUR } from "@/lib/catalog";

/**
 * Email templates the supplier agent sends.
 *
 * These are intentionally placeholder copy — clear, professional, and
 * structured so the supplier can reply machine-readably-ish, but the final
 * wording, branding, T&Cs, payment terms, INCOTERMS, etc. should be
 * revisited with procurement before going live.
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
};

export function composeOrderEmail(order: Order): ComposedEmail {
  const lines = order.items.map(
    (i) => `- ${i.qty} × ${i.name} (${i.unit}) @ ${formatEUR(i.price)} → ${formatEUR(i.qty * i.price)}`,
  );

  const subject = `[${order.id}] Purchase request — ${order.project} (${formatEUR(order.subtotal)})`;

  const text = [
    `Hello,`,
    ``,
    `We would like to place the following order for project "${order.project}".`,
    `Reference: ${order.id}`,
    ``,
    `Items:`,
    ...lines,
    ``,
    `Estimated subtotal: ${formatEUR(order.subtotal)} (excl. VAT, excl. shipping)`,
    ``,
    `Please confirm by reply email:`,
    `  1. Availability and unit prices`,
    `  2. Earliest delivery date to our site (${COMPANY.address})`,
    `  3. Shipping cost`,
    `  4. Your order reference / quote number`,
    ``,
    `If any item is unavailable or pricing has changed, please propose the closest`,
    `equivalent so we can decide quickly.`,
    ``,
    `We need a response within 24 hours to keep the project on schedule.`,
    ``,
    `Thank you,`,
    `${COMPANY.name}`,
    `${COMPANY.contact} · ${COMPANY.phone}`,
  ].join("\n");

  const itemsHtml = order.items
    .map(
      (i) =>
        `<tr><td>${i.qty}</td><td>${escapeHtml(i.name)}</td><td>${escapeHtml(i.unit)}</td><td style="text-align:right">${formatEUR(i.price)}</td><td style="text-align:right">${formatEUR(i.qty * i.price)}</td></tr>`,
    )
    .join("");

  const html = `
<div style="font-family:Inter,Arial,sans-serif;color:#1f2937;font-size:14px;line-height:1.55">
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
  <p>Please confirm:</p>
  <ol>
    <li>Availability and unit prices</li>
    <li>Earliest delivery date to our site (${escapeHtml(COMPANY.address)})</li>
    <li>Shipping cost</li>
    <li>Your order reference / quote number</li>
  </ol>
  <p>If any item is unavailable or pricing has changed, please propose the closest equivalent.<br/>
  We need a response within <strong>24 hours</strong> to keep the project on schedule.</p>
  <p>Thank you,<br/>
  ${escapeHtml(COMPANY.name)}<br/>
  ${escapeHtml(COMPANY.contact)} · ${escapeHtml(COMPANY.phone)}</p>
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
    `${COMPANY.name}`,
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
