// ===== App Script: HDFC Alert Parser — BankDetails updater =====
// Gmail label : HDFC/1250-Alerts
// Source      : HDFC UPI alert emails (HTML format)
// Sheet       : BankDetails (col A-H + col I = source tag "ALERT")
//
// DEDUPLICATION STRATEGY (v3):
//   1. Primary:   RefNo (UPI txn ref) must not exist in col C
//   2. Secondary: amount+date+VPA combo must not exist in col B+D+E/F
//      (handles same txn imported by MerchantPayout with different RRN)
//   3. Source tag "ALERT" written to col I — distinguishes from MerchantPayout rows
//
// IMPORTANT: MerchantPayout.gs writes source tag "XLSX" or "ALERT_MP" to col I
// This script writes "ALERT" to col I
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

    // ── Load existing data for deduplication ─────────────────────────────
    const existingData   = sheet.getRange("A2:I").getValues();
    const existingRefs   = new Set();   // col C — refNos
    const existingCombos = new Set();   // "amount|dateStr|vpa" combos

    existingData.forEach(row => {
      const refNo  = String(row[2] || "").trim();   // col C
      const dateV  = row[0];                         // col A — date
      const narr   = String(row[1] || "").trim();   // col B — narration (contains VPA)
      const wdAmt  = parseFloat(row[4]) || 0;       // col E — withdrawal
      const dpAmt  = parseFloat(row[5]) || 0;       // col F — deposit
      const amount = wdAmt || dpAmt;
      const dateStr = dateV ? new Date(dateV).toDateString() : "";

      if (refNo)  existingRefs.add(refNo);

      // Extract VPA from narration (last word that looks like vpa@bank)
      const vpaM = narr.match(/([^\s]+@[\w]+)\s*$/i);
      const vpa  = vpaM ? vpaM[1].toLowerCase() : narr.toLowerCase();

      if (amount && dateStr) {
        existingCombos.add(`${amount}|${dateStr}|${vpa}`);
      }
    });

    if (DEBUG) Logger.log(`Loaded ${existingRefs.size} existing refNos, ${existingCombos.size} combos`);

    // ── Search Gmail ──────────────────────────────────────────────────────
    const query   = `label:"${LABEL_NAME}"`;
    const threads = GmailApp.search(query, 0, THREAD_SEARCH_LIMIT);

    const stats = {
      threadsFound: threads.length, threadsProcessed: 0,
      messagesSeen: 0, imported: 0, skippedDupRef: 0,
      skippedDupCombo: 0, skippedOther: 0, errors: []
    };

    threads.forEach(thread => {
      try {
        const messages = thread.getMessages();
        if (!messages.length) return;
        stats.threadsProcessed++;

        messages.forEach(msg => {
          try {
            stats.messagesSeen++;

            // ── Message-level label check ────────────────────────────
            const msgId = msg.getId();
            let msgResource;
            try { msgResource = Gmail.Users.Messages.get('me', msgId, { format: 'metadata' }); }
            catch (gErr) { msgResource = Gmail.Users.Messages.get('me', msgId); }
            const labelIds = (msgResource && msgResource.labelIds) ? msgResource.labelIds : [];
            if (labelIds.indexOf(labelId) === -1) { stats.skippedOther++; return; }
            // ────────────────────────────────────────────────────────

            // ── Get body ─────────────────────────────────────────────
            let rawBody = msg.getPlainBody();
            if (!rawBody || rawBody.trim().length < 20) rawBody = _stripHtml(msg.getBody());
            if (!rawBody || rawBody.trim().length < 10) { stats.skippedOther++; return; }

            const cleanBody = rawBody.replace(/\s+/g, " ").trim();
            const txn = extractHDFCTransaction(cleanBody);

            if (!txn)        { if (DEBUG) Logger.log("Skipped: parse failed");   stats.skippedOther++; return; }
            if (!txn.refNo)  { if (DEBUG) Logger.log("Skipped: no refNo");        stats.skippedOther++; return; }
            if (!txn.amount) { if (DEBUG) Logger.log("Skipped: zero amount");     stats.skippedOther++; return; }

            // ── Dedup check 1: refNo ─────────────────────────────────
            if (existingRefs.has(txn.refNo)) {
              if (DEBUG) Logger.log(`Skipped dupRef: ${txn.refNo}`);
              stats.skippedDupRef++;
              return;
            }

            // ── Dedup check 2: amount + date + VPA combo ─────────────
            const txnDateObj = txn.txnDate ? new Date(txn.txnDate) : new Date();
            const txnDateStr = txnDateObj.toDateString();
            const vpaFromNarr = (txn.narration.match(/([^\s]+@[\w]+)\s*$/i) || ["",""])[1].toLowerCase()
                             || txn.narration.toLowerCase();
            const combo = `${txn.amount}|${txnDateStr}|${vpaFromNarr}`;

            if (existingCombos.has(combo)) {
              if (DEBUG) Logger.log(`Skipped dupCombo (already in sheet via MerchantPayout): ${combo}`);
              stats.skippedDupCombo++;
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

            sheet.appendRow([
              txnDateObj, txn.narration, txn.refNo, txnDateObj,
              withdrawalAmt, depositAmt, newBalance,
              "",          // col H — reconciliation formula (set below)
              "ALERT"      // col I — source tag: distinguishes from MerchantPayout
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

            if (DEBUG) Logger.log(`✅ ${txn.isDebit?"DR":"CR"} | ₹${txn.amount} | ${txn.refNo} | ${txn.narration}`);

            // Update in-memory dedup sets
            existingRefs.add(txn.refNo);
            existingCombos.add(combo);
            stats.imported++;

          } catch(errMsg) { stats.errors.push("Msg: " + (errMsg.message || errMsg)); stats.skippedOther++; }
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
  } catch(e) {
    Logger.log("Error fetching Gmail labels: " + (e.message || e));
    return "";
  }
}

// ── extractHDFCTransaction ────────────────────────────────────────────────

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

  // ── Date ──────────────────────────────────────────────────────────────
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
  const threads = GmailApp.search(query, 0, 5);
  Logger.log("Threads found: " + threads.length);
  if (threads.length > 0) {
    const msg = threads[0].getMessages()[0];
    Logger.log("Subject: " + msg.getSubject());
    const stripped = _stripHtml(msg.getBody());
    Logger.log("Stripped (400): " + stripped.substring(0, 400));
  }
}

function debugParseLatestMessage() {
  const query = `label:"${LABEL_NAME}"`;
  const threads = GmailApp.search(query, 0, 3);
  Logger.log("Threads found: " + threads.length);
  threads.forEach((thread, ti) => {
    thread.getMessages().forEach((msg, mi) => {
      Logger.log(`\n--- Thread ${ti} Msg ${mi} ---`);
      let rawBody = msg.getPlainBody();
      if (!rawBody || rawBody.trim().length < 20) rawBody = _stripHtml(msg.getBody());
      const cleanBody = rawBody.replace(/\s+/g, " ").trim();
      Logger.log("Body (300): " + cleanBody.substring(0, 300));
      const txn = extractHDFCTransaction(cleanBody);
      if (txn) {
        Logger.log(`✅ ${txn.isDebit?"DR":"CR"} ₹${txn.amount} ref=${txn.refNo} date=${txn.txnDate} narr=${txn.narration}`);
      } else {
        Logger.log("❌ parse failed");
      }
    });
  });
}
