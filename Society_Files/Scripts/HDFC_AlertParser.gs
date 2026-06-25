// ===== App Script: HDFC Alert Parser — BankDetails updater =====
// Gmail label : HDFC/1250-Alerts
// Sheet       : BankDetails (in SocietyData spreadsheet)
// Requires    : Gmail Advanced Service enabled (Services → Gmail API)
//
// FIXES (2026-06-26 v2):
//   - Removed is:unread filter — processes ALL labeled emails, uses refNo dedupe
//   - Added HTML stripper — extracts plain text from HTML email body
//   - Amount: "Rs.160 is debited" specific match — avoids account ending digits
//   - VPA: [^\s(]+ captures full VPA like 9246308480-4@ybl
//   - Narration: NAME first, then VPA
// ================================================================

const SHEET_ID            = "1oXmvMIfQDm51KoHHtkhg8KgK1Qi5mwFYSBdrwir85CA";
const LABEL_NAME          = "HDFC/1250-Alerts";
const DEBUG               = true;
const THREAD_SEARCH_LIMIT = 200;

// ── Entry points ──────────────────────────────────────────────────────────

function doPost(e) {
  const result = parseHDFCAlertsToBankDetails();
  return ContentService
    .createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}

function doGet(e) {
  if (e && e.parameter && e.parameter.test == "1") {
    const result = parseHDFCAlertsToBankDetails();
    return ContentService
      .createTextOutput(JSON.stringify(result))
      .setMimeType(ContentService.MimeType.JSON);
  }
  return ContentService
    .createTextOutput(JSON.stringify({ ok: false, message: "To test, add ?test=1" }))
    .setMimeType(ContentService.MimeType.JSON);
}

// ── Main function ─────────────────────────────────────────────────────────

function parseHDFCAlertsToBankDetails() {
  try {
    const ss = SpreadsheetApp.openById(SHEET_ID);
    if (!ss) return { ok: false, message: "Spreadsheet not found: " + SHEET_ID };

    const sheet = ss.getSheetByName("BankDetails");
    if (!sheet) return { ok: false, message: "BankDetails sheet not found" };

    const labelId = _getGmailLabelIdByName(LABEL_NAME);
    if (!labelId) return { ok: false, message: `Gmail label not found: ${LABEL_NAME}` };

    // FIX: No is:unread — use refNo deduplication instead
    const query   = `label:"${LABEL_NAME}"`;
    const threads = GmailApp.search(query, 0, THREAD_SEARCH_LIMIT);

    // Load all existing refNos from col C to skip duplicates
    const existingRefs = new Set(
      sheet.getRange("C2:C").getValues().flat().filter(Boolean)
    );

    const stats = {
      threadsFound: threads.length, threadsProcessed: 0,
      messagesSeen: 0, imported: 0, skipped: 0, errors: []
    };

    threads.forEach(thread => {
      try {
        const messages = thread.getMessages();
        if (!messages.length) return;
        stats.threadsProcessed++;

        messages.forEach(msg => {
          try {
            stats.messagesSeen++;

            // ── Message-level label check via Gmail API ──────────────
            const msgId = msg.getId();
            let msgResource;
            try {
              msgResource = Gmail.Users.Messages.get('me', msgId, { format: 'metadata' });
            } catch (gErr) {
              msgResource = Gmail.Users.Messages.get('me', msgId);
            }
            const labelIds = (msgResource && msgResource.labelIds) ? msgResource.labelIds : [];
            if (labelIds.indexOf(labelId) === -1) { stats.skipped++; return; }
            // ────────────────────────────────────────────────────────

            // FIX: Try plain body first, fall back to HTML-stripped body
            let rawBody = msg.getPlainBody();
            if (!rawBody || rawBody.trim().length < 20) {
              rawBody = _stripHtml(msg.getBody());
            }
            if (!rawBody || rawBody.trim().length < 10) { stats.skipped++; return; }

            const cleanBody = rawBody.replace(/\s+/g, " ").trim();
            if (DEBUG) Logger.log("Body (first 300): " + cleanBody.substring(0, 300));

            const txn = extractHDFCTransaction(cleanBody);

            if (!txn)        { if (DEBUG) Logger.log("Skipped: parse failed");    stats.skipped++; return; }
            if (!txn.refNo)  { if (DEBUG) Logger.log("Skipped: no refNo");         stats.skipped++; return; }
            if (!txn.amount) { if (DEBUG) Logger.log("Skipped: zero amount");      stats.skipped++; return; }

            // Deduplicate by refNo — handles already-read emails
            if (existingRefs.has(txn.refNo)) {
              if (DEBUG) Logger.log("Skipped: duplicate refNo " + txn.refNo);
              stats.skipped++;
              return;
            }

            // ── Append to BankDetails ────────────────────────────────
            const lastRow        = sheet.getLastRow();
            const closingCell    = sheet.getRange(lastRow, 7);
            const closingBalance = Number(closingCell.getValue()) || 0;
            const closingFmt     = closingCell.getNumberFormat();

            let withdrawalAmt = "", depositAmt = "", newBalance = closingBalance;
            if (txn.isCredit) { depositAmt   = txn.amount; newBalance += txn.amount; }
            else              { withdrawalAmt = txn.amount; newBalance -= txn.amount; }

            const txnDate = txn.txnDate ? new Date(txn.txnDate) : new Date();

            sheet.appendRow([txnDate, txn.narration, txn.refNo, txnDate,
                             withdrawalAmt, depositAmt, newBalance, ""]);

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

            if (DEBUG) Logger.log(`✅ ${txn.isDebit?"DR":"CR"} | ₹${txn.amount} | ${txn.refNo} | ${txn.narration}`);

            existingRefs.add(txn.refNo);
            stats.imported++;

          } catch(errMsg) { stats.errors.push("Msg: " + (errMsg.message || errMsg)); stats.skipped++; }
        });
      } catch(errThread) { stats.errors.push("Thread: " + (errThread.message || errThread)); }
    });

    return { ok: true, stats };

  } catch(err) { return { ok: false, message: String(err) }; }
}

// ── Strip HTML tags to plain text ─────────────────────────────────────────

function _stripHtml(html) {
  if (!html) return "";
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, " ")   // remove style blocks
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, " ")  // remove script blocks
    .replace(/<br\s*\/?>/gi, "\n")                       // <br> → newline
    .replace(/<\/?(p|div|td|tr|li|h\d)[^>]*>/gi, "\n")  // block tags → newline
    .replace(/<a\s[^>]*href="([^"]+)"[^>]*>.*?<\/a>/gi, "$1") // links → URL
    .replace(/<[^>]+>/g, " ")                            // strip remaining tags
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#\d+;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
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
  } catch(e) {
    Logger.log("Error fetching Gmail labels: " + (e.message || e));
    return "";
  }
}

// ── extractHDFCTransaction ────────────────────────────────────────────────
// DEBIT:  "Rs.160.00 is debited from your account ending 1250 towards VPA 9246308480-4@ybl (PARTHO KUNDU) on 25-06-26"
// CREDIT: "Rs.500.00 is credited to your account ... Sender: RAVI KUMAR (VPA: 9876543210@ybl) on 25-06-26"

function extractHDFCTransaction(cleanBody) {
  const result = { isCredit:false, isDebit:false, amount:0, refNo:"", txnDate:"", narration:"" };

  result.isCredit = /successfully credited/i.test(cleanBody) || /\bcredited\b/i.test(cleanBody);
  result.isDebit  = /\bdebited\b/i.test(cleanBody);
  if (!result.isCredit && !result.isDebit) return null;

  // ── Amount ────────────────────────────────────────────────────────────
  const amtSpecific =
    cleanBody.match(/Rs\.?\s*([\d,]+(?:\.\d{1,2})?)\s+is\s+(?:debited|credited)/i) ||
    cleanBody.match(/(?:debited|credited)\s+(?:by\s+)?Rs\.?\s*([\d,]+(?:\.\d{1,2})?)/i);
  if (amtSpecific) {
    result.amount = parseFloat(amtSpecific[1].replace(/,/g, ""));
  } else {
    const amtAll = [...cleanBody.matchAll(/Rs\.?\s*([\d,]+(?:\.\d{1,2})?)/gi)];
    for (const m of amtAll) {
      const val = parseFloat(m[1].replace(/,/g, ""));
      if (cleanBody.indexOf('ending ' + m[1]) === -1 && val > 0) { result.amount = val; break; }
    }
  }

  // ── Reference number ──────────────────────────────────────────────────
  const refM =
    cleanBody.match(/UPI\s*transaction\s*reference\s*no\.?\s*[:\-]?\s*(\d+)/i) ||
    cleanBody.match(/UPI\s*Reference\s*No\.?\s*[:\-]?\s*(\d+)/i) ||
    cleanBody.match(/reference\s*number(?:\s*is)?\s*[:\-]?\s*(\d+)/i);
  if (refM) result.refNo = refM[1];

  // ── Date: DD-MM-YY / DD-MM-YYYY / DD/MM/YY / DD/MM/YYYY ──────────────
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

  // ── Narration DEBIT ───────────────────────────────────────────────────
  if (result.isDebit && !result.narration) {
    const m = cleanBody.match(/towards\s+VPA\s+([^\s(]+)\s*\(([^)]+)\)/i);
    if (m) result.narration = m[2].trim() + ' ' + m[1].trim();
  }

  // ── Narration CREDIT ──────────────────────────────────────────────────
  if (result.isCredit && !result.narration) {
    const m = cleanBody.match(/Sender\s*:\s*(.*?)\s*\(VPA:\s*([^)]+)\)/i);
    if (m) result.narration = m[1].trim() + ' ' + m[2].trim();
  }

  // ── Fallback VPA ──────────────────────────────────────────────────────
  if (!result.narration) {
    const m = cleanBody.match(/([^\s(]+@[\w]+)/i);
    if (m) result.narration = m[1];
  }

  return result;
}

// ── DEBUG FUNCTIONS ───────────────────────────────────────────────────────

function debugListLabels() {
  const res = Gmail.Users.Labels.list('me');
  if (!res || !res.labels) { Logger.log("No labels returned"); return; }
  res.labels.forEach(l => Logger.log(`ID: ${l.id}  |  NAME: "${l.name}"`));
  Logger.log("Total labels: " + res.labels.length);
}

function debugSearchThreads() {
  const query = `label:"${LABEL_NAME}"`;
  Logger.log("Query: " + query);
  const threads = GmailApp.search(query, 0, 5);
  Logger.log("Threads found: " + threads.length);
  if (threads.length > 0) {
    const msg = threads[0].getMessages()[0];
    Logger.log("Subject: " + msg.getSubject());
    Logger.log("IsUnread: " + msg.isUnread());
    const plain = msg.getPlainBody() || "";
    Logger.log("PlainBody length: " + plain.length);
    Logger.log("PlainBody snippet: " + plain.substring(0, 200));
    const stripped = _stripHtml(msg.getBody());
    Logger.log("HTML-stripped length: " + stripped.length);
    Logger.log("HTML-stripped snippet: " + stripped.substring(0, 400));
  }
}

function debugParseLatestMessage() {
  const query = `label:"${LABEL_NAME}"`;
  const threads = GmailApp.search(query, 0, 3);
  Logger.log("Threads found: " + threads.length);
  threads.forEach((thread, ti) => {
    thread.getMessages().forEach((msg, mi) => {
      Logger.log(`\n--- Thread ${ti} Msg ${mi} ---`);
      Logger.log("Subject: " + msg.getSubject());
      let rawBody = msg.getPlainBody();
      if (!rawBody || rawBody.trim().length < 20) rawBody = _stripHtml(msg.getBody());
      const cleanBody = rawBody.replace(/\s+/g, " ").trim();
      Logger.log("Body (300): " + cleanBody.substring(0, 300));
      const txn = extractHDFCTransaction(cleanBody);
      if (txn) {
        Logger.log("✅ isCredit=" + txn.isCredit + " isDebit=" + txn.isDebit);
        Logger.log("   amount=" + txn.amount + " refNo=" + txn.refNo);
        Logger.log("   txnDate=" + txn.txnDate + " narration=" + txn.narration);
      } else {
        Logger.log("❌ extractHDFCTransaction returned null");
      }
    });
  });
}
