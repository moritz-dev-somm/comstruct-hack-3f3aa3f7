/**
 * EU-standard purchase-order PDF generator (client-side, jsPDF).
 *
 * All data is derived from the Order + supplier records — nothing about the
 * supplier is hardcoded. When an order has items from multiple suppliers,
 * one PDF is produced per supplier group via
 * `generatePurchaseOrdersBySupplier`. Long supplier / project / item names
 * are wrapped with `splitTextToSize` so blocks never overlap.
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

export type SupplierBlock = {
  name: string;
  email?: string | null;
  phone?: string | null;
};

export type SupplierContact = {
  name: string;
  email?: string | null;
  phone?: string | null;
};

const VAT_RATE = 0.19;
const FALLBACK_SUPPLIER = "Unassigned";

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

/** Group an order's items by supplier name (case-insensitive trim). */
export function groupOrderBySupplier(order: Order): Array<{
  supplierName: string;
  items: Order["items"];
  subtotal: number;
}> {
  const groups = new Map<string, Order["items"]>();
  for (const it of order.items) {
    const key = (it.supplier && it.supplier.trim()) || FALLBACK_SUPPLIER;
    const arr = groups.get(key) ?? [];
    arr.push(it);
    groups.set(key, arr);
  }
  return Array.from(groups.entries())
    .map(([supplierName, items]) => ({
      supplierName,
      items,
      subtotal: items.reduce((s, i) => s + i.qty * i.price, 0),
    }))
    .sort((a, b) => a.supplierName.localeCompare(b.supplierName));
}

export function generatePurchaseOrderPdf(
  order: Order,
  supplier: SupplierBlock,
  items: Order["items"],
  subtotal: number,
): jsPDF {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const page = { w: 210, h: 297, m: 15 };

  /* ----- Header band ----- */
  doc.setFillColor(47, 104, 121);
  doc.rect(0, 0, page.w, 26, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
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
    const innerW = colW - 8;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(110);
    doc.text(c.label.toUpperCase(), x, metaY + 7);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(20);
    // Wrap & truncate so long values never overflow into the next column.
    const lines = doc.splitTextToSize(c.value, innerW) as string[];
    const display = lines[0] + (lines.length > 1 ? "…" : "");
    doc.text(display, x, metaY + 14);
  });

  /* ----- Address blocks (3 columns, each 60mm wide, 5mm gutter) ----- */
  const addrY = metaY + 30;
  const addrColW = (page.w - 2 * page.m - 10) / 3; // ≈ 56.6mm
  const buyerH = drawAddressBlock(doc, "BUYER", {
    name: BUYER.name,
    lines: [BUYER.street, BUYER.city, "VAT " + BUYER.vat, BUYER.email, BUYER.phone],
  }, page.m, addrY, addrColW);
  const supplierH = drawAddressBlock(doc, "SUPPLIER", {
    name: supplier.name,
    lines: [
      supplier.email ?? null,
      supplier.phone ?? null,
    ],
  }, page.m + addrColW + 5, addrY, addrColW);
  const shipH = drawAddressBlock(doc, "DELIVER TO", {
    name: `Site: ${order.project}`,
    lines: ["c/o Site Office", "Attn: " + order.foreman],
  }, page.m + 2 * (addrColW + 5), addrY, addrColW);

  /* ----- Line items ----- */
  const tableStartY = addrY + Math.max(buyerH, supplierH, shipH) + 6;
  const rows = items.map((it, idx) => {
    const lineNet = it.qty * it.price;
    return [
      String(idx + 1),
      it.productId ?? "",
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
    styles: {
      fontSize: 9,
      cellPadding: 2.2,
      textColor: 30,
      overflow: "linebreak",
      valign: "top",
    },
    headStyles: {
      fillColor: [244, 245, 246],
      textColor: 60,
      fontStyle: "bold",
      lineColor: [220, 220, 220],
    },
    columnStyles: {
      0: { cellWidth: 8, halign: "right" },
      1: { cellWidth: 24, font: "courier", fontSize: 8 },
      2: { cellWidth: "auto" },
      3: { cellWidth: 12, halign: "right" },
      4: { cellWidth: 14 },
      5: { cellWidth: 24, halign: "right" },
      6: { cellWidth: 26, halign: "right", fontStyle: "bold" },
    },
    margin: { left: page.m, right: page.m, bottom: 28 },
  });

  /* ----- Totals ----- */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const afterTableY: number = (doc as any).lastAutoTable.finalY + 6;
  const net = subtotal;
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
  const sigY = Math.min(termsY + 32, page.h - 22);
  doc.setDrawColor(180);
  doc.line(page.m, sigY, page.m + 60, sigY);
  doc.line(page.w - page.m - 60, sigY, page.w - page.m, sigY);
  doc.setFontSize(8);
  doc.setTextColor(110);
  doc.text("Authorised by — Buyer", page.m, sigY + 4);
  const approverLine = doc.splitTextToSize(order.approver ?? order.foreman, 60)[0];
  doc.text(approverLine, page.m, sigY + 8);
  doc.text("Acknowledged by — Supplier", page.w - page.m - 60, sigY + 4);
  const supplierAck = doc.splitTextToSize(supplier.name, 60)[0];
  doc.text(supplierAck, page.w - page.m - 60, sigY + 8);

  /* ----- Footer on every page ----- */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pageCount = (doc as any).internal.getNumberOfPages() as number;
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.setTextColor(150);
    doc.text(
      `${BUYER.name} · ${BUYER.vat} · Generated ${new Date().toLocaleString("en-GB")} · Page ${i} of ${pageCount}`,
      page.w / 2,
      page.h - 8,
      { align: "center" },
    );
  }

  return doc;
}

/**
 * Draw an address block with wrapped name and stacked detail lines.
 * Returns the total height consumed (in mm) so callers can lay out beneath it.
 */
function drawAddressBlock(
  doc: jsPDF,
  title: string,
  block: { name: string; lines: Array<string | null | undefined> },
  x: number,
  y: number,
  maxWidth: number,
): number {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7);
  doc.setTextColor(120);
  doc.text(title, x, y);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(25);
  const nameLines = doc.splitTextToSize(block.name, maxWidth) as string[];
  const nameLineH = 4.2;
  nameLines.forEach((ln, i) => doc.text(ln, x, y + 5 + i * nameLineH));

  let cursorY = y + 5 + nameLines.length * nameLineH + 1.5;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(70);
  for (const raw of block.lines) {
    if (!raw) continue;
    const wrapped = doc.splitTextToSize(raw, maxWidth) as string[];
    for (const ln of wrapped) {
      doc.text(ln, x, cursorY);
      cursorY += 3.8;
    }
  }
  return cursorY - y;
}

function drawTotalRow(doc: jsPDF, label: string, value: string, x: number, y: number) {
  doc.setFontSize(10);
  doc.text(label, x, y);
  doc.text(value, x + 70, y, { align: "right" });
}

function safeSlug(s: string): string {
  return s.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "");
}

export function purchaseOrderFilename(order: Order, supplierName?: string): string {
  const project = safeSlug(order.project);
  const supplier = supplierName ? `-${safeSlug(supplierName)}` : "";
  return `PO-${order.id}${supplier}-${project}.pdf`;
}

/** One PDF per supplier group, derived from the order data. */
export function generatePurchaseOrdersBySupplier(
  order: Order,
  contacts: Map<string, SupplierContact> | undefined = undefined,
): Array<{
  supplierName: string;
  contact: SupplierBlock;
  doc: jsPDF;
  filename: string;
  items: Order["items"];
  subtotal: number;
}> {
  const groups = groupOrderBySupplier(order);
  return groups.map((g) => {
    const ct = contacts?.get(g.supplierName.toLowerCase());
    const supplier: SupplierBlock = {
      name: ct?.name ?? g.supplierName,
      email: ct?.email ?? null,
      phone: ct?.phone ?? null,
    };
    const doc = generatePurchaseOrderPdf(order, supplier, g.items, g.subtotal);
    return {
      supplierName: g.supplierName,
      contact: supplier,
      doc,
      filename: purchaseOrderFilename(order, g.supplierName),
      items: g.items,
      subtotal: g.subtotal,
    };
  });
}

/** Returns just the base64 payload (no data: prefix), for AgentMail attachments. */
export function purchaseOrderPdfBase64(
  order: Order,
  supplier: SupplierBlock,
  items: Order["items"],
  subtotal: number,
): string {
  const doc = generatePurchaseOrderPdf(order, supplier, items, subtotal);
  const dataUri = doc.output("datauristring");
  const comma = dataUri.indexOf(",");
  return comma >= 0 ? dataUri.slice(comma + 1) : dataUri;
}

/** Save one PDF per supplier — staggered so browsers don't drop downloads. */
export function downloadPurchaseOrdersBySupplier(
  order: Order,
  contacts?: Map<string, SupplierContact>,
): void {
  const pdfs = generatePurchaseOrdersBySupplier(order, contacts);
  pdfs.forEach((p, i) => {
    setTimeout(() => p.doc.save(p.filename), i * 250);
  });
}

/** Open the first per-supplier PO in a new tab (used by simple "View PO" buttons). */
export function openFirstPurchaseOrderPdf(
  order: Order,
  contacts?: Map<string, SupplierContact>,
): void {
  const pdfs = generatePurchaseOrdersBySupplier(order, contacts);
  if (pdfs.length === 0) return;
  const blob = pdfs[0].doc.output("blob");
  const url = URL.createObjectURL(blob);
  window.open(url, "_blank", "noopener,noreferrer");
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
