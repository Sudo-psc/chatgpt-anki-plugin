import type { AnkiCardInfo, AnkiNoteInfo } from '../anki/wire-types.js';
import type { CardState, CardView, NoteView } from './types.js';

export function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

export function parentOf(name: string): string | null {
  const index = name.lastIndexOf('::');
  return index === -1 ? null : name.slice(0, index);
}

export function cardState(card: Pick<AnkiCardInfo, 'queue' | 'type'>): CardState {
  if (card.queue === -1) return 'suspended';
  switch (card.type) {
    case 0:
      return 'new';
    case 1:
      return 'learning';
    case 2:
      return 'review';
    case 3:
      return 'relearning';
    default:
      return 'unknown';
  }
}

export function mapCard(wire: AnkiCardInfo, tags: string[] = []): CardView {
  return {
    cardId: wire.cardId,
    noteId: wire.note,
    deck: wire.deckName,
    model: wire.modelName,
    question: stripHtml(wire.question),
    answer: stripHtml(wire.answer),
    tags,
    due: typeof wire.due === 'number' ? wire.due : null,
    intervalDays: wire.interval,
    reps: wire.reps,
    lapses: wire.lapses,
    queue: wire.queue,
    type: wire.type,
    state: cardState(wire),
  };
}

export function mapNote(wire: AnkiNoteInfo): NoteView {
  const fields: Record<string, string> = {};
  for (const [name, field] of Object.entries(wire.fields)) {
    fields[name] = field.value;
  }
  return {
    noteId: wire.noteId,
    model: wire.modelName,
    fields,
    tags: wire.tags,
  };
}
