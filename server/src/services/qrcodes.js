/**
 * QR code identifier helpers.
 *
 * Codes read as <PREFIX>-<0001>, where the prefix abbreviates the facility so a
 * printed sticker is identifiable at a glance: "Dominion City Church Ikeja"
 * becomes DCCI-0001.
 */

// Words that carry no identity and would only dilute an abbreviation.
const STOPWORDS = new Set([
  'the', 'of', 'and', 'for', 'at', 'in', 'on', 'a', 'an',
  'ltd', 'limited', 'plc', 'inc', 'nig', 'nigeria',
]);

const MAX_PREFIX = 5;

/**
 * Derive a prefix from a facility name.
 *   "Dominion City Church Ikeja" -> "DCCI"
 *   "Victoria Island Car Park"   -> "VICP"
 *   "Lekki"                      -> "LEKK"
 * Falls back when a name yields nothing usable (symbols only, empty).
 */
function facilityPrefix(name, fallback = 'PSK') {
  const cleaned = String(name || '').replace(/[^A-Za-z0-9\s]/g, ' ').trim();
  if (!cleaned) return fallback;

  const words = cleaned.split(/\s+/).filter((w) => w && !STOPWORDS.has(w.toLowerCase()));
  if (!words.length) return fallback;

  const initials = words.map((w) => w[0]).join('').toUpperCase();
  // One or two words give too thin an abbreviation to be recognisable, so take
  // the leading letters of the first word instead (Lekki -> LEKK).
  if (initials.length >= 3) return initials.slice(0, MAX_PREFIX);
  return words[0].slice(0, 4).toUpperCase();
}

/** Normalises user-supplied prefixes to the same shape we generate. */
function normalizePrefix(prefix, fallback = 'PSK') {
  const cleaned = String(prefix || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  return cleaned ? cleaned.slice(0, MAX_PREFIX) : fallback;
}

module.exports = { facilityPrefix, normalizePrefix, MAX_PREFIX };
