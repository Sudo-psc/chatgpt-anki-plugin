import { describe, expect, it } from 'vitest';
import {
  buildAnkiSearchQuery,
  computeDeckHierarchy,
  escapeAnkiTerm,
  stripHtmlPreview,
  validateAnkiSearchQuery,
} from '../../src/anki/search.js';

describe('Anki search syntax utilities (src/anki/search.ts)', () => {
  it('escapes terms with spaces, colons, or quotes properly', () => {
    expect(escapeAnkiTerm('Default')).toBe('Default');
    expect(escapeAnkiTerm('Medicina::Cardiologia')).toBe('"Medicina::Cardiologia"');
    expect(escapeAnkiTerm('Cardio "Avançada"')).toBe('"Cardio \\"Avançada\\""');
    expect(escapeAnkiTerm('   ')).toBe('""');
  });

  it('validates balanced quotes and parentheses', () => {
    expect(validateAnkiSearchQuery('deck:"Medicina::Cardiologia" (is:due OR is:new) -is:suspended')).toBe(
      'deck:"Medicina::Cardiologia" (is:due OR is:new) -is:suspended',
    );
    expect(validateAnkiSearchQuery('deck:"Cardio \\"Avançada\\""')).toBe('deck:"Cardio \\"Avançada\\""');
    expect(() => validateAnkiSearchQuery('   ')).toThrowError(/cannot be empty/);
    expect(() => validateAnkiSearchQuery('deck:"Medicina')).toThrowError(/Unclosed double quote/);
    expect(() => validateAnkiSearchQuery('(tag:a OR tag:b')).toThrowError(/Unclosed parenthesis/);
    expect(() => validateAnkiSearchQuery('tag:a)')).toThrowError(/Unbalanced closing parenthesis/);
  });

  it('builds composite search queries from structured filters', () => {
    const q = buildAnkiSearchQuery({
      deckName: 'Medicina::Cardiologia',
      tag: 'fisiologia',
      state: 'due',
      minInterval: 7,
      maxInterval: 60,
      rawQuery: '-is:suspended',
    });
    expect(q).toBe('deck:"Medicina::Cardiologia" tag:fisiologia is:due prop:ivl>=7 prop:ivl<=60 -is:suspended');
    expect(buildAnkiSearchQuery({})).toBe('deck:*');
  });

  it('computes deck hierarchy parentName and depth', () => {
    expect(computeDeckHierarchy('Default')).toEqual({ parentName: null, depth: 0 });
    expect(computeDeckHierarchy('Medicina::Cardiologia')).toEqual({ parentName: 'Medicina', depth: 1 });
    expect(computeDeckHierarchy('A::B::C')).toEqual({ parentName: 'A::B', depth: 2 });
  });

  it('strips HTML tags, scripts, styles, and truncates long previews', () => {
    const html = '<style>.c{color:red}</style><div>Hello <b>World</b> &amp; Friends!</div>';
    expect(stripHtmlPreview(html)).toBe('Hello World & Friends!');
    const longText = 'A'.repeat(300);
    expect(stripHtmlPreview(longText, 50).length).toBe(50);
  });
});
