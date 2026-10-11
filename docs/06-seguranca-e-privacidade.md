# Segurança, Privacidade e Termos de Uso (`docs/06-seguranca-e-privacidade.md`)

---

## 1. Modelo de Ameaças (Threat Model — STRIDE)

| ID | Ameaça (STRIDE) | Vetor | Mitigação Implementada |
|:---|:----------------|:------|:-----------------------|
| **TM-01** | **Spoofing** (Falsificação de identidade) | Cliente não autorizado tenta invocar `/mcp` ou interceptar código OAuth. | OAuth 2.1 com **PKCE (`S256`) obrigatório**; tokens JWT assinados (`HS256`) validados em cada request; comparação de segredos com `crypto.timingSafeEqual`. |
| **TM-02** | **Tampering** (Adulteração / Exclusão acidental de coleção) | Prompt injection em cartão ou alucinação do LLM tenta apagar baralhos/notas. | Separação de escopos OAuth (`anki:read`, `anki:write`, `anki:review`, `anki:delete`); parâmetro `confirm: true` obrigatório em `delete_deck` e `delete_note`; proteção de `Default`; modo global `ANKI_READ_ONLY=1`. |
| **TM-03** | **Information Disclosure** (Vazamento de cartões em logs ou banco) | Conteúdo de flashcards gravado em logs de aplicação ou cache em nuvem. | Arquitetura *stateless pass-through* (zero persistência em disco); redação automática de campos sensíveis no logger (`src/infra/logger.ts`). |
| **TM-04** | **Information Disclosure** (Exposição da porta 8765 do AnkiConnect) | Usuário abre a porta 8765 diretamente no roteador para a internet sem TLS/Auth. | Uso da ponte reversa **`anki-bridge`** (conexão de saída `wss://` autenticada com `BRIDGE_SHARED_TOKEN`), mantendo o AnkiConnect restrito a `127.0.0.1:8765`. |
| **TM-05** | **Denial of Service** (Exaustão de recursos / payloads gigantes) | Query `search_cards` retorna dezenas de milhares de cartões ou flood em `/oauth/token`. | Paginação forçada (`limit <= 100`), truncamento seguro de pré-visualização, timeout (`ANKICONNECT_TIMEOUT_MS`) e *rate limiting* por IP (`express-rate-limit`). |
| **TM-06** | **Elevation of Privilege** (Escalada de escopo) | Token emitido apenas para leitura tenta criar ou apagar notas. | Verificação de escopo por tool (`requireScope`) antes da execução do handler da tool. |

---

## 2. Arquitetura OAuth 2.1 + PKCE e Escopos

O servidor implementa as especificações exigidas pelo OpenAI Apps SDK e pelo protocolo MCP:

* **RFC 9728 (OAuth 2.0 Protected Resource Metadata)**: `GET /.well-known/oauth-protected-resource` informa `resource`, `authorization_servers` e `scopes_supported`.
* **RFC 8414 (OAuth 2.0 Authorization Server Metadata)**: `GET /.well-known/oauth-authorization-server` publica `issuer`, `authorization_endpoint`, `token_endpoint`, `registration_endpoint`, `revocation_endpoint`, `jwks_uri`, `code_challenge_methods_supported: ["S256"]`.
* **RFC 7591 (Dynamic Client Registration)**: `POST /oauth/register` registra dinamicamente o cliente do ChatGPT e valida os `redirect_uris`.
* **RFC 7636 (PKCE `S256`)**: `BASE64URL(SHA256(code_verifier)) === code_challenge` verificado em `POST /oauth/token`. Códigos de autorização são de uso único e expiram em 5 minutos.

---

## 3. Conformidade com LGPD (Lei nº 13.709/2018) e GDPR (UE 2016/679)

1. **Finalidade e Necessidade**: os dados de cartões transitam pelo servidor MCP única e exclusivamente para atender ao comando imediato do titular no ChatGPT.
2. **Minimização e Retenção Zero**: em operação normal (`ankiconnect` / `bridge`), nenhum conteúdo de nota ou cartão é armazenado em banco de dados do servidor.
3. **Transparência e Direitos do Titular**: o usuário pode revogar tokens a qualquer momento (`POST /oauth/revoke`), desconectar o agente local (`Ctrl+C` no `anki-bridge`) ou ativar `ANKI_READ_ONLY=1`.

---

## 4. Política de Privacidade Pública (Servida em `GET /privacy`)

* **Controlador / Operador**: Projeto open-source `chatgpt-anki-plugin` (MIT).
* **Dados Processados**:
  * Nomes de baralhos, notas, campos de cartões, tags e estatísticas de revisão enviados em tempo real entre a instância Anki do usuário e a sessão ativa do ChatGPT.
  * Metadados técnicos operacionais: identificadores de requisição (`requestId`), timestamp, nome da tool invocada, latência em milissegundos e status de sucesso/erro.
* **Armazenamento e Retenção**:
  * **Zero retenção de flashcards**: o servidor MCP processa os cartões exclusivamente em memória volátil durante a requisição HTTP (*stateless pass-through*).
  * **Credenciais**: o servidor **jamais solicita ou armazena** usuário ou senha do `ankiweb.net`.
* **Compartilhamento com Terceiros**: os dados retornados pelas tools MCP são entregues unicamente ao cliente MCP autenticado pelo próprio usuário (ex.: ChatGPT da OpenAI, sujeito à Política de Privacidade da OpenAI). Não há venda de dados, anúncios ou rastreadores.
* **Segurança**: comunicação criptografada via HTTPS/TLS 1.2+ e WSS, autenticação OAuth 2.1 com PKCE (`S256`) e escopos granulares.
* **Contato e Revogação**: o usuário pode revogar o acesso a qualquer momento nas configurações de Apps/Conectores do ChatGPT ou pelo endpoint `/oauth/revoke`.

---

## 5. Termos de Uso Públicos (Servidos em `GET /terms`)

1. **Aceitação e Licença**: este software é distribuído sob a licença MIT, "no estado em que se encontra" (*as-is*), sem garantias expressas ou implícitas.
2. **Não Afiliação**: `chatgpt-anki-plugin` é um projeto independente e não é afiliado, endossado ou mantido pela Ankitects Pty Ltd (Anki / AnkiWeb) nem pela OpenAI.
3. **Uso Responsável e Conformidade com o AnkiWeb**: o usuário concorda em utilizar a integração por meio do AnkiConnect local / ponte autorizada, respeitando integralmente os [Termos de Serviço do AnkiWeb](https://ankiweb.net/account/terms) e as Políticas de Uso da OpenAI.
4. **Backup da Coleção**: embora operações destrutivas (`delete_deck`, `delete_note`) exijam confirmação explícita (`confirm: true`), o usuário é responsável por manter backups regulares de sua coleção Anki (`Arquivo → Exportar → Pacote de Coleção do Anki (.colpkg)`).
