// =====================================================================
// BankSync.gs  —  SCRWA Society Bank Statement Auto-Import
// =====================================================================
// THREE sources, ONE script, ONE dedup set, ONE BankDetails sheet
//
// SOURCE 1 — XLSX   : Merchant Payout Report (from upi@hdfcbank.bank.in)
//                     RefNo = RRN (col I of xlsx)   Source tag = "XLSX"
// SOURCE 2 — ALERT  : Gmail label HDFC/1250-Alerts (HTML alert emails)
//                     RefNo = UPI Txn Ref            Source tag = "ALERT"
// SOURCE 3 — PLAIN  : from:alerts@hdfcbank.bank.in plain-text alerts
//                     RefNo = UPI Txn Ref            Source tag = "PLAIN"
//
// DEDUPLICATION (two layers):
//   Layer 1 — RefNo  : exact match on col C
//   Layer 2 — Combo  : amount + date + VPA (catches same txn, diff RefNo)
//
// Col I = source tag  ("XLSX" / "ALERT" / "PLAIN")
// =====================================================================

const BS_SHEET_ID     = "1oXmvMIfQDm51KoHHtkhg8KgK1Qi5mwFYSBdrwir85CA";
const BS_LABEL_NAME   = "HDFC/1250-Alerts";
const BS_DEBUG        = true;
const BS_THREAD_LIMIT = 200;

// xlsx column indices (0-based)
const BS_COL_PAYER_VPA = 5;
const BS_COL_MERCHANT  = 3;
const BS_COL_RRN       = 8;
const BS_COL_TXN_DATE  = 9;
const BS_COL_NET_AMT   = 18;
const BS_COL_CR_DR     = 22;

// ── Entry points ──────────────────────────────────────────────────────

function doGet(e) {
  if (e && e.parameter && e.parameter.test == "1") {
    const result = runBankSync();
    return ContentService.createTextOutput(JSON.stringify(result))
      .setMimeType(ContentService.MimeType.JSON);
  }
  return ContentService.createTextOutput(JSON.stringify({ ok:false, message:"Add ?test=1 to run" }))
    .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  return ContentService.createTextOutput(JSON.stringify(runBankSync()))
    .setMimeType(ContentService.MimeType.JSON);
}

// Manual trigger — run from dropdown
function runBankSync() {
  try {
    const ss = SpreadsheetApp.openById(BS_SHEET_ID);
    if (!ss) return { ok:false, message:"Spreadsheet not found" };

    const sheet = ss.getSheetByName("BankDetails");
    if (!sheet) return { ok:false, message:"BankDetails sheet not found" };

    // ── Build dedup sets from existing sheet data ──────────────────
    const existingData   = sheet.getRange("A2:I").getValues();
    const existingRefs   = new Set();
    const existingCombos = new Set();

    existingData.forEach(row => {
      const refNo  = String(row[2] || "").trim();
      const dateV  = row[0];
      const narr   = String(row[1] || "").trim();
      const wdAmt  = parseFloat(String(row[4]).replace(/[₹,]/g,"")) || 0;
      const dpAmt  = parseFloat(String(row[5]).replace(/[₹,]/g,"")) || 0;
      const amount = wdAmt || dpAmt;
      const dateStr = dateV ? new Date(dateV).toDateString() : "";
      const vpaM   = narr.match(/([^\s]+@[\w]+)\s*$/i);
      const vpa    = vpaM ? vpaM[1].toLowerCase() : narr.toLowerCase().substring(0,30);

      if (refNo)            existingRefs.add(refNo);
      if (amount && dateStr) existingCombos.add(`${amount}|${dateStr}|${vpa}`);
    });

    if (BS_DEBUG) Logger.log(`📋 Loaded ${existingRefs.size} refNos, ${existingCombos.size} combos from sheet`);

    const stats = {
      xlsx:  { found:0, imported:0, skipped:0 },
      alert: { found:0, imported:0, skipped:0 },
      plain: { found:0, imported:0, skipped:0 },
      errors: []
    };

    // ══════════════════════════════════════════════════════════════
    // SOURCE 1 — XLSX Merchant Payout Report
    // ══════════════════════════════════════════════════════════════
    const xlsxQuery   = `from:upi@hdfcbank.bank.in subject:"Merchant Payout Report" is:unread has:attachment`;
    const xlsxThreads = GmailApp.search(xlsxQuery, 0, BS_THREAD_LIMIT);
    stats.xlsx.found  = xlsxThreads.length;
    if (BS_DEBUG) Logger.log(`📧 XLSX threads: ${xlsxThreads.length}`);

    xlsxThreads.forEach(thread => {
      try {
        const msgs = thread.getMessages().filter(m => m.isUnread());
        if (!msgs.length) return;

        msgs.forEach(msg => {
          try {
            const xlsxAtt = msg.getAttachments().find(a =>
              a.getName().toLowerCase().endsWith('.xlsx') &&
              a.getName().toLowerCase().includes('merchant')
            );
            if (!xlsxAtt) { stats.xlsx.skipped++; return; }
            if (BS_DEBUG) Logger.log(`📎 XLSX: ${xlsxAtt.getName()}`);

            const rows = _parseXlsx(xlsxAtt);
            if (!rows || rows.length < 2) { stats.errors.push("XLSX parse failed"); return; }

            rows.slice(1).forEach(row => {
              try {
                const rrn    = String(row[BS_COL_RRN]      || "").trim();
                const crDr   = String(row[BS_COL_CR_DR]    || "").trim().toUpperCase();
                const netAmt = parseFloat(row[BS_COL_NET_AMT]  || 0);
                const rawDate= String(row[BS_COL_TXN_DATE] || "").trim();
                const payer  = String(row[BS_COL_PAYER_VPA]|| "").trim();
                const merch  = String(row[BS_COL_MERCHANT] || "").trim();

                if (!rrn || !netAmt) { stats.xlsx.skipped++; return; }

                const txnDate = _parseMerchantDate(rawDate);
                if (!txnDate) { stats.xlsx.skipped++; return; }

                const narration = "UPI-" + [payer, merch].filter(Boolean).join("-");
                const vpa = (payer.match(/([^\s]+@[\w]+)/i)||["",payer])[1].toLowerCase();
                const combo = `${netAmt}|${txnDate.toDateString()}|${vpa || narration.toLowerCase().substring(0,30)}`;

                if (existingRefs.has(rrn)) {
                  if (BS_DEBUG) Logger.log(`⏭ XLSX dupRef: ${rrn}`);
                  stats.xlsx.skipped++; return;
                }
                if (existingCombos.has(combo)) {
                  if (BS_DEBUG) Logger.log(`⏭ XLSX dupCombo: ${combo}`);
                  stats.xlsx.skipped++; return;
                }

                _appendRow(sheet, txnDate, narration, rrn, netAmt, crDr, "XLSX", existingRefs, existingCombos, combo);
                stats.xlsx.imported++;

              } catch(rowErr) { stats.errors.push("XLSX row: " + rowErr.message); }
            });

            _markDone(msg, thread);
          } catch(msgErr) { stats.errors.push("XLSX msg: " + msgErr.message); }
        });
      } catch(tErr) { stats.errors.push("XLSX thread: " + tErr.message); }
    });

    // ══════════════════════════════════════════════════════════════
    // SOURCE 2 — HDFC/1250-Alerts label (HTML alert emails)
    // ══════════════════════════════════════════════════════════════
    const labelId = _getLabelId(BS_LABEL_NAME);
    if (!labelId) {
      stats.errors.push(`Gmail label not found: ${BS_LABEL_NAME}`);
    } else {
      const alertThreads = GmailApp.search(`label:"${BS_LABEL_NAME}"`, 0, BS_THREAD_LIMIT);
      stats.alert.found  = alertThreads.length;
      if (BS_DEBUG) Logger.log(`📧 ALERT threads: ${alertThreads.length}`);

      alertThreads.forEach(thread => {
        try {
          thread.getMessages().forEach(msg => {
            try {
              // Message-level label check
              const msgRes = _getMsgResource(msg.getId());
              const lblIds = msgRes && msgRes.labelIds ? msgRes.labelIds : [];
              if (lblIds.indexOf(labelId) === -1) { stats.alert.skipped++; return; }

              // Get body — HTML email, strip tags
              let rawBody = msg.getPlainBody();
              if (!rawBody || rawBody.trim().length < 20) rawBody = _stripHtml(msg.getBody());
              if (!rawBody || rawBody.trim().length < 10) { stats.alert.skipped++; return; }

              const txn = _parseHdfcTxn(rawBody.replace(/\s+/g," ").trim());
              if (!txn || !txn.refNo || !txn.amount) { stats.alert.skipped++; return; }

              const txnDate = txn.txnDate ? new Date(txn.txnDate) : new Date();
              const vpa = (txn.narration.match(/([^\s]+@[\w]+)\s*$/i)||["",""])[1].toLowerCase()
                        || txn.narration.toLowerCase().substring(0,30);
              const combo = `${txn.amount}|${txnDate.toDateString()}|${vpa}`;

              if (existingRefs.has(txn.refNo)) {
                if (BS_DEBUG) Logger.log(`⏭ ALERT dupRef: ${txn.refNo}`);
                stats.alert.skipped++; return;
              }
              if (existingCombos.has(combo)) {
                if (BS_DEBUG) Logger.log(`⏭ ALERT dupCombo (already via XLSX): ${combo}`);
                stats.alert.skipped++; return;
              }

              const crDr = txn.isCredit ? "CR" : "DR";
              _appendRow(sheet, txnDate, txn.narration, txn.refNo, txn.amount, crDr, "ALERT", existingRefs, existingCombos, combo);
              stats.alert.imported++;

            } catch(msgErr) { stats.errors.push("ALERT msg: " + msgErr.message); stats.alert.skipped++; }
          });
        } catch(tErr) { stats.errors.push("ALERT thread: " + tErr.message); }
      });
    }

    // ══════════════════════════════════════════════════════════════
    // SOURCE 3 — Plain text HDFC alerts (from:alerts@hdfcbank.bank.in)
    // ══════════════════════════════════════════════════════════════
    const plainQuery   = `from:alerts@hdfcbank.bank.in is:unread`;
    const plainThreads = GmailApp.search(plainQuery, 0, BS_THREAD_LIMIT);
    stats.plain.found  = plainThreads.length;
    if (BS_DEBUG) Logger.log(`📧 PLAIN threads: ${plainThreads.length}`);

    plainThreads.forEach(thread => {
      try {
        const msgs = thread.getMessages().filter(m => m.isUnread());
        if (!msgs.length) return;

        msgs.forEach(msg => {
          try {
            const body = msg.getPlainBody() || msg.getBody() || "";
            const txn  = _parseHdfcTxn(body.replace(/\s+/g," ").trim());
            if (!txn || !txn.refNo || !txn.amount) { stats.plain.skipped++; return; }

            const txnDate = txn.txnDate ? new Date(txn.txnDate) : new Date();
            const vpa = (txn.narration.match(/([^\s]+@[\w]+)\s*$/i)||["",""])[1].toLowerCase()
                      || txn.narration.toLowerCase().substring(0,30);
            const combo = `${txn.amount}|${txnDate.toDateString()}|${vpa}`;

            if (existingRefs.has(txn.refNo)) {
              if (BS_DEBUG) Logger.log(`⏭ PLAIN dupRef: ${txn.refNo}`);
              stats.plain.skipped++; return;
            }
            if (existingCombos.has(combo)) {
              if (BS_DEBUG) Logger.log(`⏭ PLAIN dupCombo: ${combo}`);
              stats.plain.skipped++; return;
            }

            const crDr = txn.isCredit ? "CR" : "DR";
            _appendRow(sheet, txnDate, txn.narration, txn.refNo, txn.amount, crDr, "PLAIN", existingRefs, existingCombos, combo);
            _markDone(msg, thread);
            stats.plain.imported++;

          } catch(msgErr) { stats.errors.push("PLAIN msg: " + msgErr.message); stats.plain.skipped++; }
        });
      } catch(tErr) { stats.errors.push("PLAIN thread: " + tErr.message); }
    });

    if (BS_DEBUG) Logger.log(`\n✅ DONE\nXLSX:  imported=${stats.xlsx.imported} skipped=${stats.xlsx.skipped}\nALERT: imported=${stats.alert.imported} skipped=${stats.alert.skipped}\nPLAIN: imported=${stats.plain.imported} skipped=${stats.plain.skipped}`);
    return { ok:true, stats };

  } catch(err) { return { ok:false, message:String(err) }; }
}

// ── Append one row to BankDetails ────────────────────────────────────

function _appendRow(sheet, txnDate, narration, refNo, amount, crDr, source, existingRefs, existingCombos, combo) {
  const lastRow    = sheet.getLastRow();
  const closeCell  = sheet.getRange(lastRow, 7);
  const closeBal   = Number(closeCell.getValue()) || 0;
  const closeFmt   = closeCell.getNumberFormat();

  let wd = "", dp = "", newBal = closeBal;
  if (crDr === "CR") { dp = amount; newBal += amount; }
  else               { wd = amount; newBal -= amount; }

  sheet.appendRow([txnDate, narration, refNo, txnDate, wd, dp, newBal, "", source]);

  const r = sheet.getLastRow();
  try { sheet.getRange(r,1).setNumberFormat("dd-mm-yyyy"); } catch(e) {}
  try { sheet.getRange(r,4).setNumberFormat("dd-mm-yyyy"); } catch(e) {}
  try { sheet.getRange(r,5).setNumberFormat("₹#,##0.00");  } catch(e) {}
  try { sheet.getRange(r,6).setNumberFormat("₹#,##0.00");  } catch(e) {}
  try { sheet.getRange(r,7).setNumberFormat(closeFmt);     } catch(e) {}

  const f = `=IFERROR(IF(AND(
  ABS(SUM(FILTER(TransactionDetails!G:G,TransactionDetails!A:A=C${r})))=ABS(
    IF(FILTER(TransactionDetails!C:C,TransactionDetails!A:A=C${r})="💰Cash In",
      VALUE(SUBSTITUTE(F${r},"₹","")),VALUE(SUBSTITUTE(E${r},"₹","")))),
  COUNTA(FILTER(TransactionDetails!E:E,TransactionDetails!A:A=C${r}))>0,
  COUNTA(FILTER(TransactionDetails!F:F,TransactionDetails!A:A=C${r}))>0,
  COUNTA(FILTER(TransactionDetails!G:G,TransactionDetails!A:A=C${r}))>0,
  IF(FILTER(TransactionDetails!C:C,TransactionDetails!A:A=C${r})="💰Cash In",
    COUNTA(FILTER(TransactionDetails!H:H,TransactionDetails!A:A=C${r}))>0,TRUE)
),TRUE,FALSE),"")`;
  try { sheet.getRange(r,8).setFormula(f); } catch(e) {}

  if (BS_DEBUG) Logger.log(`✅ [${source}] ${crDr} ₹${amount} | ${refNo} | ${narration}`);
  existingRefs.add(refNo);
  existingCombos.add(combo);
}

// ── HDFC transaction parser (works for both HTML-stripped + plain text) ─

function _parseHdfcTxn(cleanBody) {
  const r = { isCredit:false, isDebit:false, amount:0, refNo:"", txnDate:"", narration:"" };

  r.isCredit = /successfully credited/i.test(cleanBody) || /\bcredited\b/i.test(cleanBody);
  r.isDebit  = /\bdebited\b/i.test(cleanBody);
  if (!r.isCredit && !r.isDebit) return null;

  // Amount
  const amtM =
    cleanBody.match(/Rs\.?\s*([\d,]+(?:\.\d{1,2})?)\s+is\s+(?:debited|credited)/i) ||
    cleanBody.match(/(?:debited|credited)\s+(?:by\s+)?Rs\.?\s*([\d,]+(?:\.\d{1,2})?)/i);
  if (amtM) {
    r.amount = parseFloat(amtM[1].replace(/,/g,""));
  } else {
    const all = [...cleanBody.matchAll(/Rs\.?\s*([\d,]+(?:\.\d{1,2})?)/gi)];
    for (const m of all) {
      const v = parseFloat(m[1].replace(/,/g,""));
      if (cleanBody.indexOf('ending '+m[1]) === -1 && v > 0) { r.amount=v; break; }
    }
  }

  // RefNo
  const refM =
    cleanBody.match(/UPI\s*transaction\s*reference\s*no\.?\s*[:\-]?\s*(\d+)/i) ||
    cleanBody.match(/UPI\s*Reference\s*No\.?\s*[:\-]?\s*(\d+)/i) ||
    cleanBody.match(/reference\s*number(?:\s*is)?\s*[:\-]?\s*(\d+)/i);
  if (refM) r.refNo = refM[1];

  // Date
  const dateM =
    cleanBody.match(/on\s+(\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4})(?:\b|\.)/i) ||
    cleanBody.match(/Date\s*[:\-]\s*(\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4})/i);
  if (dateM) {
    const p = dateM[1].split(/[-\/]/);
    if (p.length===3) {
      const [d,m,y] = p;
      r.txnDate = `${m}/${d}/${y.length===2?"20"+y:y}`;
    }
  }

  // Narration — debit
  if (r.isDebit && !r.narration) {
    const m = cleanBody.match(/towards\s+VPA\s+([^\s(]+)\s*\(([^)]+)\)/i);
    if (m) r.narration = m[2].trim()+' '+m[1].trim();
  }
  // Narration — credit
  if (r.isCredit && !r.narration) {
    const m = cleanBody.match(/Sender\s*:\s*(.*?)\s*\(VPA:\s*([^)]+)\)/i);
    if (m) r.narration = m[1].trim()+' '+m[2].trim();
  }
  // Fallback
  if (!r.narration) {
    const m = cleanBody.match(/([^\s(]+@[\w]+)/i);
    if (m) r.narration = m[1];
  }

  return r;
}

// ── HTML stripper ────────────────────────────────────────────────────

function _stripHtml(html) {
  if (!html) return "";
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi," ")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi," ")
    .replace(/<br\s*\/?>/gi,"\n")
    .replace(/<\/?(p|div|td|tr|li|h\d)[^>]*>/gi,"\n")
    .replace(/<a\s[^>]*href="([^"]+)"[^>]*>.*?<\/a>/gi,"$1")
    .replace(/<[^>]+>/g," ")
    .replace(/&nbsp;/gi," ").replace(/&amp;/gi,"&")
    .replace(/&lt;/gi,"<").replace(/&gt;/gi,">")
    .replace(/&#\d+;/gi," ").replace(/\s+/g," ").trim();
}

// ── Gmail helpers ────────────────────────────────────────────────────

function _getLabelId(name) {
  try {
    const res = Gmail.Users.Labels.list('me');
    if (!res || !res.labels) return "";
    for (let i=0; i<res.labels.length; i++) {
      if (res.labels[i].name===name) return res.labels[i].id;
    }
    return "";
  } catch(e) { Logger.log("Label lookup error: "+e); return ""; }
}

function _getMsgResource(msgId) {
  try { return Gmail.Users.Messages.get('me', msgId, {format:'metadata'}); }
  catch(e) { try { return Gmail.Users.Messages.get('me', msgId); } catch(e2) { return null; } }
}

function _markDone(msg, thread) {
  try {
    msg.markRead();
    if (!thread.getMessages().some(m=>m.isUnread())) thread.moveToArchive();
  } catch(e) {}
}

// ── XLSX parser (Drive API v2) ───────────────────────────────────────

function _parseXlsx(attachment) {
  let tempId=null, convId=null;
  try {
    const blob = attachment.copyBlob();
    blob.setName("temp_payout.xlsx");
    tempId = DriveApp.createFile(blob).getId();
    const conv = Drive.Files.copy({title:"temp_parse",mimeType:MimeType.GOOGLE_SHEETS}, tempId);
    convId = conv.id;
    const sht = SpreadsheetApp.openById(convId).getSheets()[0];
    const lr = sht.getLastRow(), lc = sht.getLastColumn();
    if (lr<1||lc<1) return [];
    const all = sht.getRange(1,1,lr,lc).getValues();
    return all.filter((row,i)=> i===0 || String(row[BS_COL_RRN]||"").trim()!=="");
  } catch(e) { Logger.log("XLSX error: "+e); return null; }
  finally {
    try { if(tempId) DriveApp.getFileById(tempId).setTrashed(true); } catch(e){}
    try { if(convId) DriveApp.getFileById(convId).setTrashed(true); } catch(e){}
  }
}

// ── Date parser for Merchant Payout xlsx ────────────────────────────

function _parseMerchantDate(raw) {
  try {
    const m = raw.match(/^(\d{1,2})-([A-Z]{3})-(\d{4})/i);
    if (!m) return null;
    const months = {JAN:0,FEB:1,MAR:2,APR:3,MAY:4,JUN:5,JUL:6,AUG:7,SEP:8,OCT:9,NOV:10,DEC:11};
    const mo = months[m[2].toUpperCase()];
    return mo!==undefined ? new Date(parseInt(m[3]),mo,parseInt(m[1])) : null;
  } catch(e) { return null; }
}

// ── Debug helpers ────────────────────────────────────────────────────

function debugBankSync() {
  const result = runBankSync();
  Logger.log(JSON.stringify(result, null, 2));
}
