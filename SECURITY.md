# Política de Segurança (`SECURITY.md`)

## Versões Suportadas

| Versão | Suportada |
|:-------|:----------|
| `0.1.x` | Sim |

## Invariantes de Segurança do Projeto

1. **Zero Retenção de Flashcards em Nuvem**: em modo `ankiconnect` e `bridge`, o servidor processa os cartões de forma *stateless pass-through* em memória volátil e jamais grava o conteúdo dos cartões em disco.
2. **OAuth 2.1 com PKCE (`S256`) Obrigatório em Hosts Públicos**: `assertHttpSecurity` impede que o servidor suba em interfaces não-loopback (`0.0.0.0`) com `MCP_ALLOW_UNAUTHENTICATED=1` ou com segredo JWT fraco.
3. **Sem Credenciais do AnkiWeb**: o projeto nunca solicita nem armazena usuário ou senha do `ankiweb.net`.
4. **Proteção contra Operações Destrutivas**: `delete_deck` e `delete_note` exigem escopo OAuth `anki:delete` e parâmetro explícito `confirm: true`. O modo `ANKI_READ_ONLY=1` bloqueia qualquer mutação na coleção.
5. **Logs Livres de PII**: `src/infra/logger.ts` escreve exclusivamente em `stderr` com redação automática de `Authorization`, `token`, `fields`, `Front`, `Back`, `tags` e `pin`.

## Como Reportar uma Vulnerabilidade

Por favor, **não abra uma issue pública** para vulnerabilidades de segurança.

* Utilize a aba **Security → Report a vulnerability** (GitHub Private Vulnerability Reporting) no repositório [`https://github.com/Sudo-psc/chatgpt-anki-plugin/security/advisories/new`](https://github.com/Sudo-psc/chatgpt-anki-plugin/security/advisories/new).
* Tempo de resposta inicial: até **48 horas**.
* Procedimento de rotação de segredos e contenção: documentado em [`docs/08-runbook-operacional.md`](./docs/08-runbook-operacional.md).
