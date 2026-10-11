#!/usr/bin/env node
/**
 * Robô assistido (Playwright, janela VISÍVEL) para o critério C10:
 * instala o connector do Anki no ChatGPT (developer mode) e executa os prompts
 * de teste, salvando a transcrição em docs/evidencias/C10-developer-mode.md.
 *
 * Fases:
 *   node scripts/chatgpt-browser-assist.mjs login      # aguarda o login manual
 *   node scripts/chatgpt-browser-assist.mjs connector  # cria o connector (best-effort)
 *   node scripts/chatgpt-browser-assist.mjs prompts    # roda os 15 prompts
 *
 * O popup de consentimento OAuth (nosso domínio) é aprovado automaticamente.
 * Perfil persistente em ~/.cache/chatgpt-anki-plugin/browser-profile (login reutilizado).
 */
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync, appendFileSync, existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';

const PHASE = process.argv[2] ?? 'login';
const MCP_URL = process.env.MCP_URL ?? 'https://chatgpt-anki-mcp-sudo.fly.dev/mcp';
const CONNECTOR_NAME = process.env.CONNECTOR_NAME ?? 'Anki (chatgpt-anki-plugin)';
const PROFILE = path.join(homedir(), '.cache', 'chatgpt-anki-plugin', 'browser-profile');
const ROOT = path.resolve(new URL('..', import.meta.url).pathname);
const EVID = path.join(ROOT, 'docs', 'evidencias');
const SHOTS = path.join(EVID, 'screenshots');
const TRANSCRIPT = path.join(EVID, 'C10-developer-mode.md');
mkdirSync(PROFILE, { recursive: true });
mkdirSync(SHOTS, { recursive: true });

const log = (msg) => console.log(`[assist] ${msg}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const ctx = await chromium.launchPersistentContext(PROFILE, {
  headless: false,
  viewport: null,
  args: ['--start-maximized', '--disable-blink-features=AutomationControlled'],
});

// Aprova automaticamente o consentimento OAuth do NOSSO servidor (popup ou aba).
let consentApproved = false;
ctx.on('page', (p) => {
  void (async () => {
    try {
      await p.waitForLoadState('domcontentloaded').catch(() => {});
      if (p.url().includes('/oauth/authorize')) {
        log('página de consentimento OAuth detectada — aprovando...');
        await p.getByRole('button', { name: /Autorizar/i }).click({ timeout: 15000 });
        consentApproved = true;
        log('consentimento aprovado.');
      }
    } catch (err) {
      log(`falha ao aprovar consentimento (aprovar manualmente na janela): ${err.message}`);
    }
  })();
});

const page = ctx.pages()[0] ?? (await ctx.newPage());
page.setDefaultTimeout(20_000);

const shot = (name) => page.screenshot({ path: path.join(SHOTS, name), fullPage: false }).catch(() => {});
const hasComposer = () =>
  page
    .locator('#prompt-textarea, div[contenteditable="true"]')
    .first()
    .isVisible({ timeout: 3000 })
    .catch(() => false);

/** Logado = composer visível OU cookie de sessão presente (cobre variações de UI). */
async function isLoggedIn() {
  if (await hasComposer()) return true;
  try {
    const cookies = await ctx.cookies('https://chatgpt.com');
    return cookies.some((c) => /session[-_]?token/i.test(c.name));
  } catch {
    return false;
  }
}

async function waitForLoggedIn(maxMs) {
  const deadline = Date.now() + maxMs;
  while (Date.now() < deadline) {
    if (await isLoggedIn()) return true;
    await sleep(4000);
  }
  return false;
}

function instructionsTab(steps) {
  const html = `<!doctype html><html lang="pt-BR"><meta charset="utf-8"><title>Instruções — instalar connector</title>
  <body style="font-family:system-ui;max-width:720px;margin:40px auto;padding:0 16px;line-height:1.6;color:#111">
  <h1>🤖 Instalação do connector do Anki (assistida)</h1>
  <p>Esta janela do ChatGPT está sendo controlada pelo robô. Se alguma etapa travar, faça manualmente:</p>
  <ol>${steps.map((s) => `<li>${s}</li>`).join('')}</ol>
  <p><b>URL do servidor MCP:</b> <code>${MCP_URL}</code><br>
  <b>Nome sugerido:</b> <code>${CONNECTOR_NAME}</code><br>
  <b>Autenticação:</b> OAuth (o popup será aprovado automaticamente)</p>
  <p>Quando terminar, deixe o navegador aberto — o robô continua sozinho.</p></body></html>`;
  const file = path.join(PROFILE, 'instructions.html');
  writeFileSync(file, html, 'utf8');
  return page.goto(`file://${file}`).catch(() => {});
}

async function goToConnectors() {
  for (const url of [
    'https://chatgpt.com/#settings/Connectors',
    'https://chatgpt.com/settings/connectors',
    'https://chatgpt.com/#settings/Connectors/Advanced',
  ]) {
    await page.goto(url, { waitUntil: 'domcontentloaded' }).catch(() => {});
    await sleep(2500);
    const text = await page.locator('body').innerText().catch(() => '');
    if (/connector/i.test(text)) return true;
  }
  return false;
}

async function tryCreateConnector() {
  const createBtn = page.getByRole('button', { name: /^(create|criar|adicionar|add)/i }).first();
  if (!(await createBtn.isVisible({ timeout: 5000 }).catch(() => false))) return false;
  await createBtn.click().catch(() => {});
  await sleep(2000);
  return true;
}

async function tryFill(field, value) {
  const candidates = [page.getByLabel(field).first(), page.getByPlaceholder(field).first()];
  for (const locator of candidates) {
    if (await locator.isVisible({ timeout: 1500 }).catch(() => false)) {
      await locator.fill(value).catch(() => {});
      const current = await locator.inputValue().catch(() => '');
      if (current === value) return true;
    }
  }
  return false;
}

// ---------------------------------------------------------------- phases

if (PHASE === 'login') {
  await page.goto('https://chatgpt.com/', { waitUntil: 'domcontentloaded' });
  if (await isLoggedIn()) {
    log('já autenticado (perfil persistente). LOGIN OK');
    await shot('c10-00-login-ok.png');
  } else {
    log('faça o LOGIN na janela aberta (você tem ~11 minutos; aceite o cookie banner se aparecer).');
    const ok = await waitForLoggedIn(11 * 60 * 1000);
    if (ok) {
      log('LOGIN OK');
      await shot('c10-00-login-ok.png');
    } else {
      log('LOGIN NÃO CONCLUÍDO a tempo. Alternativa: rode você mesmo no Terminal, onde vê o progresso:');
      log('  cd ~/harnesses/opencode-2026-09-25-23-48/chatgpt-anki-plugin && node scripts/chatgpt-browser-assist.mjs login');
      process.exitCode = 2;
    }
  }
  await ctx.close();
  process.exit(process.exitCode ?? 0);
}

if (PHASE === 'connector') {
  await page.goto('https://chatgpt.com/', { waitUntil: 'domcontentloaded' });
  if (!(await waitForLoggedIn(60 * 1000))) {
    log('não está logado — rode a fase login primeiro.');
    process.exitCode = 2;
  } else {
    await instructionsTab([
      'No ChatGPT: <b>Configurações → Connectors</b> (ative <i>Developer mode</i> em Advanced, se pedir).',
      `Clique em <b>Create</b>, dê o nome <code>${CONNECTOR_NAME}</code>.`,
      `Em <b>MCP Server URL</b> cole <code>${MCP_URL}</code>.`,
      'Em <b>Authentication</b> escolha <b>OAuth</b> e clique em <b>Create/Connect</b>.',
      'O popup de consentimento será aprovado automaticamente pelo robô (botão “Autorizar”).',
    ]);

    const onConnectors = await goToConnectors();
    await shot('c10-01-connectors.png');
    log(onConnectors ? 'página de Connectors aberta.' : 'não encontrei a página de Connectors — siga a aba de instruções.');

    let automated = false;
    if (onConnectors && (await tryCreateConnector())) {
      log('formulário de criação aberto — preenchendo...');
      const nameOk = await tryFill(/name|nome/i, CONNECTOR_NAME);
      const urlOk = await tryFill(/url|server|servidor/i, MCP_URL);
      const oauth = page.getByText(/oauth/i).first();
      await oauth.click({ timeout: 4000 }).catch(() => {});
      const submit = page.getByRole('button', { name: /^(create|criar|connect|conectar|save|salvar)/i }).last();
      await submit.click({ timeout: 5000 }).catch(() => {});
      log(`preenchido (nome: ${nameOk}, url: ${urlOk}); aguardando popup OAuth / conclusão...`);
      automated = true;
      await shot('c10-02-form.png');
    }

    // Aguarda o connector aparecer na lista (manual ou automatizado), até 8 min.
    const deadline = Date.now() + 8 * 60 * 1000;
    let done = false;
    while (Date.now() < deadline) {
      const body = await page.locator('body').innerText().catch(() => '');
      if (/chatgpt-anki|anki \(chatgpt/i.test(body) || (/connector/i.test(body) && /oauth|url/i.test(body) && automated)) {
        done = true;
        break;
      }
      await sleep(5000);
    }
    await shot(done ? 'c10-03-connector-ok.png' : 'c10-03-connector-pending.png');
    log(done ? 'CONNECTOR OK (ou lista atualizada).' : 'não confirmei o connector; siga a aba de instruções e depois rode a fase prompts.');
    process.exitCode = done ? 0 : 3;
  }
  await ctx.close();
  process.exit(process.exitCode ?? 0);
}

if (PHASE === 'recon') {
  await page.goto('https://chatgpt.com/', { waitUntil: 'domcontentloaded' });
  if (!(await waitForLoggedIn(60 * 1000))) {
    log('não está logado — rode a fase login primeiro.');
    process.exitCode = 2;
  } else {
    for (const url of ['https://chatgpt.com/#settings/Plugins', 'https://chatgpt.com/#settings/Connectors']) {
      await page.goto(url, { waitUntil: 'domcontentloaded' }).catch(() => {});
      await sleep(3000);
      const text = await page.locator('body').innerText().catch(() => '');
      if (/plugin|conector|connector/i.test(text)) break;
    }
    const pluginsItem = page.getByText(/^Plugins$/i).first();
    if (await pluginsItem.isVisible({ timeout: 3000 }).catch(() => false)) {
      await pluginsItem.click().catch(() => {});
      await sleep(2500);
    }
    const body = await page.locator('body').innerText().catch(() => '');
    const buttons = await page.getByRole('button').allTextContents().catch(() => []);
    const links = await page.getByRole('link').allTextContents().catch(() => []);
    writeFileSync(
      path.join(SHOTS, 'recon-plugins.txt'),
      `URL: ${page.url()}\n\nBUTTONS:\n${buttons.join('\n')}\n\nLINKS:\n${links.join('\n')}\n\nBODY (primeiros 6000 chars):\n${body.slice(0, 6000)}`,
      'utf8',
    );
    await shot('recon-plugins.png');
    log('recon salvo em docs/evidencias/screenshots/recon-plugins.{png,txt}');
  }
  await ctx.close();
  process.exit(process.exitCode ?? 0);
}

if (PHASE === 'recon2') {
  await page.goto('https://chatgpt.com/', { waitUntil: 'domcontentloaded' });
  if (!(await waitForLoggedIn(60 * 1000))) {
    log('não está logado — rode a fase login primeiro.');
    process.exitCode = 2;
  } else {
    await page.goto('https://chatgpt.com/plugins', { waitUntil: 'domcontentloaded' });
    await sleep(3500);
    const addBtn = page.getByRole('button', { name: /adicionar|add/i }).first();
    await addBtn.click({ timeout: 8000 }).catch((e) => log(`clique em Adicionar falhou: ${e.message}`));
    await sleep(2000);
    await shot('recon2-add-menu.png');
    const body = await page.locator('body').innerText().catch(() => '');
    const menuItems = await page.getByRole('menuitem').allTextContents().catch(() => []);
    const buttons = await page.getByRole('button').allTextContents().catch(() => []);
    writeFileSync(
      path.join(SHOTS, 'recon2-add-menu.txt'),
      `URL: ${page.url()}\n\nMENUITEMS:\n${menuItems.join('\n')}\n\nBUTTONS:\n${buttons.filter(Boolean).join('\n')}\n\nBODY (últimos 3000 chars):\n${body.slice(-3000)}`,
      'utf8',
    );
    log('recon2 salvo em docs/evidencias/screenshots/recon2-add-menu.{png,txt}');
  }
  await ctx.close();
  process.exit(process.exitCode ?? 0);
}

if (PHASE === 'recon3') {
  await page.goto('https://chatgpt.com/', { waitUntil: 'domcontentloaded' });
  if (!(await waitForLoggedIn(60 * 1000))) {
    log('não está logado — rode a fase login primeiro.');
    process.exitCode = 2;
  } else {
    await page.goto('https://chatgpt.com/plugins', { waitUntil: 'domcontentloaded' });
    await sleep(3500);
    await page.getByRole('button', { name: /adicionar|add/i }).first().click({ timeout: 8000 }).catch((e) => log(`Adicionar: ${e.message}`));
    await sleep(1500);
    await page.getByRole('menuitem', { name: /servidor MCP/i }).first().click({ timeout: 8000 }).catch((e) => log(`menu MCP: ${e.message}`));
    await sleep(3500);
    await shot('recon3-mcp-dialog.png');
    const fields = await page
      .evaluate(() =>
        Array.from(document.querySelectorAll('input,textarea,select')).map((el) => ({
          tag: el.tagName,
          type: el.type,
          name: el.name,
          placeholder: el.placeholder,
          ariaLabel: el.getAttribute('aria-label'),
        })),
      )
      .catch(() => []);
    const buttons = await page.getByRole('button').allTextContents().catch(() => []);
    const body = await page.locator('body').innerText().catch(() => '');
    writeFileSync(
      path.join(SHOTS, 'recon3-mcp-dialog.txt'),
      `URL: ${page.url()}\n\nFIELDS:\n${JSON.stringify(fields, null, 2)}\n\nBUTTONS:\n${buttons.filter(Boolean).join('\n')}\n\nBODY (últimos 2500 chars):\n${body.slice(-2500)}`,
      'utf8',
    );
    log('recon3 salvo em docs/evidencias/screenshots/recon3-mcp-dialog.{png,txt}');
  }
  await ctx.close();
  process.exit(process.exitCode ?? 0);
}

if (PHASE === 'connector2') {
  await page.goto('https://chatgpt.com/', { waitUntil: 'domcontentloaded' });
  if (!(await waitForLoggedIn(60 * 1000))) {
    log('não está logado — rode a fase login primeiro.');
    process.exitCode = 2;
  } else {
    await page.goto('https://chatgpt.com/plugins', { waitUntil: 'domcontentloaded' });
    await sleep(3500);
    await page.getByRole('button', { name: /adicionar|add/i }).first().click({ timeout: 8000 }).catch((e) => log(`Adicionar: ${e.message}`));
    await sleep(1500);
    await page.getByRole('menuitem', { name: /servidor MCP/i }).first().click({ timeout: 8000 }).catch((e) => log(`menu MCP: ${e.message}`));
    await sleep(3000);

    // Escopo do diálogo (fallback: página inteira)
    let scope = page.getByRole('dialog').filter({ hasText: /Adicionar servidor MCP/i }).last();
    if ((await scope.count()) === 0) scope = page;

    const nameInput = scope.locator('input[placeholder="Ferramenta personalizada"]').first();
    const descInput = scope.locator('textarea[placeholder="Explique em poucas palavras o que ele faz"]').first();
    const urlInput = scope.locator('input[aria-label="URL do servidor"], input[type="url"]').first();

    await nameInput.waitFor({ state: 'visible', timeout: 15000 });
    await nameInput.fill(CONNECTOR_NAME);
    await descInput.fill('Consulta, cria, edita, pesquisa e revisa flashcards do Anki via AnkiConnect (servidor MCP próprio).');
    await urlInput.fill(MCP_URL);
    log(`formulário preenchido (nome="${CONNECTOR_NAME}", url="${MCP_URL}")`);

    // Autenticação: garantir OAuth
    const select = scope.locator('select').first();
    if ((await select.count()) > 0) {
      const options = await select.locator('option').evaluateAll((os) => os.map((o) => ({ value: o.value, label: (o.textContent ?? '').trim() })));
      log(`opções de autenticação: ${JSON.stringify(options)}`);
      const oauthOption = options.find((o) => /^oauth$/i.test(o.label));
      if (oauthOption) await select.selectOption({ label: oauthOption.label }).catch(() => {});
    }

    // Checkbox de ciência de riscos
    const checkbox = scope.locator('input[type="checkbox"]').first();
    if ((await checkbox.count()) > 0) {
      await checkbox.check({ force: true }).catch((e) => log(`checkbox: ${e.message}`));
      log('checkbox "Entendo e quero continuar" marcado.');
    }

    await shot('c10-04-form-preenchido.png');
    const submit = scope.getByRole('button', { name: /criar como plugin/i }).first();
    await submit.click({ timeout: 8000 }).catch((e) => log(`submit: ${e.message}`));
    log('submit "Criar como plugin" — aguardando fluxo OAuth (popup será aprovado automaticamente)...');

    // Aguarda conclusão: diálogo fecha e/ou plugin aparece nos Instalados (até 4 min)
    const deadline = Date.now() + 4 * 60 * 1000;
    let done = false;
    while (Date.now() < deadline) {
      const dialogVisible = (await scope.count()) > 0 && (await scope.isVisible().catch(() => false));
      const body = await page.locator('body').innerText().catch(() => '');
      if (!dialogVisible && /instalados/i.test(body)) {
        done = true;
        break;
      }
      await sleep(4000);
    }
    await shot(done ? 'c10-05-connector-criado.png' : 'c10-05-connector-pendente.png');
    log(done ? 'CONNECTOR CRIADO (aparece em Instalados).' : 'não confirmei a criação — verifique a janela.');
    process.exitCode = done ? 0 : 3;
  }
  await ctx.close();
  process.exit(process.exitCode ?? 0);
}

if (PHASE === 'connect') {
  await page.goto('https://chatgpt.com/', { waitUntil: 'domcontentloaded' });
  if (!(await waitForLoggedIn(60 * 1000))) {
    log('não está logado — rode a fase login primeiro.');
    process.exitCode = 2;
  } else {
    const connectorUrl =
      process.env.CONNECTOR_URL ?? 'https://chatgpt.com/plugins/plugin_asdk_app_6acafe0bfe30819180cc0183ecdf3de1';
    await page.goto(connectorUrl, { waitUntil: 'domcontentloaded' }).catch(() => {});
    await sleep(7000);
    const bodyText = await page.locator('body').innerText().catch(() => '');
    if (!/anki \(chatgpt-anki-plugin\)/i.test(bodyText)) {
      await page.goto('https://chatgpt.com/plugins', { waitUntil: 'domcontentloaded' });
      await sleep(3500);
      await page.getByText('Anki (chatgpt-anki-plugin)', { exact: true }).first().click({ timeout: 8000 }).catch((e) => log(`clique no plugin: ${e.message}`));
      await sleep(8000);
    }
    await shot('c10-06-plugin-aberto.png');

    const connectBtn = page.getByRole('button', { name: /^conectar$/i }).first();
    if (await connectBtn.isVisible({ timeout: 6000 }).catch(() => false)) {
      await connectBtn.click().catch((e) => log(`Conectar: ${e.message}`));
      log('cliquei "Conectar".');
      await sleep(2500);
    } else {
      log('botão "Conectar" não visível — possivelmente já conectado; seguindo.');
    }
    // Polling tolerante: o modal de consentimento do ChatGPT pode demorar a renderizar.
    const modalDeadline = Date.now() + 2 * 60 * 1000;
    let continuarClicked = false;
    while (Date.now() < modalDeadline && !consentApproved) {
      if (!continuarClicked) {
        const continuarBtn = page.getByRole('button', { name: /continuar em anki/i }).first();
        if (await continuarBtn.isVisible({ timeout: 1500 }).catch(() => false)) {
          await shot('c10-06b-consent-modal.png');
          await continuarBtn.click().catch(() => {});
          continuarClicked = true;
          log('cliquei "Continuar em Anki" (consentimento do ChatGPT).');
        }
      }
      if (page.url().includes('/oauth/authorize')) {
        const autorizar = page.getByRole('button', { name: /autorizar/i }).first();
        if (await autorizar.isVisible({ timeout: 3000 }).catch(() => false)) {
          await autorizar.click().catch(() => {});
          consentApproved = true;
        }
      }
      await sleep(2000);
    }

    // Espera o consentimento OAuth (popup) — até 2 minutos.
    const deadline = Date.now() + 2 * 60 * 1000;
    while (Date.now() < deadline && !consentApproved) {
      await sleep(2000);
    }
    if (consentApproved) {
      log('OAuth aprovado — aguardando troca de token/atualização da UI...');
      await sleep(8000);
    }
    await shot(consentApproved ? 'c10-07-conectado.png' : 'c10-07-conexao-pendente.png');
    log(consentApproved ? 'CONEXÃO OK (fluxo OAuth completo).' : 'conexão não completou — verifique a janela.');
    process.exitCode = consentApproved ? 0 : 3;
  }
  await ctx.close();
  process.exit(process.exitCode ?? 0);
}

if (PHASE === 'recon4') {
  await page.goto('https://chatgpt.com/', { waitUntil: 'domcontentloaded' });
  if (!(await waitForLoggedIn(60 * 1000))) {
    log('não está logado — rode a fase login primeiro.');
    process.exitCode = 2;
  } else {
    await page.goto('https://chatgpt.com/plugins', { waitUntil: 'domcontentloaded' });
    await sleep(3500);
    await page.getByText('Anki (chatgpt-anki-plugin)', { exact: true }).first().click({ timeout: 8000 }).catch((e) => log(`clique: ${e.message}`));
    await sleep(9000); // deixa a página de detalhe carregar por completo
    await shot('recon4-plugin-detail.png');
    const buttons = await page.getByRole('button').allTextContents().catch(() => []);
    const links = await page.getByRole('link').allTextContents().catch(() => []);
    const body = await page.locator('body').innerText().catch(() => '');
    writeFileSync(
      path.join(SHOTS, 'recon4-plugin-detail.txt'),
      `URL: ${page.url()}\n\nBUTTONS:\n${buttons.filter(Boolean).join('\n')}\n\nLINKS(não-vazios):\n${links.filter((l) => l.trim()).slice(0, 60).join('\n')}\n\nBODY (últimos 2000):\n${body.slice(-2000)}`,
      'utf8',
    );
    log('recon4 salvo em docs/evidencias/screenshots/recon4-plugin-detail.{png,txt}');
  }
  await ctx.close();
  process.exit(process.exitCode ?? 0);
}

if (PHASE === 'recon5') {
  await page.goto('https://chatgpt.com/', { waitUntil: 'domcontentloaded' });
  if (!(await waitForLoggedIn(60 * 1000))) {
    log('não está logado — rode a fase login primeiro.');
    process.exitCode = 2;
  } else {
    const probe = await page.evaluate(() => {
      const describe = (el) => ({
        tag: el.tagName,
        id: el.id,
        cls: String(el.className).slice(0, 100),
        role: el.getAttribute('role'),
        ariaLabel: el.getAttribute('aria-label'),
        placeholder: el.getAttribute('placeholder'),
        contentEditable: el.getAttribute('contenteditable'),
        testid: el.getAttribute('data-testid'),
        visible: el.offsetParent !== null || el.getClientRects().length > 0,
      });
      return {
        url: location.href,
        textboxes: Array.from(document.querySelectorAll('[role="textbox"]')).slice(0, 10).map(describe),
        textareas: Array.from(document.querySelectorAll('textarea')).slice(0, 10).map(describe),
        contenteditables: Array.from(document.querySelectorAll('[contenteditable]')).slice(0, 10).map(describe),
        sendButtons: Array.from(document.querySelectorAll('button'))
          .filter((b) => /send|enviar/i.test(String(b.getAttribute('aria-label') ?? '') + ' ' + String(b.textContent ?? '')))
          .slice(0, 6)
          .map(describe),
        floatingChat: document.querySelectorAll('[data-quick-chat-drag-handle]').length,
      };
    });
    writeFileSync(path.join(SHOTS, 'recon5-dom.json'), JSON.stringify(probe, null, 2), 'utf8');
    await shot('recon5-chat.png');
    log('recon5 salvo em docs/evidencias/screenshots/recon5-dom.json');
  }
  await ctx.close();
  process.exit(process.exitCode ?? 0);
}

if (PHASE === 'recon6') {
  await page.goto('https://chatgpt.com/', { waitUntil: 'domcontentloaded' });
  if (!(await waitForLoggedIn(60 * 1000))) {
    log('não está logado — rode a fase login primeiro.');
    process.exitCode = 2;
  } else {
    const composer = page.locator('div[role="textbox"][contenteditable="true"]').first();
    await composer.waitFor({ state: 'visible', timeout: 30_000 });
    await composer.click();
    await composer.type('Responda apenas com a palavra: OK', { delay: 20 });
    await page.keyboard.press('Enter');
    await sleep(12_000);
    const probe = await page.evaluate(() => {
      const testids = Array.from(new Set(Array.from(document.querySelectorAll('[data-testid]')).map((e) => e.getAttribute('data-testid')))).slice(0, 40);
      const authorRoles = Array.from(document.querySelectorAll('[data-message-author-role]')).map((e) => e.getAttribute('data-message-author-role'));
      const candidates = Array.from(document.querySelectorAll('div,section,article,li'))
        .filter((el) => el.children.length <= 3 && /^OK\.?$/i.test(String(el.textContent ?? '').trim()))
        .slice(0, 6)
        .map((el) => ({
          tag: el.tagName,
          testid: el.getAttribute('data-testid'),
          cls: String(el.className).slice(0, 90),
          parentTestid: el.parentElement?.getAttribute('data-testid') ?? null,
          parentCls: String(el.parentElement?.className ?? '').slice(0, 90),
          grandparentTestid: el.parentElement?.parentElement?.getAttribute('data-testid') ?? null,
          outer: el.outerHTML.slice(0, 260),
        }));
      return { url: location.href, testids, authorRoles, candidates };
    });
    writeFileSync(path.join(SHOTS, 'recon6-dom.json'), JSON.stringify(probe, null, 2), 'utf8');
    await shot('recon6-chat.png');
    log('recon6 salvo em docs/evidencias/screenshots/recon6-dom.json');
  }
  await ctx.close();
  process.exit(process.exitCode ?? 0);
}

if (PHASE === 'prompts-extra') {
  const PROMPT =
    'Crie uma nota no conector "Anki (chatgpt-anki-plugin)": baralho Default, frente "Teste C10 final", verso "Ok". Sim, eu autorizo e confirmo a criação.';
  const ASSISTANT_SELECTOR = 'div[data-markdown-text-style="assistant-message"]';
  await page.goto('https://chatgpt.com/', { waitUntil: 'domcontentloaded' });
  if (!(await waitForLoggedIn(60 * 1000))) {
    log('não está logado — rode a fase login primeiro.');
    process.exitCode = 2;
  } else {
    const composer = page.locator('div[role="textbox"][contenteditable="true"], #prompt-textarea').first();
    await composer.waitFor({ state: 'visible', timeout: 30_000 });
    await composer.click();
    await composer.type(PROMPT, { delay: 15 });
    await page.keyboard.press('Enter');

    const assistant = page.locator(ASSISTANT_SELECTOR);
    const scrape = async () => {
      const before = await assistant.count();
      await page
        .waitForFunction((arg) => document.querySelectorAll(arg.selector).length > arg.count, { selector: ASSISTANT_SELECTOR, count: before }, { timeout: 90_000 })
        .catch(() => {});
      let last = '';
      for (let i = 0; i < 40; i += 1) {
        const text = await assistant.last().innerText().catch(() => '');
        if (text && text === last) break;
        last = text;
        await sleep(1500);
      }
      return last;
    };

    let last = await scrape();
    // Se o modelo pediu confirmação, clica no botão inline ou responde autorizando.
    if (/confirmar|autoriz|deseja que eu/i.test(last)) {
      const confirmBtn = page.getByRole('button', { name: /confirmar.*(criar|nota|conexão)?|criar nota/i }).first();
      if (await confirmBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        await confirmBtn.click().catch(() => {});
        await sleep(2500);
      } else {
        await composer.click();
        await composer.type('Sim, confirmo: pode criar a nota agora no conector "Anki (chatgpt-anki-plugin)".', { delay: 15 });
        await page.keyboard.press('Enter');
      }
      const second = await scrape();
      last = `${last} ⟶ [CONFIRMAÇÃO ENVIADA PELO ROBÔ] ${second}`;
    }
    const summary = last.replace(/\s+/g, ' ').trim().slice(0, 600);
    appendFileSync(TRANSCRIPT, `| 16 | \`create_note (autorizado)\` | ${PROMPT.replace(/\|/g, '\\|')} | ${summary.replace(/\|/g, '\\|') || '(sem resposta)'} |\n`, 'utf8');
    await shot('c10-prompt-16-create-note.png');
    log('prompts-extra concluído.');
  }
  await ctx.close();
  process.exit(process.exitCode ?? 0);
}

if (PHASE === 'prompts') {
  const prompts = [
    ['list_decks', 'Quais baralhos eu tenho no meu Anki?'],
    ['get_deck', 'Me mostre os detalhes e estatísticas do baralho Estudos::Anatomia'],
    ['search_cards', 'Busque meus cartões com a tag farmacologia'],
    ['get_due_cards', 'Quais cartões estão vencidos hoje no meu Anki?'],
    ['get_card', 'Mostre em detalhe o primeiro cartão vencido da minha lista'],
    ['submit_review', 'Dê a nota "good" nesse primeiro cartão vencido'],
    ['get_stats', 'Quantos cartões eu revisei hoje e quantos estão vencidos?'],
    ['create_note', 'Crie uma nota no baralho Default com frente "Teste C10" e verso "Ok"'],
    ['update_note', 'Na nota que acabamos de criar, atualize o verso para "Ok, atualizado"'],
    ['manage_tags', 'Liste todas as minhas tags do Anki'],
    ['update_model_templates', 'Adicione o CSS ".card{color:#1f2937}" ao modelo Basic'],
    ['create_deck', 'Crie um baralho chamado ChatGPT::Teste'],
    ['update_deck', 'Renomeie o baralho ChatGPT::Teste para ChatGPT::Teste2'],
    ['delete_note', 'Apague a nota "Teste C10" (confirme a exclusão)'],
    ['delete_deck', 'Apague o baralho ChatGPT::Teste2 (confirme a exclusão)'],
  ];

  const FROM = Number(process.env.PROMPT_FROM ?? 1);
  const TO = Number(process.env.PROMPT_TO ?? prompts.length);
  if (!existsSync(TRANSCRIPT)) {
    writeFileSync(
      TRANSCRIPT,
      `# Evidência C10 — ChatGPT developer mode (execução assistida)\n\n` +
        `- **Data:** ${new Date().toISOString()}\n- **Endpoint:** ${MCP_URL}\n- **Robô:** scripts/chatgpt-browser-assist.mjs (Playwright, janela visível)\n\n` +
        `| # | Tool | Prompt | Resposta (resumo) |\n|:--|:--|:--|:--|\n`,
      'utf8',
    );
  }

  await page.goto('https://chatgpt.com/', { waitUntil: 'domcontentloaded' });
  if (!(await waitForLoggedIn(60 * 1000))) {
    log('não está logado — rode a fase login primeiro.');
    process.exitCode = 2;
  } else {
    const existing = readFileSync(TRANSCRIPT, 'utf8');
    for (const [index, [tool, prompt]] of prompts.entries()) {
      const n = index + 1;
      if (n < FROM || n > TO) continue;
      if (new RegExp(`\\|\\s*${n}\\s*\\|`).test(existing)) {
        log(`prompt ${n} já registrado — pulando.`);
        continue;
      }
      log(`prompt ${n}/${prompts.length} (${tool}): ${prompt}`);
      try {
        await page.goto('https://chatgpt.com/', { waitUntil: 'domcontentloaded' }).catch(() => {});
        const composer = page.locator('div[role="textbox"][contenteditable="true"], #prompt-textarea').first();
        await composer.waitFor({ state: 'visible', timeout: 30_000 });
        await composer.click();
        await composer.type(prompt, { delay: 15 });
        await page.keyboard.press('Enter');

        // Aprovação inline do connector, se o ChatGPT pedir ("Use connector")
        const useBtn = page.getByRole('button', { name: /use connector|usar connector|permitir|allow/i }).first();
        await useBtn.click({ timeout: 4000 }).catch(() => {});

        // UI 2026: mensagens do assistente ficam em [data-markdown-text-style="assistant-message"].
        const ASSISTANT_SELECTOR = 'div[data-markdown-text-style="assistant-message"]';
        const assistant = page.locator(ASSISTANT_SELECTOR);
        const before = await assistant.count();
        await page.waitForFunction(
          (arg) => document.querySelectorAll(arg.selector).length > arg.count,
          { selector: ASSISTANT_SELECTOR, count: before },
          { timeout: 60_000 },
        ).catch(() => {});

        // Estabilidade do texto (streaming terminou)
        let last = '';
        for (let i = 0; i < 30; i += 1) {
          const text = await assistant.last().innerText().catch(() => '');
          if (text && text === last) break;
          last = text;
          await sleep(1500);
        }
        const summary = last.replace(/\s+/g, ' ').trim().slice(0, 400);
        appendFileSync(TRANSCRIPT, `| ${n} | \`${tool}\` | ${prompt.replace(/\|/g, '\\|')} | ${summary.replace(/\|/g, '\\|') || '(sem resposta capturada)'} |\n`, 'utf8');
        await shot(`c10-prompt-${String(n).padStart(2, '0')}-${tool}.png`);
      } catch (err) {
        appendFileSync(TRANSCRIPT, `| ${n} | \`${tool}\` | ${prompt.replace(/\|/g, '\\|')} | ERRO: ${String(err.message).replace(/\|/g, '\\|').slice(0, 200)} |\n`, 'utf8');
        log(`prompt ${n} falhou: ${err.message}`);
      }
    }
    log(`transcrição salva em ${path.relative(ROOT, TRANSCRIPT)}`);
  }
  await ctx.close();
  process.exit(process.exitCode ?? 0);
}
