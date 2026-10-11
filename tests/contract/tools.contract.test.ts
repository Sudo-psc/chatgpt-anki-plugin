import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ALL_TOOLS, getTool, inputJsonSchema, outputJsonSchema, toolNames } from '../../src/tools/registry.js';
import { TOOL_SCOPES, type ErrorCode } from '../../src/tools/types.js';
import { ALL_SCOPES, callTool, obtainToken, startTestApp, type TestApp } from '../helpers/test-app.js';

/** C5: the exact mandated tool list (13) plus the 2 documented extension tools. */
const MANDATED_TOOLS = [
  'list_decks',
  'get_deck',
  'create_deck',
  'update_deck',
  'delete_deck',
  'search_cards',
  'get_card',
  'create_note',
  'update_note',
  'delete_note',
  'get_due_cards',
  'submit_review',
  'get_stats',
];
const EXTENDED_TOOLS = ['manage_tags', 'update_model_templates'];
const READ_ONLY_TOOLS = ['list_decks', 'get_deck', 'search_cards', 'get_card', 'get_due_cards', 'get_stats'];
const DESTRUCTIVE_TOOLS = ['delete_deck', 'delete_note', 'manage_tags', 'update_model_templates'];
const KNOWN_ERROR_CODES: ErrorCode[] = [
  'VALIDATION_ERROR',
  'NOT_FOUND',
  'CONFLICT',
  'FORBIDDEN',
  'RATE_LIMITED',
  'ANKI_UNAVAILABLE',
  'ANKI_ERROR',
  'INTERNAL',
];

describe('tool registry contract (C5/C6)', () => {
  it('exposes exactly the mandated tools plus the documented extensions', () => {
    const names = [...toolNames()].sort();
    expect(names).toEqual([...MANDATED_TOOLS, ...EXTENDED_TOOLS].sort());
    for (const mandated of MANDATED_TOOLS) {
      expect(getTool(mandated), `mandated tool ${mandated} must be registered`).toBeDefined();
    }
  });

  it('every tool has title, description, valid scope and sane annotations', () => {
    for (const tool of ALL_TOOLS) {
      expect(tool.title.length, tool.name).toBeGreaterThan(2);
      expect(tool.description.length, tool.name).toBeGreaterThan(40);
      expect(TOOL_SCOPES).toContain(tool.scope);
      if (READ_ONLY_TOOLS.includes(tool.name)) {
        expect(tool.annotations.readOnlyHint, `${tool.name} must be readOnlyHint`).toBe(true);
      }
      if (DESTRUCTIVE_TOOLS.includes(tool.name)) {
        expect(tool.annotations.destructiveHint, `${tool.name} must be destructiveHint`).toBe(true);
      }
    }
  });

  it('scopes are assigned per operation as documented', () => {
    const expected: Record<string, string> = {
      list_decks: 'anki:read',
      get_deck: 'anki:read',
      create_deck: 'anki:write',
      update_deck: 'anki:write',
      delete_deck: 'anki:write',
      search_cards: 'anki:read',
      get_card: 'anki:read',
      create_note: 'anki:write',
      update_note: 'anki:write',
      delete_note: 'anki:write',
      get_due_cards: 'anki:review',
      submit_review: 'anki:review',
      get_stats: 'anki:read',
      manage_tags: 'anki:write',
      update_model_templates: 'anki:admin',
    };
    for (const tool of ALL_TOOLS) {
      expect(tool.scope, tool.name).toBe(expected[tool.name]);
    }
  });

  it('input schemas are strict JSON Schema objects', () => {
    for (const tool of ALL_TOOLS) {
      const schema = inputJsonSchema(tool);
      expect(schema.type, tool.name).toBe('object');
      expect(schema.additionalProperties, tool.name).toBe(false);
      expect(schema.properties, tool.name).toBeTypeOf('object');
      if (schema.required !== undefined) expect(Array.isArray(schema.required), tool.name).toBe(true);
    }
    expect(inputJsonSchema(getTool('get_card') as never).required).toEqual(['card_id']);
    expect(inputJsonSchema(getTool('delete_deck') as never).required).toEqual(['name', 'confirm']);
    // Fields with defaults must not be required (ChatGPT relies on optionality).
    expect(inputJsonSchema(getTool('search_cards') as never).required).toEqual(['query']);
    expect(inputJsonSchema(getTool('get_due_cards') as never).required).toBeUndefined();
    expect(inputJsonSchema(getTool('list_decks') as never).required).toBeUndefined();
  });

  it('output schemas are JSON Schema objects', () => {
    for (const tool of ALL_TOOLS) {
      const schema = outputJsonSchema(tool);
      expect(schema.type, tool.name).toBe('object');
      expect(schema.properties, tool.name).toBeTypeOf('object');
    }
  });
});

describe('tool contracts against a live server (C6)', () => {
  let app: TestApp;
  let token: string;

  beforeAll(async () => {
    app = await startTestApp();
    token = await obtainToken(app.baseUrl, { scope: ALL_SCOPES });
  });

  afterAll(async () => {
    await app.close();
  });

  /** Canonical, side-effect-ordered invocation per tool. */
  async function canonicalCall(name: string): Promise<Record<string, unknown> | null> {
    const prepare = async (): Promise<Record<string, unknown>> => {
      const deck = await callTool(app.baseUrl, token, 'create_deck', { name: 'Contrato' });
      expect(deck.isError).toBe(false);
      const note = await callTool(app.baseUrl, token, 'create_note', {
        deck: 'Contrato',
        model: 'Basic',
        fields: { Front: 'Pergunta de contrato', Back: 'Resposta de contrato' },
        tags: ['contrato'],
      });
      expect(note.isError).toBe(false);
      const search = await callTool(app.baseUrl, token, 'search_cards', { query: 'tag:contrato' });
      const card = (search.structuredContent?.cards as Array<Record<string, unknown>>)[0] as Record<string, unknown>;
      return { noteId: note.structuredContent?.note_id as number, cardId: card?.card_id as number };
    };

    switch (name) {
      case 'list_decks':
        return (await callTool(app.baseUrl, token, name, {})).structuredContent;
      case 'get_deck':
        return (await callTool(app.baseUrl, token, name, { name: 'Default' })).structuredContent;
      case 'create_deck':
        return (await callTool(app.baseUrl, token, name, { name: 'Contrato' })).structuredContent;
      case 'update_deck':
        return (await callTool(app.baseUrl, token, name, { name: 'Contrato', new_name: 'Contrato2' })).structuredContent;
      case 'delete_deck': {
        await callTool(app.baseUrl, token, 'create_deck', { name: 'ParaDeletar' });
        return (await callTool(app.baseUrl, token, name, { name: 'ParaDeletar', confirm: true })).structuredContent;
      }
      case 'search_cards':
        return (await callTool(app.baseUrl, token, name, { query: 'is:due' })).structuredContent;
      case 'get_card': {
        const due = await callTool(app.baseUrl, token, 'get_due_cards', { limit: 1 });
        const cardId = (due.structuredContent?.cards as Array<Record<string, unknown>>)[0]?.card_id as number;
        return (await callTool(app.baseUrl, token, name, { card_id: cardId })).structuredContent;
      }
      case 'create_note':
        return (await callTool(app.baseUrl, token, name, {
          deck: 'Default',
          model: 'Basic',
          fields: { Front: 'Nota de contrato', Back: 'Resposta' },
        })).structuredContent;
      case 'update_note': {
        const { noteId } = await prepare();
        return (await callTool(app.baseUrl, token, name, { note_id: noteId, tags: ['contrato', 'ok'] })).structuredContent;
      }
      case 'delete_note': {
        const created = await callTool(app.baseUrl, token, 'create_note', {
          deck: 'Default',
          model: 'Basic',
          fields: { Front: 'Para deletar contrato', Back: 'x' },
        });
        return (await callTool(app.baseUrl, token, name, {
          note_ids: [created.structuredContent?.note_id as number],
          confirm: true,
        })).structuredContent;
      }
      case 'get_due_cards':
        return (await callTool(app.baseUrl, token, name, {})).structuredContent;
      case 'submit_review': {
        const due = await callTool(app.baseUrl, token, 'get_due_cards', { limit: 1 });
        const cardId = (due.structuredContent?.cards as Array<Record<string, unknown>>)[0]?.card_id as number;
        return (await callTool(app.baseUrl, token, name, { card_id: cardId, ease: 'hard' })).structuredContent;
      }
      case 'get_stats':
        return (await callTool(app.baseUrl, token, name, {})).structuredContent;
      case 'manage_tags':
        return (await callTool(app.baseUrl, token, name, { action: 'list' })).structuredContent;
      case 'update_model_templates':
        return (await callTool(app.baseUrl, token, name, { model: 'Basic', css: '.card{}' })).structuredContent;
      default:
        throw new Error(`no canonical call defined for ${name}`);
    }
  }

  it('every tool output validates against its declared output schema', async () => {
    for (const tool of ALL_TOOLS) {
      const result = await canonicalCall(tool.name);
      expect(result, tool.name).not.toBeNull();
      const parsed = tool.outputSchema.safeParse(result);
      if (!parsed.success) {
        throw new Error(
          `output of ${tool.name} does not match its schema: ${JSON.stringify(parsed.error.issues)}`,
        );
      }
    }
  });

  it('every error payload uses a documented code, message and hint', async () => {
    const scenarios: Array<{ name: string; args: Record<string, unknown> }> = [
      { name: 'delete_deck', args: { name: 'Default', confirm: false } },
      { name: 'get_deck', args: { name: 'NaoExiste' } },
      { name: 'update_deck', args: { name: 'Default', new_name: 'Estudos' } },
      { name: 'update_note', args: { note_id: 1 } },
    ];
    for (const scenario of scenarios) {
      const result = await callTool(app.baseUrl, token, scenario.name, scenario.args);
      expect(result.isError, scenario.name).toBe(true);
      const code = result.payload?.code as ErrorCode;
      expect(KNOWN_ERROR_CODES, `${scenario.name} returned code ${code}`).toContain(code);
      expect(typeof result.payload?.message).toBe('string');
      expect(result.payload?.hint).toBeTruthy();
    }
  });
});
