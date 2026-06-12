import { describe, it, expect } from 'vitest';
import { keyBetween, seedKeys } from '../shared/fractionalIndex';

describe('fractional index keys', () => {
  it('first key, append, prepend all preserve order', () => {
    const first = keyBetween(null, null);
    const after = keyBetween(first, null);
    const before = keyBetween(null, first);
    expect(before < first).toBe(true);
    expect(first < after).toBe(true);
  });

  it('between-ness holds for repeated middle insertion (100 deep)', () => {
    let lo = keyBetween(null, null);
    let hi = keyBetween(lo, null);
    for (let i = 0; i < 100; i++) {
      const mid = keyBetween(lo, hi);
      expect(lo < mid && mid < hi).toBe(true);
      if (i % 2 === 0) lo = mid; else hi = mid;
    }
  });

  it('1000 appends stay ordered with short keys', () => {
    const keys = seedKeys(1000);
    for (let i = 1; i < keys.length; i++) {
      expect(keys[i - 1] < keys[i]).toBe(true);
    }
    // append chains must not grow linearly (a novel appends scenes constantly)
    expect(keys[999].length).toBeLessThan(40);
  });

  it('1000 prepends stay ordered', () => {
    let prev = keyBetween(null, null);
    for (let i = 0; i < 1000; i++) {
      const next = keyBetween(null, prev);
      expect(next < prev).toBe(true);
      prev = next;
    }
  });

  it('never produces trailing zeros', () => {
    let lo = keyBetween(null, null);
    let hi = keyBetween(lo, null);
    for (let i = 0; i < 200; i++) {
      const mid = keyBetween(lo, hi);
      expect(mid.endsWith('0')).toBe(false);
      if (i % 2 === 0) lo = mid; else hi = mid;
    }
  });

  it('rejects invalid inputs', () => {
    expect(() => keyBetween('b', 'a')).toThrow();
    expect(() => keyBetween('a', 'a')).toThrow();
    expect(() => keyBetween('a0', null)).toThrow(/trailing zero/);
    expect(() => keyBetween('a!', null)).toThrow(/invalid character/);
    expect(() => keyBetween('', null)).toThrow(/empty/);
  });

  it('survives 2000 random insertions at arbitrary positions', () => {
    // deterministic PRNG so failures reproduce
    let seed = 42;
    const rand = () => (seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;

    const keys: string[] = [keyBetween(null, null)];
    for (let i = 0; i < 2000; i++) {
      const pos = Math.floor(rand() * (keys.length + 1));
      const lo = pos > 0 ? keys[pos - 1] : null;
      const hi = pos < keys.length ? keys[pos] : null;
      const k = keyBetween(lo, hi);
      if (lo !== null) expect(k > lo).toBe(true);
      if (hi !== null) expect(k < hi).toBe(true);
      expect(k.endsWith('0')).toBe(false);
      keys.splice(pos, 0, k);
    }
    const sorted = [...keys].sort();
    expect(keys).toEqual(sorted);
  });

  it('sorts correctly under SQLite-style binary collation (ASCII)', () => {
    // digits must be in ASCII order for lexicographic = numeric ordering
    const sample = ['0', '9', 'A', 'Z', 'a', 'z'];
    const sorted = [...sample].sort();
    expect(sorted).toEqual(sample);
  });
});
