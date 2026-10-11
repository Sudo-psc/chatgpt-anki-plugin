# ADR-0008 — Single-tenant primeiro; roadmap multi-tenant para listagem pública

- **Status:** Aceito (2026-10-10)
- **Decisores:** Arquiteto, Segurança, Orquestrador.

## Contexto

Um connector do ChatGPT aponta para **um** endpoint MCP. Cada usuário tem uma
coleção Anki e um AnkiConnect próprios. Para o app funcionar para um usuário,
o servidor precisa alcançar **o AnkiConnect daquele usuário** — o que levanta a
questão: uma instância compartilhada para todos ou uma instância por usuário?

## Decisão

1. **v0.1 é single-tenant**: uma instância do servidor atende o dono da
   instância (`subject = "owner"`), com `ANKI_CONNECT_URL`/`ANKI_CONNECT_API_KEY`
   fixados por env. Caminhos suportados:
   - **self-host** na máquina do usuário (localhost) — caso mais seguro;
   - **self-host em VPS/Fly + túnel privado** para o AnkiConnect do usuário
     (Tailscale/Cloudflare Tunnel), documentado no runbook;
   - instâncias dedicadas com `MCP_DEV_TOKEN` desabilitado e OAuth habilitado.
2. **Roadmap multi-tenant** (T-048) — a arquitetura já prepara:
   - `subject` real do token (hoje `owner`) e `AnkiGateway` por request;
   - futura tabela de configuração por usuário: `ankiconnect_url` +
     `ankiconnect_api_key` **cifrados** (AES-256-GCM com chave derivada de um
     segredo de servidor), coletados em uma página autenticada pós-consentimento;
   - isolamento por usuário em cache/rate limit; consentimento explícito.
3. Até a implementação multi-tenant, a **listagem pública** do app na Apps
   Directory fica condicionada ao modelo self-host (instância do próprio
   usuário) e a revisão da OpenAI é feita com a conta de demonstração `mock`
   (ADR-0004). O caminho de produção publicado exige T-048 concluído e novo ADR.

## Alternativas consideradas

- **Instância compartilhada desde o dia 1** com credenciais por usuário:
  correto como destino, mas exige armazenamento de segredos de terceiros,
  compliance e gestão de incidentes — deliberadamente adiado para não
  comprometer segurança/qualidade do v0.1.
- **BYO-deployment apenas** (cada usuário faz deploy do seu): mantido como
  modelo suportado, sozinho limita o público leigo — T-048 destrava.

## Consequências

- C10–C12 são exercidos com instância dedicada + developer mode; a publicação
  geral depende de T-048 (registrado como risco aberto no backlog).
- A conta de demonstração da revisão usa `ANKI_BACKEND=mock` — nenhuma coleção
  de terceiro é acessada durante a revisão.
