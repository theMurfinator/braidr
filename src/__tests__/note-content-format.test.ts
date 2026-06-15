import { describe, it, expect } from 'vitest';
import { isBlockJson } from '../shared/noteContent';

describe('isBlockJson', () => {
  it('treats a JSON array of blocks as block-json', () => {
    expect(isBlockJson('[{"type":"paragraph","content":[]}]')).toBe(true);
  });
  it('treats an empty array as block-json', () => {
    expect(isBlockJson('[]')).toBe(true);
  });
  it('treats legacy HTML as NOT block-json', () => {
    expect(isBlockJson('<p>hello <strong>world</strong></p>')).toBe(false);
  });
  it('treats an empty string as NOT block-json', () => {
    expect(isBlockJson('')).toBe(false);
  });
  it('treats a JSON object (not array) as NOT block-json', () => {
    expect(isBlockJson('{"type":"paragraph"}')).toBe(false);
  });
  it('treats malformed JSON as NOT block-json', () => {
    expect(isBlockJson('[{oops')).toBe(false);
  });
});
