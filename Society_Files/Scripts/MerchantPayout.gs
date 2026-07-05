
// ── Sheet menu ───────────────────────────────────────────────────────────────
function onOpenMerchantPayout() {
  SpreadsheetApp.getUi()
    .createMenu('🏦 Bank Sync')
    .addItem('▶️ Run Bank Sync Now',         'importBankTransactions')
    .addItem('🔍 Dry Run (no changes)',       'dryRunImport')
    .addSeparator()
    .addItem('⚙️ Setup 5-min Sync Trigger',  'setupSyncBankTrigger')
    .addItem('🛑 Remove Sync Trigger',        'removeSyncBankTrigger')
    .addToUi();
}

function setupSyncBankTrigger() {
  ScriptApp.getProjectTriggers().forEach(function(t) {
    if (t.getHandlerFunction() === 'processSyncBankFlag') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('processSyncBankFlag').timeBased().everyMinutes(5).create();
  SpreadsheetApp.getUi().alert('✅ Bank Sync Trigger installed!\nWill check for sync request every 5 minutes.');
}

function removeSyncBankTrigger() {
  var removed = 0;
  ScriptApp.getProjectTriggers().forEach(function(t) {
    if (t.getHandlerFunction() === 'processSyncBankFlag') { ScriptApp.deleteTrigger(t); removed++; }
  });
  SpreadsheetApp.getUi().alert('Sync trigger removed (' + removed + ' trigger(s) deleted).');
}

// ═══════════════════════════════════════════════════════════════════════════
// MerchantPayout.gs  v2.3
// ═══════════════════════════════════════════════════════════════════════════
// Source 1: upi@hdfcbank.bank.in     — Merchant Payout Report (.xlsx)
// Source 2: alerts@hdfcbank.bank.in  — Direct UPI credit alerts (plain text)
// Both append to BankDetails sheet in SocietyData spreadsheet
//
// FIXES IN v2.3:
//   - Date columns write real Date objects (not strings) — no setNumberFormat
//   - try-catch inside row loop — one bad row never crashes entire import
//   - Empty/null row guard for converted Excel rows
//   - msg.markRead() after ALL attachments processed
//   - try/finally on both temp file cleanups
//   - RRNs forced to String when building duplicate lookup
//
// REQUIRES: Drive API v2 → Extensions → Apps Script → Services → Drive API
// TRIGGER : 5-min time-driven trigger on checkAndImport()
// ═══════════════════════════════════════════════════════════════════════════

const SHEET_ID_MP     = "1oXmvMIfQDm51KoHHtkhg8KgK1Qi5mwFYSBdrwir85CA";
const DEBUG_MP        = true;
const THREAD_LIMIT_MP = 50;

// ── Excel column indices (0-based) — HDFC Merchant Payout Report ─────────
const COL_PAYER_VPA = 5;   // Payer VPA
const COL_MERCHANT  = 3;   // Merchant Name
const COL_RRN       = 8;   // Txn ref no. (RRN)
const COL_TXN_DATE  = 9;   // Transaction Req Date  "14-JUN-2026 11:26:50"
const COL_NET_AMT   = 18;  // Net Amount
const COL_CR_DR     = 22;  // CR / DR

// ── BankDetails column map (1-based, 8 columns) ──────────────────────────
// Col 1 Date | Col 2 Narration | Col 3 Chq/Ref.No. | Col 4 Value Dt
// Col 5 Withdrawal Amt | Col 6 Deposit Amt | Col 7 Closing Balance | Col 8 Reconciled


// ═══════════════════════════════════════════════════════════════════════════
// ENTRY POINT — 5-min time-driven trigger runs this
// ═══════════════════════════════════════════════════════════════════════════
function checkAndImport() {
  var stats = {
    threadsFound      : 0,
    threadsProcessed  : 0,
    messagesSeen      : 0,
    imported          : 0,
    skipped           : 0,
    errors            : []
  };

  var ss        = SpreadsheetApp.openById(SHEET_ID_MP);
  var bankSheet = ss.getSheetByName('BankDetails');
  if (!bankSheet) {
    log('ERROR: BankDetails sheet not found');
    stats.errors.push('BankDetails sheet not found');
    return stats;
  }

  // ── Build existing RRN set from Col C ─────────────────────────────────
  var existingRRNs = {};
  var lastRow = bankSheet.getLastRow();
  if (lastRow >= 2) {
    var rrnData = bankSheet.getRange(2, 3, lastRow - 1, 1).getValues();
    rrnData.forEach(function(r) {
      var v = String(r[0] || '').trim();
      if (v && v !== '0') existingRRNs[v] = true;
    });
  }
  log('Existing RRNs in BankDetails: ' + Object.keys(existingRRNs).length);

  var rowsToAppend = [];

  importMerchantPayoutXlsx(existingRRNs, rowsToAppend, stats);
  importUpiAlerts(existingRRNs, rowsToAppend, stats);
  appendToSheet(bankSheet, rowsToAppend);

  stats.imported = rowsToAppend.length;
  return stats;
}


// ═══════════════════════════════════════════════════════════════════
//  SYNC TRIGGER — AppSheet sets Settings!B1 = "YES"
//  This function runs every 5 min, picks it up, runs import
// ═══════════════════════════════════════════════════════════════════
function processSyncBankFlag() {
  var ss = SpreadsheetApp.openById(SS_ID);

  // Read Settings sheet B1
  var settingsSheet = ss.getSheetByName('Settings');
  if (!settingsSheet) {
    log('processSyncBankFlag: Settings sheet not found');
    return;
  }

  var flagCell = settingsSheet.getRange('B1');
  var flagVal  = String(flagCell.getValue() || '').trim().toUpperCase();

  if (flagVal !== 'YES') return;

  // Clear flag immediately to prevent re-triggering
  flagCell.setValue('');
  log('processSyncBankFlag: SyncBank flag detected — starting import...');

  try {
    var result = importBankTransactions();
    log('processSyncBankFlag: import done — ' + JSON.stringify(result));
  } catch(err) {
    log('processSyncBankFlag ERROR: ' + err.toString());
    // Restore flag so user can retry
    flagCell.setValue('YES');
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// SOURCE 1: upi@hdfcbank.bank.in — Merchant Payout .xlsx attachment
// ═══════════════════════════════════════════════════════════════════════════
function importMerchantPayoutXlsx(existingRRNs, rowsToAppend, stats) {
  var threads = GmailApp.search(
    'from:upi@hdfcbank.bank.in subject:"Merchant Payout" is:unread',
    0, THREAD_LIMIT_MP
  );
  stats.threadsFound += threads.length;
  log('Source 1 — Unread Merchant Payout emails found: ' + threads.length);

  threads.forEach(function(thread) {
    stats.threadsProcessed++;
    thread.getMessages().forEach(function(msg) {
      stats.messagesSeen++;
      msg.getAttachments().forEach(function(att) {

        var attName = att.getName().toLowerCase();
        if (attName.indexOf('.xlsx') === -1 && attName.indexOf('.xls') === -1) {
          log('SKIP non-Excel attachment: ' + att.getName());
          return;
        }
        log('Processing attachment: ' + att.getName());

        var tempFile = DriveApp.createFile(att);
        var tempId   = tempFile.getId();

        try {
          var resource  = { title: 'temp_mp_import', mimeType: MimeType.GOOGLE_SHEETS };
          var converted = Drive.Files.copy(resource, tempId, { convert: true });
          var gsId      = converted.id;

          try {
            var gsTmp    = SpreadsheetApp.openById(gsId);
            var srcSheet = gsTmp.getSheets()[0];
            var dataRows = srcSheet.getDataRange().getValues();
            log('Total rows in converted sheet (incl header/blanks): ' + dataRows.length);

            for (var i = 1; i < dataRows.length; i++) {
              try {
                var row = dataRows[i];
                if (!row || row.length === 0) continue;
                if (row.every(function(c) { return c === '' || c === null || c === undefined; })) continue;

                var rrn = String(row[COL_RRN] || '').trim();
                if (!rrn || rrn === '0') continue;

                if (existingRRNs[rrn]) {
                  log('SKIP duplicate RRN: ' + rrn);
                  stats.skipped++;
                  continue;
                }

                var crDr = String(row[COL_CR_DR] || '').trim().toUpperCase();
                if (crDr !== 'CR') {
                  log('SKIP non-CR row RRN: ' + rrn);
                  stats.skipped++;
                  continue;
                }

                var rawDate    = String(row[COL_TXN_DATE] || '').trim();
                var dateOnly   = rawDate.split(' ')[0];
                var dateParsed = new Date(dateOnly);

                var payerVpa  = String(row[COL_PAYER_VPA] || '').trim();
                var narration = 'UPI-' + payerVpa;
                var amount    = parseFloat(row[COL_NET_AMT]) || 0;

                rowsToAppend.push([
                  dateParsed, narration, rrn, dateParsed, '', amount, '', false
                ]);

                existingRRNs[rrn] = true;
                log('QUEUED (xlsx) RRN: ' + rrn + '  ₹' + amount + '  ' + payerVpa);

              } catch(rowErr) {
                log('SKIP row ' + i + ' error: ' + rowErr.message);
                stats.errors.push('Row ' + i + ': ' + rowErr.message);
              }
            }

          } finally {
            try { Drive.Files.remove(gsId); } catch(e) { log('Cleanup gsId error: ' + e.message); }
          }

        } finally {
          try { Drive.Files.remove(tempId); } catch(e) { log('Cleanup tempId error: ' + e.message); }
        }

      }); // end attachments

      msg.markRead();
    }); // end messages

    thread.markRead();
  }); // end threads
}

// ═══════════════════════════════════════════════════════════════════════════
// SOURCE 2: alerts@hdfcbank.bank.in — plain text UPI credit/debit alerts
// ═══════════════════════════════════════════════════════════════════════════
function importUpiAlerts(existingRRNs, rowsToAppend, stats) {
  var threads = GmailApp.search(
    'from:alerts@hdfcbank.bank.in subject:"Account update for your HDFC Bank" is:unread',
    0, THREAD_LIMIT_MP
  );
  stats.threadsFound += threads.length;
  log('Source 2 — Unread UPI Alert emails found: ' + threads.length);

  threads.forEach(function(thread) {
    stats.threadsProcessed++;
    thread.getMessages().forEach(function(msg) {
      stats.messagesSeen++;
      var body = msg.getPlainBody();
      var tx   = extractAlertTransaction(body);

      if (!tx) {
        log('SKIP — could not parse alert email body');
        stats.skipped++;
        msg.markRead();
        return;
      }

      if (existingRRNs[tx.rrn]) {
        log('SKIP duplicate RRN (alert): ' + tx.rrn);
        stats.skipped++;
        msg.markRead();
        return;
      }

      if (tx.type !== 'CR') {
        log('SKIP non-credit alert RRN: ' + tx.rrn);
        stats.skipped++;
        msg.markRead();
        return;
      }

      rowsToAppend.push([
        tx.date, tx.narration, tx.rrn, tx.date, '', tx.amount, '', false
      ]);

      existingRRNs[tx.rrn] = true;
      log('QUEUED (alert) RRN: ' + tx.rrn + '  ₹' + tx.amount + '  ' + tx.narration);
      msg.markRead();

    }); // end messages

    thread.markRead();
  }); // end threads
}

// ═══════════════════════════════════════════════════════════════════════════
// extractAlertTransaction — parses plain text HDFC UPI alert email body
//
// Expected body format:
//   Rs.500.00 credited to your A/c ...
//   Sender: NAME (VPA: x@ybl)
//   UPI Reference No.: 045209782909
//   Date: 01-06-26
// ═══════════════════════════════════════════════════════════════════════════
function extractAlertTransaction(body) {
  try {
    // Amount + credit/debit direction
    var amtMatch = body.match(/Rs\.?([\d,]+\.?\d*)\s+(credited|debited)/i);
    if (!amtMatch) return null;
    var amount = parseFloat(amtMatch[1].replace(/,/g, ''));
    var type   = amtMatch[2].toLowerCase() === 'credited' ? 'CR' : 'DR';

    // Payer VPA and Sender name
    var vpaMatch    = body.match(/VPA:\s*([^\s\)]+)/i);
    var senderMatch = body.match(/Sender:\s*([^\(]+)/i);
    var vpa         = vpaMatch    ? vpaMatch[1].trim() : '';
    var sender      = senderMatch ? senderMatch[1].trim() : '';
    var narration   = 'UPI-' + (vpa || sender || 'UNKNOWN');

    // UPI Reference No. (RRN)
    var rrnMatch = body.match(/UPI Reference No\.?:?\s*(\d+)/i);
    if (!rrnMatch) return null;
    var rrn = rrnMatch[1].trim();

    // Date "01-06-26" or "01-06-2026" → real Date object
    var dateMatch = body.match(/Date:\s*(\d{1,2}-\d{2}-\d{2,4})/i);
    var dateObj;
    if (dateMatch) {
      var parts = dateMatch[1].split('-');
      var dd    = parseInt(parts[0], 10);
      var mm    = parseInt(parts[1], 10) - 1;    // JS months 0-based
      var yy    = parts[2];
      var yyyy  = yy.length === 2 ? 2000 + parseInt(yy, 10) : parseInt(yy, 10);
      dateObj   = new Date(yyyy, mm, dd);
    } else {
      dateObj = new Date();                       // fallback: today
    }

    return { amount: amount, type: type, narration: narration, rrn: rrn, date: dateObj };

  } catch(e) {
    log('extractAlertTransaction error: ' + e.message);
    return null;
  }
}


// ═══════════════════════════════════════════════════════════════════════════
// appendToSheet — writes all queued rows to BankDetails in one batch
// Passes Date objects directly — NO setNumberFormat (typed column safe)
// ═══════════════════════════════════════════════════════════════════════════
function appendToSheet(bankSheet, rowsToAppend) {
  if (rowsToAppend.length === 0) {
    log('i️ No new transactions to import');
    return;
  }

  // Sort by date ascending before writing
  rowsToAppend.sort(function(a, b) {
    var da = a[0] instanceof Date ? a[0].getTime() : new Date(a[0]).getTime();
    var db = b[0] instanceof Date ? b[0].getTime() : new Date(b[0]).getTime();
    return da - db;
  });
  log('Sorted ' + rowsToAppend.length + ' row(s) by date ascending');

  var startRow    = bankSheet.getLastRow() + 1;
  var appendRange = bankSheet.getRange(startRow, 1, rowsToAppend.length, 8);
  appendRange.setValues(rowsToAppend);

  // Col 7: Closing Balance formula
  var prevBalCell    = bankSheet.getRange(startRow - 1, 7);
  var prevBalFormula = prevBalCell.getFormula();
  if (prevBalFormula) {
    for (var r = 0; r < rowsToAppend.length; r++) {
      var newRow = startRow + r;
      bankSheet.getRange(newRow, 7).setFormula(shiftFormula(prevBalFormula, startRow - 1, newRow));
    }
    log('✅ Closing Balance formula applied to ' + rowsToAppend.length + ' row(s)');
  } else {
    log('⚠️ Closing Balance: no formula in row above');
  }

  // Col 8: Reconciled formula
  var prevRecCell    = bankSheet.getRange(startRow - 1, 8);
  var prevRecFormula = prevRecCell.getFormula();
  if (prevRecFormula) {
    for (var r = 0; r < rowsToAppend.length; r++) {
      var newRow = startRow + r;
      bankSheet.getRange(newRow, 8).setFormula(shiftFormula(prevRecFormula, startRow - 1, newRow));
    }
    log('✅ Reconciled formula applied to ' + rowsToAppend.length + ' row(s)');
  } else {
    log('⚠️ Reconciled: no formula in row above');
  }

  SpreadsheetApp.flush();
  log('✅ Appended ' + rowsToAppend.length + ' new row(s) to BankDetails');

  // ── Write Cash In / Cash Out as plain TEXT to TransactionDetails Col D ──
  // No formula = no copy-paste breakage ever
  // rowsToAppend[i][5] = deposit (Cash In), [4] = withdrawal (Cash Out)
  try {
    var ss2    = SpreadsheetApp.openById(SS_ID);
    var tSheet = ss2.getSheetByName('TransactionDetails');
    if (tSheet && tSheet.getLastRow() >= 2) {
      // Build RRN → type map from this batch
      var typeMap = {};
      for (var ri = 0; ri < rowsToAppend.length; ri++) {
        var rrn = String(rowsToAppend[ri][2] || '').trim();
        var dep = rowsToAppend[ri][5];
        if (!rrn) continue;
        typeMap[rrn] = (dep && dep !== '' && dep !== 0) ? '💰Cash In' : '💸Cash Out';
      }
      // Scan TransactionDetails Col B for matching RRNs
      var tLastRow = tSheet.getLastRow();
      var colB     = tSheet.getRange(2, 2, tLastRow - 1, 1).getValues();
      var updates  = 0;
      for (var ti = 0; ti < colB.length; ti++) {
        var tRrn = String(colB[ti][0] || '').trim();
        if (!tRrn || !typeMap[tRrn]) continue;
        var dCell = tSheet.getRange(ti + 2, 4);
        var dFml  = dCell.getFormula();
        var dVal  = String(dCell.getValue() || '').trim();
        // Only write if blank or has broken C[ formula
        if (!dVal || (dFml && dFml.indexOf('C[') >= 0)) {
          dCell.setValue(typeMap[tRrn]);
          updates++;
        }
      }
      if (updates > 0) {
        SpreadsheetApp.flush();
        log('✅ TransactionDetails Col D: ' + updates + ' type values written');
      }
    }
  } catch(terr) {
    log('⚠️ Col D update skipped: ' + terr.toString());
  }
}



// ═══════════════════════════════════════════════════════════════════════════
// shiftFormula — shifts ALL row numbers in a formula by offset
// e.g. prevRow=629, newRow=631 shifts all row refs by +2
// ═══════════════════════════════════════════════════════════════════════════
function shiftFormula(formula, prevRow, newRow) {
  var offset = newRow - prevRow;
  return formula.replace(/([A-Z]+)(\d+)/g, function(match, col, row) {
    return col + (parseInt(row, 10) + offset);
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// log — controlled by DEBUG_MP flag
// ═══════════════════════════════════════════════════════════════════════════
function log(msg) {
  if (DEBUG_MP) Logger.log(msg);
}



// ═══════════════════════════════════════════════════════════════════
//  ONE-TIME FIX: fixTransactionTypeFormulas()
//  Rewrites TransactionDetails Col D with absolute column refs
//  Run once from GAS editor — fixes all existing + future rows
// ═══════════════════════════════════════════════════════════════════
function fixTransactionTypeFormulas() {
  var ss     = SpreadsheetApp.openById(SS_ID);
  var tSheet = ss.getSheetByName('TransactionDetails');
  if (!tSheet) { Logger.log('TransactionDetails not found'); return; }

  var lastRow = tSheet.getLastRow();
  if (lastRow < 2) { Logger.log('No data rows'); return; }

  var fixed = 0;
  for (var i = 2; i <= lastRow; i++) {
    // Col D = column 4, Col B = column 2 (ReceiptNo)
    var formula =
      '=IFERROR(IF(INDEX(BankDetails!$F:$F,MATCH(B' + i + ',BankDetails!$C:$C,0))<>"",' +
      '"\uD83D\uDCB0Cash In",' +
      'IF(INDEX(BankDetails!$E:$E,MATCH(B' + i + ',BankDetails!$C:$C,0))<>"",' +
      '"\uD83D\uDCB8Cash Out","")),"")';
    tSheet.getRange(i, 4).setFormula(formula);
    fixed++;
  }
  SpreadsheetApp.flush();
  Logger.log('✅ Fixed ' + fixed + ' Col D formulas in TransactionDetails');
}

// ═══════════════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════
//  restoreColDFormulas() — ONE-TIME RESTORE
//  Rewrites TransactionDetails Col D with the ORIGINAL formula
//  that was working before ReceiptPDF.gs development.
//  Only fixes rows where formula has broken C[ structured refs.
//  Run once from GAS editor, then this function is no longer needed.
// ═══════════════════════════════════════════════════════════════
function restoreColDFormulas() {
  var ss     = SpreadsheetApp.openById(SS_ID);
  var tSheet = ss.getSheetByName('TransactionDetails');
  if (!tSheet) { Logger.log('TransactionDetails not found'); return; }

  var lastRow = tSheet.getLastRow();
  if (lastRow < 2) { Logger.log('No data rows'); return; }

  var fixed = 0, skipped = 0;
  for (var i = 2; i <= lastRow; i++) {
    var cell    = tSheet.getRange(i, 4);
    var formula = cell.getFormula();

    // Only rewrite rows that have broken C[ structured refs
    // (introduced by our fixTransactionTypeFormulas / fixAllColDFormulas runs)
    if (!formula || formula.indexOf('C[') < 0) {
      skipped++;
      continue;
    }

    // Restore ORIGINAL formula — plain column refs (no $)
    // Google Sheets adjusts row number correctly when copied down
    var original =
      '=IFERROR(' +
        'IF(' +
          'INDEX(BankDetails!F:F,MATCH(B' + i + ',BankDetails!C:C,0))<>"",' +
          '"\uD83D\uDCB0Cash In",' +
          'IF(' +
            'INDEX(BankDetails!E:E,MATCH(B' + i + ',BankDetails!C:C,0))<>"",' +
            '"\uD83D\uDCB8Cash Out",""' +
          ')' +
        ')' +
      ',"")';

    cell.setFormula(original);
    fixed++;
  }

  SpreadsheetApp.flush();
  Logger.log('\u2705 Restored ' + fixed + ' Col D formulas | Skipped (already OK): ' + skipped);
}

// TEST FUNCTIONS — run manually, no sheet writes
// ═══════════════════════════════════════════════════════════════════════════

// Shows unread email count per source
function testEmailCounts() {
  var src1 = GmailApp.search(
    'from:upi@hdfcbank.bank.in subject:"Merchant Payout" is:unread', 0, 50
  );
  var src2 = GmailApp.search(
    'from:alerts@hdfcbank.bank.in subject:"Account update for your HDFC Bank" is:unread', 0, 50
  );
  Logger.log('Source 1 (xlsx)  unread threads: ' + src1.length);
  Logger.log('Source 2 (alert) unread threads: ' + src2.length);
}

// Dry run — logs exactly what would be imported WITHOUT writing to sheet
function testDryRun() {
  var existingRRNs = {};
  var rowsToAppend = [];
  importMerchantPayoutXlsx(existingRRNs, rowsToAppend);
  importUpiAlerts(existingRRNs, rowsToAppend);
  Logger.log('═══ DRY RUN RESULT ═══');
  Logger.log('Total rows that would be appended: ' + rowsToAppend.length);
  rowsToAppend.forEach(function(r, idx) {
    Logger.log(
      'Row ' + (idx + 1) + ': ' +
      Utilities.formatDate(r[0], Session.getScriptTimeZone(), 'dd-MM-yyyy') +
      ' | ' + r[1] +
      ' | RRN: ' + r[2] +
      ' | ₹' + r[5]
    );
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// WEB APP ENTRY POINT — called when Web App URL is opened
// Triggers checkAndImport() and returns result as plain text
// ═══════════════════════════════════════════════════════════════════════════
function doGetImport(e) {
  try {
    var stats = checkAndImport();
    var response = {
      ok        : stats.errors.length === 0,
      timestamp : Utilities.formatDate(new Date(), 'Asia/Calcutta', 'dd-MM-yyyy HH:mm:ss'),
      stats     : stats
    };
    return ContentService
      .createTextOutput(JSON.stringify(response, null, 2))
      .setMimeType(ContentService.MimeType.JSON);
  } catch(err) {
    var errResponse = {
      ok        : false,
      timestamp : Utilities.formatDate(new Date(), 'Asia/Calcutta', 'dd-MM-yyyy HH:mm:ss'),
      stats     : { error: err.message }
    };
    return ContentService
      .createTextOutput(JSON.stringify(errResponse, null, 2))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

