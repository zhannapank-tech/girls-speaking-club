# Funnel tracking

The landing page logs two things to a Google Sheet:

- **visit**: someone opened the page. `source` says where from (`ig` when the link has `?ref=ig`).
- **cta_click**: someone tapped a Telegram button. `button` says which: `hero`, `prices`, `faq-level`, `final`, `sticky`.

## Setup (once, about 2 minutes)

1. Create a new Google Sheet, for example "Speaking Club Funnel".
2. In the sheet: **Extensions → Apps Script**. Delete what's there, paste all of `apps-script.gs`, and save.
3. In the editor, choose `setup` in the function menu and click **Run**. Allow access when Google asks. An **Events** tab appears in the sheet.
4. Click **Deploy → New deployment → type: Web app**.
   - Execute as: **Me**
   - Who has access: **Anyone**
   - Click **Deploy** and copy the **Web app URL** (starts with `https://script.google.com/macros/s/`).
5. In `index.html`, replace `PASTE_WEB_APP_URL_HERE` with that URL, then publish the page.
6. In the Instagram bio, use the landing page link with `?ref=ig` at the end.

Check: open the Web app URL in a browser. It should say `ok`. Then open the landing page and a **visit** row appears in the Events tab.

"Anyone" access only lets someone add rows to the Events tab. It can't read the sheet.
