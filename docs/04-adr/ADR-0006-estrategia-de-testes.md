# ADR-0006 — Estratégia de testes: Vitest (unit/integração/contrato) + Playwright E2E + mock determinístico

- **Status:** Aceito (2026-10-10)
- **Decisores:** QA, DevOps, Arquiteto.

## Contexto

Precisamos provar C5–C8: 15 tools funcionando, contratos de schema validados,
erros tipados, OAuth funcionando com 401s, cobertura ≥ 80% em `src/tools` e
`src/anki` — tudo em CI, sem depender de Anki real, rede externa ou dados de
usuários.

## Decisão

1. **Pirâmide de testes com 4 suítes Vitest** (`tests/`):
   - **unit** (`tests/unit`): config, logger, tokens, oauth service, rate limit,
     client AnkiConnect (erros/timeout/shape), mock, mapeamento de erros de tool.
   - **integração** (`tests/integration`): servidor HTTP real em porta efêmera +
     `MockAnkiConnect` in-process; fluxo OAuth completo (approve→token→call);
     as 15 tools ponta a ponta; cenários de falha (Anki fora, rate limit, 413,
     405, Origin bloqueada).
   - **contrato** (`tests/contract`): o registry percorre as 15 tools e afirma
     nomes exatos, scopes, annotations, JSON Schema (tipos/`required`) e valida
     **o output real de cada tool** contra o `outputSchema` declarado; taxonomia
     de erros fechada.
   - **E2E** (`tests/e2e`, Playwright): widgets reais servidos pelo servidor
     (estado via `?state=`, teclado, CSP); roteiro assistido do ChatGPT
     developer mode como spec skipada com passos (evidência C10).
2. **`MockAnkiConnect` como instrumento central**: emulador in-process do
   AnkiConnect API v6 com coleção sintética, ids determinísticos, injeção de
   falha (`failNextAction`) e atraso (`delayAction`) para testar timeouts.
   O mesmo emulador alimenta o modo `demo`.
3. **Sem mocks de HTTP frágeis na integração**: o cliente usa `fetch` real
   contra o mock via HTTP; apenas os testes unitários injetam `fetchImpl`.
4. **Gate de cobertura no CI**: `vitest.config.ts` restringe a medição a
   `src/tools` e `src/anki` (excluindo o próprio mock — instrumento de teste) e
   falha abaixo de 80% (linhas/statements/funções) e 75% (branches).
   Resultado atual: **96,9% linhas / 92,3% branches** no agregado.
5. **CI obrigatório** (`.github/workflows/ci.yml`): lint → typecheck →
   test:coverage → build, com upload de relatório; gitleaks (working tree +
   histórico) e SBOM SPDX como jobs próprios.

## Alternativas consideradas

- **Anki real em CI**: rejeitado (GUI, plataforma, coleção por runner).
- **fixtures de payload congelados**: usados apenas unitariamente; a integração
  exercita o fluxo real HTTP para evitar "testar o mock".
- **testcontainers**: desnecessário — não há banco de dados no servidor.

## Consequências

- Determinismo e isolamento: cada teste de integração sobe o próprio
  mock+servidor em portas efêmeras.
- O emulador documenta suas simplificações no header (agendador aproximado,
  subconjunto de query) — é instrumento, não promessa de paridade.
