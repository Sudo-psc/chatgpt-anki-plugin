# ADR-0004 — Stateless, sem persistência de conteúdo de cartões; backend mock sintético

- **Status:** Aceito (2026-10-10)
- **Decisores:** Segurança, Arquiteto, Redator.

## Contexto

A política do programa e a LGPD/GDPR exigem minimização de dados. O servidor
intermedia conteúdo potencialmente sensível (cartões de estudo — que podem
conter dados de pacientes quando o usuário é da saúde). Ao mesmo tempo, demo e
revisão da OpenAI precisam de uma coleção funcional sem expor dados reais.

## Decisão

1. **Zero persistência de conteúdo**: o servidor não grava cartões, notas,
   campos, nem mantém cache de payloads. Cada request é processado
   *pass-through* contra o AnkiConnect local e descartado. Não há banco.
2. **Logs sem conteúdo**: logger estruturado registra apenas metadados
   (tool, subject, ms, status, código de erro), com defesa em profundidade:
   redação de chaves sensíveis (`token`, `secret`, `api_key`, ...) e
   truncamento de strings em 500 caracteres (`src/infra/logger.ts`, testado).
3. **Estado em memória apenas transiente**: authorization codes (TTL 60s),
   janelas de rate limit e clientes DCR vivem em memória do processo e
   desaparecem no restart — aceitável para single-tenant.
4. **Backend `mock`**: emulador in-memory do AnkiConnect com **coleção 100%
   sintética** (`src/anki/mock/seed.ts`, conteúdo genérico de estudo). Usado em
   demo, testes e na conta de demonstração exigida pela revisão da OpenAI.
   O modo é explícito (`ANKI_BACKEND=mock`), logado e nunca ativado por padrão.

## Alternativas consideradas

- **Cache de leituras (TTL curto)**: rejeitado para v0.1 — ganho pequeno,
  risco de retenção acidental; se adotado no futuro exigirá criptografia,
  TTL e endpoint de exclusão (revisão obrigatória via novo ADR).
- **Persistência de tokens/refresh**: desnecessária (tokens stateless; ADR-0003).
- **Fixtures com dados "anonimizados" reais**: rejeitado — anonimização de
  cartões médicos é frágil; coleção sintética elimina o problema.

## Consequências

- Direito de exclusão (LGPD art. 18) é trivial: não há dados do usuário para
  excluir além de logs operacionais (sem conteúdo) — declarado na política de
  privacidade.
- Impossível oferecer features que exijam histórico (ex.: analytics de revisão
  entre sessões); stats vêm do próprio Anki (`get_stats`).
- A conta de demonstração para revisão da OpenAI roda no modo `mock` com
  dados claramente sintéticos (sem alegação de serem reais).
