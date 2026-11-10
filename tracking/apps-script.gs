/**
 * Girls' Speaking Club – landing page tracker.
 *
 * Paste this into the Google Sheet's Apps Script editor (Extensions → Apps Script)
 * and deploy it as a Web app. Each visit and each Telegram button click on the
 * landing page adds one row to the "Events" tab.
 *
 * Columns: time | event | button | source | visitor | lang | referrer | page
 *   event   – "visit" or "cta_click"
 *   button  – which Telegram button: hero, prices, faq-level, final, sticky
 *   source  – where the visitor came from: ig, direct, or the referring site
 *   visitor – random anonymous id stored in the visitor's browser (counts unique people)
 */

const SHEET_NAME = 'Events';
const HEADERS = ['time', 'event', 'button', 'source', 'visitor', 'lang', 'referrer', 'page'];
const EVENTS = ['visit', 'cta_click'];

function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.tryLock(5000);
  try {
    const d = JSON.parse((e && e.postData && e.postData.contents) || '{}');
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

// Run once from the editor (select "setup" → Run) to create the Events tab.
function setup() {
  getSheet_();
}

function getSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(SHEET_NAME);
  if (!sh) {
    sh = ss.insertSheet(SHEET_NAME);
    sh.appendRow(HEADERS);
    sh.setFrozenRows(1);
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
