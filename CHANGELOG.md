# Changelog

Todas as mudanças relevantes deste projeto são documentadas neste arquivo.

O formato segue [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/) e o
projeto adere a [SemVer](https://semver.org/lang/pt-BR/).

## [Unreleased]

## [0.1.0] - 2026-10-10

### Added

- Servidor MCP remoto (Streamable HTTP, MCP 2025-06-18) conectando o ChatGPT ao Anki.
- 15 tools MCP: `list_decks`, `get_deck`, `create_deck`, `update_deck`,
  `delete_deck`, `search_cards`, `get_card`, `create_note`, `update_note`,
  `delete_note`, `get_due_cards`, `submit_review`, `get_stats`, `manage_tags`,
  `update_model_templates`.
- Adapter AnkiConnect (API v6) com erros tipados, timeout e tratamento de
  indisponibilidade do Anki.
- OAuth 2.1 com PKCE (S256), scopes por operação (`anki:read`, `anki:write`,
  `anki:review`, `anki:admin`), Protected Resource Metadata (RFC 9728),
  Dynamic Client Registration (RFC 7591) e Authorization Server Metadata (RFC 8414).
- Backend `mock` com coleção sintética para demo, testes e revisão da OpenAI.
- Widgets do Apps SDK: lista de baralhos/cartões e sessão de revisão (Again/Hard/Good/Easy).
- Suítes de teste unitário, integração, contrato e E2E; gate de cobertura
  ≥ 80% em `src/tools` e `src/anki`.
- Dockerfile multi-stage, docker-compose (perfis `real` e `demo`), Fly.io config.
- CI GitHub Actions: lint, typecheck, testes com cobertura, build, scan de
  segredos (gitleaks) e SBOM (syft).
- Documentação completa (visão geral, requisitos, arquitetura, 8 ADRs,
  contratos das tools, segurança, testes, runbook, submissão OpenAI, backlog).
- Política de privacidade e termos de uso.

[Unreleased]: https://github.com/Sudo-psc/chatgpt-anki-plugin/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/Sudo-psc/chatgpt-anki-plugin/releases/tag/v0.1.0
