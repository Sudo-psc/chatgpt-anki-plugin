# Widgets do Apps SDK

Widgets HTML estáticos servidos pelo servidor MCP em:

- `GET /widgets/decks.html` — lista de baralhos (`list_decks`), resultados de busca (`search_cards`) e cartões devidos (`get_due_cards`).
- `GET /widgets/review.html` — sessão de revisão com botões Again/Hard/Good/Easy que chamam `submit_review`.

## Contrato com o ChatGPT (Apps SDK)

Os widgets leem o estado de `window.openai.toolOutput` (injetado pelo ChatGPT após
a chamada da tool) e enviam ações via `window.openai.callTool(name, arguments)`.
Consulte a documentação oficial do Apps SDK para a API completa
(`platform.openai.com/docs/apps` / `developers.openai.com/apps-sdk`) — a ponte
`window.openai` é fornecida exclusivamente pelo host ChatGPT.

## Teste local (sem ChatGPT)

Com o servidor rodando (`npm run demo`), abra no navegador:

```
http://localhost:8080/widgets/decks.html?state={"decks":[{"id":1,"name":"Default","parent":null}]}
http://localhost:8080/widgets/review.html?state={"cards":[{"card_id":1,"question":"Pergunta?","answer":"Resposta.","deck":"Default","state":"review"}]}
```

O parâmetro `?state=` é apenas para desenvolvimento/testes E2E (ver
`tests/e2e/widget.spec.ts`); em produção o estado vem do ChatGPT.

## Segurança

As respostas são servidas com CSP restritiva (`default-src 'none'; script-src 'self'; ...`)
definida em `src/app.ts` — a mesma CSP deve ser declarada no formulário de
submissão da OpenAI (ver `docs/09-submissao-openai.md`). Não adicione scripts
inline nem fontes externas sem atualizar a CSP e o alerta de revisão.
