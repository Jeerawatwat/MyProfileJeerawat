// backend/utils/money.js
// Money is DECIMAL(12,2) in MySQL but a float once it reaches JS. Every
// comparison that decides whether a refund fits inside what was paid is done
// in integer satang (1/100 baht) so 0.1 + 0.2 style float error can never let
// a refund go over the paid amount by a fraction.
function toSatang(value) {
  return Math.round(Number(value) * 100);
}

function fromSatang(satang) {
  return satang / 100;
}

function round2(value) {
  return fromSatang(toSatang(value));
}

// Parses a user-typed amount: must be a positive number with at most 2
// decimal places. Returns null if invalid.
function parsePositiveAmount(raw) {
  const text = typeof raw === 'number' ? String(raw) : typeof raw === 'string' ? raw.trim() : '';
  if (!/^\d+(\.\d{1,2})?$/.test(text)) return null;
  const value = Number(text);
  if (!(value > 0) || value > 9999999999.99) return null;
  return value;
}

module.exports = { toSatang, fromSatang, round2, parsePositiveAmount };
