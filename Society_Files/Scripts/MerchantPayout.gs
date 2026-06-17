// ===== App Script: HDFC Merchant Payout Report + Direct UPI Alerts =====
// Source 1: upi@hdfcbank.bank.in     — Merchant Payout Report (.xlsx)
// Source 2: alerts@hdfcbank.bank.in  — Direct UPI credit/debit alerts (plain text)
// Both append to BankDetails sheet. Drive API v2 must be enabled in Services.

const SHEET_ID_MP       = "1oXmvMIfQDm51KoHHtkhg8KgK1Qi5mwFYSBdrwir85CA";
const DEBUG_MP          = true;
const THREAD_LIMIT_MP   = 50;

// ── Excel column indices (0-based) for Merchant Payout ──
const COL_PAYER_VPA  = 5;
const COL_MERCHANT   = 3;
const COL_RRN        = 8;
const COL_TXN_DATE   = 9;
const COL_NET_AMT    = 18;
const COL_CR_DR      = 22;

// ── Entry points ──
function doGet_MP(e) {
  return ContentService
    .createTextOutput(JSON.stringify(parseMerchantPayoutReport()))
    .setMimeType(ContentService.MimeType.JSON);
}
function doPost_MP(e) {
  return ContentService
    .createTextOutput(JSON.stringify(parseMerchantPayoutReport()))
    .setMimeType(ContentService.MimeType.JSON);
}
function runMerchantPayout() {
  const result = parseMerchantPayoutReport();
  Logger.log(JSON.stringify(result, null, 2));
}

// ══════════════════════════════════════════════════════════
// MAIN FUNCTION
// ══════════════════════════════════════════════════════════
function parseMerchantPayoutReport() {
  try {
    const ss = SpreadsheetApp.openById(SHEET_ID_MP);
    if (!ss) return { ok: false, message: "Spreadsheet not found" };

    const sheet = ss.getSheetByName("BankDetails");
    if (!sheet) return { ok: false, message: "BankDetails sheet not found" };

    const existingRefs = new Set(
      sheet.getRange("C2:C").getValues().flat().filter(Boolean).map(String)
    );

    const stats = {
      threadsFound: 0, threadsProcessed: 0,
      rowsSeen: 0, imported: 0, skipped: 0, errors: []
    };

    // ── Source 1: Merchant Payout Report emails (xlsx attachment) ──
    const q1 = `from:upi@hdfcbank.bank.in subject:"Merchant Payout Report" is:unread has:attachment`;
    const threads1 = GmailApp.search(q1, 0, THREAD_LIMIT_MP);

    // ── Source 2: Direct UPI Alert emails (plain text) ──
    const q2 = `from:alerts@hdfcbank.bank.in subject:"Account update for your HDFC Bank" is:unread`;
    const threads2 = GmailApp.search(q2, 0, THREAD_LIMIT_MP);

    stats.threadsFound = threads1.length + threads2.length;
    if (DEBUG_MP) {
      Logger.log(`📧 Merchant Payout threads: ${threads1.length}`);
      Logger.log(`📧 Direct Alert threads: ${threads2.length}`);
    }

    // ── Process Source 1: xlsx attachments ──
    threads1.forEach(thread => {
      try {
        const messages = thread.getMessages().filter(m => m.isUnread());
        if (!messages.length) return;
        stats.threadsProcessed++;

        messages.forEach(msg => {
          try {
            const xlsxAtt = msg.getAttachments().find(a =>
              a.getName().toLowerCase().endsWith('.xlsx') &&
              a.getName().toLowerCase().includes('merchant')
            );
            if (!xlsxAtt) {
              if (DEBUG_MP) Logger.log("No .xlsx found, skipping");
              stats.skipped++;
              return;
            }
            if (DEBUG_MP) Logger.log("📎 Processing: " + xlsxAtt.getName());

            const rows = parseXlsxAttachment(xlsxAtt);
            if (!rows || rows.length < 2) {
              stats.errors.push("Could not parse XLSX");
              return;
            }

            rows.slice(1).forEach(row => {
              try {
                stats.rowsSeen++;
                const rrn    = String(row[COL_RRN]      || "").trim();
                const crDr   = String(row[COL_CR_DR]    || "").trim().toUpperCase();
                const netAmt = parseFloat(row[COL_NET_AMT]   || 0);
                const rawDate= String(row[COL_TXN_DATE]  || "").trim();
                const payer  = String(row[COL_PAYER_VPA] || "").trim();
                const merch  = String(row[COL_MERCHANT]  || "").trim();

                if (!rrn || !netAmt) { stats.skipped++; return; }
                if (existingRefs.has(rrn)) {
                  if (DEBUG_MP) Logger.log("Duplicate RRN: " + rrn);
                  stats.skipped++; return;
                }

                const txnDate = parseMerchantDate(rawDate);
                if (!txnDate) { stats.skipped++; return; }

                const narration = buildNarration(payer, merch);
                appendToSheet(sheet, txnDate, narration, rrn, netAmt, crDr, existingRefs, stats);

              } catch(rowErr) {
                stats.errors.push("Row: " + (rowErr.message || rowErr));
              }
            });

            markDone(msg, thread);
          } catch(msgErr) {
            stats.errors.push("Msg: " + (msgErr.message || msgErr));
          }
        });
      } catch(tErr) { stats.errors.push("Thread: " + (tErr.message || tErr)); }
    });

    // ── Process Source 2: plain text UPI alerts ──
    threads2.forEach(thread => {
      try {
        const messages = thread.getMessages().filter(m => m.isUnread());
        if (!messages.length) return;
        stats.threadsProcessed++;

        messages.forEach(msg => {
          try {
            stats.rowsSeen++;
            const body = msg.getPlainBody() || msg.getBody() || "";
            const cleanBody = body.replace(/\s+/g, " ").trim();

            if (DEBUG_MP) Logger.log("📨 Alert email body (first 200): " + cleanBody.substring(0, 200));

            const txn = extractAlertTransaction(cleanBody);
            if (!txn) {
              if (DEBUG_MP) Logger.log("Could not parse alert email");
              stats.skipped++; return;
            }
            if (!txn.refNo || !txn.amount) {
              if (DEBUG_MP) Logger.log("Missing refNo or amount in alert");
              stats.skipped++; return;
            }
            if (existingRefs.has(txn.refNo)) {
              if (DEBUG_MP) Logger.log("Duplicate ref: " + txn.refNo);
              stats.skipped++; return;
            }

            const txnDate = txn.txnDate ? new Date(txn.txnDate) : new Date();
            const crDr    = txn.isCredit ? "CR" : "DR";
            const narration = txn.narration || "HDFC UPI Alert";

            appendToSheet(sheet, txnDate, narration, txn.refNo, txn.amount, crDr, existingRefs, stats);
            markDone(msg, thread);

          } catch(msgErr) {
            stats.errors.push("Alert msg: " + (msgErr.message || msgErr));
          }
        });
      } catch(tErr) { stats.errors.push("Alert thread: " + (tErr.message || tErr)); }
    });

    return { ok: true, stats };

  } catch(err) {
    return { ok: false, message: String(err) };
  }
}

// ══════════════════════════════════════════════════════════
// SHARED: Append a row to BankDetails
// ══════════════════════════════════════════════════════════
function appendToSheet(sheet, txnDate, narration, refNo, amount, crDr, existingRefs, stats) {
  const lastDataRow    = sheet.getLastRow();
  const closingBalCell = sheet.getRange(lastDataRow, 7);
  const closingBal     = Number(closingBalCell.getValue()) || 0;
  const closingFmt     = closingBalCell.getNumberFormat();

  let withdrawalAmt = "";
  let depositAmt    = "";
  let newBalance    = closingBal;

  if (crDr === "CR") {
    depositAmt  = amount;
    newBalance += amount;
  } else {
    withdrawalAmt = amount;
    newBalance   -= amount;
  }

  sheet.appendRow([txnDate, narration, refNo, txnDate,
                   withdrawalAmt, depositAmt, newBalance, ""]);

  const newRow = sheet.getLastRow();

  try { sheet.getRange(newRow, 1).setNumberFormat("dd-mm-yyyy"); } catch(e) {}
  try { sheet.getRange(newRow, 4).setNumberFormat("dd-mm-yyyy"); } catch(e) {}
  try { sheet.getRange(newRow, 5).setNumberFormat("\u20b9#,##0.00"); } catch(e) {}
  try { sheet.getRange(newRow, 6).setNumberFormat("\u20b9#,##0.00"); } catch(e) {}
  try { sheet.getRange(newRow, 7).setNumberFormat(closingFmt);       } catch(e) {}

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

  if (DEBUG_MP) Logger.log(`✅ Imported | Ref: ${refNo} | ${crDr} ₹${amount}`);

  existingRefs.add(refNo);
  stats.imported++;
}

// ══════════════════════════════════════════════════════════
// SOURCE 2: Parse plain-text HDFC alert email
// ══════════════════════════════════════════════════════════
function extractAlertTransaction(cleanBody) {
  const result = {
    isCredit:  false, isDebit: false,
    amount:    0,     refNo:  "",
    txnDate:   "",    narration: ""
  };

  result.isCredit = /successfully credited/i.test(cleanBody) || /\bcredited\b/i.test(cleanBody);
  result.isDebit  = /\bdebited\b/i.test(cleanBody);
  if (!result.isCredit && !result.isDebit) return null;

  // Amount
  const amtM = cleanBody.match(/Rs\.?\s*([\d,]+(?:\.\d{1,2})?)/i);
  if (amtM) result.amount = parseFloat(amtM[1].replace(/,/g, ""));

  // Reference number
  const refM =
    cleanBody.match(/UPI\s*transaction\s*reference\s*no\.?\s*:\s*(\d+)/i) ||
    cleanBody.match(/UPI\s*Reference\s*No\.?\s*:\s*(\d+)/i) ||
    cleanBody.match(/reference number(?: is)?\s*(\d+)/i);
  if (refM) result.refNo = refM[1];

  // Date — handles DD-MM-YY and DD-MM-YYYY
  const dateM =
    cleanBody.match(/Date\s*:\s*(\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4})/i) ||
    cleanBody.match(/on\s+(\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4})/i);
  if (dateM) {
    const parts = dateM[1].split(/[-\/]/);
    if (parts.length === 3) {
      const [day, month, year] = parts;
      const fullYear = year.length === 2 ? "20" + year : year;
      result.txnDate = `${month}/${day}/${fullYear}`;
    }
  }

  // Narration — credit: sender VPA
  const creditM = cleanBody.match(/Sender\s*:\s*(.*?)\s*\(VPA:\s*([^)]+)\)/i);
  if (creditM) {
    result.narration = `${creditM[2].trim()} ${creditM[1].trim()}`;
  }

  // Narration — debit: towards VPA
  if (!result.narration) {
    const debitM = cleanBody.match(/towards\s+VPA\s+([\w.\-@]+)\s+\(([^)]+)\)/i);
    if (debitM) result.narration = `${debitM[1].trim()} ${debitM[2].trim()}`;
  }

  // Fallback narration — any VPA
  if (!result.narration) {
    const vpaM = cleanBody.match(/([\w.\-]+@\w+)/i);
    if (vpaM) result.narration = vpaM[1];
  }

  return result;
}

// ══════════════════════════════════════════════════════════
// SOURCE 1: Parse XLSX via Drive API v2
// ══════════════════════════════════════════════════════════
function parseXlsxAttachment(attachment) {
  let tempFileId  = null;
  let convertedId = null;
  try {
    const blob = attachment.copyBlob();
    blob.setName("temp_merchant_payout.xlsx");
    const tempFile = DriveApp.createFile(blob);
    tempFileId = tempFile.getId();

    const converted = Drive.Files.copy(
      { title: "temp_sheet_parse", mimeType: MimeType.GOOGLE_SHEETS },
      tempFileId
    );
    convertedId = converted.id;

    const tempSheet = SpreadsheetApp.openById(convertedId).getSheets()[0];
    const lastRow   = tempSheet.getLastRow();
    const lastCol   = tempSheet.getLastColumn();
    if (lastRow < 1 || lastCol < 1) return [];

    const allRows = tempSheet.getRange(1, 1, lastRow, lastCol).getValues();
    // Header row + only rows with a valid RRN
    return allRows.filter((row, i) =>
      i === 0 || String(row[COL_RRN] || "").trim() !== ""
    );

  } catch(e) {
    Logger.log("XLSX parse error: " + e);
    return null;
  } finally {
    try { if (tempFileId)  DriveApp.getFileById(tempFileId).setTrashed(true);  } catch(e) {}
    try { if (convertedId) DriveApp.getFileById(convertedId).setTrashed(true); } catch(e) {}
  }
}

// ══════════════════════════════════════════════════════════
// HELPERS
// ══════════════════════════════════════════════════════════
function parseMerchantDate(raw) {
  try {
    if (!raw) return null;
    const match = raw.match(/^(\d{1,2})-([A-Z]{3})-(\d{4})/i);
    if (!match) return null;
    const months = {JAN:0,FEB:1,MAR:2,APR:3,MAY:4,JUN:5,
                    JUL:6,AUG:7,SEP:8,OCT:9,NOV:10,DEC:11};
    const m = months[match[2].toUpperCase()];
    if (m === undefined) return null;
    return new Date(parseInt(match[3]), m, parseInt(match[1]));
  } catch(e) { return null; }
}

function buildNarration(payerVpa, merchantName) {
  const parts = [];
  if (payerVpa) parts.push(payerVpa);
  if (merchantName && merchantName !== "SENIOR CITIZENS RESIDENTIAL WELFARE ASSO") {
    parts.push(merchantName);
  }
  return "UPI-" + parts.join("-");
}

function markDone(msg, thread) {
  try {
    msg.markRead();
    if (!thread.getMessages().some(m => m.isUnread())) thread.moveToArchive();
  } catch(e) { Logger.log("Mark/archive error: " + e); }
}
