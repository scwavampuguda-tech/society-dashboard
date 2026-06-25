// ===== App Script: HDFC Alert Parser — BankDetails updater =====
// Gmail label : HDFC/1250-Alerts  (runs under parthok@gmail.com)
// Sheet       : BankDetails (in SocietyData spreadsheet)
// Requires    : Gmail Advanced Service enabled (Services → Gmail API)
//
// RULE: Only UNREAD emails are imported. After import → marked as read.
//       Read email = already imported = never touched again.
//
// NARRATION FORMAT: VPA first, then NAME
//   e.g.  9246308480-4@ybl PARTHO KUNDU
// ================================================================

const SHEET_ID            = "1oXmvMIfQDm51KoHHtkhg8KgK1Qi5mwFYSBdrwir85CA";
const LABEL_NAME          = "HDFC/1250-Alerts";
const THREAD_SEARCH_LIMIT = 50;

// ── Entry points ──────────────────────────────────────────────────────────

function doPost(e) {
  return ContentService
    .createTextOutput(JSON.stringify(parseHDFCAlertsToBankDetails()))
    .setMimeType(ContentService.MimeType.JSON);
}

function doGet(e) {
  if (e && e.parameter && e.parameter.test == "1") {
    return ContentService
      .createTextOutput(JSON.stringify(parseHDFCAlertsToBankDetails()))
      .setMimeType(ContentService.MimeType.JSON);
  }
  return ContentService
    .createTextOutput(JSON.stringify({ ok: false, message: "Add ?test=1 to run" }))
    .setMimeType(ContentService.MimeType.JSON);
}

// ── Main function ─────────────────────────────────────────────────────────

function parseHDFCAlertsToBankDetails() {
  try {
    const ss = SpreadsheetApp.openById(SHEET_ID);
    if (!ss) return { ok: false, message: "Spreadsheet not found: " + SHEET_ID };

    const sheet = ss.getSheetByName("BankDetails");
    if (!sheet) return { ok: false, message: "BankDetails sheet not found" };

    const query   = `label:"${LABEL_NAME}" is:unread`;
    const threads = GmailApp.search(query, 0, THREAD_SEARCH_LIMIT);

    Logger.log(`Unread threads: ${threads.length}`);

    const stats = { threadsFound: threads.length, imported: 0, skipped: 0, errors: [] };

    if (threads.length === 0) {
      Logger.log("No unread alerts. Nothing to import.");
      return { ok: true, stats };
    }

    threads.forEach(thread => {
      try {
        const unreadMsgs = thread.getMessages().filter(m => m.isUnread());
        if (!unreadMsgs.length) return;

        unreadMsgs.forEach(msg => {
          try {
            let rawBody = msg.getPlainBody();
            if (!rawBody || rawBody.trim().length < 20) rawBody = _stripHtml(msg.getBody());
            if (!rawBody || rawBody.trim().length < 10) {
              msg.markRead();
              stats.skipped++;
              return;
            }

            const cleanBody = rawBody.replace(/\s+/g, " ").trim();
            const txn = extractHDFCTransaction(cleanBody);

            if (!txn)        { msg.markRead(); stats.skipped++; return; }
            if (!txn.refNo)  { msg.markRead(); stats.skipped++; return; }
            if (!txn.amount) { msg.markRead(); stats.skipped++; return; }

            // Append to BankDetails (cols A–H only)
            const lastRow        = sheet.getLastRow();
            const closingCell    = sheet.getRange(lastRow, 7);
            const closingBalance = Number(closingCell.getValue()) || 0;
            const closingFmt     = closingCell.getNumberFormat();

            let withdrawalAmt = "", depositAmt = "", newBalance = closingBalance;
            if (txn.isCredit) { depositAmt   = txn.amount; newBalance += txn.amount; }
            else              { withdrawalAmt = txn.amount; newBalance -= txn.amount; }

            const txnDate = txn.txnDate ? new Date(txn.txnDate) : new Date();

            sheet.appendRow([
              txnDate, txn.narration, txn.refNo, txnDate,
              withdrawalAmt, depositAmt, newBalance,
              ""    // col H — reconciliation formula set below
            ]);

            const newRow = sheet.getLastRow();
            try { sheet.getRange(newRow, 1).setNumberFormat("dd-mm-yyyy"); } catch(e) {}
            try { sheet.getRange(newRow, 4).setNumberFormat("dd-mm-yyyy"); } catch(e) {}
            try { sheet.getRange(newRow, 5).setNumberFormat("₹#,##0.00");  } catch(e) {}
            try { sheet.getRange(newRow, 6).setNumberFormat("₹#,##0.00");  } catch(e) {}
            try { sheet.getRange(newRow, 7).setNumberFormat(closingFmt);   } catch(e) {}

            const formula = `=IFERROR(IF(AND(
  ABS(SUM(FILTER(TransactionDetails!G:G,TransactionDetails!A:A=C${newRow})))=ABS(
    IF(FILTER(TransactionDetails!C:C,TransactionDetails!A:A=C${newRow})="💰Cash In",
      VALUE(SUBSTITUTE(F${newRow},"₹","")),VALUE(SUBSTITUTE(E${newRow},"₹","")))),
  COUNTA(FILTER(TransactionDetails!E:E,TransactionDetails!A:A=C${newRow}))>0,
  COUNTA(FILTER(TransactionDetails!F:F,TransactionDetails!A:A=C${newRow}))>0,
  COUNTA(FILTER(TransactionDetails!G:G,TransactionDetails!A:A=C${newRow}))>0,
  IF(FILTER(TransactionDetails!C:C,TransactionDetails!A:A=C${newRow})="💰Cash In",
    COUNTA(FILTER(TransactionDetails!H:H,TransactionDetails!A:A=C${newRow}))>0,TRUE)
),TRUE,FALSE),"")`;
            try { sheet.getRange(newRow, 8).setFormula(formula); } catch(e) {}

            msg.markRead();
            Logger.log(`✅ ${txn.isDebit?"DR":"CR"} | ₹${txn.amount} | ${txn.refNo} | ${txn.narration}`);
            Logger.log(`   → Row ${newRow} appended to BankDetails | Email marked as read`);
            stats.imported++;

          } catch(msgErr) { stats.errors.push("Msg: " + (msgErr.message||msgErr)); stats.skipped++; }
        });

      } catch(threadErr) { stats.errors.push("Thread: " + (threadErr.message||threadErr)); }
    });

    Logger.log(`DONE | imported: ${stats.imported} | skipped: ${stats.skipped}`);
    return { ok: true, stats };

  } catch(err) { return { ok: false, message: String(err) }; }
}

// ── Strip HTML to plain text ──────────────────────────────────────────────

function _stripHtml(html) {
  if (!html) return "";
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/?(p|div|td|tr|li|h\d)[^>]*>/gi, "\n")
    .replace(/<a\s[^>]*href="([^"]+)"[^>]*>.*?<\/a>/gi, "$1")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<").replace(/&gt;/gi, ">")
    .replace(/&#\d+;/gi, " ").replace(/\s+/g, " ").trim();
}

// ── Gmail label ID lookup ─────────────────────────────────────────────────

function _getGmailLabelIdByName(name) {
  try {
    const res = Gmail.Users.Labels.list('me');
    if (!res || !res.labels) return "";
    for (let i = 0; i < res.labels.length; i++) {
      if (res.labels[i].name === name) return res.labels[i].id;
    }
    return "";
  } catch(e) { Logger.log("Label lookup error: " + (e.message||e)); return ""; }
}

// ── Parse HDFC alert email body ───────────────────────────────────────────
// DEBIT:  "Rs.160.00 is debited from your account ending 1250
//          towards VPA 9246308480-4@ybl (PARTHO KUNDU) on 25-06-26.
//          UPI transaction reference no.: 318765712182."
// CREDIT: "Rs.500.00 is credited to your account ...
//          Sender: RAVI KUMAR (VPA: 9876543210@ybl) on 25-06-26."
//
// NARRATION: VPA first, then NAME → "9246308480-4@ybl PARTHO KUNDU"

function extractHDFCTransaction(cleanBody) {
  const result = { isCredit:false, isDebit:false, amount:0, refNo:"", txnDate:"", narration:"" };

  result.isCredit = /successfully credited/i.test(cleanBody) || /\bcredited\b/i.test(cleanBody);
  result.isDebit  = /\bdebited\b/i.test(cleanBody);
  if (!result.isCredit && !result.isDebit) return null;

  // Amount
  const amtM =
    cleanBody.match(/Rs\.?\s*([\d,]+(?:\.\d{1,2})?)\s+is\s+(?:debited|credited)/i) ||
    cleanBody.match(/(?:debited|credited)\s+(?:by\s+)?Rs\.?\s*([\d,]+(?:\.\d{1,2})?)/i);
  if (amtM) {
    result.amount = parseFloat(amtM[1].replace(/,/g, ""));
  } else {
    const all = [...cleanBody.matchAll(/Rs\.?\s*([\d,]+(?:\.\d{1,2})?)/gi)];
    for (const m of all) {
      const val = parseFloat(m[1].replace(/,/g, ""));
      if (cleanBody.indexOf('ending ' + m[1]) === -1 && val > 0) { result.amount = val; break; }
    }
  }

  // Reference number
  const refM =
    cleanBody.match(/UPI\s*transaction\s*reference\s*no\.?\s*[:\-]?\s*(\d+)/i) ||
    cleanBody.match(/UPI\s*Reference\s*No\.?\s*[:\-]?\s*(\d+)/i) ||
    cleanBody.match(/reference\s*number(?:\s*is)?\s*[:\-]?\s*(\d+)/i);
  if (refM) result.refNo = refM[1];

  // Date
  const dateM =
    cleanBody.match(/on\s+(\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4})(?:\b|\.)/i) ||
    cleanBody.match(/Date\s*[:\-]\s*(\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4})/i);
  if (dateM) {
    const parts = dateM[1].split(/[-\/]/);
    if (parts.length === 3) {
      const [day, month, year] = parts;
      result.txnDate = `${month}/${day}/${year.length===2?"20"+year:year}`;
    }
  }

  // Narration DEBIT — VPA first, then NAME
  if (result.isDebit && !result.narration) {
    const m = cleanBody.match(/towards\s+VPA\s+([^\s(]+)\s*\(([^)]+)\)/i);
    if (m) result.narration = m[1].trim() + ' ' + m[2].trim();
  }

  // Narration CREDIT — VPA first, then NAME
  if (result.isCredit && !result.narration) {
    const m = cleanBody.match(/Sender\s*:\s*(.*?)\s*\(VPA:\s*([^)]+)\)/i);
    if (m) result.narration = m[2].trim() + ' ' + m[1].trim();
  }

  // Fallback
  if (!result.narration) {
    const m = cleanBody.match(/([^\s(]+@[\w]+)/i);
    if (m) result.narration = m[1];
  }

  return result;
}

// ── Debug functions ───────────────────────────────────────────────────────

function debugListLabels() {
  const res = Gmail.Users.Labels.list('me');
  if (!res || !res.labels) { Logger.log("No labels returned"); return; }
  res.labels.forEach(l => Logger.log(`ID: ${l.id}  |  NAME: "${l.name}"`));
  Logger.log("Total labels: " + res.labels.length);
}

function debugCheckUnread() {
  const query = `label:"${LABEL_NAME}" is:unread`;
  const threads = GmailApp.search(query, 0, 10);
  Logger.log(`Unread threads in ${LABEL_NAME}: ${threads.length}`);
  threads.forEach((thread, i) => {
    const msg = thread.getMessages().find(m => m.isUnread());
    if (!msg) return;
    let body = msg.getPlainBody();
    if (!body || body.trim().length < 20) body = _stripHtml(msg.getBody());
    const clean = body.replace(/\s+/g," ").trim();
    const txn = extractHDFCTransaction(clean);
    if (txn) Logger.log(`[${i}] ✅ ${txn.isDebit?"DR":"CR"} | ₹${txn.amount} | ${txn.refNo} | ${txn.narration}`);
    else     Logger.log(`[${i}] ❌ Could not parse — ${msg.getSubject()}`);
  });
}
