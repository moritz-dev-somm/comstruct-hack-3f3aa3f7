/**
 * Resolve free-form supplier delivery wording to a concrete calendar date.
 *
 * Suppliers reply with all sorts of phrasings — "by next Tuesday", "in 5
 * business days", "15.06.2026", "ASAP", "Lieferung am Freitag". This pure
 * utility maps that text to an ISO date using a reference anchor (typically
 * the supplier reply's received-at), so the foreman sees a real date in the
 * Orders tab instead of raw text.
 *
 * Supports English, German, French, Italian — that's the language mix the
 * agent already handles in `agent/agent.server.ts`.
 */

export type DeliveryConfidence = "high" | "medium" | "low" | "unresolved";

export type ResolvedDeliveryDate = {
  /** ISO date `YYYY-MM-DD`, earliest committed date. Null when unresolved. */
  iso: string | null;
  /** End of range; same as `iso` for point dates. Null when unresolved. */
  isoEnd: string | null;
  confidence: DeliveryConfidence;
  /** True when the raw text references delivery but we can't pin a date. */
  needsClarification: boolean;
  /** Short English explanation of how the date was derived. */
  note: string;
};

const UNRESOLVED: ResolvedDeliveryDate = {
  iso: null,
  isoEnd: null,
  confidence: "unresolved",
  needsClarification: false,
  note: "No delivery information stated.",
};

const WEEKDAYS: Record<string, number> = {
  // English
  sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6,
  sun: 0, mon: 1, tue: 2, tues: 2, wed: 3, thu: 4, thur: 4, thurs: 4, fri: 5, sat: 6,
  // German
  sonntag: 0, montag: 1, dienstag: 2, mittwoch: 3, donnerstag: 4, freitag: 5, samstag: 6, sonnabend: 6,
  // French
  dimanche: 0, lundi: 1, mardi: 2, mercredi: 3, jeudi: 4, vendredi: 5, samedi: 6,
  // Italian
  domenica: 0, lunedi: 1, lunedì: 1, martedi: 2, martedì: 2, mercoledi: 3, mercoledì: 3,
  giovedi: 4, giovedì: 4, venerdi: 5, venerdì: 5, sabato: 6,
};

const MONTHS: Record<string, number> = {
  january: 1, jan: 1, februar: 2, february: 2, feb: 2, märz: 3, marz: 3, march: 3, mar: 3,
  april: 4, apr: 4, mai: 5, may: 5, maggio: 5, juni: 6, june: 6, jun: 6, giugno: 6,
  juli: 7, july: 7, jul: 7, luglio: 7, august: 8, aug: 8, agosto: 8,
  september: 9, sep: 9, sept: 9, settembre: 9, oktober: 10, october: 10, oct: 10, ottobre: 10,
  november: 11, nov: 11, novembre: 11, dezember: 12, december: 12, dec: 12, dicembre: 12,
  // French
  janvier: 1, février: 2, fevrier: 2, mars: 3, avril: 4, juin: 6, juillet: 7, août: 8, aout: 8,
  septembre: 9, octobre: 10, novembre_: 11, décembre: 12, decembre: 12,
};

function pad(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

function toIso(d: Date): string {
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

function utcDate(y: number, m: number, d: number): Date {
  return new Date(Date.UTC(y, m - 1, d));
}

function anchorAsUtc(anchor: Date): Date {
  return utcDate(anchor.getUTCFullYear(), anchor.getUTCMonth() + 1, anchor.getUTCDate());
}

function addDays(d: Date, n: number): Date {
  const out = new Date(d.getTime());
  out.setUTCDate(out.getUTCDate() + n);
  return out;
}

function addBusinessDays(d: Date, n: number): Date {
  let out = new Date(d.getTime());
  let remaining = n;
  while (remaining > 0) {
    out = addDays(out, 1);
    const day = out.getUTCDay();
    if (day !== 0 && day !== 6) remaining -= 1;
  }
  return out;
}

function endOfWeek(anchor: Date, which: "this" | "next"): Date {
  // Friday of the chosen week (business end of week).
  const day = anchor.getUTCDay(); // 0..6, Sun=0
  // Days to Friday this week:
  const toFriThis = ((5 - day) + 7) % 7;
  const fri = addDays(anchor, toFriThis === 0 && day !== 5 ? 7 : toFriThis);
  return which === "next" ? addDays(fri, 7) : fri;
}

function endOfMonth(anchor: Date, which: "this" | "next"): Date {
  const y = anchor.getUTCFullYear();
  const m = anchor.getUTCMonth() + 1;
  const targetMonth = which === "next" ? m + 1 : m;
  const overflowYear = targetMonth > 12 ? y + 1 : y;
  const realMonth = ((targetMonth - 1) % 12) + 1;
  // last day of realMonth = day 0 of next month
  const last = new Date(Date.UTC(overflowYear, realMonth, 0));
  // Walk back to a weekday.
  let out = last;
  while (out.getUTCDay() === 0 || out.getUTCDay() === 6) out = addDays(out, -1);
  return out;
}

function nextWeekday(anchor: Date, targetDow: number, modifier: "this" | "next" | null): Date {
  const anchorDow = anchor.getUTCDay();
  let delta = (targetDow - anchorDow + 7) % 7;
  if (delta === 0) delta = 7; // never "today"
  if (modifier === "next") {
    // Convention: "next Tuesday" = Tuesday of the following calendar week.
    if (delta <= 7) delta += 7;
  }
  return addDays(anchor, delta);
}

const VAGUE_PATTERNS: RegExp[] = [
  /\b(when\s+(?:available|in\s+stock)|as\s+soon\s+as\s+(?:we|possible)|sobald(?:\s+wir)?\s+k(?:ö|o)nnen|d(?:è|e)s\s+que\s+possible|appena\s+possibile|prossimamente|in\s+(?:k(?:ü|u)rze|breve)|soon|bient(?:ô|o)t|baldigst|asap|au\s+plus\s+vite)\b/i,
  /\b(we'?ll\s+(?:see|let\s+you\s+know)|tba|tbd|to\s+be\s+(?:announced|determined)|noch\s+offen|encore\s+(?:à|a)\s+d(?:é|e)finir|da\s+definire)\b/i,
];

const MENTIONS_DELIVERY = /(delivery|deliver|arriv\w*|ship\w*|lead\s*time|liefer\w*|zustell\w*|ankunft|livr\w*|consegn\w*|spediz\w*|exp(?:é|e)di\w*)/i;

/**
 * Main entry. `anchor` should be the supplier reply timestamp (UTC-ish) — we
 * normalise to UTC midnight so weekday math is stable across timezones.
 */
export function resolveDeliveryDate(
  raw: string | null | undefined,
  anchor: Date,
): ResolvedDeliveryDate {
  const text = (raw ?? "").trim();
  if (!text) return UNRESOLVED;

  const anchorDay = anchorAsUtc(anchor);
  const lower = text.toLowerCase();

  // --- Vague phrases up front ---------------------------------------------
  if (VAGUE_PATTERNS.some((re) => re.test(lower))) {
    // ASAP-ish: give an optimistic +2 business day estimate so the foreman
    // sees *something* on screen, but mark it low confidence + clarify.
    const isAsap = /(as\s+soon\s+as\s+possible|asap|au\s+plus\s+vite|appena\s+possibile|sobald(?:\s+wir)?\s+k(?:ö|o)nnen|d(?:è|e)s\s+que\s+possible)/i.test(
      lower,
    );
    if (isAsap) {
      const est = addBusinessDays(anchorDay, 2);
      return {
        iso: toIso(est),
        isoEnd: toIso(est),
        confidence: "low",
        needsClarification: true,
        note: `Supplier said "${truncate(text)}" — estimated as +2 business days, needs confirmation.`,
      };
    }
    return {
      iso: null,
      isoEnd: null,
      confidence: "low",
      needsClarification: true,
      note: `Supplier wording "${truncate(text)}" is too vague to pin a date.`,
    };
  }

  // --- Today / tomorrow ----------------------------------------------------
  if (/\b(today|heute|aujourd'?hui|oggi)\b/i.test(lower)) {
    return point(anchorDay, "high", `Supplier said "today".`);
  }
  if (/\b(tomorrow|morgen|demain|domani)\b/i.test(lower)) {
    const d = addDays(anchorDay, 1);
    return point(d, "high", `Supplier said "tomorrow".`);
  }
  if (/\bday\s+after\s+tomorrow|übermorgen|ubermorgen|apr(?:è|e)s-?demain|dopodomani\b/i.test(lower)) {
    return point(addDays(anchorDay, 2), "high", `Supplier said "day after tomorrow".`);
  }

  // --- Absolute dates ------------------------------------------------------
  // ISO YYYY-MM-DD
  const iso = lower.match(/\b(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})\b/);
  if (iso) {
    const y = +iso[1], m = +iso[2], d = +iso[3];
    if (validYmd(y, m, d)) return point(utcDate(y, m, d), "high", `Parsed ISO date ${iso[0]}.`);
  }

  // DD.MM.YYYY or DD/MM/YYYY or DD-MM-YYYY
  const dmy = lower.match(/\b(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{2,4})\b/);
  if (dmy) {
    const d = +dmy[1], m = +dmy[2];
    let y = +dmy[3];
    if (y < 100) y += 2000;
    if (validYmd(y, m, d)) return point(utcDate(y, m, d), "high", `Parsed date ${dmy[0]}.`);
  }

  // DD.MM or DD/MM (no year — assume current year, roll to next year if past)
  const dm = lower.match(/\b(\d{1,2})[.\/](\d{1,2})\b(?!\s*[.\/-]\s*\d)/);
  if (dm) {
    const d = +dm[1], m = +dm[2];
    if (m >= 1 && m <= 12 && d >= 1 && d <= 31) {
      const y = anchorDay.getUTCFullYear();
      let candidate = utcDate(y, m, d);
      if (candidate.getTime() < anchorDay.getTime()) candidate = utcDate(y + 1, m, d);
      if (validYmd(candidate.getUTCFullYear(), m, d)) {
        return point(candidate, "high", `Parsed date ${dm[0]} (year inferred).`);
      }
    }
  }

  // "15 June", "15. Juni", "15 giugno"
  const dMonth = lower.match(
    /\b(\d{1,2})\.?\s+([a-zà-ÿ]{3,12})\b(?:\s+(\d{2,4}))?/i,
  );
  if (dMonth) {
    const d = +dMonth[1];
    const monthName = dMonth[2].toLowerCase();
    const m = MONTHS[monthName];
    if (m && d >= 1 && d <= 31) {
      let y = dMonth[3] ? +dMonth[3] : anchorDay.getUTCFullYear();
      if (y < 100) y += 2000;
      let candidate = utcDate(y, m, d);
      if (!dMonth[3] && candidate.getTime() < anchorDay.getTime()) {
        candidate = utcDate(y + 1, m, d);
      }
      if (validYmd(candidate.getUTCFullYear(), m, d)) {
        return point(candidate, "high", `Parsed ${dMonth[0]}.`);
      }
    }
  }

  // --- End of week / month -------------------------------------------------
  const eowNext = /(end\s+of\s+next\s+week|ende\s+n(?:ä|a)chster\s+woche|fin\s+de\s+la\s+semaine\s+prochaine|fine\s+(?:della\s+)?prossima\s+settimana)/i;
  const eowThis = /(end\s+of\s+(?:this\s+)?week|ende\s+(?:dieser\s+)?woche|fin\s+de\s+(?:cette\s+)?semaine|fine\s+(?:di\s+questa\s+|della\s+)?settimana)/i;
  if (eowNext.test(lower)) return point(endOfWeek(anchorDay, "next"), "medium", "End of next week (Friday).");
  if (eowThis.test(lower)) return point(endOfWeek(anchorDay, "this"), "medium", "End of this week (Friday).");

  const eomNext = /(end\s+of\s+next\s+month|ende\s+n(?:ä|a)chsten\s+monats|fin\s+du\s+mois\s+prochain|fine\s+(?:del\s+)?prossimo\s+mese)/i;
  const eomThis = /(end\s+of\s+(?:this\s+)?month|ende\s+(?:dieses\s+)?monats|fin\s+(?:du|de)\s+mois|fine\s+(?:del\s+)?mese)/i;
  if (eomNext.test(lower)) return point(endOfMonth(anchorDay, "next"), "medium", "End of next month.");
  if (eomThis.test(lower)) return point(endOfMonth(anchorDay, "this"), "medium", "End of this month.");

  // --- "in/within N days/weeks/months" + ranges ----------------------------
  // Range first: "5–7 working days" or "5-7 days"
  const range = lower.match(
    /\b(\d{1,3})\s*[–\-to]+\s*(\d{1,3})\s*(business|working|werktag\w*|ouvr(?:é|e)s?|lavorativ\w*)?\s*(day|days|tag\w*|jour\w*|giorn\w*|week|weeks|woch\w*|semain\w*|settima\w*)\b/i,
  );
  if (range) {
    const a = +range[1], b = +range[2];
    const business = !!range[3];
    const unit = range[4];
    const isWeek = /^(week|weeks|woch|semain|settima)/i.test(unit);
    const start = isWeek
      ? addDays(anchorDay, a * 7)
      : business
        ? addBusinessDays(anchorDay, a)
        : addDays(anchorDay, a);
    const end = isWeek
      ? addDays(anchorDay, b * 7)
      : business
        ? addBusinessDays(anchorDay, b)
        : addDays(anchorDay, b);
    return {
      iso: toIso(start),
      isoEnd: toIso(end),
      confidence: "high",
      needsClarification: false,
      note: `Range: ${a}–${b} ${business ? "business " : ""}${isWeek ? "weeks" : "days"}.`,
    };
  }

  const inN = lower.match(
    /\b(?:in|within|inside|innerhalb(?:\s+von)?|dans|entro|fra|tra)\s+(\d{1,3})\s*(business|working|werktag\w*|ouvr(?:é|e)s?|lavorativ\w*)?\s*(day|days|tag\w*|jour\w*|giorn\w*|week|weeks|woch\w*|semain\w*|settima\w*|month|months|monat\w*|mois|mes\w*)\b/i,
  );
  if (inN) {
    const n = +inN[1];
    const business = !!inN[2];
    const unit = inN[3];
    const isWeek = /^(week|weeks|woch|semain|settima)/i.test(unit);
    const isMonth = /^(month|months|monat|mois|mes)/i.test(unit);
    let target: Date;
    if (isMonth) target = addDays(anchorDay, n * 30);
    else if (isWeek) target = addDays(anchorDay, n * 7);
    else target = business ? addBusinessDays(anchorDay, n) : addDays(anchorDay, n);
    return point(
      target,
      isMonth ? "medium" : "high",
      `${n} ${business ? "business " : ""}${isMonth ? "months" : isWeek ? "weeks" : "days"} from reply.`,
    );
  }

  // "ships within 5 days" — same as above but the duration phrase comes after.
  const trailingDuration = lower.match(
    /\b(\d{1,3})\s*(business|working|werktag\w*|ouvr(?:é|e)s?|lavorativ\w*)?\s*(day|days|tag\w*|jour\w*|giorn\w*|week|weeks|woch\w*|semain\w*|settima\w*)\b/i,
  );
  if (trailingDuration && MENTIONS_DELIVERY.test(lower)) {
    const n = +trailingDuration[1];
    const business = !!trailingDuration[2];
    const unit = trailingDuration[3];
    const isWeek = /^(week|weeks|woch|semain|settima)/i.test(unit);
    const target = isWeek
      ? addDays(anchorDay, n * 7)
      : business
        ? addBusinessDays(anchorDay, n)
        : addDays(anchorDay, n);
    return point(
      target,
      "high",
      `~${n} ${business ? "business " : ""}${isWeek ? "weeks" : "days"} (from supplier wording).`,
    );
  }

  // --- Weekday names -------------------------------------------------------
  // Find weekday with optional this/next modifier.
  const weekdayMatch = lower.match(
    /\b(this|next|am|naechsten|n(?:ä|a)chsten|prochain[e]?|prossim[oa])?\s*(sun|sunday|mon|monday|tue|tues|tuesday|wed|wednesday|thu|thur|thurs|thursday|fri|friday|sat|saturday|sonntag|montag|dienstag|mittwoch|donnerstag|freitag|samstag|sonnabend|dimanche|lundi|mardi|mercredi|jeudi|vendredi|samedi|domenica|luned[iì]|marted[iì]|mercoled[iì]|gioved[iì]|venerd[iì]|sabato)\b/i,
  );
  if (weekdayMatch) {
    const modRaw = weekdayMatch[1]?.toLowerCase() ?? "";
    const dow = WEEKDAYS[weekdayMatch[2].toLowerCase()];
    if (dow != null) {
      const modifier: "this" | "next" | null = /next|n(?:ä|a)chsten|prochain|prossim/.test(modRaw)
        ? "next"
        : modRaw === "this"
          ? "this"
          : null;
      const d = nextWeekday(anchorDay, dow, modifier);
      return point(
        d,
        modifier ? "high" : "medium",
        `Weekday "${weekdayMatch[0].trim()}" resolved against ${toIso(anchorDay)}.`,
      );
    }
  }

  // Nothing matched but they mentioned delivery → ask for clarification.
  if (MENTIONS_DELIVERY.test(lower)) {
    return {
      iso: null,
      isoEnd: null,
      confidence: "low",
      needsClarification: true,
      note: `Could not parse a date from "${truncate(text)}".`,
    };
  }

  return UNRESOLVED;
}

function point(d: Date, confidence: DeliveryConfidence, note: string): ResolvedDeliveryDate {
  const iso = toIso(d);
  return { iso, isoEnd: iso, confidence, needsClarification: false, note };
}

function validYmd(y: number, m: number, d: number): boolean {
  if (y < 2000 || y > 2100) return false;
  if (m < 1 || m > 12) return false;
  if (d < 1 || d > 31) return false;
  const probe = utcDate(y, m, d);
  return probe.getUTCFullYear() === y && probe.getUTCMonth() + 1 === m && probe.getUTCDate() === d;
}

function truncate(s: string, n = 60): string {
  return s.length <= n ? s : `${s.slice(0, n - 1)}…`;
}
