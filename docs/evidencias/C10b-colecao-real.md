# Evidência — ativação do microsserviço AnkiWeb com a coleção real

- **Data:** 2026-10-11
- **Endpoint:** `https://chatgpt-anki-real.fly.dev` (MCP: `/mcp`)
- **Máquina:** Fly.io `gru`, shared-cpu-1x 1GB, volume `anki_data` → `/data`
- **Perfil:** `Usuário 1` (syncKey intacto, `defaultLang=pt_BR` preservado)

## O que foi validado ao vivo

| Verificação | Evidência |
|:--|:--|
| Boot + Anki headless | `/ready` → `{"status":"ready","anki":"ok","anki_connect_version":6}` |
| **Sync com o AnkiWeb** | log `[sync 12:15:22Z] {"result": null, "error": null}` |
| Coleção real na nuvem | `list_decks` → **77 baralhos** (Catarata, OCT, Oculoplastica, Superfície Ocular…) |
| Cartões reais | `get_due_cards` → **7.430 vencidos**; `get_stats` → 1250 novos / 1992 aprender / 6167 revisão |
| Busca | `search_cards deck:"Superfície Ocular::Olho Seco"` → **145 cartões** |
| `get_deck` (nome acentuado) | stats `{new:11, learn:49, review:36, total:145}` (fix: `getDeckStats` chaveado por id) |
| CSS de template no texto | removido (`stripHtml` agora descarta `<style>/<script>` — issue #3 fechada) |
| OAuth real (OWNER_PASSWORD) | `obtainToken` + `list_decks` ✓ |
| Conector no ChatGPT | log: `/oauth/register 201` → `/oauth/authorize` → `/oauth/approve 302` → `/oauth/token 200`; conector **`Anki (Minha Coleção)`** aparece em *Instalados* |

## Observações

- O conector **demo** (`Anki (chatgpt-anki-plugin)`, app suspenso) ainda está
  instalado no ChatGPT e, por isso, os prompts de teste abertos pelo robô na
  sessão foram roteados para ele (a conexão expira); nesses casos o ChatGPT
  pede "Reconectar". Após **excluir o plugin demo** e selecionar o conector
  real, o uso é direto na mesma conversa.
- Prompts de escrita (create/update/delete) foram **deliberadamente pulados**
  (`PROMPTS_READONLY=1`) para não alterar a coleção médica real.
- Mídia não é transferida (upload só de dados): áudios/imagens continuam no Mac;
  os textos vêm com `stripHtml` sem CSS.
