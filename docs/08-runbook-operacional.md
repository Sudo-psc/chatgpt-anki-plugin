# Runbook Operacional (`docs/08-runbook-operacional.md`)

Este runbook descreve os procedimentos operacionais padrão (SOPs) para manter o servidor MCP `chatgpt-anki-plugin` em produção, cobrindo monitoramento, rotação de segredos, rollback, resposta a incidentes de vazamento e indisponibilidade do Anki/AnkiConnect.

---

## 1. Verificação de Saúde e Diagnóstico Rápido

### 1.1 Endpoints de Diagnóstico

* **Healthcheck**:
  ```bash
  curl -fsSL https://<HOST>/health
  ```
  Resposta esperada (`200 OK`):
  ```json
  {
    "status": "ok",
    "service": "chatgpt-anki-plugin",
    "version": "0.1.0",
    "anki": {
      "backend": "ankiconnect",
      "reachable": true,
      "bridgeConnected": false
    }
  }
  ```
* **Métricas Operacionais**:
  ```bash
  curl -fsSL https://<HOST>/metrics
  ```
  Retorna contadores de requisições HTTP, chamadas por tool MCP, erros por código e conexões ativas do `anki-bridge`.

---

## 2. Procedimento 1 — Rotação de Segredos (`OAUTH_JWT_SECRET` e `BRIDGE_SHARED_TOKEN`)

Quando realizar: a cada 90 dias, após suspeita de exposição de credenciais ou desligamento de colaborador.

1. **Gerar novos segredos criptográficos**:
   ```bash
   NEW_JWT_SECRET=$(openssl rand -hex 32)
   NEW_BRIDGE_TOKEN=$(openssl rand -hex 32)
   NewPin=$(openssl rand -base64 18)
   ```
2. **Atualizar variáveis de ambiente no provedor de hospedagem (Render / Fly.io / Railway / Docker)**:
   * Atualizar `OAUTH_JWT_SECRET`, `BRIDGE_SHARED_TOKEN` e `OAUTH_AUTHORIZE_PIN`.
3. **Reiniciar o serviço (rolling deploy)**:
   * Todos os tokens JWT emitidos anteriormente são invalidados imediatamente após a troca de `OAUTH_JWT_SECRET`.
4. **Reconectar clientes**:
   * No ChatGPT: clicar em **Reconnect** no conector do app para executar novo handshake OAuth 2.1 + PKCE.
   * Na máquina local (se usar ponte reversa): reiniciar `npx chatgpt-anki-plugin bridge --token <NEW_BRIDGE_TOKEN>`.
5. **Verificação pós-rotação**:
   * Testar um token antigo e confirmar retorno `401 Unauthorized`.
   * Executar `npm run smoke` contra a URL pública.

---

## 3. Procedimento 2 — Rollback de Deploy em Produção

Quando realizar: regressão funcional após deploy, aumento de erros `5xx` (> 2% em 5 min) ou falha no healthcheck `/health`.

1. **Ativar modo de contenção imediato (se houver risco a dados de cartões)**:
   * Definir `ANKI_READ_ONLY=1` nas variáveis de ambiente do serviço para bloquear `create_*`, `update_*`, `delete_*` e `submit_review` mantendo leitura ativa.
2. **Reverter a versão em produção**:
   * **Via Render Dashboard**: acessar *Service → Deploys*, localizar o último deploy verde e clicar em **Rollback to this deploy**.
   * **Via Git / GitHub Actions**:
     ```bash
     git revert HEAD --no-edit
     git push origin main
     ```
   * **Via Docker**:
     ```bash
     docker pull ghcr.io/sudo-psc/chatgpt-anki-plugin:<TAG_ESTAVEL_ANTERIOR>
     docker compose -f docker/docker-compose.yml up -d
     ```
3. **Verificação pós-rollback**:
   * Confirmar `GET /health` retornando `200 OK` com a versão anterior.
   * Desativar `ANKI_READ_ONLY=0` somente após validar a causa-raiz em ambiente local.

---

## 4. Procedimento 3 — Resposta a Incidente de Vazamento de Credenciais ou Dados

Severidade: **Crítica (SEV-1)**.

1. **Contenção imediata (T + 0 a 10 min)**:
   * Rotacionar `OAUTH_JWT_SECRET`, `BRIDGE_SHARED_TOKEN`, `OAUTH_AUTHORIZE_PIN` e `ANKICONNECT_API_KEY` (Seguir Procedimento 1).
   * Invocar `POST /oauth/revoke` ou reiniciar a instância para limpar códigos/tokens em memória.
   * Caso o vazamento tenha ocorrido em commit Git: revogar imediatamente o segredo afetado (nunca confiar apenas em `git push --force`).
2. **Avaliação de Impacto (T + 10 a 30 min)**:
   * Como o servidor opera em modo *stateless pass-through* (ADR-0004), verificar que nenhum cartão foi persistido em disco.
   * Auditar logs de acesso (`requestId`, `tool`, `timestamp`, IP de origem) para identificar se ferramentas de leitura (`search_cards`, `get_card`) ou escrita foram chamadas durante a janela de exposição.
3. **Erradicação e Prevenção (T + 30 a 120 min)**:
   * Executar `gitleaks detect --source . -v`.
   * Abrir ADR/post-mortem documentando a linha do tempo, causa-raiz e nova regra de validação.
   * Notificar usuários afetados conforme prazos da LGPD/GDPR se aplicável.

---

## 5. Procedimento 4 — Indisponibilidade do Anki Desktop / AnkiConnect / AnkiWeb

### Cenário A — Anki Desktop fechado ou AnkiConnect inacessível (`ANKI_UNREACHABLE`)

* **Sintoma**: Tools retornam código `ANKI_UNREACHABLE` (`Could not reach AnkiConnect at http://127.0.0.1:8765`).
* **Ações de Resolução**:
  1. Verificar se o aplicativo **Anki Desktop** está aberto e com perfil carregado.
  2. Em **Ferramentas → Complementos (Add-ons)** no Anki, confirmar que o **AnkiConnect (`2055492159`)** está instalado e habilitado.
  3. **macOS (App Nap)**: se o Anki parar de responder em segundo plano, executar no terminal:
     ```bash
     defaults write net.ichi2.anki NSAppSleepDisabled -bool YES
     ```
  4. Testar localmente:
     ```bash
     curl -s http://127.0.0.1:8765 -X POST -d '{"action":"version","version":6}'
     ```

### Cenário B — Ponte Reversa `anki-bridge` desconectada do servidor HTTPS

* **Sintoma**: `GET /health` mostra `"bridgeConnected": false`.
* **Ações de Resolução**:
  1. Na máquina onde o Anki está aberto, executar:
     ```bash
     npx chatgpt-anki-plugin bridge --server wss://<HOST>/bridge --token <BRIDGE_SHARED_TOKEN>
     ```
  2. O CLI possui reconexão automática com *exponential backoff* (`1s → 2s → 4s → 15s`).

### Cenário C — Indisponibilidade do `ankiweb.net`

* **Impacto**: Como todas as 13 tools operam contra a coleção local via AnkiConnect (e não dependem do `ankiweb.net` em tempo de requisição), **o plugin continua 100% funcional durante quedas do AnkiWeb**. A sincronização com a nuvem do AnkiWeb ocorrerá normalmente quando o serviço da Ankitects voltar ao ar.
