/**
 * Mirrors server/src/services/qrcodes.js so the batch form can preview the
 * prefix before submitting. The server remains authoritative — it re-derives
 * the prefix when the client omits one.
 */
const STOPWORDS = new Set([
  'the', 'of', 'and', 'for', 'at', 'in', 'on', 'a', 'an',
  'ltd', 'limited', 'plc', 'inc', 'nig', 'nigeria',
]);

const MAX_PREFIX = 5;

/** "Dominion City Church Ikeja" -> "DCCI" */
export function facilityPrefix(name, fallback = 'PSK') {
  const cleaned = String(name || '').replace(/[^A-Za-z0-9\s]/g, ' ').trim();
  if (!cleaned) return fallback;
  const words = cleaned.split(/\s+/).filter((w) => w && !STOPWORDS.has(w.toLowerCase()));
  if (!words.length) return fallback;
  const initials = words.map((w) => w[0]).join('').toUpperCase();
  if (initials.length >= 3) return initials.slice(0, MAX_PREFIX);
  return words[0].slice(0, 4).toUpperCase();
}

export function normalizePrefix(prefix, fallback = '') {
  const cleaned = String(prefix || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  return cleaned ? cleaned.slice(0, MAX_PREFIX) : fallback;
}
