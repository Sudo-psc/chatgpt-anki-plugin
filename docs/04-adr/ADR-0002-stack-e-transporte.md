# ADR-0002 — Stack e transporte: TypeScript/Node 22 + MCP SDK oficial (Streamable HTTP, JSON mode)

- **Status:** Aceito (2026-10-10)
- **Decisores:** Arquiteto, Dev MCP.

## Contexto

O ChatGPT conecta-se a servidores MCP remotos via **Streamable HTTP** com
JSON-RPC 2.0 (spec MCP 2025-06-18), com descoberta OAuth (RFC 8414/9728) e
negociação de versão de protocolo. Precisamos escolher linguagem, runtime e se
implementamos o protocolo ou usamos o SDK oficial.

## Decisão

1. **TypeScript em Node.js ≥ 20 (22 LTS em CI/Docker), ESM (`NodeNext`)** para
   o servidor inteiro; Python não foi necessário (AnkiConnect é HTTP).
2. **SDK oficial `@modelcontextprotocol/sdk`** (`^1.32.1`) para o protocolo:
   `McpServer.registerTool` (schemas Zod → JSON Schema; validação de entrada e
   de `structuredContent` de saída) e `StreamableHTTPServerTransport` em
   **modo JSON** (`enableJsonResponse: true`) e **stateless**
   (`sessionIdGenerator: undefined`; um par server+transport por request,
   conforme o exemplo oficial `simpleStatelessStreamableHttp`).
3. HTTP próprio com `node:http` (sem framework): roteador com
   `/health`, `/ready`, `/mcp`, `/oauth/*`, `/.well-known/*`, `/widgets/*` —
   controle total dos headers de segurança (CSP, WWW-Authenticate) e do ciclo
   de vida por request.
4. GET `/mcp` responde **405** (sem stream SSE) — permitido pela spec para
   servidores que não oferecem stream; `Accept` deve listar
   `application/json` e `text/event-stream` (exigência do SDK/spec; clients
   reais como o ChatGPT enviam ambos).

## Alternativas consideradas

- **Implementação própria do protocolo**: rejeitada — o SDK oficial é mantido,
  cobre validação, negociação de versão e sessões; menos risco de divergência.
- **Express/Fastify**: desnecessário para o conjunto de rotas; `node:http`
  reduz superfície de dependência no caminho crítico.
- **Modo com sessão (stateful)**: rejeitado para v0.1 — stateless permite
  múltiplas instâncias sem *sticky sessions*; o estado por sessão do SDK não é
  necessário para tools puras. Custo: um par server+transport por request
  (registro de tools é leve).

## Consequências

- Validação de args é dupla: JSON Schema/Zod pelo SDK (erros nomeiam a tool) e
  validações semânticas próprias (`ToolError` typado) — ver ADR-0005.
- Sem SSE ⇒ sem notificações server→client e sem resuma; `/mcp` GET = 405;
  documentado para clientes.
- Node ≥ 20 exigido (fetch/AbortController/`base64url` nativos).
