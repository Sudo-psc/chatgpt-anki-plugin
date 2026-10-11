# 09 — Submissão à OpenAI (ChatGPT Apps / Plugins)

Guia do processo de revisão e pacote de submissão, baseado na documentação
oficial:
<https://developers.openai.com/apps-sdk/app-submission-guidelines> ·
<https://developers.openai.com/apps-sdk/deploy/submission>.

## 1. Pré-requisitos (bloqueadores de conta — ação humana)

| # | Item | Como | Estado |
|:---|:---|:---|:---|
| P1 | Organização verificada na OpenAI Platform (individual ou business) | Dashboard → Settings → Verification | ⬜ requer conta do proprietário |
| P2 | Papel **Owner** (ou `api.apps.write`) na org | Dashboard | ⬜ |
| P3 | MCP server em domínio **público HTTPS** (sem endpoint local) | `fly deploy` (runbook §1) | ⬜ requer FLY_API_TOKEN |
| P4 | Política de privacidade **publicada** com URL | `docs/legal/politica-de-privacidade.md` → GitHub Pages `/legal/` | ⬜ habilitar Pages |
| P5 | Termos de uso publicados | `docs/legal/termos-de-uso.md` | ⬜ idem |
| P6 | CSP definida para os domínios exatos usados | string em §5 | ✅ definida no servidor (header) |
| P7 | Conta de demonstração para a revisão (apps autenticados) | modo `mock` (§4) | ✅ endpoint pronto no modo demo |

> **Nota (ADR-0008):** a listagem pública ampla depende do roadmap multi-tenant
> (T-048). A submissão inicial pode ocorrer com o modelo self-host documentado;
> a revisão técnica usa a instância de demonstração `mock`.

## 2. Checklist de conformidade (submission guidelines)

- [x] **Privacidade**: política cobre categorias de dados, finalidade,
      destinatários, retenção e controles (`legal/politica-de-privacidade.md`).
- [x] **Erros bem tratados**: taxonomia tipada + hints (`05-tools-mcp.md`).
- [x] **Anotações corretas das tools**: `readOnlyHint`/`destructiveHint`
      revisadas em `tests/contract` (verificado no CI).
- [x] **Sem IP de terceiros**: nenhum uso de marca OpenAI/Anki em nome/ícone;
      declaração de não afiliação nos termos.
- [x] **Estabilidade e latência**: timeout de 10 s, erros acionáveis, smoke/CI.
- [ ] **Screenshots** (opcional p/ apps com UI): capturar os widgets em
      developer mode (dimensões exigidas pela plataforma) → `docs/evidencias/`.
- [ ] **Nome/descrição**: usados em §3 (revisar antes de submeter).
- [ ] **Login da conta demo** para revisores (não usar 2FA no demo):
      usuário `demo` + token documentado (modo `mock`).

## 3. Metadados do app (pt-BR)

- **Nome:** `ChatGPT ↔ Anki (SRS Flashcards)` *(evitar termos genéricos isolados)*
- **Categoria:** Produtividade / Educação
- **Descrição curta (≤ 160):** Consulte, crie, edite, pesquise e revise seus
  flashcards do Anki direto no ChatGPT, com sua coleção ficando no seu Anki.
- **Descrição longa:** ver `README.md` § O que é + limitações (AnkiConnect
  local, sem AnkiWeb, single-tenant na v0.1).
- **URLs:** repo, política de privacidade, termos, suporte (issues).

## 4. Conta de demonstração (modo mock)

A revisão da OpenAI exige um ambiente funcional. Sirva uma instância com:

```
ANKI_BACKEND=mock
PUBLIC_BASE_URL=https://<host-demo>
TOKEN_SECRET=<segredo dedicado, NÃO o de produção>
MCP_DEV_TOKEN=<vazio>              # o revisor usa OAuth normal
```

- Dados 100% sintéticos (ADR-0004): nenhum dado de usuário real é exposto.
- Fornecer ao revisor: URL do MCP (`/mcp`) + fluxo OAuth (self-service) +
  prompts de teste (§6). Se o fluxo do portal exigir credenciais fixas, usar o
  client pré-registrado com senha simples (sem 2FA).

## 5. CSP declarada

A mesma aplicada nos widgets (`src/app.ts`), para preencher o formulário:

```
default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:;
connect-src 'self'; frame-ancestors https://chatgpt.com https://*.chatgpt.com
```

## 6. Prompts de teste (para o formulário e o revisor)

| Tool | Prompt |
|:---|:---|
| list_decks | "Quais baralhos eu tenho no meu Anki?" |
| get_deck / get_stats | "Mostre as estatísticas do baralho Estudos::Anatomia" |
| search_cards | "Busque meus cartões com a tag farmacologia" |
| create_note / update_note | "Crie uma nota em Default com frente 'Teste' e verso 'Ok'" → "Atualize o verso para 'Ok 2'" |
| get_due_cards / submit_review | "Comece uma revisão: pegue os cartões devidos" → "Dê 'good' no primeiro" |
| manage_tags / update_model_templates (admin) | "Liste minhas tags" → "Adicione .card{color:blue} no CSS do modelo Basic" |
| delete_note / delete_deck | "Apague a nota que criamos" → "Apague o baralho de teste" |

## 7. Teste em developer mode (evidência C10)

1. Connectors → Advanced → **Developer mode** ON → **Create** com `https://<host>/mcp`.
2. Autorizar via OAuth (consentimento com scopes em pt-BR).
3. Executar os 15 prompts (§6) e **transcrever** chamada→resposta por tool.
4. Anexar em `docs/evidencias/C10-developer-mode.md` (+ screenshots do widget).
5. Roteiro executável assistido: `CHATGPT_E2E=1 npx playwright test tests/e2e/chatgpt.developer-mode.spec.ts`.

## 8. Submissão e iteração

1. Portal → **Submit for review** (draft do app + MCP/OAuth metadata + §3 + §5 + §6).
2. Acompanhar status por e-mail/Dashboard; cada org pode ter **1 versão em revisão por vez**.
3. **Log de rejeições** (preencher a cada rodada):

| Data | Motivo informado | Correção aplicada | Commit/PR |
|:---|:---|:---|:---|
| — | — | — | — |

4. Aprovado ⇒ **Publish** no Dashboard ⇒ app no diretório; usuários fora da
   conta do desenvolvedor passam a poder instalar (C12).

## 9. Manutenção pós-publicação

- Revisar a política a cada mudança de escopo de dados; atualizar metadados.
- Monitorar erros/`update my submission` para fixes; apps instáveis podem ser
  removidos pela OpenAI — regressões de latência entram no runbook §6.
