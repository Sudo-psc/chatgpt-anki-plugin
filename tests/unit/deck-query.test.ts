import { describe, expect, it } from 'vitest';
import { deckQuery } from '../../src/anki/decks.js';
import { MockAnkiConnect } from '../../src/anki/mock/mock-anki-connect.js';
import { seedCollection } from '../../src/anki/mock/seed.js';

describe('deckQuery', () => {
  it('quotes plain deck names', () => {
    expect(deckQuery('Estudos::Anatomia')).toBe('deck:"Estudos::Anatomia"');
  });

  it('escapes Anki wildcards so a deck name matches only itself', () => {
    // `_` e `*` são curingas na busca do Anki: sem escape, "A_B" casaria "AxB".
    expect(deckQuery('C_B*')).toBe('deck:"C\\_B\\*"');
  });

  it('escapes quotes and backslashes instead of dropping them', () => {
    expect(deckQuery('Say "hi" \\ bye')).toBe('deck:"Say \\"hi\\" \\\\ bye"');
  });
});

describe('MockAnkiConnect deck search', () => {
  it('unescapes deck queries like Anki does', async () => {
    const mock = MockAnkiConnect.withSeed(seedCollection());
    const listener = await mock.listen(0);
    try {
      const call = async (action: string, params: Record<string, unknown>): Promise<unknown> => {
        const response = await fetch(listener.url, {
          method: 'POST',
          body: JSON.stringify({ action, version: 6, params }),
        });
        return ((await response.json()) as { result: unknown }).result;
      };
      await call('createDeck', { deck: 'A_B "x"' });
      await call('addNote', {
        note: { deckName: 'A_B "x"', modelName: 'Basic', fields: { Front: 'q', Back: 'a' }, tags: [] },
      });
      const ids = (await call('findCards', { query: deckQuery('A_B "x"') })) as number[];
      expect(ids).toHaveLength(1);
    } finally {
      await listener.close();
    }
  });
});
