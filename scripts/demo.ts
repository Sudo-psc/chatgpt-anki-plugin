/**
 * Modo demonstração: servidor MCP com backend mock (coleção sintética) e um
 * dev token para testes manuais rápidos.
 *
 *   npm run demo
 *   curl -s http://localhost:8080/health
 *   curl -s -X POST http://localhost:8080/mcp \
 *     -H 'content-type: application/json' \
 *     -H 'authorization: Bearer demo-token-change-me' \
 *     -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
 *
 * ATENÇÃO: o dev token ignora OAuth — use apenas localmente.
 */
process.env.ANKI_BACKEND = process.env.ANKI_BACKEND ?? 'mock';
process.env.MCP_DEV_TOKEN = process.env.MCP_DEV_TOKEN ?? 'demo-token-change-me';

await import('../src/index.js');
