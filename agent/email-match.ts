/**
 * Pure email + domain helpers used by the agent inbound pipeline.
 * No I/O. Unit-testable.
 */

export type ParsedEmail = { name: string | null; email: string };

/** Parse `"Name" <a@b.com>` or `a@b.com`. Returns null email when unparseable. */
export function parseEmailAddress(raw: string | null | undefined): ParsedEmail {
  const s = (raw ?? "").trim();
  if (!s) return { name: null, email: "" };
  const angle = /^(.*)<\s*([^<>\s]+@[^<>\s]+)\s*>$/.exec(s);
  if (angle) {
    const name = angle[1].replace(/^"|"$/g, "").trim() || null;
    return { name, email: angle[2].toLowerCase() };
  }
  const bare = /([^\s<>"]+@[^\s<>",]+)/.exec(s);
  return { name: null, email: bare ? bare[1].toLowerCase() : "" };
}

/** Minimal "second-level" suffix list — covers the suppliers we deal with. */
const TWO_LEVEL_SUFFIXES = new Set([
  "co.uk", "org.uk", "ac.uk", "gov.uk",
  "com.au", "net.au", "org.au",
  "co.nz", "co.jp", "co.kr",
  "com.br", "com.mx", "com.ar",
]);

/** Strip subdomains to registrable domain ("mail.bauhandel.ch" → "bauhandel.ch"). */
export function registrableDomain(hostOrEmail: string | null | undefined): string {
  if (!hostOrEmail) return "";
  let host = hostOrEmail.trim().toLowerCase();
  if (host.includes("@")) host = host.split("@").pop() ?? "";
  if (!host) return "";
  const parts = host.split(".").filter(Boolean);
  if (parts.length <= 2) return parts.join(".");
  const lastTwo = parts.slice(-2).join(".");
  if (TWO_LEVEL_SUFFIXES.has(lastTwo)) {
    return parts.slice(-3).join(".");
  }
  return lastTwo;
}

export type NegotiationLike = {
  supplier_email: string | null;
  status: string | null;
};

export type SupplierLike = {
  email?: string | null;
  email_domains?: string[] | null;
};

/**
 * True if `from` plausibly originates from the same supplier as the
 * negotiation. Allows exact-email match always, and same-registrable-domain
 * match while the negotiation is still open (sent / awaiting_reply).
 */
export function senderMatchesNegotiation(
  fromRaw: string,
  negotiation: NegotiationLike,
  supplier?: SupplierLike | null,
): boolean {
  const { email } = parseEmailAddress(fromRaw);
  if (!email) return false;
  const expected = (negotiation.supplier_email ?? "").toLowerCase();
  if (expected && email === expected) return true;

  const senderDomain = registrableDomain(email);
  if (!senderDomain) return false;

  const expectedDomain = registrableDomain(expected);
  const open = negotiation.status === "sent" || negotiation.status === "awaiting_reply";
  if (open && expectedDomain && senderDomain === expectedDomain) return true;

  if (supplier?.email && registrableDomain(supplier.email) === senderDomain) return true;
  if (supplier?.email_domains?.some((d) => registrableDomain(d) === senderDomain)) return true;

  return false;
}

/** Extract `ORD-1234` from a subject like `Re: [ORD-1234] ...`. */
export function extractOrderIdFromSubject(subject: string | null | undefined): string | null {
  if (!subject) return null;
  const m = /\b(ORD-\d{3,})\b/i.exec(subject);
  return m ? m[1].toUpperCase() : null;
}
