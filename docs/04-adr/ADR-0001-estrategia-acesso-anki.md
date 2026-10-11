# ADR-0001 — Estratégia de acesso à coleção Anki

- **Status:** Aceito (2026-10-10)
- **Contexto:** programas M1 (dossiê Anki), requisito de não inventar APIs.
- **Decisores:** Arquiteto, Pesquisador Anki, Segurança.

## Contexto

O servidor MCP precisa ler e escrever na coleção Anki do usuário. Opções
levantadas na pesquisa com fontes oficiais:

1. **AnkiConnect** (add-on local, `127.0.0.1:8765`, API v6).
2. **Servidor de sync Anki auto-hospedado** (oficial).
3. **Cliente próprio do protocolo de sync do AnkiWeb**.
4. **Anki Desktop headless em container**.

## Fatos da pesquisa (fontes)

- O manual oficial do Anki documenta o servidor de sync auto-hospedado **como
  ferramenta de sincronização**, não como API de dados: *"PRs que adicionem
  coisas como uma REST API ou bancos de dados externos dificilmente serão
  aceitos... Se você procura uma solução de API existente, o add-on
  AnkiConnect pode atender"* — <https://docs.ankiweb.net/sync-server.html>.
- O protocolo de sync do AnkiWeb é proprietário e muda com as versões do
  cliente: *"clientes mais novos podem depender de mudanças no protocolo de
  sync; a sincronização pode parar de funcionar se você atualizar os clientes
  sem atualizar o servidor"* — mesma fonte.
- O AnkiWeb **não expõe API REST pública** (apenas a GUI de sync); não há
  endpoint documentado de CRUD de cartões.
- O AnkiConnect (FooSoft) expõe > 100 ações documentadas, incluindo
  `deckNamesAndIds`, `getDeckStats`, `findCards`, `cardsInfo`, `notesInfo`,
  `addNote`, `updateNoteFields/Tags/Model`, `deleteNotes`, `deleteDecks`,
  `changeDeck`, `answerCards` (ease 1–4, API v6), `getNumCardsReviewedToday`,
  `getTags`, `updateModelTemplates`, `updateModelStyling`
  — <https://git.sr.ht/~foosoft/anki-connect> (documentação das ações).

## Opções avaliadas

| Opção | Prós | Contras | Veredito |
|:---|:---|:---|:---|
| **(a) AnkiConnect local/self-hosted** | API estável por versão major, ampla, mantida; roda no dispositivo do usuário (dados não saem); recomendada pelo próprio projeto Anki | Exige Anki Desktop aberto com o add-on; alcance pela rede precisa de túnel/VPN em deploy remoto | **Escolhida** |
| (b) Servidor de sync auto-hospedado | Oficial, mantido pelo Anki | Não é API de dados; sem REST por design; mudanças de protocolo quebram clientes; risco de violar expectativas do projeto | Rejeitada para v0.1 (aceitável apenas como *backend de sync* do usuário, fora do escopo do app) |
| (c) Cliente próprio do protocolo AnkiWeb | Sem dependência local | Engenharia reversa de protocolo proprietário, risco de violar ToS do AnkiWeb, frágil a cada release; armazenamento de credenciais AnkiWeb | **Proibida** por política do projeto |
| (d) Anki Desktop headless em container | Sem GUI; bom para usuário avançado | Complexidade (X/qt headless), licença/empacotamento, sincronização de arquivo sensível; ainda precisaria de uma ponte API | Backlog (T-046) como backend alternativo do `AnkiGateway` |

## Decisão

1. Adotar **AnkiConnect** como estratégia primária, atrás da interface
   `AnkiGateway` (`src/anki/index.ts`), que permite trocar o backend sem
   impacto nas tools (ex.: headless futuro).
2. Deploy recomendado: o servidor fala com `ANKI_CONNECT_URL` — localmente
   `http://127.0.0.1:8765`; em deploy remoto, expor o AnkiConnect da máquina do
   usuário via túnel privado (ex.: Tailscale/Cloudflare Tunnel) — documentado
   no runbook; **nunca** expor AnkiConnect diretamente à internet pública sem
   `apiKey` + rede privada.
3. Proibido no projeto: scraping do AnkiWeb, automação de login, engenharia
   reversa de credenciais ou do protocolo de sync.
4. `ANKI_BACKEND=mock` oferece um emulador in-memory (coleção sintética) para
   demo/testes/revisão da OpenAI — nunca como substituto silencioso do real
   (log explícito + aviso na documentação).

## Consequências

- O modo de falha "Anki fechado/add-on ausente" é tratado como estado
  operacional normal: `ANKI_UNAVAILABLE` com hint e `/ready` 503.
- Requisitos de versão: AnkiConnect recente o suficiente para expor
  `answerCards` (mapeado com hint específico quando ausente).
- Limitações derivadas do AnkiConnect são documentadas por tool
  (`update_deck` composto; sem rename nativo; multi-deck com subdecks rejeitado).
- Segurança: `ANKI_CONNECT_API_KEY` suportado e recomendado; servidor pode
  rodar na mesma máquina do Anki ou em rede privada.
