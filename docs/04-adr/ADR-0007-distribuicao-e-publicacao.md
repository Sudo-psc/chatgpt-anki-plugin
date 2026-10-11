# ADR-0007 — Estratégia de Distribuição e Publicação (Developer Mode, Diretório e Auto-Hospedagem)

- **Status**: Aceito
- **Data**: 2026-10-10
- **Decisores**: Orquestrador, Arquiteto, Produto

## Contexto

Com o servidor MCP pronto (ADR-0001 a ADR-0006), existem três canais possíveis de distribuição. A documentação oficial da OpenAI (verificada em 2026-10) passou a estruturar a distribuição em dois níveis: o **app** (a capacidade MCP com UI opcional, construída com o Apps SDK) e o **plugin** (o pacote que o usuário descobre, instala e que é submetido/publicado — "apps are now submitted and published as plugins").

Requisitos oficiais para submissão ao diretório (C11/C12):

- MCP server hospedado em **domínio público** com TLS válido — sem endpoints locais ou de teste;
- **CSP explícita** declarando exatamente os domínios acessados pelo app (obrigatório na revisão);
- **Política de Privacidade** publicada e **organização verificada** no OpenAI Platform;
- Conta de demonstração para o revisor, sem cadastro ou 2FA inacessível (no nosso caso: backend `memory` + `OAUTH_AUTHORIZE_PIN`);
- **Uma versão em revisão por vez** e **nomes, assinaturas e descrições de tools travados após a publicação** — alterações exigem resubmissão;
- Projetos com **data residency na UE** não podem submeter; usar projeto com data residency global.

## Opções Avaliadas

| Opção | Prós | Contras / Riscos |
|:------|:-----|:-----------------|
| **(A) Somente Developer Mode** (uso pessoal/equipe) | Disponível imediatamente, sem revisão da OpenAI; funciona com qualquer hospedagem (Render, Fly, Docker local, túnel) | Sem descoberta pública; cada usuário configura o app manualmente |
| **(B) Publicação no diretório público via fluxo de plugins** | Descoberta e credibilidade; instalação em um clique pelos usuários | Exige organização verificada, revisão, CSP e contas de demonstração; tools travados após a publicação; uma versão em revisão por vez |
| **(C) Somente auto-hospedado** (`npx`/Docker) | Privacidade máxima; independência total da OpenAI; sem lock de tools | Sem descoberta; fricção de setup (bridge/túnel) para usuários não técnicos |

## Decisão

Adotar os três canais em camadas, sem mudanças na arquitetura do ADR-0001:

1. **Imediato — Developer Mode**: liberar o uso já hoje contra a instância Render (`render.yaml`) ou contra instalação local, sem depender da verificação de organização (risco R-02 do `docs/10-backlog-e-cronograma.md`).
2. **Meta pública — Diretório via fluxo de plugins**: submeter o pacote de `docs/09-submissao-openai.md` no portal de submissão assim que a *Organization Verification* for concluída. **Congelar o contrato das 13 tools** (nomes, assinaturas, descrições e anotações) antes da submissão, pois passam a exigir resubmissão a cada mudança.
3. **Sempre disponível — Auto-hospedado**: manter o caminho `npx chatgpt-anki-plugin` / Docker Compose documentado como opção de privacidade máxima e de contingência caso a instância pública seja descontinuada.

O backend `memory` (sandbox sintético) deixa de ser apenas artefato de teste e passa a ser **requisito de conformidade**: é ele que permite ao revisor da OpenAI exercitar todas as tools sem instalar o Anki Desktop.

## Consequências

- **Positivas**: caminho crítico do usuário liberado hoje (Developer Mode), sem bloquear a meta pública; conformidade de revisão já endereçada pelo sandbox em memória, `/privacy`, `/terms` e ícone; privacidade preservada em todos os canais (bridge reverso, zero persistência — ADR-0004).
- **Negativas / Mitigação**: após a publicação, mudanças de superfície de tools exigem resubmissão (registrado como **R-05** no backlog); mitigação: congelar o contrato v1 das 13 tools antes de submeter e agrupar mudanças de contrato em releases únicas. Mudanças operacionais que não tocam o contrato (variáveis de ambiente, runtime, hospedagem) permanecem imediatas.
- **Revisitar quando**: verificação de organização concluída; resultado da primeira revisão da OpenAI; mudança relevante nas regras do diretório (ex.: suporte a data residency UE).
