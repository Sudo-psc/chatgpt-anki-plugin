# Microsserviço AnkiWeb-as-API (`ankiweb-service`)

**Transforma sua conta AnkiWeb em uma API controlada por agentes de IA** — sem
depender do Anki local estar aberto.

```
ChatGPT ──(HTTPS · MCP · OAuth 2.1)──▶ servidor MCP ──(127.0.0.1)──▶ AnkiConnect
        (mesma máquina)                                                │
                                                            Anki headless (Xvfb)
                                                                       ⇅ sync
                                                                   AnkiWeb
```

Uma única imagem contém: **Anki oficial (headless) + AnkiConnect + servidor MCP
+ loop de sync**. O AnkiConnect fica **somente em 127.0.0.1** — nunca exposto.

> Por que não falar "com a API do AnkiWeb" diretamente? **O AnkiWeb não tem API
> de dados** (só sync). A forma suportada e estável é esta: rodar o próprio
> Anki de forma headless, sincronizando com sua conta como um segundo
> dispositivo (decisão registrada no ADR-0009).

## 1. Rodar local (Docker Compose)

```bash
# na raiz do repo
export TOKEN_SECRET="$(openssl rand -base64 48)"
export OWNER_PASSWORD="uma-senha-forte-de-consentimento"
docker compose -f docker/docker-compose.yml --profile ankiweb up -d --build
curl -fsS http://localhost:8080/health
```

O perfil Anki (com o login do AnkiWeb) precisa estar no volume **antes** do
primeiro boot — veja §3.

## 2. Deploy no Fly.io (produção)

```bash
fly apps create chatgpt-anki-real
fly secrets set TOKEN_SECRET="$(openssl rand -base64 48)" OWNER_PASSWORD="<forte>"
fly deploy --config fly.ankiweb.toml
curl -fsS https://chatgpt-anki-real.fly.dev/health
```

Requisitos: 1 machine always-on de 1 GB (`auto_stop="off"` — o sync precisa
rodar) + volume de 1 GB. ~US$ 7–10/mês. Depois: ChatGPT → Plugins → Adicionar
servidor MCP personalizado → `https://<app>.fly.dev/mcp` (OAuth com a
`OWNER_PASSWORD`).

## 3. Enviar o perfil do Anki (com a sessão AnkiWeb)

No seu computador (Anki fechado para copiar limpo):

```bash
cd ~/Library/Application\ Support          # macOS
tar -czf /tmp/anki-profile.tgz Anki2
```

Envie para o volume do app (Fly):

```bash
fly ssh console -a chatgpt-anki-real -C 'sh -c "cat > /tmp/anki-profile.tgz"' < /tmp/anki-profile.tgz
fly ssh console -a chatgpt-anki-real -C 'sh -c "mkdir -p /data && tar -xzf /tmp/anki-profile.tgz --strip-components=1 -C /data && rm /tmp/anki-profile.tgz && ls /data"'
fly apps restart chatgpt-anki-real
```

> A sessão do AnkiWeb vive no `prefs21.db` (chave de sync — **não é a senha**).
> Se um dia rotacionar a senha do AnkiWeb, repita este upload.
> Ajuste `ANKI_PROFILE` (ex.: `Philipe`) nas variáveis do app.

Docker local equivalente: `docker cp anki-profile.tgz <container>:/tmp/` +
`docker exec ... tar -xzf ... -C /data`.

## 4. Variáveis

| Variável | Default | Descrição |
|:---|:---|:---|
| `TOKEN_SECRET` | — | **Obrigatória** (assinatura de tokens/client ids) |
| `OWNER_PASSWORD` | — | **Obrigatória** na página de consentimento (mín. 12) |
| `ANKI_PROFILE` | (padrão) | Nome do perfil Anki (ex.: `Philipe`) |
| `SYNC_INTERVAL_SECONDS` | `900` | Intervalo do sync com o AnkiWeb |
| `SYNC_STARTUP_DELAY_SECONDS` | `10` | Espera antes do 1º sync |
| `DISABLE_SYNC_LOOP` | — | `1` desliga o loop (smoke tests) |
| `ANKI_CONNECT_API_KEY` | — | Opcional (o endpoint é local-only) |

## 5. Operação

- **Logs do sync**: `fly logs` → linhas `[sync <ts>] ...` (também `[ankiweb-service]` e `http_request`).
- **Conflitos**: o AnkiWeb trata o headless como um dispositivo normal (igual celular+desktop). O primeiro sync após um "full sync" local pode exigir decisão — faça um sync manual no seu Anki antes de subir o perfil.
- **Falha de sync** não derruba o serviço: o loop loga e tenta de novo; as tools continuam servindo a última cópia sincronizada.
- **Backup**: continue exportando sua coleção periodicamente (`Arquivo → Exportar`).
- **Smoke sem AnkiWeb**: `DISABLE_SYNC_LOOP=1` + perfil vazio ⇒ coleção nova com deck `Default` — usado nos testes do repo (`docs/07-plano-de-testes.md`).

## 5.1 Troubleshooting (aprendizados de produção, 2026-10-11)

Três problemas reais foram encontrados e resolvidos no primeiro deploy (todas
as correções já estão na imagem):

| Sintoma | Causa | Correção (no repo) |
|:---|:---|:---|
| `xvfb-run: error: xauth command not found` | pacote ausente | `xauth` no `apt-get` do Dockerfile |
| Anki crasha com `lang_to_disk_lang(None)` em `setupLangAndBackend` | perfil criado via API **sem** a chave `defaultLang` no meta | entrypoint grava o meta direto no `prefs21.db` (pickle de dict, mesmo formato do Anki) |
| `Running as root without --no-sandbox is not supported` (QtWebEngine) | Anki renderiza webviews; sandbox recusa root | `QTWEBENGINE_CHROMIUM_FLAGS="--no-sandbox --disable-gpu"` no Dockerfile |

Notas operacionais relacionadas:
- Perfil inexistente faz o Anki abrir o diálogo de seleção (modal) e o
  AnkiConnect nunca sobe → o entrypoint cria/conserta o perfil a cada boot.
- `DEBUG_HOLD=1` mantém o container em repouso (com `/health` verde) para
  depuração via `fly ssh` — útil para diagnosticar sem o supervisor de prontidão.
- O supervisor reinicia o Anki sozinho até `ANKI_RELAUNCH_MAX` (5) vezes antes
  de derrubar o container (evita crash-loops longos).

## 6. Segurança

- AnkiConnect só escuta em `127.0.0.1` dentro da própria máquina.
- Instância pública exige `OWNER_PASSWORD` (anti-bruteforce por IP + global, 429).
- A chave de sync do AnkiWeb fica apenas no volume do **seu** app. Vazou? Troque a senha do AnkiWeb (invalida a chave) e reenvie o perfil.
