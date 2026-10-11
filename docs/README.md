# Documentação — ChatGPT ↔ Anki (chatgpt-anki-plugin)

Servidor MCP que conecta o ChatGPT à sua coleção Anki via AnkiConnect.
Documentação em português; código e mensagens de commit em inglês.

## Índice

| # | Documento | Conteúdo |
|:---|:---|:---|
| 00 | [Visão geral](00-visao-geral.md) | Escopo congelado, público, princípios, glossário |
| 01 | [Requisitos funcionais](01-requisitos-funcionais.md) | 14 FRs com critérios de aceite testáveis |
| 02 | [Requisitos não funcionais](02-requisitos-nao-funcionais.md) | 12 NFRs com método de verificação |
| 03 | [Arquitetura](03-arquitetura.md) | C4, fluxos OAuth/tool, camadas, erros, config |
| 04 | [ADRs](04-adr/ADR-0001-estrategia-acesso-anki.md) | 8 decisões registradas (acesso ao Anki, stack, auth, …) |
| 05 | [Contratos das tools](05-tools-mcp.md) | As 15 tools: entrada, saída, erros, scopes, mapeamento AnkiConnect |
| 06 | [Segurança e privacidade](06-seguranca-e-privacidade.md) | STRIDE, LGPD/GDPR, segredos, superfície de rede |
| 07 | [Plano de testes](07-plano-de-testes.md) | Pirâmide, cobertura, cenários de falha, E2E/C10 |
| 08 | [Runbook operacional](08-runbook-operacional.md) | Deploy, rotação de segredos, rollback, incidentes |
| 09 | [Submissão OpenAI](09-submissao-openai.md) | Checklist de conformidade, metadados, prompts, iteração |
| 10 | [Backlog e cronograma](10-backlog-e-cronograma.md) | 50 tarefas, marcos M0–M6, relatório de status |
| — | [Política de Privacidade](legal/politica-de-privacidade.md) | Documento público (URL para a OpenAI) |
| — | [Termos de Uso](legal/termos-de-uso.md) | Documento público (URL para a OpenAI) |
| — | [Evidências](evidencias/README.md) | Artefatos de verificação dos critérios C1–C15 |

## Começando

Ver o [README do repositório](../README.md) § Quickstart (demo em 2 comandos).
