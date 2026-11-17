/**
 * Girls' Speaking Club – landing page tracker.
 *
 * Paste this into the Google Sheet's Apps Script editor (Extensions → Apps Script)
 * and deploy it as a Web app. Each visit and each Telegram button click on the
 * landing page adds one row to the "Tracking S.Club Funnel" tab.
 *
 * Columns: time | event | button | source | visitor | lang | referrer | page
 *   event   – "visit" or "cta_click"
 *   button  – which Telegram button: hero, prices, faq-level, final, sticky
 *   source  – where the visitor came from: ig, direct, or the referring site
 *   visitor – random anonymous id stored in the visitor's browser (counts unique people)
 */

const SHEET_NAME = 'Tracking S.Club Funnel';
// The tab is found by its ID first, so renaming it later doesn't break tracking.
const SHEET_ID = 694894671;
const HEADERS = ['time', 'event', 'button', 'source', 'visitor', 'lang', 'referrer', 'page', 'username', 'goal', 'hardest', 'years', 'understanding'];
// visit, cta_click: from the landing page. bot_*/trial_*: from the ChatPlace Telegram bot.
const EVENTS = ['visit', 'cta_click', 'bot_start', 'trial_requested', 'trial_confirmed'];

function doPost(e) {
  let d = {};
  try { d = JSON.parse((e && e.postData && e.postData.contents) || '{}'); } catch (err) { return ok_(); }
  if (d.event === 'voice_forward') return forwardVoice_(d);

  const lock = LockService.getScriptLock();
  lock.tryLock(5000);
  try {
    if (EVENTS.indexOf(d.event) === -1) return ok_();
    getSheet_().appendRow([
      new Date(),
      d.event,
      clean_(d.cta),
      clean_(d.source),
      clean_(d.visitor),
      clean_(d.lang),
      clean_(d.referrer),
      clean_(d.page),
      clean_(d.username),
      clean_(d.goal),
      clean_(d.hardest),
      clean_(d.years),
      clean_(d.understanding),
    ]);
  } catch (err) {
    // Ignore bad requests; never break the landing page.
  } finally {
    lock.releaseLock();
  }
  return ok_();
}

// Opening the web app URL in a browser shows "ok", to check the deploy worked.
function doGet() {
  return ok_();
}

// Run once from the editor (select "setup" → Run) to create the tracking tab.
function setup() {
  getSheet_();
}

function getSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheets().filter(function (s) { return s.getSheetId() === SHEET_ID; })[0]
    || ss.getSheetByName(SHEET_NAME);
  if (!sh) {
    sh = ss.insertSheet(SHEET_NAME);
    sh.appendRow(HEADERS);
    sh.setFrozenRows(1);
  }
  if (sh.getRange(1, HEADERS.length).getValue() !== HEADERS[HEADERS.length - 1]) {
    sh.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
  }
  return sh;
}

// Short plain text only; a leading = + - @ would make Sheets treat it as a formula.
function clean_(v) {
  let s = String(v == null ? '' : v).slice(0, 200);
  if (/^[=+\-@]/.test(s)) s = "'" + s;
  return s;
}

function ok_() {
  return ContentService.createTextOutput('ok');
}

/* ------------------------------------------------------------------------
 * Voice forwarding: when someone sends their voice message to @jannaspeaks_bot,
 * ChatPlace calls this script with {event: "voice_forward", clientId, firstName, username}.
 * The script finds that person's chat in ChatPlace, takes their latest voice note
 * and has the bot send it to Zhanna as a real Telegram voice message.
 *
 * Needs two Script properties (Project Settings → Script properties):
 *   TG_BOT_TOKEN       – the bot token from @BotFather (looks like 1234567890:AAH...)
 *   CHATPLACE_API_KEY  – a ChatPlace API key (Settings → MCP connector → Create API key)
 * Each attempt is written to the "Bot log" tab, so problems are visible.
 * ---------------------------------------------------------------------- */
const VOICE_TO_CHAT_ID = 6960287697; // @jannaenglish
const CHATPLACE_MCP = 'https://mcp.chatplace.io/mcp';

function forwardVoice_(d) {
  let status = '';
  try {
    const props = PropertiesService.getScriptProperties();
    const token = props.getProperty('TG_BOT_TOKEN');
    const key = props.getProperty('CHATPLACE_API_KEY');
    if (!token || !key) throw new Error('Script properties TG_BOT_TOKEN / CHATPLACE_API_KEY are not set');

    const mcp = mcpSession_(key);
    const chatId = findChatId_(mcp, String(d.clientId || ''));
    if (!chatId) throw new Error('No ChatPlace chat found for client ' + d.clientId);

    // The voice note can take a moment to be stored: try a few times.
    let url = '';
    for (let i = 0; i < 4 && !url; i++) {
      if (i) Utilities.sleep(2000);
      url = latestVoiceUrl_(mcp, chatId);
    }
    if (!url) throw new Error('No voice message found in chat ' + chatId);

    const caption = '🎙 ' + (d.firstName || '') + (d.username ? ' @' + d.username : '') + ' — голосовое для пробного';
    const res = UrlFetchApp.fetch('https://api.telegram.org/bot' + token + '/sendVoice', {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify({ chat_id: VOICE_TO_CHAT_ID, voice: url, caption: caption }),
      muteHttpExceptions: true,
    });
    const body = JSON.parse(res.getContentText() || '{}');
    status = body.ok ? 'sent' : 'telegram error: ' + (body.description || res.getResponseCode());
  } catch (err) {
    status = 'error: ' + err.message;
  }
  logBot_(d, status);
  return ContentService.createTextOutput(status);
}

/* Minimal client for ChatPlace's MCP server (JSON-RPC over HTTP, API key auth). */
function mcpSession_(key) {
  let sessionId = null;
  let nextId = 1;
  function post(body) {
    const headers = { Authorization: 'Bearer ' + key, Accept: 'application/json, text/event-stream' };
    if (sessionId) headers['Mcp-Session-Id'] = sessionId;
    const res = UrlFetchApp.fetch(CHATPLACE_MCP, {
      method: 'post', contentType: 'application/json', headers: headers,
      payload: JSON.stringify(body), muteHttpExceptions: true,
    });
    const h = res.getAllHeaders();
    Object.keys(h).forEach(function (k) { if (k.toLowerCase() === 'mcp-session-id') sessionId = h[k]; });
    const text = res.getContentText() || '';
    if (res.getResponseCode() >= 400) throw new Error('ChatPlace ' + res.getResponseCode() + ': ' + text.slice(0, 150));
    if (!text) return null;
    // Answers come either as plain JSON or as server-sent events ("data: {...}").
    const lines = text.split('\n').filter(function (l) { return l.indexOf('data:') === 0; });
    return JSON.parse(lines.length ? lines[lines.length - 1].slice(5) : text);
  }
  post({ jsonrpc: '2.0', id: nextId++, method: 'initialize', params: {
    protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'speaking-club-funnel', version: '1' } } });
  post({ jsonrpc: '2.0', method: 'notifications/initialized' });
  return {
    call: function (name, args) {
      const r = post({ jsonrpc: '2.0', id: nextId++, method: 'tools/call', params: { name: name, arguments: args || {} } });
      if (!r || r.error) throw new Error('ChatPlace ' + name + ': ' + JSON.stringify(r && r.error).slice(0, 150));
      const t = ((r.result && r.result.content) || []).map(function (c) { return c.text || ''; }).join('');
      try { return JSON.parse(t); } catch (e) { return t; }
    },
  };
}

function findChatId_(mcp, clientId) {
  let args = { limit: 50 };
  for (let page = 0; page < 6; page++) {
    const r = mcp.call('chats_list', args);
    const hit = ((r && r.items) || []).filter(function (c) { return c.clientId === clientId; })[0];
    if (hit) return hit.id;
    if (!r || !r.hasNextItems) return null;
    args = { limit: 50, lastItemId: r.lastItemId, lastItemTimestamp: Number(r.lastItemTimestamp) };
  }
  return null;
}

function latestVoiceUrl_(mcp, chatId) {
  const msgs = mcp.call('chats_messages', { chatId: chatId, limit: 10 }) || [];
  for (let i = 0; i < msgs.length; i++) {
    const m = msgs[i];
    if (m.side !== 'client') continue;
    const audio = (m.mediaFiles || []).filter(function (f) { return f.typeName === 'audio' && f.url; })[0];
    if (audio) return audio.url;
  }
  return '';
}

function logBot_(d, status) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName('Bot log');
  if (!sh) { sh = ss.insertSheet('Bot log'); sh.appendRow(['time', 'action', 'client', 'username', 'result']); sh.setFrozenRows(1); }
  sh.appendRow([new Date(), 'voice_forward', clean_(d.clientId), clean_(d.username), clean_(status)]);
}

// Run once from the editor (select "authorizeVoice" → Run) to grant the new permission
// to call ChatPlace and Telegram, and to check both script properties are set.
function authorizeVoice() {
  const p = PropertiesService.getScriptProperties();
  UrlFetchApp.fetch('https://api.telegram.org', { muteHttpExceptions: true });
  Logger.log('TG_BOT_TOKEN set: ' + !!p.getProperty('TG_BOT_TOKEN') + ', CHATPLACE_API_KEY set: ' + !!p.getProperty('CHATPLACE_API_KEY'));
}
