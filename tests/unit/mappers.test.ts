import { describe, expect, it } from 'vitest';
import { cardState, parentOf, stripHtml } from '../../src/domain/mappers.js';

describe('stripHtml', () => {
  it('removes style and script blocks entirely (templates do Anki injetam CSS)', () => {
    const html = '<style>.card { color: red; } @import url("x.css");</style><div>Pergunta real</div><script>alert(1)</script>';
    const text = stripHtml(html);
    expect(text).toBe('Pergunta real');
    expect(text).not.toContain('color');
    expect(text).not.toContain('alert');
  });

  it('converts <br> to newline and decodes basic entities', () => {
    const text = stripHtml('Linha 1<br>Linha 2<br/>Linha 3&amp;mais &lt;tag&gt; &quot;aspas&quot; &#39;ap&#39;');
    expect(text).toContain('Linha 1');
    expect(text).toContain('Linha 2');
    expect(text).toContain('&mais <tag> "aspas" \'ap\'');
  });

  it('keeps plain text intact and trims', () => {
    expect(stripHtml('  Fêmur.  ')).toBe('Fêmur.');
  });
});

describe('parentOf', () => {
  it('derives the parent from "::" notation', () => {
    expect(parentOf('Estudos::Anatomia')).toBe('Estudos');
    expect(parentOf('A::B::C')).toBe('A::B');
    expect(parentOf('Default')).toBeNull();
  });
});

describe('cardState', () => {
  it('maps queue/type to the documented states', () => {
    expect(cardState({ queue: -1, type: 2 })).toBe('suspended');
    expect(cardState({ queue: 0, type: 0 })).toBe('new');
    expect(cardState({ queue: 1, type: 1 })).toBe('learning');
    expect(cardState({ queue: 2, type: 2 })).toBe('review');
    expect(cardState({ queue: 1, type: 3 })).toBe('relearning');
    expect(cardState({ queue: 0, type: 9 })).toBe('unknown');
  });
});
