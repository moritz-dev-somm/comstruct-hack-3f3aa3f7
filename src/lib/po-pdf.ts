/**
 * EU-standard purchase-order PDF generator (client-side, jsPDF).
 *
 * Format follows the conventions of a European construction-site PO:
 *   - Buyer / Supplier / Ship-to blocks
 *   - PO header (number, date, project, payment terms, currency)
 *   - Line items table with code, description, qty, unit, unit price, line total
 *   - Net subtotal, VAT (19%), gross total
 *   - Terms & signature block
 *
 * PDF is regenerated deterministically from the Order — no blob is persisted,
 * the order data itself is the source of truth.
 */
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import type { Order } from "./orders";
import { formatEUR } from "./catalog";

const BUYER = {
  name: "comstruct Bau GmbH",
  street: "Bahnhofstrasse 12",
  city: "4051 Basel, Switzerland",
  vat: "CHE-123.456.789 MWST",
  email: "procurement@comstruct.example",
  phone: "+41 61 555 01 23",
};

const DEFAULT_SUPPLIER = {
  name: "OBI Bau- und Heimwerkermärkte GmbH",
  street: "Albert-Einstein-Straße 7-9",
  city: "42929 Wermelskirchen, Germany",
  vat: "DE 121 758 727",
};

export type SupplierBlock = {
  name: string;
  street?: string;
  city?: string;
  vat?: string;
  email?: string;
  phone?: string;
};

const VAT_RATE = 0.19;

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

export function generatePurchaseOrderPdf(order: Order): jsPDF {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const page = { w: 210, h: 297, m: 15 };

  /* ----- Header band ----- */
  doc.setFillColor(47, 104, 121); // brand petrol-teal
  doc.rect(0, 0, page.w, 26, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.text("PURCHASE ORDER", page.m, 17);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text("comstruct", page.w - page.m, 12, { align: "right" });
  doc.setFontSize(8);
  doc.text("Construction Materials Procurement", page.w - page.m, 17, { align: "right" });

  /* ----- PO meta box ----- */
  doc.setTextColor(0, 0, 0);
  const metaY = 34;
  doc.setDrawColor(220);
  doc.setLineWidth(0.2);
  doc.roundedRect(page.m, metaY, page.w - 2 * page.m, 22, 1.5, 1.5, "S");

  const metaCols = [
    { label: "PO Number", value: order.id },
    { label: "Issue Date", value: fmtDate(order.createdAt) },
    { label: "Project", value: order.project },
    { label: "Currency", value: "EUR" },
  ];
  const colW = (page.w - 2 * page.m) / metaCols.length;
  metaCols.forEach((c, i) => {
    const x = page.m + i * colW + 4;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(110);
    doc.text(c.label.toUpperCase(), x, metaY + 7);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(20);
    doc.text(c.value, x, metaY + 14);
  });

  /* ----- Address blocks ----- */
  const addrY = metaY + 30;
  drawAddressBlock(doc, "BUYER", BUYER, page.m, addrY);
  drawAddressBlock(doc, "SUPPLIER", SUPPLIER, page.m + 65, addrY);
  drawAddressBlock(
    doc,
    "DELIVER TO",
    {
      name: `Site: ${order.project}`,
      street: "c/o Site Office",
      city: "Attn: " + order.foreman,
      vat: "",
      email: "",
      phone: "",
    },
    page.m + 130,
    addrY,
  );

  /* ----- Line items ----- */
  const tableStartY = addrY + 38;
  const rows = order.items.map((it, idx) => {
    const lineNet = it.qty * it.price;
    return [
      String(idx + 1),
      it.productId,
      it.name + (it.category ? `\n${it.category}` : ""),
      String(it.qty),
      it.unit ?? "pcs",
      formatEUR(it.price),
      formatEUR(lineNet),
    ];
  });

  autoTable(doc, {
    startY: tableStartY,
    head: [["#", "Item code", "Description", "Qty", "Unit", "Unit price", "Net amount"]],
    body: rows,
    theme: "grid",
    styles: { fontSize: 9, cellPadding: 2.2, textColor: 30 },
    headStyles: {
      fillColor: [244, 245, 246],
      textColor: 60,
      fontStyle: "bold",
      lineColor: [220, 220, 220],
    },
    columnStyles: {
      0: { cellWidth: 8, halign: "right" },
      1: { cellWidth: 22, font: "courier", fontSize: 8 },
      2: { cellWidth: "auto" },
      3: { cellWidth: 12, halign: "right" },
      4: { cellWidth: 14 },
      5: { cellWidth: 24, halign: "right" },
      6: { cellWidth: 26, halign: "right", fontStyle: "bold" },
    },
    margin: { left: page.m, right: page.m },
  });

  /* ----- Totals ----- */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const afterTableY: number = (doc as any).lastAutoTable.finalY + 6;
  const net = order.subtotal;
  const vat = net * VAT_RATE;
  const gross = net + vat;
  const totalsX = page.w - page.m - 70;
  drawTotalRow(doc, "Net total", formatEUR(net), totalsX, afterTableY);
  drawTotalRow(doc, `VAT (${(VAT_RATE * 100).toFixed(0)}%)`, formatEUR(vat), totalsX, afterTableY + 6);
  doc.setDrawColor(180);
  doc.line(totalsX, afterTableY + 9.5, page.w - page.m, afterTableY + 9.5);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  drawTotalRow(doc, "Gross total", formatEUR(gross), totalsX, afterTableY + 15);

  /* ----- Terms ----- */
  const termsY = afterTableY + 28;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(40);
  doc.text("Terms & Conditions", page.m, termsY);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(80);
  const terms = [
    "Payment: Net 30 days from invoice date, by bank transfer.",
    "Incoterms 2020: DAP — Delivered At Place (construction site).",
    "Delivery contact and PO number must appear on the delivery note and invoice.",
    "Goods received subject to inspection. Defects must be reported within 7 days.",
    "Governing law: Switzerland. Jurisdiction: Basel-Stadt.",
  ];
  terms.forEach((t, i) => doc.text("• " + t, page.m, termsY + 5 + i * 4));

  /* ----- Signature ----- */
  const sigY = termsY + 32;
  doc.setDrawColor(180);
  doc.line(page.m, sigY, page.m + 60, sigY);
  doc.line(page.w - page.m - 60, sigY, page.w - page.m, sigY);
  doc.setFontSize(8);
  doc.setTextColor(110);
  doc.text("Authorised by — Buyer", page.m, sigY + 4);
  doc.text(order.approver ?? order.foreman, page.m, sigY + 8);
  doc.text("Acknowledged by — Supplier", page.w - page.m - 60, sigY + 4);

  /* ----- Footer ----- */
  doc.setFontSize(7);
  doc.setTextColor(150);
  doc.text(
    `${BUYER.name} · ${BUYER.vat} · Generated ${new Date().toLocaleString("en-GB")} · Page 1`,
    page.w / 2,
    page.h - 8,
    { align: "center" },
  );

  return doc;
}

function drawAddressBlock(
  doc: jsPDF,
  title: string,
  a: { name: string; street: string; city: string; vat: string; email?: string; phone?: string },
  x: number,
  y: number,
) {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7);
  doc.setTextColor(120);
  doc.text(title, x, y);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(25);
  doc.text(a.name, x, y + 5);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(70);
  doc.text(a.street, x, y + 10);
  doc.text(a.city, x, y + 14);
  if (a.vat) doc.text("VAT " + a.vat, x, y + 18);
  if (a.email) doc.text(a.email, x, y + 22);
  if (a.phone) doc.text(a.phone, x, y + 26);
}

function drawTotalRow(doc: jsPDF, label: string, value: string, x: number, y: number) {
  doc.setFontSize(10);
  doc.text(label, x, y);
  doc.text(value, x + 70, y, { align: "right" });
}

export function purchaseOrderFilename(order: Order): string {
  const safeProject = order.project.replace(/[^a-z0-9]+/gi, "-");
  return `PO-${order.id}-${safeProject}.pdf`;
}

export function downloadPurchaseOrderPdf(order: Order): void {
  const doc = generatePurchaseOrderPdf(order);
  doc.save(purchaseOrderFilename(order));
}

export function openPurchaseOrderPdf(order: Order): void {
  const doc = generatePurchaseOrderPdf(order);
  const blob = doc.output("blob");
  const url = URL.createObjectURL(blob);
  window.open(url, "_blank", "noopener,noreferrer");
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
