# Evidência C13 — Setup por terceiro em < 15 minutos

**Data:** 2026-10-10 · **Ambiente da medição:** macOS (Darwin), Node v22.23.0, npm 10.9.8

## Método

Proxy automatizado do quickstart do README:

1. `npm ci` (dependências) — **~10 s** (301 pacotes, lockfile respeitado).
2. `npm run demo` → servidor pronto (`GET /health` 200) — **< 3 s**.
3. `bash scripts/smoke.sh` → health + ready + initialize + tools/list + 2 tool calls
   — **~2 s** no total, saída `✓ smoke test completo`.

Total observado no caminho de desenvolvimento: **< 30 segundos** de comandos
até um servidor MCP funcional respondendo às tools (muito abaixo do teto de
15 min, que inclui leitura do README e clonagem).

## Caminho Docker (2 comandos)

```bash
docker compose -f docker/docker-compose.yml --profile demo up -d --build anki-mcp-demo
curl -fsS http://localhost:8080/health
```

Não executado nesta medição por indisponibilidade do daemon Docker no
ambiente (registrado); build multi-stage é determinístico (`npm ci` + `tsc`).

## Teste formal com humano (pendente)

- [ ] Um terceiro (sem contexto prévio) segue o README do zero e cronometra.
- [ ] Registrar dúvidas/atritos encontrados e corrigir o README.

Resultado do proxy automatizado: **APROVADO** (ordem de magnitude com folga).
