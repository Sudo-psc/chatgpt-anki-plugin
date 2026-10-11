# Política de Segurança

## Versões suportadas

| Versão | Suporte |
|:---|:---|
| 0.1.x | ✅ |
| < 0.1 | ❌ |

## Reportando uma vulnerabilidade

Não abra issue pública. Envie um e-mail para **philipe.saraiva.cruz@gmail.com**
com:

- Descrição da vulnerabilidade e impacto potencial;
- Passos de reprodução (PoC);
- Versão/commit afetado;
- Se desejar, sugestão de mitigação.

Resposta esperada em até 5 dias úteis. Divulgaremos a correção e daremos
crédito (se autorizado) após o fix ser publicado.

## Modelo de ameaça (resumo)

O modelo completo (STRIDE) está em [`docs/06-seguranca-e-privacidade.md`](docs/06-seguranca-e-privacidade.md).

- O servidor MCP é um *resource server* OAuth 2.1; todo acesso a `/mcp` exige
  Bearer token válido (assinatura HMAC, expiração e audience).
- Scopes por operação limitam o dano de um token vazado (`anki:read` vs
  `anki:write` vs `anki:review` vs `anki:admin`).
- O servidor é **stateless com relação a conteúdo de cartões**: nenhuma nota,
  campo ou cartão é persistido pelo servidor.
- O adapter Anki fala apenas com **AnkiConnect local/self-hosted** do usuário.
  O projeto não acessa o AnkiWeb, não automatiza login e não armazena
  credenciais do AnkiWeb (ver ADR-0001).

## Segredos

- Segredos apenas via variáveis de ambiente/secret manager.
- `.env` nunca é comitado; CI roda `gitleaks` no working tree e no histórico.
- Em produção, `TOKEN_SECRET` é obrigatório e o servidor recusa o valor padrão.

## Rotação de segredos e resposta a incidentes

Procedimentos em [`docs/08-runbook-operacional.md`](docs/08-runbook-operacional.md).
