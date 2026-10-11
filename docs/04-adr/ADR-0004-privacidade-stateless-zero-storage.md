# ADR-0004 — Privacidade e Processamento Stateless (Zero Armazenamento de Cartões)

* **Status**: Aceito
* **Data**: 2026-10-10
* **Decisores**: Segurança, Arquiteto

## Contexto

Flashcards frequentemente contêm anotações pessoais, dados acadêmicos ou informações sensíveis de estudo. As restrições do projeto e as diretrizes de revisão da OpenAI determinam a minimização de dados e proíbem armazenar conteúdo de cartões sem necessidade.

## Decisão

1. **Pass-through estrito**: o servidor MCP atua exclusivamente como tradutor de protocolo entre as chamadas MCP do ChatGPT e o adaptador Anki (`AnkiConnectAdapter` / `BridgeRelayAdapter`). Nenhum banco de dados de cartões é mantido pelo servidor em produção.
2. **Redação de Logs**: o logger estruturado (`src/infra/logger.ts`) possui lista de bloqueio explícita para chaves sensíveis (`Authorization`, `token`, `fields`, `Front`, `Back`, `tags`, `code_verifier`, `pin`). Apenas nomes de tools, códigos de status e tempos de resposta são registrados.
3. **Endpoint de Exclusão / Revogação**: `POST /oauth/revoke` e `DELETE /mcp` permitem encerrar imediatamente qualquer token ou conexão ativa.

## Consequências

* Conformidade imediata com LGPD (Art. 6º — necessidade e minimização) e GDPR (Art. 5(1)(c)).
* Em caso de comprometimento do container em nuvem, não há base histórica de flashcards armazenada em disco.
