// Fractional index keys (docs/data-model/TO-BE.md §2).
//
// A key is a base-62 string interpreted as a fraction in (0, 1); ordering
// keys lexicographically orders the items. Inserting between two items
// derives a key strictly between theirs — a one-row write, never a
// renumber. Algorithm follows David Greenspan's "Implementing Fractional
// Indexing" (Observable), midpoint variant.
//
// Invariants:
// - keys never end in the minimum digit '0' (such a key has no room
//   before it at its own length)
// - keyBetween(a, b) returns k with a < k < b lexicographically
// - null bounds mean "no neighbor": keyBetween(null, null) is the first
//   key, keyBetween(k, null) appends after k, keyBetween(null, k) before k

const DIGITS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
const ZERO = DIGITS[0];

function midpoint(a: string, b: string | null): string {
  if (b !== null && a >= b) {
    throw new Error(`fractionalIndex: ${JSON.stringify(a)} >= ${JSON.stringify(b)}`);
  }
  if (a.slice(-1) === ZERO || (b !== null && b.slice(-1) === ZERO)) {
    throw new Error('fractionalIndex: trailing zero in input key');
  }
  if (b !== null) {
    // shared prefix: recurse past it
    let n = 0;
    while ((a.charAt(n) || ZERO) === b.charAt(n)) n++;
    if (n > 0) return b.slice(0, n) + midpoint(a.slice(n), b.slice(n));
  }
  // first digits differ
  const digitA = a ? DIGITS.indexOf(a.charAt(0)) : 0;
  const digitB = b !== null ? DIGITS.indexOf(b.charAt(0)) : DIGITS.length;
  if (digitB - digitA > 1) {
    return DIGITS.charAt(Math.round(0.5 * (digitA + digitB)));
  }
  // consecutive leading digits
  if (b !== null && b.length > 1) {
    return b.slice(0, 1);
  }
  return DIGITS.charAt(digitA) + midpoint(a.slice(1), null);
}

function validate(key: string, label: string): void {
  if (key === '') throw new Error(`fractionalIndex: empty ${label} key`);
  for (const ch of key) {
    if (!DIGITS.includes(ch)) {
      throw new Error(`fractionalIndex: invalid character in ${label} key: ${JSON.stringify(key)}`);
    }
  }
  if (key.slice(-1) === ZERO) {
    throw new Error(`fractionalIndex: ${label} key has trailing zero: ${JSON.stringify(key)}`);
  }
}

// Append/prepend fast paths. Pure midpoint halves the remaining digit
// space every call, so appends (the most common outline operation) would
// grow keys ~1 char per 6 inserts. Incrementing/decrementing the
// rightmost adjustable digit instead grows ~1 char per 30+.

function increment(a: string): string {
  for (let i = a.length - 1; i >= 0; i--) {
    const d = DIGITS.indexOf(a.charAt(i));
    if (d < DIGITS.length - 1) return a.slice(0, i) + DIGITS.charAt(d + 1);
  }
  return a + DIGITS.charAt(31); // all max digits: extend
}

function decrement(b: string): string {
  for (let i = b.length - 1; i >= 0; i--) {
    const d = DIGITS.indexOf(b.charAt(i));
    // stop at '1': decrementing to '0' would leave a trailing zero
    if (d > 1) return b.slice(0, i) + DIGITS.charAt(d - 1);
  }
  // only 0s and 1s left: step under the last digit
  return b.slice(0, -1) + ZERO + DIGITS.charAt(31);
}

/** A key strictly between a and b. null = unbounded on that side. */
export function keyBetween(a: string | null, b: string | null): string {
  if (a !== null) validate(a, 'lower');
  if (b !== null) validate(b, 'upper');
  if (a !== null && b !== null && a >= b) {
    throw new Error(`fractionalIndex: lower ${JSON.stringify(a)} >= upper ${JSON.stringify(b)}`);
  }
  if (a !== null && b === null) return increment(a);
  if (a === null && b !== null) return decrement(b);
  return midpoint(a ?? '', b);
}

/** n evenly spread keys for seeding an ordered list (back-fill). */
export function seedKeys(n: number): string[] {
  const keys: string[] = [];
  let prev: string | null = null;
  for (let i = 0; i < n; i++) {
    prev = keyBetween(prev, null);
    keys.push(prev);
  }
  return keys;
}
