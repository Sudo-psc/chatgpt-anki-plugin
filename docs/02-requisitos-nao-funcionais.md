# Requisitos Não Funcionais (`RNF-001` a `RNF-012`)

Todos os requisitos não funcionais possuem metas quantitativas e critérios de aceite verificáveis.

---

## RNF-001 — Latência de Resposta das Tools MCP

* **Categoria**: Desempenho.
* **Especificação**: O overhead introduzido pelo servidor MCP (validação Zod, verificação JWT, serialização JSON-RPC) deve ser `< 50 ms` no percentil 95 (p95); chamadas completas contra o AnkiConnect local ou `InMemoryAnkiAdapter` devem responder em `< 500 ms` (p95) para consultas de até 50 cartões.
* **Critério de Aceite**: Suíte de integração executa as 13 tools em `< 500 ms` por chamada; timeout configurável via `ANKICONNECT_TIMEOUT_MS` (padrão `8000 ms`) aborta chamadas penduradas com erro `ANKI_TIMEOUT`.

---

## RNF-002 — Privacidade e Processamento Stateless (Zero Retenção de Cartões)

* **Categoria**: Privacidade / LGPD / GDPR.
* **Especificação**: O servidor MCP **não persiste conteúdo de cartões, notas ou baralhos em banco de dados próprio** em modo `ankiconnect` ou `bridge`. Todo o tráfego de cartões é processado em memória de forma *stateless* e *pass-through*.
* **Critério de Aceite**: Nenhum arquivo SQLite/JSON de conteúdo de usuário é gravado em disco pelo servidor HTTP; logs estruturados (`src/infra/logger.ts`) registram apenas `tool`, `action`, `durationMs`, `status` e `requestId`, nunca `fields`, `Front`, `Back` ou `tags`.

---

## RNF-003 — Segurança de Autenticação e Criptografia em Trânsito

* **Categoria**: Segurança.
* **Especificação**: Em produção, todo tráfego externo ocorre exclusivamente sobre HTTPS (TLS 1.2+) e WSS, com tokens JWT assinados com HMAC-SHA256 (`HS256`, segredo ≥ 256 bits) ou par de chaves assimétricas, PKCE `S256` obrigatório e comparação em tempo constante (`crypto.timingSafeEqual`) para segredos estáticos.
* **Critério de Aceite**: Tentativa de iniciar o servidor HTTP em host público (`0.0.0.0`) com `MCP_ALLOW_UNAUTHENTICATED=1` ou sem `OAUTH_JWT_SECRET` seguro falha na inicialização (`assertHttpSecurity`).

---

## RNF-004 — Cobertura de Testes Automatizados ≥ 80%

* **Categoria**: Qualidade / Manutenibilidade.
* **Especificação**: A cobertura de linhas, funções, branches e statements nos módulos `src/tools/**` e `src/anki/**` deve ser **≥ 80%**.
* **Critério de Aceite**: `npm run test:coverage` falha com código de saída `!= 0` se qualquer métrica em `src/tools` ou `src/anki` ficar abaixo de 80% (configurado em `vitest.config.ts`).

---

## RNF-005 — Conformidade Estrita de Contratos e Erros Acionáveis

* **Categoria**: Confiabilidade / UX Conversacional.
* **Especificação**: Toda tool MCP deve validar entradas com Zod, expor JSON Schema completo com `.describe()` em todos os parâmetros, retornar `structuredContent` tipado e, em caso de falha, retornar erro estruturado (`code`, `message`, `hint`, `retryable`) sem expor stack traces internos.
* **Critério de Aceite**: Suíte `tests/contract/tools.contract.test.ts` valida os schemas, anotações (`readOnlyHint`, `destructiveHint`, `idempotentHint`, `openWorldHint`) e envelopes de sucesso/erro das 13 tools.

---

## RNF-006 — Limite de Payload e Paginação para o ChatGPT

* **Categoria**: Escalabilidade / Limites da Plataforma OpenAI.
* **Especificação**: Nenhuma tool pode retornar mais de 100 cartões por chamada ou payloads superiores a `256 KB`, evitando truncamento de contexto no modelo.
* **Critério de Aceite**: `search_cards` e `get_due_cards` impõem `limit <= 100` no schema Zod e truncam campos de pré-visualização longos em listagens (mantendo o conteúdo integral em `get_card`).

---

## RNF-007 — Rate Limiting e Proteção contra Abuso

* **Categoria**: Segurança / Disponibilidade.
* **Especificação**: Os endpoints `/oauth/*` e `/mcp` devem contar com *rate limiting* por IP (`express-rate-limit`) e cabeçalhos de segurança HTTP (`helmet`, CSP restritiva para widgets).
* **Critério de Aceite**: Exceder o limite configurado retorna `429 Too Many Requests` com cabeçalho `Retry-After`.

---

## RNF-008 — Observabilidade (Logs Estruturados, Métricas e Healthcheck)

* **Categoria**: Operação / Observabilidade.
* **Especificação**: O servidor deve emitir logs JSON estruturados em `stderr` (compatível com OpenTelemetry / Pino), propagar `x-request-id` e expor `GET /health` (e `/healthz`) além de métricas operacionais em `GET /metrics`.
* **Critério de Aceite**: `GET /health` retorna `200 OK` com `{ status: "ok", version, uptimeSeconds, anki: { backend, reachable } }` em `< 100 ms`.

---

## RNF-009 — Portabilidade e Reprodutibilidade em Container (Docker)

* **Categoria**: DevOps / Implantação.
* **Especificação**: O projeto deve fornecer `docker/Dockerfile` multi-stage rodando com usuário não-root (`node`), `docker/docker-compose.yml` e `render.yaml` prontos para deploy contínuo.
* **Critério de Aceite**: Um terceiro consegue subir o servidor localmente em `< 15 minutos` seguindo o `README.md` (via `npm start` ou `docker compose up`).

---

## RNF-010 — Ausência Total de Segredos e Dados Pessoais no Repositório

* **Categoria**: Segurança de Supply Chain.
* **Especificação**: Zero credenciais reais, tokens, chaves privadas ou coleções `.anki2`/`.apkg` reais no código-fonte ou no histórico do Git.
* **Critério de Aceite**: Workflow de CI executa verificação de segredos (Gitleaks) e geração de SBOM CycloneDX a cada push/PR em `main`.

---

## RNF-011 — Modo Somente-Leitura de Emergência (`ANKI_READ_ONLY`)

* **Categoria**: Segurança Operacional.
* **Especificação**: Quando `ANKI_READ_ONLY=1` estiver ativo, todas as 8 tools de escrita/exclusão/revisão (`create_deck`, `update_deck`, `delete_deck`, `create_note`, `update_note`, `delete_note`, `submit_review`) devem recusar alterações antes de tocar no adaptador Anki.
* **Critério de Aceite**: Testes automatizados verificam que 100% das tools mutáveis retornam `READ_ONLY_MODE` quando `ANKI_READ_ONLY=1`.

---

## RNF-012 — Resiliência à Indisponibilidade do Anki Desktop

* **Categoria**: Resiliência.
* **Especificação**: Quando o Anki Desktop estiver fechado, em App Nap (macOS) ou com a ponte WebSocket desconectada, o servidor MCP não deve cair; deve retornar `ANKI_UNREACHABLE` com instruções passo a passo para o usuário abrir o Anki ou iniciar `npx chatgpt-anki-plugin bridge`.
* **Critério de Aceite**: Teste unitário e de integração simula `ECONNREFUSED` na porta `8765` e valida o retorno de erro estruturado acionável sem queda do processo HTTP.
