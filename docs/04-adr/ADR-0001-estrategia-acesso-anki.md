# ADR-0001 — Estratégia de Acesso à Coleção Anki (AnkiConnect + Ponte Reversa WebSocket + Fallback Sandbox)

* **Status**: Aceito
* **Data**: 2026-10-10
* **Decisores**: Arquiteto, Pesquisador Anki, Segurança

## Contexto

O objetivo do projeto é permitir que o ChatGPT (executando na nuvem da OpenAI) visualize, crie, edite, pesquise e revise cartões Anki do usuário através de um servidor MCP remoto sobre HTTPS.

Entretanto, a pesquisa nas fontes oficiais da Anki confirmou uma restrição crítica:

1. **O AnkiWeb (`ankiweb.net`) não possui API REST pública.**
2. **Os Termos de Uso do AnkiWeb proíbem acesso automatizado não-oficial, scraping ou compartilhamento de credenciais com serviços de terceiros.**
3. A coleção oficial do usuário reside localmente no SQLite (`collection.anki2` / `collection.anki21`) gerenciado pelo Anki Desktop, que expõe uma API JSON-RPC v6 local e bem estabelecida por meio do add-on **AnkiConnect** (código `2055492159`, porta `127.0.0.1:8765`).

## Opções Avaliadas

| Opção | Descrição | Prós | Contras / Riscos |
|:------|:----------|:-----|:-----------------|
| **(A) AnkiConnect Local + Ponte Reversa WebSocket (`anki-bridge`)** | Servidor MCP na nuvem (HTTPS) + agente leve local que abre conexão `wss://` de saída para o servidor MCP e repassa JSON-RPC ao `127.0.0.1:8765` (ou conexão direta quando auto-hospedado localmente). | 100% compatível com ToS do AnkiWeb; zero armazenamento de senha AnkiWeb; não exige abrir portas/NAT; suporta todas as 13 tools em tempo real. | Exige que o Anki Desktop esteja aberto durante o uso com coleção real. |
| **(B) Servidor de Sync Anki Auto-Hospedado** | Rodar `anki-sync-server` na nuvem e configurar o Anki do usuário para sincronizar com ele. | Funciona com Anki Mobile se o usuário trocar o servidor de sync. | Faz o usuário **perder a sincronização oficial com o AnkiWeb** (o Anki só aceita um sync server por perfil) e exige manter cópia da coleção no servidor. |
| **(C) Cliente de Sync contra `ankiweb.net`** | Implementar o protocolo binário privado de sync do AnkiWeb no servidor MCP. | Não exigiria Anki Desktop aberto. | **Viola os Termos de Uso do AnkiWeb**, exige armazenar a senha do usuário no servidor e pode corromper a coleção em conflitos de full-sync. **Rejeitado.** |
| **(D) Anki Headless em Container** | Subir `anki` pylib/Desktop em container no servidor. | Independente da máquina local. | Sem sync com AnkiWeb oficial, exige upload manual de `.apkg`/`.colpkg` e armazenamento de dados do usuário em nuvem. |

## Decisão

Adotar a **Opção A** como arquitetura principal, estruturada em torno da interface `AnkiAdapter` com três implementações selecionáveis por configuração (`ANKI_BACKEND`):

1. **`AnkiConnectAdapter` (`ankiconnect`)**: comunicação HTTP direta com `http://127.0.0.1:8765` (com suporte a `BridgeRelayAdapter` automático quando um cliente `anki-bridge` está conectado via WebSocket).
2. **`BridgeRelayAdapter` (`bridge`)**: túnel reverso WebSocket (`WSS /bridge`) autenticado por token secreto compartilhado (`BRIDGE_SHARED_TOKEN`), permitindo que a instância HTTPS em produção (Render) converse com o AnkiConnect local do usuário sem expor a porta `8765` à internet.
3. **`InMemoryAnkiAdapter` (`memory`, ou fallback automático configurável)**: coleção em memória pré-populada com dados sintéticos de estudo, utilizada em testes automatizados, demonstrações e durante a revisão de conformidade da OpenAI.

## Consequências

* **Positivas**: conformidade total com os Termos de Uso do AnkiWeb e da OpenAI; arquitetura *stateless* sem retenção de cartões em disco; suporte tanto a uso local quanto a uso em nuvem via ChatGPT.
* **Negativas / Mitigação**: quando o Anki Desktop do usuário estiver fechado, o servidor retorna o erro estruturado `ANKI_UNREACHABLE` com instruções claras para abrir o Anki ou ativar o `anki-bridge`.
