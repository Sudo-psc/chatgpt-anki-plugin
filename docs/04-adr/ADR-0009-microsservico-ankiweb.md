# ADR-0009 — Microsserviço "AnkiWeb como API" (Anki headless + AnkiConnect + MCP)

- **Status:** Aceito (2026-10-11)
- **Decisores:** Arquiteto, Segurança, Orquestrador (pedido do proprietário: independência do Anki local)
- **Relacionados:** ADR-0001 (estratégia de acesso), R-02 do backlog.

## Contexto

O proprietário quer usar a integração **sem depender do Anki local estar aberto**,
idealmente "via AnkiWeb". Fato de base (ADR-0001): **o AnkiWeb não expõe API de
dados** — apenas sincroniza coleções por protocolo proprietário. Não existe
endpoint para CRUD de cartões na conta AnkiWeb.

## Opções consideradas

| Opção | Prós | Contras | Veredito |
|:---|:---|:---|:---|
| (a) Cliente próprio do protocolo de sync do AnkiWeb | Sem executar o Anki | Engenharia reversa de protocolo proprietário; **armazenar senha do AnkiWeb**; quebra a cada release; risco de ToS | **Proibida** (ADR-0001) |
| (b) Rodar o **Anki oficial headless** (build Linux) num servidor, com AnkiConnect, sincronizando com o AnkiWeb como um dispositivo normal | Protocolo/cliente **oficiais**; credenciais nunca saem do próprio Anki (sessão por chave de sync); estável entre releases | Consome ~1 GB de RAM; precisa de perfil copiado (com a sessão) e upload ocasional | **Escolhida** |
| (c) Manter só o local + túnel | Zero custo | Continua dependente do Mac ligado | Mantida como opção (docs/08 §1) |

## Decisão

1. Criar o microsserviço **`docker/ankiweb-service`**: uma única imagem que roda
   (i) Anki oficial Linux headless sob Xvfb, (ii) AnkiConnect preso a
   `127.0.0.1:8765`, (iii) o loop de sync (`SYNC_INTERVAL_SECONDS`, default 900 s)
   e (iv) o servidor MCP existente — tudo na mesma máquina, sem expor o
   AnkiConnect.
2. **Credenciais**: nunca pedimos senha do AnkiWeb. O perfil Anki do usuário é
   copiado para o volume `/data` **já autenticado** (chave de sync no
   `prefs21.db`); a rotação de senha invalida a chave e exige novo upload.
3. **Segurança pública**: instância pública com dados reais exige
   `OWNER_PASSWORD` (gate no consentimento OAuth — implementação existente,
   com anti-bruteforce por IP+global) e `TOKEN_SECRET` forte.
4. **Artefatos pinados**: Anki `ARG ANKI_VERSION` (26.09.3) e AnkiConnect por
   **commit hash** (`ARG ANKI_CONNECT_COMMIT`), arquitetura via `TARGETARCH`
   (x86_64/arm64 oficiais).
5. Deploy de referência em `fly.ankiweb.toml` (app `chatgpt-anki-real`,
   1 machine 1 GB **always-on** — o sync exige processo vivo; sem `auto-stop`).

## Consequências

- **Custo**: ~US$ 7–10/mês (machine 1 GB + volume 1 GB). Confirmado antes de ativar.
- **Semântica de sync**: o headless é um dispositivo como qualquer outro; conflitos
  são os mesmos de "celular + desktop". Primeiro sync pode pedir decisão (full
  sync) — orientação: sincronizar manualmente antes do upload do perfil.
- **Falha de sync não derruba o serviço** (loop loga e tenta de novo; tools
  servem a última cópia sincronizada) — observável por `[sync <ts>]` nos logs.
- **Backup continua sendo do usuário** (AnkiWeb + exports periódicos).
- Este ADR promove o roadmap **R-02** a entrega; a ativação real (app Fly +
  upload do perfil) depende de custo/credenciais do proprietário e é registrada
  em `docs/evidencias/`.
