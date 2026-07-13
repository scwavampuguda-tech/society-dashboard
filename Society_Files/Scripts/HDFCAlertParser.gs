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
const THREAD_SEARCH_LIMIT = 50;

// ── IMPORTANT: Run debugListLabels() first to get exact label name ────────
// Gmail converts "/" to "-" in search bar but stores original name internally
// Copy the exact name from debugListLabels() output and paste below
const LABEL_NAME = "HDFC/1250-Alerts";   // ← update after running debugListLabels()

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

    const label = GmailApp.getUserLabelByName(LABEL_NAME);
    if (!label) {
      // Give helpful error showing available labels
      const res    = Gmail.Users.Labels.list('me');
      const names  = (res && res.labels) ? res.labels.map(l => '"' + l.name + '"').join(', ') : 'none';
      return { ok: false, message: 'Label "' + LABEL_NAME + '" not found. Available: ' + names };
    }

    const threads = label.getThreads(0, THREAD_SEARCH_LIMIT);
    Logger.log("Threads in label [" + LABEL_NAME + "]: " + threads.length);

    const stats = { threadsFound: threads.length, imported: 0, skipped: 0, errors: [] };

    if (threads.length === 0) {
      Logger.log("No threads found under label. Nothing to import.");
      return { ok: true, stats };
    }

    threads.forEach(function(thread) {
      try {
        // FIX: filter on message.isUnread() directly — not thread labels
        const unreadMsgs = thread.getMessages().filter(function(m) {
          return m.isUnread();
        });

        if (!unreadMsgs.length) return;

        unreadMsgs.forEach(function(msg) {
          try {
            let rawBody = msg.getPlainBody();
            if (!rawBody || rawBody.trim().length < 20) rawBody = _stripHtml(msg.getBody());
            if (!rawBody || rawBody.trim().length < 10) {
              msg.markRead();
              stats.skipped++;
              return;
            }

            const cleanBody = rawBody.replace(/\s+/g, " ").trim();

            // Import only HDFC account ending 1250
            if (!/account ending\s+1250/i.test(cleanBody)) {
              Logger.log("Skipped — not account 1250: " + msg.getSubject());
              msg.markRead();
              stats.skipped++;
              return;
            }

            const txn = extractHDFCTransaction(cleanBody);
            if (!txn)        { msg.markRead(); stats.skipped++; return; }
            if (!txn.refNo)  { msg.markRead(); stats.skipped++; return; }
            if (!txn.amount) { msg.markRead(); stats.skipped++; return; }

            // Duplicate check — Col C (Chq/Ref No)
            const lastRow   = sheet.getLastRow();
            const refColumn = lastRow > 1
              ? sheet.getRange(2, 3, lastRow - 1, 1).getValues().flat().map(String)
              : [];

            if (refColumn.includes(String(txn.refNo))) {
              Logger.log("Duplicate skipped: " + txn.refNo);
              msg.markRead();
              stats.skipped++;
              return;
            }

            // Closing balance from last row
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

            const formula =
              `=IFERROR(IF(AND(` +
              `ABS(SUM(FILTER(TransactionDetails!G:G,TransactionDetails!A:A=C${newRow})))=ABS(` +
              `IF(FILTER(TransactionDetails!C:C,TransactionDetails!A:A=C${newRow})="💰Cash In",` +
              `VALUE(SUBSTITUTE(F${newRow},"₹","")),VALUE(SUBSTITUTE(E${newRow},"₹","")))),` +
              `COUNTA(FILTER(TransactionDetails!E:E,TransactionDetails!A:A=C${newRow}))>0,` +
              `COUNTA(FILTER(TransactionDetails!F:F,TransactionDetails!A:A=C${newRow}))>0,` +
              `COUNTA(FILTER(TransactionDetails!G:G,TransactionDetails!A:A=C${newRow}))>0,` +
              `IF(FILTER(TransactionDetails!C:C,TransactionDetails!A:A=C${newRow})="💰Cash In",` +
              `COUNTA(FILTER(TransactionDetails!H:H,TransactionDetails!A:A=C${newRow}))>0,TRUE)` +
              `),TRUE,FALSE),"")`;
            try { sheet.getRange(newRow, 8).setFormula(formula); } catch(e) {}

            msg.markRead();
            Logger.log("✅ " + (txn.isDebit ? "DR" : "CR") +
                       " | ₹" + txn.amount +
                       " | " + txn.refNo +
                       " | " + txn.narration +
                       " → Row " + newRow);
            stats.imported++;

          } catch(msgErr) {
            stats.errors.push("Msg: " + (msgErr.message || msgErr));
            stats.skipped++;
          }
        });

      } catch(threadErr) {
        stats.errors.push("Thread: " + (threadErr.message || threadErr));
      }
    });

    Logger.log("DONE | imported: " + stats.imported + " | skipped: " + stats.skipped);
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

// ── Parse HDFC alert email body ───────────────────────────────────────────
// DEBIT:  "Rs.160.00 is debited from your account ending 1250
//          towards VPA 9246308480-4@ybl (PARTHO KUNDU) on 25-06-26."
// CREDIT: "Rs.500.00 has been successfully credited to your HDFC Bank
//          account ending 1250. Sender: NAME (VPA: vpa@bank) on 13-07-26."
//
// NARRATION: VPA first, then NAME → "9246308480-4@ybl PARTHO KUNDU"

function extractHDFCTransaction(cleanBody) {
  const result = {
    isCredit: false, isDebit: false,
    amount: 0, refNo: "", txnDate: "", narration: ""
  };

  result.isCredit = /successfully credited/i.test(cleanBody) || /\bcredited\b/i.test(cleanBody);
  result.isDebit  = /\bdebited\b/i.test(cleanBody);
  if (!result.isCredit && !result.isDebit) return null;

  // Amount
  const amtM =
    cleanBody.match(/Rs\.?\s*([\d,]+(?:\.\d{1,2})?)\s+(?:has been\s+)?(?:successfully\s+)?(?:debited|credited)/i) ||
    cleanBody.match(/(?:debited|credited)\s+(?:by\s+)?Rs\.?\s*([\d,]+(?:\.\d{1,2})?)/i);
  if (amtM) {
    result.amount = parseFloat(amtM[1].replace(/,/g, ""));
  } else {
    const all = [...cleanBody.matchAll(/Rs\.?\s*([\d,]+(?:\.\d{1,2})?)/gi)];
    for (const m of all) {
      const val = parseFloat(m[1].replace(/,/g, ""));
      if (!cleanBody.includes('ending ' + m[1]) && val > 0) { result.amount = val; break; }
    }
  }

  // Reference number
  const refM =
    cleanBody.match(/UPI\s*(?:transaction\s*)?[Rr]eference\s*[Nn]o\.?\s*[:\-]?\s*(\d{10,})/i) ||
    cleanBody.match(/reference\s*number(?:\s*is)?\s*[:\-]?\s*(\d{10,})/i);
  if (refM) result.refNo = refM[1];

  // Date — handles "13-07-26" and "13-07-2026"
  const dateM =
    cleanBody.match(/[Dd]ate\s*[:\-]\s*(\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4})/i) ||
    cleanBody.match(/on\s+(\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4})(?:\b|\.)/i);
  if (dateM) {
    const parts = dateM[1].split(/[-\/]/);
    if (parts.length === 3) {
      const [day, month, year] = parts;
      result.txnDate = month + "/" + day + "/" + (year.length === 2 ? "20" + year : year);
    }
  }

  // Narration CREDIT — "Sender: NAME (VPA: vpa@bank)"  → "vpa@bank NAME"
  if (result.isCredit && !result.narration) {
    const m = cleanBody.match(/[Ss]ender\s*:\s*([^(]+?)\s*\(\s*VPA\s*:\s*([^)]+)\)/i);
    if (m) result.narration = m[2].trim() + ' ' + m[1].trim();
  }

  // Narration DEBIT — "towards VPA vpa@bank (NAME)"  → "vpa@bank NAME"
  if (result.isDebit && !result.narration) {
    const m = cleanBody.match(/towards\s+VPA\s+([^\s(]+)\s*\(([^)]+)\)/i);
    if (m) result.narration = m[1].trim() + ' ' + m[2].trim();
  }

  // Fallback — any VPA pattern
  if (!result.narration) {
    const m = cleanBody.match(/([^\s(]+@[\w]+)/i);
    if (m) result.narration = m[1];
  }

  return result;
}

// ── Debug: list all Gmail label names exactly ─────────────────────────────
// Run this FIRST to find exact label name to use in LABEL_NAME above

function debugListLabels() {
  const res = Gmail.Users.Labels.list('me');
  if (!res || !res.labels) { Logger.log("No labels returned"); return; }
  res.labels.forEach(function(l) {
    Logger.log('ID: ' + l.id + '  |  NAME: "' + l.name + '"');
  });
  Logger.log("Total labels: " + res.labels.length);
}

// ── Debug: check threads + unread status under label ─────────────────────

function debugCheckUnread() {
  const label = GmailApp.getUserLabelByName(LABEL_NAME);
  if (!label) {
    Logger.log('Label not found: "' + LABEL_NAME + '" — run debugListLabels() to find exact name');
    return;
  }
  const threads = label.getThreads(0, THREAD_SEARCH_LIMIT);
  Logger.log('Label: "' + LABEL_NAME + '" | Threads: ' + threads.length);
  threads.forEach(function(thread) {
    thread.getMessages().forEach(function(msg) {
      Logger.log(
        "Subject: " + msg.getSubject() +
        " | Unread: " + msg.isUnread() +
        " | Date: " + msg.getDate()
      );
    });
  });
}

// ── Debug: dry-run parse on latest unread message ─────────────────────────

function debugParseLatest() {
  const label = GmailApp.getUserLabelByName(LABEL_NAME);
  if (!label) { Logger.log('Label "' + LABEL_NAME + '" not found'); return; }

  const threads = label.getThreads(0, 5);
  let found = false;
  threads.forEach(function(thread) {
    thread.getMessages().forEach(function(msg) {
      if (!msg.isUnread() || found) return;
      found = true;
      const rawBody  = msg.getPlainBody() || _stripHtml(msg.getBody());
      const clean    = rawBody.replace(/\s+/g, " ").trim();
      Logger.log("=== RAW BODY (first 500 chars) ===");
      Logger.log(clean.substring(0, 500));
      const txn = extractHDFCTransaction(clean);
      Logger.log("=== PARSED ===");
      Logger.log(JSON.stringify(txn, null, 2));
    });
  });
  if (!found) Logger.log("No unread messages found under label.");
}
