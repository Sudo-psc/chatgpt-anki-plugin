# ADR-0002 — Transporte MCP: Streamable HTTP Stateless sobre HTTPS

* **Status**: Aceito
* **Data**: 2026-10-10
* **Decisores**: Arquiteto, Dev MCP

## Contexto

O protocolo MCP e o OpenAI Apps SDK suportam múltiplos transportes. Precisamos escolher o transporte primário para o servidor remoto em produção e para execução local.

## Opções Avaliadas

1. **Streamable HTTP (`StreamableHTTPServerTransport` em `/mcp`, stateless)** — especificação MCP 2025-03-26+ recomendada pela OpenAI para Apps SDK.
2. **HTTP + SSE legado (`/sse` + `/messages`)** — primeira geração do transporte remoto MCP, exige afinidade de sessão persistente.
3. **Apenas `stdio`** — funciona apenas localmente (Claude Desktop / CLI), incompatível com o conector web do ChatGPT.

## Decisão

Adotar **Streamable HTTP stateless** (`sessionIdGenerator: undefined`) exposto em `POST /mcp` (com suporte complementar a `stdio` via flag `--stdio` para uso local). Cada requisição HTTP cria uma instância leve do `McpServer` e `StreamableHTTPServerTransport`, garantindo isolamento completo entre requisições e escalabilidade horizontal em plataformas PaaS (Render/Fly/Railway).

## Consequências

* Compatibilidade nativa com o conector do ChatGPT e com o Apps SDK.
* Zero estado de sessão pendurado em memória entre chamadas HTTP.
