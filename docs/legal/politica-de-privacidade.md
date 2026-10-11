# Política de Privacidade — ChatGPT ↔ Anki (chatgpt-anki-plugin)

**Última atualização:** 10 de outubro de 2026 · **Versão:** 0.1.0

Esta política descreve como o aplicativo **ChatGPT ↔ Anki** (o "Aplicativo")
trata dados. O Aplicativo é um servidor MCP de código aberto que conecta o
ChatGPT à coleção Anki **do próprio usuário** através do AnkiConnect local.

> **Não afiliação:** este projeto não é afiliado, endossado ou patrocinado pela
> Ankitects Pty Ltd (Anki/AnkiWeb) nem pela OpenAI (ChatGPT). "Anki" e
> "ChatGPT" são marcas de seus respectivos titulares.

## 1. Resumo em uma frase

**O Aplicativo não armazena o conteúdo dos seus flashcards.** Ele apenas
transita com os dados entre o ChatGPT e o seu Anki, em tempo real, para
executar o que você pediu.

## 2. Categorias de dados tratados

| Categoria | Exemplos | Tratamento | Retenção no servidor |
|:---|:---|:---|:---|
| **Conteúdo de estudo (pass-through)** | Perguntas, respostas, campos de notas, tags, nomes de baralhos | Encaminhados entre ChatGPT e o seu Anki para executar a operação; devolvidos na resposta da tool | **Nenhuma** — não é gravado, cacheado ou usado para outro fim |
| **Metadados de autenticação** | Identificador OAuth (`sub`), escopos, expiração do token | Usados para autorizar chamadas | Vida do token (≤ 1 hora) no lado do servidor; tokens são stateless |
| **Logs operacionais** | Endpoint, status HTTP, duração, nome da tool, código de erro | Diagnóstico e segurança | Sem conteúdo de cartões; rotação conforme o operador |
| **Configuração do operador** | URL do AnkiConnect, chave opcional do AnkiConnect, segredo de tokens | Operação do servidor | Vida da instância |

**Não coletamos:** credenciais do AnkiWeb (o Aplicativo não acessa o AnkiWeb),
dados de localização, contatos, conteúdo de outras abas do ChatGPT ou
informações de pagamento.

## 3. Finalidade do uso

- Executar as operações solicitadas por você no ChatGPT (listar, criar, editar,
  excluir, pesquisar e revisar cartões/notas/baralhos/tags/templates).
- Autenticar e autorizar o acesso (OAuth 2.1 com PKCE; escopos por operação).
- Segurança e diagnóstico (rate limiting, detecção de abuso, logs de erro).

**Não usamos seus dados para:** treinar modelos, publicidade, perfilamento ou
compartilhamento comercial.

## 4. Destinatários (terceiros)

| Terceiro | Papel | Dados |
|:---|:---|:---|
| **OpenAI (ChatGPT)** | Interface do usuário; envia suas solicitações ao Aplicativo | Regidos pela política da OpenAI; o conteúdo que você digita no ChatGPT é tratado pelo ChatGPT |
| **Anki Desktop / AnkiConnect (no SEU dispositivo)** | Fonte e destino dos dados de estudo | O Aplicativo fala apenas com o AnkiConnect que **você** configura |
| **Provedor de hospedagem do operador** (ex.: Fly.io) | Infra do servidor do operador | Metadados de rede/logs operacionais do Aplicativo; nunca conteúdo persistido pelo Aplicativo |

O operador da instância é a pessoa/entidade que fez o deploy (no modelo
self-host, **você mesmo**, se você opera a sua instância).

## 5. Retenção e exclusão

- **Conteúdo de estudo:** retenção zero no Aplicativo (arquitetura stateless).
- **Logs operacionais:** retidos por um curto período definido pelo operador,
  sem conteúdo de cartões; podem ser excluídos a pedido.
- **Exclusão:** como o Aplicativo não armazena seu conteúdo, não há dados
  seus a exportar/excluir nele. Você pode, a qualquer momento:
  1. revogar o acesso do conector no ChatGPT (Settings → Connectors);
  2. desligar/remover a instância do servidor;
  3. rotacionar segredos (`TOKEN_SECRET`), invalidando todos os tokens.

## 6. Segurança

- Tokens assinados (HMAC-SHA256) com validade de 1 hora e escopos mínimos por
  operação; operações destrutivas exigem confirmação explícita.
- Sem persistência de conteúdo; logs sem conteúdo, com redação de campos
  sensíveis e truncamento.
- Comunicação ChatGPT ↔ Aplicativo por HTTPS; Aplicativo ↔ Anki por rede
  local/privada (recomendação: nunca expor o AnkiConnect à Internet aberta).

## 7. Seus direitos (LGPD art. 18 / GDPR)

Titulares podem solicitar confirmação, acesso, correção, portabilidade e
eliminação. Como o Aplicativo é stateless, a maior parte dos dados está sob seu
controle direto (na sua coleção Anki e na sua instância). Solicitações ao
operador: **philipe.saraiva.cruz@gmail.com**.

## 8. Crianças

O Aplicativo não é direcionado a menores de 13 anos e não coleta dados de
crianças de forma consciente.

## 9. Alterações

Alterações materiais serão registradas no histórico deste repositório
(`git log docs/legal/`), com atualização da data no topo. O uso contínuo após a
publicação constitui aceitação da versão vigente.

## 10. Contato

**Responsável:** Philipe Saraiva Cruz · **E-mail:** philipe.saraiva.cruz@gmail.com
· **Repositório:** https://github.com/Sudo-psc/chatgpt-anki-plugin
