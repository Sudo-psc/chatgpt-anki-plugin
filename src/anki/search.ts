import { AnkiPluginError } from '../domain/errors.js';

/**
 * Validates and builds native Anki search syntax expressions (`docs.ankiweb.net/searching.html`).
 */

export interface BuildSearchQueryOptions {
  deckName?: string;
  tag?: string;
  state?: 'due' | 'new' | 'learn' | 'review' | 'suspended' | 'buried';
  minInterval?: number;
  maxInterval?: number;
  rawQuery?: string;
}

export function escapeAnkiTerm(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return '""';
  }
  const escaped = trimmed.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  if (/[\s:()"']/.test(escaped)) {
    return `"${escaped}"`;
  }
  return escaped;
}

export function validateAnkiSearchQuery(query: string): string {
  const trimmed = query.trim();
  if (!trimmed) {
    throw new AnkiPluginError(
      'INVALID_SEARCH_QUERY',
      'Search query cannot be empty.',
      'Provide a valid Anki search query such as `deck:Default`, `tag:anatomy`, or `is:due`.',
      false,
    );
  }

  // Check balanced unescaped double quotes
  let inQuotes = false;
  let escaped = false;
  let parenDepth = 0;

  for (const ch of trimmed) {
    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === '\\') {
      escaped = true;
      continue;
    }
    if (ch === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (!inQuotes) {
      if (ch === '(') parenDepth += 1;
      if (ch === ')') {
        parenDepth -= 1;
        if (parenDepth < 0) {
          throw new AnkiPluginError(
            'INVALID_SEARCH_QUERY',
            `Unbalanced closing parenthesis in search query: '${trimmed}'.`,
            'Check that every "(" has a matching ")" in your Anki search query.',
            false,
          );
        }
      }
    }
  }

  if (inQuotes) {
    throw new AnkiPluginError(
      'INVALID_SEARCH_QUERY',
      `Unclosed double quote in search query: '${trimmed}'.`,
      'Ensure deck or field phrases with spaces have matching double quotes, e.g. `deck:"Medicina::Cardiologia"`.',
      false,
    );
  }

  if (parenDepth !== 0) {
    throw new AnkiPluginError(
      'INVALID_SEARCH_QUERY',
      `Unclosed parenthesis in search query: '${trimmed}'.`,
      'Ensure all opening parentheses "(" are closed with ")".',
      false,
    );
  }

  return trimmed;
}

export function buildAnkiSearchQuery(options: BuildSearchQueryOptions): string {
  const parts: string[] = [];

  if (options.deckName) {
    parts.push(`deck:${escapeAnkiTerm(options.deckName)}`);
  }
  if (options.tag) {
    parts.push(`tag:${escapeAnkiTerm(options.tag)}`);
  }
  if (options.state) {
    parts.push(`is:${options.state}`);
  }
  if (typeof options.minInterval === 'number') {
    parts.push(`prop:ivl>=${Math.floor(options.minInterval)}`);
  }
  if (typeof options.maxInterval === 'number') {
    parts.push(`prop:ivl<=${Math.floor(options.maxInterval)}`);
  }
  if (options.rawQuery && options.rawQuery.trim()) {
    parts.push(validateAnkiSearchQuery(options.rawQuery));
  }

  const combined = parts.join(' ').trim();
  return validateAnkiSearchQuery(combined || 'deck:*');
}

export function computeDeckHierarchy(deckName: string): { parentName: string | null; depth: number } {
  const segments = deckName.split('::');
  if (segments.length <= 1) {
    return { parentName: null, depth: 0 };
  }
  return {
    parentName: segments.slice(0, -1).join('::'),
    depth: segments.length - 1,
  };
}

export function stripHtmlPreview(html: string, maxLength = 240): string {
  const withoutStyle = html.replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<script[\s\S]*?<\/script>/gi, ' ');
  const text = withoutStyle
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\s+/g, ' ')
    .trim();
  if (text.length <= maxLength) {
    return text;
  }
  return `${text.slice(0, maxLength - 1)}…`;
}
