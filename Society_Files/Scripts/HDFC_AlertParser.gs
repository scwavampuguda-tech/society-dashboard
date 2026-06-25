// ===== App Script: HDFC Alert Parser — BankDetails updater =====
// Gmail label : HDFC/1250-Alerts
// Sheet       : BankDetails (in SocietyData spreadsheet)
// Requires    : Gmail Advanced Service enabled (Services → Gmail API)
//
// FIXES (2026-06-26):
//   - Amount: picks "Rs.160 is debited" specifically — avoids account ending digits
//   - VPA:    [^\s(]+ captures full VPA like 9246308480-4@ybl (was truncated)
//   - Narration: NAME first, then VPA (e.g. "PARTHO KUNDU 9246308480-4@ybl")
// ================================================================

const SHEET_ID           = "1oXmvMIfQDm51KoHHtkhg8KgK1Qi5mwFYSBdrwir85CA";
const LABEL_NAME         = "HDFC/1250-Alerts";
const DEBUG              = true;
const THREAD_SEARCH_LIMIT = 200;

// ── Entry points ─────────────────────────────────────────────────────────

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

    // Get Gmail label ID for LABEL_NAME
    const labelId = _getGmailLabelIdByName(LABEL_NAME);
    if (!labelId) {
      return { ok: false, message: `Gmail label not found: ${LABEL_NAME}` };
    }

    const query   = `label:"${LABEL_NAME}" is:unread`;
    const threads = GmailApp.search(query, 0, THREAD_SEARCH_LIMIT);

    const existingRefs = new Set(
      sheet.getRange("C2:C").getValues().flat().filter(Boolean)
    );

    const stats = {
      threadsFound:     threads.length,
      threadsProcessed: 0,
      messagesSeen:     0,
      imported:         0,
      skipped:          0,
      errors:           []
    };

    threads.forEach(thread => {
      try {
        const unread = thread.getMessages().filter(m => m.isUnread());
        if (!unread.length) return;
        stats.threadsProcessed++;

        unread.forEach(msg => {
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
            if (labelIds.indexOf(labelId) === -1) {
              stats.skipped++;
              return;
            }
            // ────────────────────────────────────────────────────────

            const body = msg.getPlainBody() || msg.getBody();
            if (!body) { stats.skipped++; return; }

            const cleanBody = body.replace(/\s+/g, " ").trim();
            const txn = extractHDFCTransaction(cleanBody);

            if (!txn) {
              if (DEBUG) Logger.log("Skipped: Unable to parse transaction");
              stats.skipped++; return;
            }
            if (!txn.refNo) {
              if (DEBUG) Logger.log("Skipped: No reference number found");
              stats.skipped++; return;
            }
            if (existingRefs.has(txn.refNo)) {
              if (DEBUG) Logger.log("Skipped: Duplicate ref " + txn.refNo);
              stats.skipped++;
              try { msg.markRead(); } catch(e) {}
              return;
            }

            // ── Append to BankDetails ────────────────────────────────
            const lastRow            = sheet.getLastRow();
            const closingBalanceCell = sheet.getRange(lastRow, 7);
            const closingBalance     = Number(closingBalanceCell.getValue()) || 0;
            const closingFmt         = closingBalanceCell.getNumberFormat();

            let withdrawalAmt = "";
            let depositAmt    = "";
            let newBalance    = closingBalance;

            if (txn.isCredit) {
              depositAmt  = txn.amount;
              newBalance += txn.amount;
            } else {
              withdrawalAmt  = txn.amount;
              newBalance    -= txn.amount;
            }

            const txnDate = txn.txnDate ? new Date(txn.txnDate) : new Date();

            sheet.appendRow([
              txnDate, txn.narration, txn.refNo, txnDate,
              withdrawalAmt, depositAmt, newBalance, ""
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

            if (DEBUG) {
              Logger.log(`✅ Imported | ${txn.isDebit ? "DR" : "CR"} | ₹${txn.amount} | ${txn.refNo} | ${txn.narration}`);
            }

            try {
              msg.markRead();
              if (!thread.getMessages().some(m => m.isUnread())) thread.moveToArchive();
            } catch(e) {}

            existingRefs.add(txn.refNo);
            stats.imported++;

          } catch(errMsg) {
            stats.errors.push("Msg: " + (errMsg.message || errMsg));
            stats.skipped++;
          }
        });
      } catch(errThread) {
        stats.errors.push("Thread: " + (errThread.message || errThread));
      }
    });

    return { ok: true, stats };

  } catch(err) {
    return { ok: false, message: String(err) };
  }
}

// ── Helper: Gmail label ID lookup ─────────────────────────────────────────

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

// ── Transaction parser ────────────────────────────────────────────────────
// Handles HDFC debit alert:
//   "Rs.160.00 is debited from your account ending 1250 towards VPA 9246308480-4@ybl (PARTHO KUNDU) on 25-06-26"
// Handles HDFC credit alert:
//   "Rs.500.00 is credited to your account ... Sender: RAVI KUMAR (VPA: 9876543210@ybl) on 25-06-26"

function extractHDFCTransaction(cleanBody) {
  const result = {
    isCredit: false, isDebit: false,
    amount: 0, refNo: "", txnDate: "", narration: ""
  };

  result.isCredit = /successfully credited/i.test(cleanBody) || /\bcredited\b/i.test(cleanBody);
  result.isDebit  = /\bdebited\b/i.test(cleanBody);
  if (!result.isCredit && !result.isDebit) return null;

  // ── Amount: "Rs.160.00 is debited" — specific match first ────────────
  const amtSpecific =
    cleanBody.match(/Rs\.?\s*([\d,]+(?:\.\d{1,2})?)\s+is\s+(?:debited|credited)/i) ||
    cleanBody.match(/(?:debited|credited)\s+(?:by\s+)?Rs\.?\s*([\d,]+(?:\.\d{1,2})?)/i);
  if (amtSpecific) {
    result.amount = parseFloat(amtSpecific[1].replace(/,/g, ""));
  } else {
    // Fallback: scan all Rs. amounts, skip account-ending digits
    const amtAll = [...cleanBody.matchAll(/Rs\.?\s*([\d,]+(?:\.\d{1,2})?)/gi)];
    for (const m of amtAll) {
      const val = parseFloat(m[1].replace(/,/g, ""));
      if (cleanBody.indexOf('ending ' + m[1]) === -1 && val > 0) {
        result.amount = val;
        break;
      }
    }
  }

  // ── Reference number ─────────────────────────────────────────────────
  const refM =
    cleanBody.match(/UPI\s*transaction\s*reference\s*no\.?\s*[:\-]?\s*(\d+)/i) ||
    cleanBody.match(/UPI\s*Reference\s*No\.?\s*[:\-]?\s*(\d+)/i) ||
    cleanBody.match(/reference\s*number(?:\s*is)?\s*[:\-]?\s*(\d+)/i);
  if (refM) result.refNo = refM[1];

  // ── Date: DD-MM-YY, DD-MM-YYYY, DD/MM/YY, DD/MM/YYYY ────────────────
  const dateM =
    cleanBody.match(/on\s+(\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4})(?:\b|\.)/i) ||
    cleanBody.match(/Date\s*[:\-]\s*(\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4})/i);
  if (dateM) {
    const parts = dateM[1].split(/[-\/]/);
    if (parts.length === 3) {
      const [day, month, year] = parts;
      const fullYear = year.length === 2 ? "20" + year : year;
      result.txnDate = `${month}/${day}/${fullYear}`;  // MM/DD/YYYY for new Date()
    }
  }

  // ── Narration DEBIT: "towards VPA 9246308480-4@ybl (PARTHO KUNDU)" ──
  // [^\s(]+ captures full VPA including hyphens like 9246308480-4@ybl
  if (result.isDebit && !result.narration) {
    const debitM = cleanBody.match(/towards\s+VPA\s+([^\s(]+)\s*\(([^)]+)\)/i);
    if (debitM) {
      result.narration = debitM[2].trim() + ' ' + debitM[1].trim();  // "PARTHO KUNDU 9246308480-4@ybl"
    }
  }

  // ── Narration CREDIT: "Sender: NAME (VPA: vpa@bank)" ────────────────
  if (result.isCredit && !result.narration) {
    const creditM = cleanBody.match(/Sender\s*:\s*(.*?)\s*\(VPA:\s*([^)]+)\)/i);
    if (creditM) {
      result.narration = creditM[1].trim() + ' ' + creditM[2].trim();  // "RAVI KUMAR 9876543210@ybl"
    }
  }

  // ── Fallback: any VPA-like pattern ───────────────────────────────────
  if (!result.narration) {
    const vpaM = cleanBody.match(/([^\s(]+@[\w]+)/i);
    if (vpaM) result.narration = vpaM[1];
  }

  return result;
}

// ── DEBUG FUNCTIONS — run these one by one to diagnose ───────────────────

// STEP 1: Run this first — shows all Gmail labels and their IDs
function debugListLabels() {
  const res = Gmail.Users.Labels.list('me');
  if (!res || !res.labels) { Logger.log("No labels returned"); return; }
  res.labels.forEach(l => Logger.log(`ID: ${l.id}  |  NAME: "${l.name}"`));
  Logger.log("Total labels: " + res.labels.length);
}

// STEP 2: Run this — shows threads found and first message body snippet
function debugSearchThreads() {
  const query = `label:"${LABEL_NAME}" is:unread`;
  Logger.log("Query: " + query);
  const threads = GmailApp.search(query, 0, 20);
  Logger.log("Threads found: " + threads.length);

  // Also try without is:unread
  const query2 = `label:"${LABEL_NAME}"`;
  const threads2 = GmailApp.search(query2, 0, 20);
  Logger.log("Threads found (all, not just unread): " + threads2.length);

  if (threads2.length > 0) {
    const msg = threads2[0].getMessages()[0];
    Logger.log("Subject: " + msg.getSubject());
    Logger.log("IsUnread: " + msg.isUnread());
    const body = msg.getPlainBody() || "";
    Logger.log("Body snippet: " + body.substring(0, 300));
  }
}

// STEP 3: Run this — parses the most recent labeled message and shows result
function debugParseLatestMessage() {
  const query = `label:"${LABEL_NAME}"`;
  const threads = GmailApp.search(query, 0, 5);
  Logger.log("Threads found: " + threads.length);

  threads.forEach((thread, ti) => {
    thread.getMessages().forEach((msg, mi) => {
      Logger.log(`\n--- Thread ${ti} Msg ${mi} ---`);
      Logger.log("Subject: " + msg.getSubject());
      Logger.log("IsUnread: " + msg.isUnread());
      const body = (msg.getPlainBody() || msg.getBody() || "").replace(/\s+/g, " ").trim();
      Logger.log("Body: " + body.substring(0, 400));
      const txn = extractHDFCTransaction(body);
      if (txn) {
        Logger.log("✅ Parsed OK:");
        Logger.log("  isCredit:  " + txn.isCredit);
        Logger.log("  isDebit:   " + txn.isDebit);
        Logger.log("  amount:    " + txn.amount);
        Logger.log("  refNo:     " + txn.refNo);
        Logger.log("  txnDate:   " + txn.txnDate);
        Logger.log("  narration: " + txn.narration);
      } else {
        Logger.log("❌ extractHDFCTransaction returned null");
      }
    });
  });
}
