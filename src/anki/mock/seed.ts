/**
 * Coleção 100% SINTÉTICA usada no modo demo (ANKI_BACKEND=mock), nos testes de
 * integração e na revisão da OpenAI. Nenhum dado real de usuário é utilizado —
 * não substitua estes exemplos por conteúdo real (ver CONTRIBUTING.md).
 */

export interface MockSeedModel {
  name: string;
  fields: string[];
  templates?: Record<string, { Front: string; Back: string }>;
  css?: string;
}

export interface MockSeedNote {
  deck: string;
  model: string;
  fields: Record<string, string>;
  tags?: string[];
  cards?: Array<{
    due?: number;
    type?: number;
    queue?: number;
    interval?: number;
    reps?: number;
    lapses?: number;
    suspended?: boolean;
  }>;
}

export interface MockSeed {
  models: MockSeedModel[];
  decks: string[];
  notes: MockSeedNote[];
}

const DEFAULT_CSS = '.card { font-family: arial; font-size: 20px; text-align: center; color: black; background-color: white; }';

export function seedCollection(): MockSeed {
  return {
    models: [
      {
        name: 'Basic',
        fields: ['Front', 'Back'],
        templates: { 'Card 1': { Front: '{{Front}}', Back: '{{FrontSide}}\n\n<hr id=answer>\n\n{{Back}}' } },
        css: DEFAULT_CSS,
      },
      {
        name: 'Cloze',
        fields: ['Text', 'Extra'],
        templates: { 'Cloze': { Front: '{{cloze:Text}}', Back: '{{cloze:Text}}<br>{{Extra}}' } },
        css: DEFAULT_CSS,
      },
    ],
    decks: ['Default', 'Estudos::Anatomia', 'Estudos::Farmacologia', 'Concursos::Direito Constitucional'],
    notes: [
      {
        deck: 'Estudos::Anatomia',
        model: 'Basic',
        fields: { Front: 'Qual é o maior osso do corpo humano?', Back: 'Fêmur.' },
        tags: ['anatomia', 'revisao'],
        cards: [{ type: 2, queue: 2, due: 0, interval: 10, reps: 5, lapses: 0 }],
      },
      {
        deck: 'Estudos::Anatomia',
        model: 'Basic',
        fields: { Front: 'Quantos ossos tem o esqueleto humano adulto?', Back: '206 ossos.' },
        tags: ['anatomia'],
        cards: [{ type: 0, queue: 0, due: 0 }],
      },
      {
        deck: 'Estudos::Farmacologia',
        model: 'Basic',
        fields: {
          Front: 'Qual o mecanismo de ação dos beta-bloqueadores?',
          Back: 'Antagonismo competitivo de receptores beta-adrenérgicos.',
        },
        tags: ['farmacologia', 'prova'],
        cards: [{ type: 2, queue: 2, due: -2, interval: 21, reps: 8, lapses: 2 }],
      },
      {
        deck: 'Estudos::Farmacologia',
        model: 'Cloze',
        fields: {
          Text: 'O {{c1::paracetamol}} é um analgésico e antipirético, mas não é anti-inflamatório.',
          Extra: 'Exemplo sintético de nota cloze.',
        },
        tags: ['farmacologia'],
        cards: [{ type: 2, queue: 2, due: 0, interval: 7, reps: 3, lapses: 0 }],
      },
      {
        deck: 'Concursos::Direito Constitucional',
        model: 'Basic',
        fields: {
          Front: 'O que é a cláusula pétrea?',
          Back: 'Limitação material ao poder de reforma constitucional (art. 60, §4º, CF/88).',
        },
        tags: ['concurso', 'constitucional'],
        cards: [{ type: 2, queue: 2, due: 0, interval: 30, reps: 12, lapses: 1 }],
      },
      {
        deck: 'Default',
        model: 'Basic',
        fields: {
          Front: 'O que é repetição espaçada?',
          Back: 'Técnica de estudo que agenda revisões em intervalos crescentes para combater a curva do esquecimento.',
        },
        tags: ['metodo'],
        cards: [{ type: 0, queue: 0, due: 0 }],
      },
      {
        deck: 'Default',
        model: 'Basic',
        fields: { Front: 'Exemplo de cartão suspenso', Back: 'Este cartão está suspenso.' },
        tags: ['exemplo'],
        cards: [{ suspended: true, type: 2, interval: 4, reps: 1 }],
      },
    ],
  };
}
