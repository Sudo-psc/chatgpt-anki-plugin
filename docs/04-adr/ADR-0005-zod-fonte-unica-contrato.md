# ADR-0005 — Zod como fonte única de contrato; erros tipados acionáveis

- **Status:** Aceito (2026-10-10)
- **Decisores:** Arquiteto, Dev MCP, QA.

## Contexto

Cada tool MCP precisa de: JSON Schema para o `tools/list` (consumido pelo
ChatGPT), validação de entrada, validação de saída (`structuredContent`) e
uma taxonomia de erros estável e acionável (C6). Manter esses artefatos
sincronizados manualmente é fonte garantida de drift.

## Decisão

1. **Uma única definição Zod por tool** (`src/tools/*.ts` com `defineTool`),
   declarando `inputSchema`, `outputSchema`, `scope`, `annotations` e handler.
   O JSON Schema é **derivado**:
   - pelo SDK oficial na serialização de `tools/list` (validação de entrada e
     de `structuredContent`);
   - por `zod-to-json-schema` nos testes de contrato (`registry.ts`) para
     afirmar propriedades do schema (tipos, `required`, `additionalProperties`).
2. **Códigos de erro fechados** (`ErrorCode`): `VALIDATION_ERROR`,
   `NOT_FOUND`, `CONFLICT`, `FORBIDDEN`, `RATE_LIMITED`, `ANKI_UNAVAILABLE`,
   `ANKI_ERROR`, `INTERNAL`. Todo erro de tool trafega como
   `{code, message, hint?}` (`isError: true`), mapeado centralmente em
   `src/tools/errors.ts` a partir das exceções do domínio.
3. **Validação em duas camadas**, com papéis claros:
   - *tipo/forma* (campo faltando, tipo errado): validada pelo SDK; a mensagem
     nomeia a tool e o campo. Documentado como comportamento do framework.
   - *semântica de negócio* (ex.: `confirm` obrigatório verdadeiro, `fields`
     vazio, `replace` sem `replace_from`): validada no handler e devolvida com
     `VALIDATION_ERROR` + hint em pt-BR/inglês técnico.
4. **Equivalência determinística**: `content[0].text` é o mesmo JSON de
   `structuredContent` — testado (`keeps content text and structuredContent
   consistent`) para que hosts que não renderizam structuredContent tenham o
   payload completo.

## Alternativas consideradas

- **JSON Schema escrito à mão** (fonte) + validação própria: rejeitado (drift).
- **zod 4 + `z.toJSONSchema` nativo**: viável, mas o SDK 1.32 aceita
  `^3.25 || ^4`; permanecemos em zod 3.25 LTS por compatibilidade comprovada
  com `zod-to-json-schema` usado nos contratos; migração futura é transparente.
- **Erros como JSON-RPC error em vez de `isError`**: rejeitado — o padrão MCP
  para falhas de tool é `CallToolResult.isError`, preservando a sessão; JSON-RPC
  error fica para falhas de protocolo (ex.: tool desconhecida).

## Consequências

- Adicionar uma tool = 1 arquivo com Zod + testes de contrato automáticos
  (o loop de contrato percorre o registry).
- Mensagens de validação do SDK são "não tipadas" por código — mitigação:
  documentadas em `05-tools-mcp.md` § Erros e cobertas por teste que verifica a
  mensagem nomeando a tool.
