/**
 * ═══════════════════════════════════════════════════════════════════
 *  SCRWA — Consolidated Receipt PDF Generator  v4.0
 * ═══════════════════════════════════════════════════════════════════
 *  Account   : scwa.vampuguda@gmail.com
 *  Sheet ID  : 1oXmvMIfQDm51KoHHtkhg8KgK1Qi5mwFYSBdrwir85CA
 *
 *  WHAT THIS SCRIPT DOES:
 *  ──────────────────────
 *  1. Triggered from AppSheet action button on BankDetails row
 *     (when Reconciled = TRUE)
 *  2. Finds ALL TransactionDetails rows sharing the same ReceiptNo
 *  3. Looks up InternalOrderName from InternalOrder table
 *  4. Looks up invoice breakup from Invoice table (per BillID)
 *  5. Builds ONE consolidated PDF with full invoice detail per property
 *  6. Saves PDF → Drive → SCRWA_Receipts/YYYY-MM/RCPT-{receiptNo}.pdf
 *  7. Writes PDF URL to:
 *       BankDetails Col I      [8]  ReceiptPDF
 *       TransactionDetails Col P [15] ReceiptPDF
 *  8. Sends email (PDF attached) to:
 *       OwnerDetails Col K  (EmailID)   — for every tagged PropertyID
 *       ProxyDetails Col E  (REmailID)  — if IsProxy = Yes
 *       Deduped by lowercase address
 *  9. Logs to Receipts_Log sheet
 *
 *  WHATSAPP — OWNED ENTIRELY BY APPSHEET (not touched here)
 *  ─────────────────────────────────────────────────────────
 *  After script runs, AppSheet WhatsAppDraftMessage auto-includes
 *  [ReceiptPDF] link because Col P is now populated.
 *
 *  ── SHEET COLUMN MAP ────────────────────────────────────────────
 *
 *  BankDetails (header row 1, data row 2+):
 *    Col A [0]  TxnDate
 *    Col B [1]  Narration
 *    Col C [2]  RefNo           ← matches TransactionDetails.ReceiptNo
 *    Col D [3]  ValueDate
 *    Col E [4]  Withdrawal
 *    Col F [5]  Deposit
 *    Col G [6]  Balance
 *    Col H [7]  Reconciled
 *    Col I [8]  ReceiptPDF      ← AppSheet sets 'YES' to request PDF generation
 *                                  GAS replaces 'YES' with Drive URL when done
 *    Col J [9]  EmailSent       ← script writes timestamp when email sent
 *
 *  TransactionDetails (row 1=section label, row 2=headers, data row 3+):
 *    Col A [0]  TransactionID
 *    Col B [1]  ReceiptNo
 *    Col C [2]  Date
 *    Col D [3]  Type
 *    Col E [4]  Mode
 *    Col F [5]  AccountHead
 *    Col G [6]  AccountSubHead
 *    Col H [7]  Amount
 *    Col I [8]  PropertyID
 *    Col J [9]  InternalOrder   ← code e.g. MOMEN01
 *    Col K [10] BillID
 *    Col L [11] Remarks
 *    Col M [12] Notes
 *    Col N [13] Attachments
 *    Col O [14] FY Year
 *    Col P [15] ReceiptPDF      ← script writes PDF URL here
 *
 *  InternalOrder (header row 1, data row 2+):
 *    Col A [0]  InternalOrderNo   e.g. MOMEN01
 *    Col B [1]  InternalOrderName e.g. MAINTENANCE CHARGES
 *
 *  Invoice (header row 1 = labels, row 2 = col headers, data row 3+):
 *    Col A [0]  BillID
 *    Col B [1]  PropertyID
 *    Col C [2]  InternalOrder
 *    Col D [3]  StartPeriod
 *    Col E [4]  BillPeriod
 *    Col F [5]  BillDate
 *    Col G [6]  BillAmount
 *    Col H [7]  PaidAmount
 *    Col I [8]  BalanceRemaining
 *    Col J [9]  Status
 *
 *  OwnerDetails (header row 1, data row 2+):
 *    Col A [0]  propertyID
 *    Col B [1]  propertylocation (PlotNo)
 *    Col D [3]  ownershiptype
 *    Col E [4]  ownername1
 *    Col F [5]  ownername2
 *    Col H [7]  Lane No
 *    Col I [8]  IsMember
 *    Col J [9]  OwnerStatus
 *    Col K [10] EmailID         ← owner email
 *    Col L [11] Phonenumber
 *    Col M [12] IsWhatsapp
 *    Col O [14] IsProxy
 *
 *  ProxyDetails (header row 2, data row 3+):
 *    Col A [0]  propertyID
 *    Col B [1]  Represented By
 *    Col C [2]  Relation
 *    Col D [3]  RPhoto
 *    Col E [4]  REmailID        ← proxy email
 *    Col F [5]  RPhonenumber
 *    Col G [6]  (unused by script)
 *    Col H [7]  RIsWhatsapp
 * ═══════════════════════════════════════════════════════════════════
 */

// ─── CONFIG ────────────────────────────────────────────────────────
var SS_ID              = '1oXmvMIfQDm51KoHHtkhg8KgK1Qi5mwFYSBdrwir85CA';
var RECEIPTS_FOLDER    = 'SCRWA_Receipts';
var RECEIPTS_LOG_SHEET = 'Receipts_Log';
var SOCIETY_NAME       = 'Senior Citizens Residential Welfare Association (SCRWA)';
var SOCIETY_SHORT      = 'SCRWA, Vampuguda';
var SOCIETY_REGD       = 'Regd. No: 2240/2006';
var SOCIETY_EMAIL      = 'scwa.vampuguda@gmail.com';

// ─── doPost — AppSheet webhook entry point ─────────────────────────
function doGet(e) {
  try {
    var action    = (e.parameter.action    || '').trim();
    var receiptNo = (e.parameter.receiptNo || '').trim();

    // AppSheet action: ?action=generateReceipt&receiptNo=XXXXXX
    if (action === 'generateReceipt' && receiptNo) {
      var result = generateConsolidatedReceipt(receiptNo);
      return ContentService
        .createTextOutput(JSON.stringify(result))
        .setMimeType(ContentService.MimeType.JSON);
    }

    // Health check: ?action=ping
    if (action === 'ping') {
      return ContentService
        .createTextOutput(JSON.stringify({ success: true, message: 'SCRWA Receipt API is live' }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    return ContentService
      .createTextOutput(JSON.stringify({ success: false, message: 'Missing action or receiptNo' }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ success: false, message: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function doPost(e) {
  try {
    var payload   = JSON.parse(e.postData.contents);
    var action    = payload.action    || '';
    var receiptNo = String(payload.receiptNo || '').trim();
    if (action === 'generateReceipt' && receiptNo) {
      return ContentService
        .createTextOutput(JSON.stringify(generateConsolidatedReceipt(receiptNo)))
        .setMimeType(ContentService.MimeType.JSON);
    }
    return ContentService
      .createTextOutput(JSON.stringify({ success: false, message: 'Missing action or receiptNo' }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ success: false, message: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// ═══════════════════════════════════════════════════════════════════
//  MAIN ORCHESTRATOR
// ═══════════════════════════════════════════════════════════════════
function generateConsolidatedReceipt(receiptNo) {
  var ss = SpreadsheetApp.openById(SS_ID);
  var tz = Session.getScriptTimeZone();

  // 1. Bank row — must exist and be Reconciled
  var bankRow = getBankRow(ss, receiptNo);
  if (!bankRow)
    return { success: false, message: 'ReceiptNo not found in BankDetails: ' + receiptNo };
  if (!bankRow.reconciled)
    return { success: false, message: 'Not yet Reconciled: ' + receiptNo };

  // 2. Transaction rows for this ReceiptNo
  var txRows = getTransactionRows(ss, receiptNo);
  if (!txRows.length)
    return { success: false, message: 'No TransactionDetails rows for: ' + receiptNo };

  // 3. InternalOrder lookup map  { MOMEN01 → 'MAINTENANCE CHARGES', ... }
  var ioMap = getInternalOrderMap(ss);

  // 4. Member data per PropertyID
  var memberMap = {};
  txRows.forEach(function(tx) {
    if (tx.propertyId && !memberMap[tx.propertyId])
      memberMap[tx.propertyId] = getMemberData(ss, tx.propertyId);
  });

  // 5. Invoice breakup per BillID (grouped by tx row)
  txRows.forEach(function(tx) {
    tx.ioName   = ioMap[tx.internalOrder] || tx.internalOrder || '—';
    tx.invoices = tx.billId
      ? getInvoicesByBillIds(ss, tx.billId.split(',').map(function(b){ return b.trim(); }).filter(Boolean))
      : [];
  });

  // 6. Build PDF blob
  Logger.log('Step 6: building PDF...');
  var pdfBlob;
  try {
    pdfBlob = buildPdf(receiptNo, bankRow, txRows, memberMap, ioMap, tz);
    Logger.log('Step 6: PDF built OK');
  } catch(pdfErr) {
    Logger.log('Step 6 FAILED: ' + pdfErr.toString());
    return { success: false, message: 'PDF build failed: ' + pdfErr.toString() };
  }

  // 7. Save to Drive
  Logger.log('Step 7: saving to Drive...');
  var folder   = getOrCreateFolder(bankRow.date);
  var fileName = 'RCPT-' + receiptNo.replace(/[\/\\:*?"<>|]/g,'') + '.pdf';
  var iter     = folder.getFilesByName(fileName);
  if (iter.hasNext()) iter.next().setTrashed(true);
  var file     = folder.createFile(pdfBlob.setName(fileName));
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  var pdfUrl   = 'https://drive.google.com/file/d/' + file.getId() + '/view';

  // 8. Write URL to BankDetails Col J + TransactionDetails Col P
  writePdfUrl(ss, bankRow.sheetRow, txRows, pdfUrl);

  // 9. Duplicate email guard — check Col J EmailSent
  var bSheet       = ss.getSheetByName('BankDetails');
  var emailSentVal = bSheet ? String(bSheet.getRange(bankRow.sheetRow, 10).getValue()).trim() : '';

  if (emailSentVal) {
    // Already sent — return info, skip email
    logReceipt(ss, receiptNo, bankRow, txRows, memberMap, fileName, pdfUrl, []);
    return {
      success:    true,
      receiptNo:  receiptNo,
      pdfUrl:     pdfUrl,
      fileName:   fileName,
      emailSent:  false,
      message:    'PDF already generated. Email was already sent on ' + emailSentVal + '. No duplicate sent.'
    };
  }

  // 10. Send email (first time only)
  Logger.log('Step 10: sending email...');
  var emailResults = [];
  try {
    emailResults = sendEmails(receiptNo, bankRow, txRows, memberMap, pdfBlob, pdfUrl, fileName);
    Logger.log('Step 10: email sent OK');
  } catch(mailErr) {
    Logger.log('Step 10 WARNING: email failed: ' + mailErr.toString());
  }

  // 11. Write EmailSent timestamp to Col J
  var tz        = Session.getScriptTimeZone();
  var sentStamp = Utilities.formatDate(new Date(), tz, 'dd-MMM-yyyy HH:mm');
  writePdfUrl(ss, bankRow.sheetRow, txRows, pdfUrl, sentStamp);

  // 12. Log
  logReceipt(ss, receiptNo, bankRow, txRows, memberMap, fileName, pdfUrl, emailResults);

  return {
    success:      true,
    receiptNo:    receiptNo,
    pdfUrl:       pdfUrl,
    fileName:     fileName,
    txCount:      txRows.length,
    properties:   txRows.map(function(t){ return t.propertyId; }),
    totalAmount:  bankRow.amount,
    emailSent:    emailResults.length > 0,
    emailCount:   emailResults.length,
    message:      'PDF generated and email sent to ' + emailResults.length + ' recipient(s).'
  };
}

// ═══════════════════════════════════════════════════════════════════
//  DATA READERS
// ═══════════════════════════════════════════════════════════════════

// ─── BankDetails ──────────────────────────────────────────────────
function getBankRow(ss, receiptNo) {
  var sheet = ss.getSheetByName('BankDetails');
  if (!sheet) return null;
  var data  = sheet.getDataRange().getValues();
  var tz    = Session.getScriptTimeZone();
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][2]).trim() !== receiptNo) continue;
    var d = data[i][0];
    var dateStr = '', displayDate = '';
    if (d instanceof Date) {
      dateStr     = Utilities.formatDate(d, tz, 'yyyy-MM-dd');
      displayDate = Utilities.formatDate(d, tz, 'dd MMM yyyy');
    }
    var deposit    = Math.abs(parseFloat(String(data[i][5]).replace(/[₹,]/g,'')) || 0);
    var withdrawal = Math.abs(parseFloat(String(data[i][4]).replace(/[₹,]/g,'')) || 0);
    return {
      sheetRow:    i + 1,
      date:        dateStr,
      displayDate: displayDate,
      narration:   String(data[i][1] || '').trim(),
      receiptNo:   String(data[i][2] || '').trim(),
      deposit:     deposit,
      withdrawal:  withdrawal,
      amount:      deposit || withdrawal,
      reconciled:  String(data[i][7]).trim().toUpperCase() === 'TRUE'
    };
  }
  return null;
}

// ─── TransactionDetails ───────────────────────────────────────────
function getTransactionRows(ss, receiptNo) {
  var sheet = ss.getSheetByName('TransactionDetails');
  if (!sheet) return [];
  var data   = sheet.getDataRange().getValues();
  var tz     = Session.getScriptTimeZone();
  var result = [];
  for (var i = 2; i < data.length; i++) {       // data starts row 3 (index 2)
    if (String(data[i][1]).trim() !== receiptNo) continue;
    var d = data[i][2];
    var dateStr = '', displayDate = '';
    if (d instanceof Date) {
      dateStr     = Utilities.formatDate(d, tz, 'yyyy-MM-dd');
      displayDate = Utilities.formatDate(d, tz, 'dd MMM yyyy');
    } else if (d) {
      dateStr = displayDate = String(d).substring(0, 10);
    }
    var fyRaw = String(data[i][14] || '').trim();
    if (!fyRaw && dateStr) {
      var mo = parseInt(dateStr.substring(5,7), 10);
      var yr = parseInt(dateStr.substring(0,4), 10);
      fyRaw  = mo >= 4 ? yr+'-'+(yr+1) : (yr-1)+'-'+yr;
    }
    result.push({
      sheetRow:       i + 1,
      txId:           String(data[i][0]  || '').trim(),
      receiptNo:      String(data[i][1]  || '').trim(),
      date:           dateStr,
      displayDate:    displayDate,
      type:           String(data[i][3]  || '').trim(),
      mode:           String(data[i][4]  || '').trim().replace(/^[^\w\s₹(]+\s*/,''),
      accountHead:    String(data[i][5]  || '').trim().replace(/^[^\w\s]+\s*/,''),
      accountSubHead: String(data[i][6]  || '').trim().replace(/^[^\w\s]+\s*/,''),
      amount:         Math.abs(parseFloat(data[i][7]) || 0),
      propertyId:     String(data[i][8]  || '').trim().replace(/\.0$/,''),
      internalOrder:  String(data[i][9]  || '').trim(),
      billId:         String(data[i][10] || '').trim(),
      remarks:        String(data[i][11] || '').trim(),
      notes:          String(data[i][12] || '').trim(),
      fyYear:         fyRaw,
      invoices:       [],
      ioName:         ''
    });
  }
  return result;
}

// ─── InternalOrder lookup map ─────────────────────────────────────
function getInternalOrderMap(ss) {
  var sheet = ss.getSheetByName('InternalOrder');
  if (!sheet) return {};
  var data  = sheet.getDataRange().getValues();
  var map   = {};
  for (var i = 1; i < data.length; i++) {
    var code = String(data[i][0] || '').trim();
    var name = String(data[i][1] || '').trim();
    if (code) map[code] = name;
  }
  return map;
}

// ─── Invoice breakup by BillID list ──────────────────────────────
function getInvoicesByBillIds(ss, billIds) {
  var sheet = ss.getSheetByName('Invoice');
  if (!sheet || !billIds || !billIds.length) return [];
  var data  = sheet.getDataRange().getValues();
  var tz    = Session.getScriptTimeZone();
  var idSet = {};
  billIds.forEach(function(b){ idSet[b] = true; });
  var found = [];
  // Row 0 = label row, Row 1 = header row, data from row 2 (index 2)
  for (var i = 2; i < data.length; i++) {
    var billId = String(data[i][0] || '').trim();
    if (!idSet[billId]) continue;
    var period = '';
    if (data[i][4] instanceof Date) {
      period = Utilities.formatDate(data[i][4], tz, 'MMM yyyy');
    } else if (data[i][4]) {
      var raw = String(data[i][4]).trim();
      period  = raw.length >= 7 ? raw.substring(0, 7) : raw;
    }
    var billDate = '';
    if (data[i][3] instanceof Date) {
      billDate = Utilities.formatDate(data[i][3], tz, 'dd-MMM-yy');
    } else if (data[i][3]) {
      billDate = String(data[i][3]).trim().substring(0,11);
    }
    found.push({
      billId:    billId,
      billDate:  billDate,
      period:    period,
      billAmt:   Math.abs(parseFloat(data[i][6]) || 0),
      paidAmt:   Math.abs(parseFloat(data[i][7]) || 0),
      balance:   parseFloat(data[i][8]) || 0,
      status:    String(data[i][9] || '').trim().replace(/^[^\w\s✅⚠️]+\s*/,'')
    });
  }
  return found;
}

// ─── Member data ──────────────────────────────────────────────────
function getMemberData(ss, propertyId) {
  if (!propertyId) return null;
  var m = {
    propertyId: propertyId, plotNo: '', locationName: '', ownerType: 'Single',
    name: '', name2: '', fullName: '', email: '', status: '',
    isProxy: false, proxyName: '', proxyEmail: ''
  };
  var owSheet = ss.getSheetByName('OwnerDetails');
  if (owSheet) {
    var owData = owSheet.getDataRange().getValues();
    for (var i = 1; i < owData.length; i++) {
      if (String(owData[i][0]).trim().replace(/\.0$/,'') !== propertyId) continue;
      m.plotNo       = String(owData[i][1]  || '').trim().replace(/\.0$/,'');   // Col B propertylocation
      m.ownerType    = String(owData[i][3]  || 'Single').trim();
      m.name         = String(owData[i][4]  || '').trim();
      m.name2        = String(owData[i][5]  || '').trim();
      m.locationName = String(owData[i][7]  || '').trim();                      // Col H Lane No
      m.status       = String(owData[i][9]  || '').trim();
      m.email        = String(owData[i][10] || '').trim();                      // Col K EmailID
      var ipr        = String(owData[i][14] || '').trim().toLowerCase();
      m.isProxy      = ipr === 'yes' || ipr === 'y' || ipr === 'true';
      m.fullName     = m.name + (m.name2 ? ' & ' + m.name2 : '');
      break;
    }
  }
  if (!m.name) return null;
  if (m.isProxy) {
    var prSheet = ss.getSheetByName('ProxyDetails');
    if (prSheet) {
      var prData = prSheet.getDataRange().getValues();
      for (var j = 2; j < prData.length; j++) {
        if (String(prData[j][0]).trim().replace(/\.0$/,'') !== propertyId) continue;
        m.proxyName  = String(prData[j][1] || '').trim();
        m.proxyEmail = String(prData[j][4] || '').trim();   // Col E REmailID
        break;
      }
    }
  }
  return m;
}

// ─── Write PDF URL to sheets ──────────────────────────────────────
function writePdfUrl(ss, bankSheetRow, txRows, pdfUrl, emailSentStamp) {
  var bSheet = ss.getSheetByName('BankDetails');
  if (bSheet) {
    bSheet.getRange(bankSheetRow, 9).setValue(pdfUrl);               // Col I ReceiptPDF
    if (emailSentStamp) {
      bSheet.getRange(bankSheetRow, 10).setValue(emailSentStamp);    // Col J EmailSent
    }
  }
  var tSheet = ss.getSheetByName('TransactionDetails');
  if (tSheet) txRows.forEach(function(tx){
    tSheet.getRange(tx.sheetRow, 16).setValue(pdfUrl);               // Col P
  });
}

// ─── Drive folder ─────────────────────────────────────────────────
function getOrCreateFolder(dateStr) {
  var root  = DriveApp.getRootFolder();
  var mf    = root.getFoldersByName(RECEIPTS_FOLDER);
  var main  = mf.hasNext() ? mf.next() : root.createFolder(RECEIPTS_FOLDER);
  var key   = dateStr
    ? dateStr.substring(0, 7)
    : Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM');
  var sf    = main.getFoldersByName(key);
  return sf.hasNext() ? sf.next() : main.createFolder(key);
}

// ═══════════════════════════════════════════════════════════════════
//  EMAIL
// ═══════════════════════════════════════════════════════════════════
function sendEmails(receiptNo, bankRow, txRows, memberMap, pdfBlob, pdfUrl, fileName) {
  var results  = [];

  // ── TEST MODE: set to email to redirect all mail, "" for live ──
  var TEST_EMAIL = '';
  // ────────────────────────────────────────────────────────────

  // Build ONE email for the entire receipt:
  //   To:  owner email (dedupe across all properties)
  //   CC:  all unique proxy emails (dedupe, exclude owner)
  //   Body: all properties listed in one email
  var toSet  = {};   // unique owner emails
  var ccSet  = {};   // unique proxy emails
  var toName = '';

  txRows.forEach(function(tx) {
    var m = memberMap[tx.propertyId];
    if (!m) return;
    var ownerEmail = String(m.email      || '').trim().toLowerCase();
    var proxyEmail = String(m.proxyEmail || '').trim().toLowerCase();
    if (ownerEmail && ownerEmail.indexOf('@') > 0) {
      toSet[ownerEmail] = m.fullName || ownerEmail;
      if (!toName) toName = m.fullName || ownerEmail;
    }
    if (proxyEmail && proxyEmail.indexOf('@') > 0 && !toSet[proxyEmail]) {
      ccSet[proxyEmail] = m.proxyName || proxyEmail;
    }
  });

  var toAddrs = Object.keys(toSet);
  var ccAddrs = Object.keys(ccSet).filter(function(a){ return !toSet[a]; }); // exclude if already in To

  var isMulti = txRows.length > 1;

  // Build single combined entries list (all txRows)
  var allEntries = txRows.map(function(tx) {
    return { tx: tx, member: memberMap[tx.propertyId] || {} };
  });

  // Wrap in single-iteration array so existing forEach body works unchanged
  [{ toAddr: toAddrs.join(','), toName: toName, ccAddrs: ccAddrs, entries: allEntries }]
  .forEach(function(info) {
    var addr = toAddrs[0] || '';
    var propRowsHtml = info.entries.map(function(e) {
      var tx = e.tx;
      var mm = memberMap[tx.propertyId] || {};
      var invRows = '';
      if (tx.invoices && tx.invoices.length > 0) {
        invRows = tx.invoices.map(function(inv) {
          return '<tr style="font-size:9px">' +
            '<td style="padding:2px 4px;color:#475569;border-bottom:1px solid #f1f5f9">' + inv.billId + '</td>' +
            '<td style="padding:4px 8px;border-bottom:1px solid #f1f5f9">' + inv.period + '</td>' +
            '<td style="padding:2px 4px;text-align:right;border-bottom:1px solid #f1f5f9">₹' + fINR(inv.billAmt) + '</td>' +
            '<td style="padding:4px 8px;text-align:right;border-bottom:1px solid #f1f5f9;color:#15803d">₹' + fINR(inv.paidAmt) + '</td>' +
            '<td style="padding:4px 8px;text-align:right;border-bottom:1px solid #f1f5f9;color:' +
              (inv.balance > 0 ? '#dc2626' : '#15803d') + '">' +
              (inv.balance > 0 ? '₹'+fINR(inv.balance) : '₹0') + '</td>' +
            '<td style="padding:4px 8px;border-bottom:1px solid #f1f5f9">' + inv.status + '</td>' +
            '</tr>';
        }).join('');
      }

      return '<tr>' +
        '<td colspan="6" style="padding:0;padding-bottom:12px">' +

        '<table style="width:100%;border-collapse:collapse;margin-bottom:0">' +

        // ── Row 1: Owner name only ────────────────────────────────


        // ── Row 2: Owner name + Purpose / Amount ─────────────────
        '<tr style="background:#1e4d8c;color:#fff">' +
        '<td style="padding:8px 12px">' +
          '<div style="font-size:13px;font-weight:700">' + (mm.fullName || '—') + '</div>' +
          '<div style="font-size:12px;margin-top:3px;font-weight:600;opacity:.95">' +
            tx.ioName +
            ' <span style="font-weight:400;font-size:10px;opacity:.75">(' + tx.internalOrder + ')</span>' +
          '</div>' +
        '</td>' +
        '<td style="padding:8px 12px;text-align:right">' +
          '<div style="font-size:18px;font-weight:700">₹' + fINR(tx.amount) + '</div>' +
                  '</td>' +
        '</tr>' +

        '</table>' +
        // Invoice breakup sub-table
        (invRows
          ? '<table style="width:100%;border-collapse:collapse;margin:0 0 10px 20px">' +
            '<tr style="background:#e8f0fe;font-size:10px;color:#475569">' +
            '<th style="padding:4px 8px;text-align:left;font-weight:600">Bill ID</th>' +
            '<th style="padding:4px 8px;text-align:left;font-weight:600">Period</th>' +
            '<th style="padding:4px 8px;text-align:right;font-weight:600">Bill Amt</th>' +
            '<th style="padding:4px 8px;text-align:right;font-weight:600">Paid</th>' +
            '<th style="padding:4px 8px;text-align:right;font-weight:600">Balance</th>' +
            '<th style="padding:4px 8px;text-align:left;font-weight:600">Status</th>' +
            '</tr>' + invRows + '</table>'
          : '<p style="font-size:11px;color:#94a3b8;margin:0 0 10px 20px">No invoice linked — ' +
            (tx.notes || tx.remarks || 'direct payment') + '</p>') +
        '</td></tr>';
    }).join('');

    var subject = 'Payment Receipt No. ' + receiptNo +
                  ' - Rs.' + fINR(bankRow.amount) +
                  (isMulti ? ' (' + txRows.length + ' Properties)' : '') +
                  ' - ' + SOCIETY_SHORT;

    // Email body — clean narrative, receipt no. once as clickable link
    var receiptLink = '<a href="' + pdfUrl + '" style="color:#1155cc;text-decoration:underline">' + receiptNo + '</a>';
    var portalLink  = '<a href="https://scwavampuguda-tech.github.io/society-dashboard/Society_Portal.html" style="color:#1e4d8c">Outstanding Report</a>';
    var body =
      '<div style="font-family:Arial,sans-serif;font-size:14px;color:#1a1a2e;line-height:1.8">' +
      '<p>Dear ' + (info.toName || 'Member') + ',</p>' +
      '<p>Thank you for your contribution to <strong>' + SOCIETY_SHORT + '</strong>. ' +
      'Your timely payments help us maintain and improve the quality of life in our community. ' +
      'We sincerely appreciate your continued support and trust in the Management Committee.</p>' +
      '<p>Your payment of <strong>Rs.' + fINR(bankRow.amount) + '</strong> dated ' + bankRow.displayDate + ' ' +
      'has been received and reconciled. Receipt No. #' + receiptLink + ' is attached to this email ' +
      'and also available on Google Drive via the same link.</p>' +
      '<p>To view your current outstanding dues, please check your ' + portalLink + '.</p>' +
      '<p>For any queries, please quote the receipt number in your communication with the Society office.</p>' +
      '<p>Regards,<br>' +
      'SCRWA Management Committee<br>' +
      SOCIETY_SHORT + ' | ' + SOCIETY_REGD + '<br>' +
      SOCIETY_EMAIL + '</p>' +
      '<p style="font-size:12px;color:#475569;margin-top:8px"><a href="https://www.facebook.com/share/18VXdkVAQn/" style="display:inline-block;background:#1877f2;color:#ffffff;font-size:12px;font-weight:600;padding:4px 12px;border-radius:4px;text-decoration:none">f&nbsp;&nbsp;Follow us on Facebook</a></p>' +
      '<hr style="border:none;border-top:1px solid #e2e8f0;margin:16px 0">' +
      '<p style="font-size:10px;color:#94a3b8;line-height:1.6">&#x2014;&#x2014;&#x2014;&#x2014;&#x2014;&#x2014;&#x2014;&#x2014;&#x2014;&#x2014;&#x2014;&#x2014;&#x2014;&#x2014;&#x2014;&#x2014;&#x2014;&#x2014;&#x2014;&#x2014;<br>This e-Mail may contain proprietary and confidential information and is sent for the intended recipient(s) only. If, by an addressing or transmission error, this mail has been misdirected to you, you are requested to delete this mail immediately. You are also hereby notified that any use, any form of reproduction, dissemination, copying, disclosure, modification, distribution and/or publication of this e-mail message, contents or its attachment(s) other than by its intended recipient(s) is strictly prohibited. Any opinions expressed in this email are those of the individual and not necessarily of the organization. Before opening attachment(s), please scan for viruses.<br>&#x2014;&#x2014;&#x2014;&#x2014;&#x2014;&#x2014;&#x2014;&#x2014;&#x2014;&#x2014;&#x2014;&#x2014;&#x2014;&#x2014;&#x2014;&#x2014;&#x2014;&#x2014;&#x2014;&#x2014;</p>' +
      '</div>';





    try {
      var sendTo   = TEST_EMAIL || info.toAddr;
      var ccStr    = info.ccAddrs && info.ccAddrs.length ? info.ccAddrs.join(',') : '';
      var sendSubj = TEST_EMAIL
        ? '[TEST to: ' + info.toAddr + (ccStr ? ', CC: ' + ccStr : '') + '] ' + subject
        : subject;
      var mailOpts = {
        htmlBody:    body,
        attachments: [pdfBlob.setName(fileName)],
        name:        SOCIETY_SHORT,
        replyTo:     SOCIETY_EMAIL
      };
      if (!TEST_EMAIL && ccStr) mailOpts.cc = ccStr;
      GmailApp.sendEmail(sendTo, sendSubj, 'Please enable HTML to view this email.', mailOpts);
      var logTo = info.toAddr + (ccStr ? ' (CC: ' + ccStr + ')' : '');
      results.push({ to: logTo, name: info.toName, sent: true });
      Logger.log('✅ Email → To:' + info.toAddr + (ccStr ? ' | CC:' + ccStr : ''));
    } catch(err) {
      results.push({ to: info.toAddr, name: info.toName, sent: false, error: err.toString() });
      Logger.log('❌ Email failed → ' + addr + ' | ' + err.toString());
    }
  });

  return results;
}

// ═══════════════════════════════════════════════════════════════════
//  BUILD PDF
// ═══════════════════════════════════════════════════════════════════
function buildPdf(receiptNo, bankRow, txRows, memberMap, ioMap, tz) {
  var isMulti  = txRows.length > 1;
  var totalAmt = bankRow.amount;
  var fyYear   = txRows.length > 0 ? txRows[0].fyYear : '';
  var mode     = txRows.length > 0 ? txRows[0].mode   : 'UPI / Online';

  // ── Group txRows by owner+IO for merged blocks ─────────────────
  var groups = [];
  var groupMap = {};
  txRows.forEach(function(tx) {
    var m   = memberMap[tx.propertyId] || {};
    var key = (m.fullName || '') + '||' + (tx.internalOrder || '');
    if (!groupMap[key]) {
      groupMap[key] = { key: key, txList: [], m: m, ioLabel: tx.ioName || tx.internalOrder || '—', internalOrder: tx.internalOrder };
      groups.push(groupMap[key]);
    }
    groupMap[key].txList.push(tx);
  });

  // ── Per-group blocks ──────────────────────────────────────────
  var propBlocks = groups.map(function(grp, idx) {
    var txList = grp.txList;
    var m      = grp.m;
    var ioLabel = grp.ioLabel;
    var isMerged = txRows.length > 1;  // true if receipt has >1 property row
    var bg     = idx % 2 === 0 ? '#ffffff' : '#f8faff';

    // ── Merged invoice table (multiple properties, same owner+IO) ─
    var invRows = '';
    var invSubtotal = { bill: 0, paid: 0, bal: 0 };

    txList.forEach(function(tx) {
      var txMember = memberMap[tx.propertyId] || {};
      var propPrefix = isMerged
        ? '<td style="padding:2px 4px;font-size:9px;font-weight:700;color:#0d2137;border-bottom:1px solid #f1f5f9">' + tx.propertyId + '</td>' +
          '<td style="padding:2px 4px;font-size:9px;color:#475569;border-bottom:1px solid #f1f5f9">' + (txMember.plotNo || '-') + '</td>'
        : '';

      if (tx.invoices && tx.invoices.length > 0) {
        tx.invoices.forEach(function(inv) {
          invSubtotal.bill += inv.billAmt;
          invSubtotal.paid += inv.paidAmt;
          invSubtotal.bal  += inv.balance;
          invRows += '<tr>' +
            propPrefix +
            '<td style="padding:2px 4px;font-size:10px;color:#1a3c5e;font-weight:600;border-bottom:1px solid #f1f5f9">' + inv.billId + '</td>' +
            '<td style="padding:2px 4px;font-size:10px;color:#475569;border-bottom:1px solid #f1f5f9">' + (inv.billDate || '-') + '</td>' +
            '<td style="padding:2px 4px;font-size:10px;border-bottom:1px solid #f1f5f9">' + inv.period + '</td>' +
            '<td style="padding:2px 4px;font-size:11px;text-align:right;border-bottom:1px solid #f1f5f9">&#8377;' + fINR(inv.billAmt) + '</td>' +
            '<td style="padding:4px 8px;font-size:11px;text-align:right;border-bottom:1px solid #f1f5f9;color:#15803d">&#8377;' + fINR(inv.paidAmt) + '</td>' +
            '<td style="padding:4px 8px;font-size:11px;text-align:right;border-bottom:1px solid #f1f5f9;color:' +
              (inv.balance > 0 ? '#dc2626' : '#64748b') + '">' +
              (inv.balance > 0 ? '&#8377;'+fINR(inv.balance) : '&#8377;0') + '</td>' +
            '<td style="padding:2px 4px;font-size:10px;border-bottom:1px solid #f1f5f9">' + inv.status + '</td>' +
            '</tr>';
        });
      } else {
        // No invoices — show one row with direct payment note
        invRows += '<tr>' +
          propPrefix +
          '<td colspan="7" style="padding:4px 8px;font-size:11px;color:#94a3b8;border-bottom:1px solid #f1f5f9">' +
          (tx.notes || tx.remarks || 'Direct payment — no invoice linked') + '</td></tr>';
      }
    });

    // Subtotal row (if multiple invoices total)
    var totalInvoices = txList.reduce(function(s,t){ return s + (t.invoices ? t.invoices.length : 0); }, 0);
    if (totalInvoices > 1) {
      invRows += '<tr style="background:#f0fdf4;font-weight:700">' +
        (isMerged ? '<td colspan="2" style="padding:4px 8px;font-size:11px"></td>' : '') +
        '<td colspan="3" style="padding:4px 8px;font-size:11px">Sub-total</td>' +
        '<td style="padding:4px 8px;font-size:11px;text-align:right">&#8377;' + fINR(invSubtotal.bill) + '</td>' +
        '<td style="padding:4px 8px;font-size:11px;text-align:right;color:#15803d">&#8377;' + fINR(invSubtotal.paid) + '</td>' +
        '<td style="padding:4px 8px;font-size:11px;text-align:right;color:' +
          (invSubtotal.bal > 0 ? '#dc2626' : '#64748b') + '">' +
          (invSubtotal.bal > 0 ? '&#8377;'+fINR(invSubtotal.bal) : '&#8377;0') + '</td>' +
        '<td></td></tr>';
    }

    // Merged amount = sum of all tx in group
    var groupAmt = txList.reduce(function(s, t){ return s + (t.amount || 0); }, 0);

    var jointBadge = m.ownerType === '👥 Joint' || m.ownerType === 'Joint'
      ? ' <span style="background:#dbeafe;color:#1e40af;font-size:9px;padding:1px 5px;border-radius:6px">Joint</span>' : '';
    var proxyNote = (m.isProxy && m.proxyName)
      ? ' <span style="font-size:10px;color:#475569">| Represented By: ' + m.proxyName + '</span>' : '';

    // Title bar
    return '<div style="border:1px solid #d1dce8;border-radius:6px;margin-bottom:8px;background:' + bg + ';overflow:hidden">' +

      // ── Title bar: owner name ───────────────────────────────
      '<div style="background:#0d2137;color:#ffffff;padding:6px 14px">' +
      '<div style="font-size:14px;font-weight:700;color:#ffffff;letter-spacing:.2px">' +
        (m.fullName || '-') + jointBadge +
      '</div>' +
      proxyNote +
      '</div>' +

      // ── Owner + IO + Amount bar ─────────────────────────────────
      '<div style="background:#f0f4f8;color:#1a1a2e;padding:5px 14px;border-bottom:1px solid #d1dce8;' +
        'display:flex;justify-content:space-between;align-items:center">' +
      '<div style="font-size:12px;font-weight:700;color:#1a1a2e">' +
        ioLabel +
        ' <span style="font-weight:400;color:#64748b;font-size:10px">(' + grp.internalOrder + ')</span>' +
      '</div>' +
      '<div style="font-size:20px;font-weight:700;color:#15803d">&#8377;' + fINR(groupAmt) + '</div>' +
      '</div>' +

      // ── Invoice table ───────────────────────────────────────────
      '<div style="padding:4px 8px">' +
      '<table style="width:100%;border-collapse:collapse;table-layout:fixed;font-size:9px">' +
      // Col widths: PropID PlotNo BillID BillDate Period BillAmt Paid Balance Status
      (isMerged
        ? '<colgroup>' +
            '<col style="width:6%"/>'  +  // Prop ID
            '<col style="width:6%"/>'  +  // Plot No
            '<col style="width:22%"/>' +  // Bill ID
            '<col style="width:9%"/>'  +  // Bill Date
            '<col style="width:9%"/>'  +  // Period
            '<col style="width:10%"/>' +  // Bill Amt
            '<col style="width:10%"/>' +  // Paid
            '<col style="width:10%"/>' +  // Balance
            '<col style="width:9%"/>'  +  // Status
          '</colgroup>'
        : '<colgroup>' +
            '<col style="width:28%"/>' +  // Bill ID
            '<col style="width:11%"/>' +  // Bill Date
            '<col style="width:11%"/>' +  // Period
            '<col style="width:12%"/>' +  // Bill Amt
            '<col style="width:12%"/>' +  // Paid
            '<col style="width:12%"/>' +  // Balance
            '<col style="width:14%"/>' +  // Status
          '</colgroup>'
      ) +
      '<tr style="background:#e8f0fe">' +
      (isMerged
        ? '<th style="padding:3px 4px;text-align:left;font-size:9px;font-weight:700;color:#1a3c5e">Prop ID</th>' +
          '<th style="padding:3px 4px;text-align:left;font-size:9px;font-weight:700;color:#1a3c5e">Plot No</th>'
        : '') +
      '<th style="padding:3px 4px;text-align:left;font-size:9px;font-weight:700;color:#1a3c5e">Bill ID</th>' +
      '<th style="padding:3px 4px;text-align:left;font-size:9px;font-weight:700;color:#1a3c5e">Bill Date</th>' +
      '<th style="padding:3px 4px;text-align:left;font-size:9px;font-weight:700;color:#1a3c5e">Period</th>' +
      '<th style="padding:3px 4px;text-align:right;font-size:9px;font-weight:700;color:#1a3c5e">Bill Amt</th>' +
      '<th style="padding:3px 4px;text-align:right;font-size:9px;font-weight:700;color:#1a3c5e">Paid</th>' +
      '<th style="padding:3px 4px;text-align:right;font-size:9px;font-weight:700;color:#1a3c5e">Balance</th>' +
      '<th style="padding:3px 4px;text-align:left;font-size:9px;font-weight:700;color:#1a3c5e">Status</th>' +
      '</tr>' + invRows + '</table></div>' +

      '</div>';
  }).join('');

  // dummy to satisfy old variable references (tx, idx used above in groups loop)
  var _unused = null;
  if (false) { var tx = {}; var idx = 0; var m = {}; }


  // ── Grand total row (multi-property only) ────────────────────────
  var grandTotal = isMulti
    ? '<div style="background:linear-gradient(135deg,#f0fdf4,#dcfce7);border:2px solid #16a34a;' +
      'border-radius:8px;padding:10px 16px;display:flex;justify-content:space-between;' +
      'align-items:center;margin-bottom:14px">' +
      '<span style="font-size:13px;font-weight:700;color:#166534">Total — ' +
        txRows.length + ' Properties</span>' +
      '<span style="font-size:20px;font-weight:700;color:#15803d">₹' + fINR(totalAmt) + '</span>' +
      '</div>'
    : '';

  // ── Full HTML ────────────────────────────────────────────────────
  var html =
    '<!DOCTYPE html><html><head><meta charset="UTF-8"><style>' +
    '@import url(https://fonts.googleapis.com/css2?family=Roboto:wght@300;400;600;700&display=swap);' +
    '@page{size:A4 portrait;margin:10mm}' +
    'body{font-family:Roboto,Arial,sans-serif;margin:0;padding:0;color:#1a1a2e;font-size:11px}' +
    '.page{width:100%;max-width:750px;margin:0 auto;padding:0}' +
    'table{border-collapse:collapse}' +
    '</style></head><body><div class="page">' +

    // ── PAGE HEADER ─────────────────────────────────────────────
    '<div style="background:#0d2137;border-radius:10px 10px 0 0;padding:0;overflow:hidden">' +

    // Top accent bar
    '<div style="background:#c8a951;height:5px;width:100%"></div>' +

    // Header content: logo left, society name center, RECEIPT badge right
    '<table style="width:100%;background:#0d2137;border-collapse:collapse"><tr>' +

    // Logo cell
    '<td style="width:80px;padding:10px 10px 10px 14px;vertical-align:middle">' +
    '<img src="data:image/png;base64,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" ' +
    'width="80" height="80" alt="SCRWA"/>' +
    '</td>' +

    // Society name cell
    '<td style="text-align:center;padding:10px 8px;vertical-align:middle">' +
    '<div style="font-size:15px;font-weight:700;color:#800000;white-space:nowrap">' + SOCIETY_NAME + '</div>' +
    '<div style="font-size:9px;color:#c8a951;margin-top:3px;letter-spacing:.8px;text-transform:uppercase">' +
      SOCIETY_REGD + ' &nbsp;·&nbsp; Vampuguda, Hyderabad' +
    '</div>' +
    '<div style="font-size:9px;color:#93b4cc;margin-top:1px">' + SOCIETY_EMAIL + '</div>' +
    '</td>' +

    // RECEIPT badge cell
    '<td style="width:90px;padding:10px 14px 10px 8px;vertical-align:middle;text-align:right">' +
    '<div style="background:#c8a951;color:#1a3c5e;padding:5px 12px;border-radius:4px;' +
      'font-weight:700;font-size:13px;letter-spacing:1.5px;display:inline-block">RECEIPT</div>' +
    '</td>' +
    '</tr></table>' +

    // Bottom accent bar
    '<div style="background:#c8a951;height:2px;width:100%"></div>' +
    '</div>' +

    // ── BODY ────────────────────────────────────────────────────
    '<div style="border:1px solid #d1dce8;border-top:none;border-radius:0 0 10px 10px;' +
      'padding:10px 14px;background:#fff">' +

    // Receipt meta: 3 columns
    '<table style="width:100%;border-collapse:collapse;margin-bottom:8px;border:1px solid #d1dce8">' +
    '<tr>' +
    '<td style="width:33.3%;padding:5px 12px;border-right:1px solid #d1dce8;vertical-align:middle">' + metaBox('Receipt No', receiptNo) + '</td>' +
    '<td style="width:33.3%;padding:5px 12px;border-right:1px solid #d1dce8;vertical-align:middle">' + metaBox('Date', bankRow.displayDate) + '</td>' +
    '<td style="width:33.3%;padding:5px 12px;vertical-align:middle">' + metaBox('Payment Mode', mode) + '</td>' +
    '</tr></table>' +

    // Narration row
    '<div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;' +
      'padding:5px 12px;font-size:11px;margin-bottom:8px;color:#475569">' +
    '<span style="font-weight:600;color:#1a3c5e">Narration: </span>' + bankRow.narration +
    '</div>' +

    // Amount box
    '<div style="background:linear-gradient(135deg,#f0fdf4,#dcfce7);border:2px solid #16a34a;' +
      'padding:7px 14px;display:flex;justify-content:space-between;' +
      'align-items:center;margin-bottom:10px">' +
    '<div>' +
    '<div style="font-size:11px;color:#166534;font-weight:700;text-transform:uppercase;letter-spacing:.5px">Total Amount Received</div>' +
    '<div style="font-size:11px;color:#166534;font-style:italic;margin-top:3px">' +
      'Rupees ' + numberToWords(totalAmt) + ' Only' +
    '</div>' +
    '</div>' +
    '<div style="font-size:28px;font-weight:700;color:#15803d">&#8377;' + fINR(totalAmt) + '</div>' +
    '</div>' +

    // Section label
    '<div style="font-weight:700;font-size:11px;color:#1a3c5e;margin:0 0 10px;padding:5px 12px;' +
      'background:#eef4fb;border-left:4px solid #c8a951;border-radius:0 4px 4px 0;' +
      'text-transform:uppercase;letter-spacing:.6px">' +
      (isMulti ? 'Properties &amp; Invoice Detail' : 'Invoice Detail') +
    '</div>' +

    // Property blocks
    propBlocks +

    // Grand total (multi only)
    grandTotal +

    // Received stamp
    '<div style="text-align:right;margin-bottom:16px">' +
    '<span style="display:inline-block;border:2.5px solid #15803d;color:#15803d;' +
      'padding:5px 22px;border-radius:4px;font-weight:700;font-size:13px;letter-spacing:1px;' +
      'transform:rotate(-8deg);display:inline-block">RECEIVED</span>' +
    '</div>' +

    // Footer
    '<div style="text-align:center;font-size:10px;color:#94a3b8;' +
      'border-top:2px solid #eef4fb;padding-top:12px;line-height:2">' +
    'This is a system-generated receipt. No signature required.<br>' +
    SOCIETY_NAME + ' &nbsp;·&nbsp; ' + SOCIETY_REGD + '<br>' +
    '<span style="font-size:10px;color:#cbd5e1">Generated: ' +
    Utilities.formatDate(new Date(), tz, "dd MMM yyyy 'at' HH:mm") + ' IST</span>' +
    '</div>' +

    '</div></div></body></html>';

  return Utilities.newBlob(html, 'text/html', 'receipt.html').getAs('application/pdf');
}

function metaBox(label, value) {
  return '<div>' +
    '<div style="font-size:9px;color:#800000;font-weight:700;text-transform:uppercase;letter-spacing:.5px">' + label + '</div>' +
    '<div style="font-size:13px;font-weight:700;color:#1a1a2e;margin-top:1px">' + value + '</div>' +
    '</div>';
}



// ═══════════════════════════════════════════════════════════════════
//  PDF TRIGGER — watches BankDetails Col K (GeneratePDF = "YES")
//  AppSheet sets Col K = "YES" silently via Data action
//  This function runs every 1 min, picks it up, generates PDF
// ═══════════════════════════════════════════════════════════════════
function processPendingPDFs() {
  var ss     = SpreadsheetApp.openById(SS_ID);
  var bSheet = ss.getSheetByName('BankDetails');
  if (!bSheet) return;

  var lastRow = bSheet.getLastRow();
  if (lastRow < 2) return;

  // Read Col C (RefNo) and Col I (ReceiptPDF) in one batch
  var data = bSheet.getRange(2, 1, lastRow - 1, 9).getValues();  // cols A–I

  var processed = 0;

  for (var i = 0; i < data.length; i++) {
    var refNo    = String(data[i][2] || '').trim();   // Col C RefNo
    var pdfVal   = String(data[i][8] || '').trim();   // Col I ReceiptPDF

    // Only process rows where Col I = 'YES' (AppSheet trigger)
    if (pdfVal.toUpperCase() !== 'YES') continue;
    if (!refNo) continue;

    Logger.log('processPendingPDFs: generating PDF for RefNo ' + refNo);

    // Clear Col I immediately to prevent re-triggering
    bSheet.getRange(i + 2, 9).setValue('');

    try {
      var result = generateConsolidatedReceipt(refNo);
      Logger.log('processPendingPDFs: ' + JSON.stringify(result));
      processed++;
    } catch(err) {
      Logger.log('processPendingPDFs ERROR for ' + refNo + ': ' + err.toString());
      // Restore YES so it can be retried
      bSheet.getRange(i + 2, 9).setValue('YES');
    }

    if (processed >= 5) break;
  }

  Logger.log('processPendingPDFs: done. Processed ' + processed + ' row(s).');
}

// ═══════════════════════════════════════════════════════════════════
//  AUTO EMAIL TRIGGER — runs every 1 min via time-driven trigger
//  Scans BankDetails for: Col I (PDF URL) filled + Col J (EmailSent) blank
//  Sends receipt email + stamps Col J with timestamp
// ═══════════════════════════════════════════════════════════════════
function processUnsentEmails() {
  var ss     = SpreadsheetApp.openById(SS_ID);
  var bSheet = ss.getSheetByName('BankDetails');
  if (!bSheet) { Logger.log('processUnsentEmails: BankDetails not found'); return; }

  var lastRow = bSheet.getLastRow();
  if (lastRow < 2) { Logger.log('processUnsentEmails: no data rows'); return; }

  // Read Col C (RefNo), Col I (ReceiptPDF), Col J (EmailSent) in one batch
  var data = bSheet.getRange(2, 1, lastRow - 1, 10).getValues();  // cols A–J

  var processed = 0;

  for (var i = 0; i < data.length; i++) {
    var refNo     = String(data[i][2] || '').trim();   // Col C [2]
    var pdfUrl    = String(data[i][8] || '').trim();   // Col I [8]
    var emailSent = String(data[i][9] || '').trim();   // Col J [9]

    // Skip if no PDF URL or email already sent
    if (!pdfUrl || emailSent) continue;
    if (!refNo)  continue;

    Logger.log('processUnsentEmails: processing RefNo ' + refNo);

    try {
      var tz      = Session.getScriptTimeZone();
      var bankRow = getBankRow(ss, refNo);
      if (!bankRow) { Logger.log('No bankRow for ' + refNo); continue; }

      var txRows = getTransactionRows(ss, refNo);
      if (!txRows.length) { Logger.log('No txRows for ' + refNo); continue; }

      // Build member map
      var memberMap = {};
      txRows.forEach(function(tx) {
        if (tx.propertyId && !memberMap[tx.propertyId])
          memberMap[tx.propertyId] = getMemberData(ss, tx.propertyId);
      });

      // Build IO map + invoices
      var ioMap = getInternalOrderMap(ss);
      txRows.forEach(function(tx) {
        tx.ioName   = ioMap[tx.internalOrder] || tx.internalOrder || '—';
        tx.invoices = tx.billId
          ? getInvoicesByBillIds(ss, tx.billId.split(',').map(function(b){ return b.trim(); }).filter(Boolean))
          : [];
      });

      // Rebuild PDF blob for attachment
      var pdfBlob = buildPdf(refNo, bankRow, txRows, memberMap, ioMap, tz);

      // Extract filename from URL or build it
      var fileName = 'RCPT-' + refNo.replace(/[\/\:*?"<>|]/g,'') + '.pdf';

      // Send email
      var emailResults = sendEmails(refNo, bankRow, txRows, memberMap, pdfBlob, pdfUrl, fileName);

      // Stamp Col J with sent timestamp
      var sentStamp = Utilities.formatDate(new Date(), tz, 'dd-MMM-yyyy HH:mm');
      bSheet.getRange(i + 2, 10).setValue(sentStamp);   // Col J, row i+2 (1-indexed, +1 for header)

      Logger.log('processUnsentEmails: email sent for ' + refNo + ' → ' + sentStamp + ' (' + emailResults.length + ' recipients)');
      processed++;

      // Safety: max 5 per run to avoid GAS timeout
      if (processed >= 5) {
        Logger.log('processUnsentEmails: reached 5-row limit, will continue next run');
        break;
      }

    } catch(err) {
      Logger.log('processUnsentEmails ERROR for ' + refNo + ': ' + err.toString());
    }
  }

  Logger.log('processUnsentEmails: done. Processed ' + processed + ' row(s).');
}

// ═══════════════════════════════════════════════════════════════════
//  SETUP TRIGGER — run once manually to install the 1-min trigger
//  Menu: SCRWA → Setup Auto-Email Trigger
// ═══════════════════════════════════════════════════════════════════
function setupAutoEmailTrigger() {
  // Remove existing triggers
  ScriptApp.getProjectTriggers().forEach(function(t) {
    if (t.getHandlerFunction() === 'processUnsentEmails' ||
        t.getHandlerFunction() === 'processPendingPDFs') {
      ScriptApp.deleteTrigger(t);
    }
  });
  // Install 1-min trigger for PDF generation
  ScriptApp.newTrigger('processPendingPDFs')
    .timeBased()
    .everyMinutes(1)
    .create();
  // Install 1-min trigger for email sending
  ScriptApp.newTrigger('processUnsentEmails')
    .timeBased()
    .everyMinutes(1)
    .create();
  SpreadsheetApp.getUi().alert('✅ Auto Triggers installed!\n\n' +
    '• processPendingPDFs — generates PDF when Col K = YES\n' +
    '• processUnsentEmails — sends email when Col I filled + Col J blank\n\n' +
    'Both run every 1 minute.');
}

// ═══════════════════════════════════════════════════════════════════
//  REMOVE TRIGGER — stop the auto-email (run manually if needed)
// ═══════════════════════════════════════════════════════════════════
function removeAutoEmailTrigger() {
  var removed = 0;
  ScriptApp.getProjectTriggers().forEach(function(t) {
    if (t.getHandlerFunction() === 'processUnsentEmails' ||
        t.getHandlerFunction() === 'processPendingPDFs') {
      ScriptApp.deleteTrigger(t);
      removed++;
    }
  });
  SpreadsheetApp.getUi().alert('Auto-Email Trigger removed (' + removed + ' trigger(s) deleted).');
}

// ═══════════════════════════════════════════════════════════════════
//  LOG
// ═══════════════════════════════════════════════════════════════════
function logReceipt(ss, receiptNo, bankRow, txRows, memberMap, fileName, pdfUrl, emailResults) {
  var logSheet = ss.getSheetByName(RECEIPTS_LOG_SHEET);
  if (!logSheet) {
    logSheet = ss.insertSheet(RECEIPTS_LOG_SHEET);
    logSheet.appendRow(['Generated At','Receipt No','Date','Total ₹',
                        '# Properties','Property IDs','Owners',
                        'Emails Sent','File','PDF URL']);
    logSheet.getRange(1,1,1,10).setFontWeight('bold')
      .setBackground('#0f2744').setFontColor('#ffffff');
    logSheet.setFrozenRows(1);
  }
  var now   = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');
  var pids  = txRows.map(function(t){ return t.propertyId; }).join(', ');
  var names = txRows.map(function(t){
    var m = memberMap[t.propertyId]; return m ? m.fullName : t.propertyId;
  }).join(' | ');
  var sent  = emailResults.filter(function(r){ return r.sent; })
    .map(function(r){ return r.to; }).join(', ') || 'None';
  logSheet.appendRow([now, receiptNo, bankRow.displayDate, bankRow.amount,
                      txRows.length, pids, names, sent, fileName, pdfUrl]);
}

// ═══════════════════════════════════════════════════════════════════
//  HELPERS
// ═══════════════════════════════════════════════════════════════════
function fINR(n) {
  return Math.round(n || 0).toLocaleString('en-IN');
}

function numberToWords(n) {
  n = Math.round(n || 0);
  if (n === 0) return 'Zero';
  var ones = ['','One','Two','Three','Four','Five','Six','Seven','Eight','Nine',
              'Ten','Eleven','Twelve','Thirteen','Fourteen','Fifteen','Sixteen',
              'Seventeen','Eighteen','Nineteen'];
  var tens = ['','','Twenty','Thirty','Forty','Fifty','Sixty','Seventy','Eighty','Ninety'];
  function w(num) {
    if (num === 0)      return '';
    if (num < 20)       return ones[num];
    if (num < 100)      return tens[Math.floor(num/10)] + (num%10 ? ' '+ones[num%10] : '');
    if (num < 1000)     return ones[Math.floor(num/100)] + ' Hundred' + (num%100 ? ' '+w(num%100) : '');
    if (num < 100000)   return w(Math.floor(num/1000))   + ' Thousand' + (num%1000   ? ' '+w(num%1000)   : '');
    if (num < 10000000) return w(Math.floor(num/100000)) + ' Lakh'     + (num%100000 ? ' '+w(num%100000) : '');
    return w(Math.floor(num/10000000)) + ' Crore' + (num%10000000 ? ' '+w(num%10000000) : '');
  }
  return w(n).trim();
}

// ═══════════════════════════════════════════════════════════════════
//  SHEET MENU
// ═══════════════════════════════════════════════════════════════════
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('SCRWA Receipts')
    .addItem('Generate Receipt PDF — Selected Row', 'generateFromMenu')
    .addItem('Send Receipt Email — Selected Row',   'sendReceiptEmailFromMenu')
    .addSeparator()
    .addItem('Open Receipts Log', 'openLog')
    .addSeparator()
    .addItem('⚙️ Setup Auto-Email Trigger (1 min)', 'setupAutoEmailTrigger')
    .addItem('🛑 Remove Auto-Email Trigger',        'removeAutoEmailTrigger')
    .addToUi();
}

// ── Generate PDF only (no email) ────────────────────────────────────
function generateFromMenu() {
  var ui    = SpreadsheetApp.getUi();
  var sheet = SpreadsheetApp.getActiveSheet();
  var row   = sheet.getActiveCell().getRow();
  if (sheet.getName() !== 'BankDetails') {
    ui.alert('Please select a row in the BankDetails sheet.'); return;
  }
  if (row <= 1) {
    ui.alert('Please select a data row (row 2 or below).'); return;
  }
  if (String(sheet.getRange(row, 8).getValue()).trim().toUpperCase() !== 'TRUE') {
    ui.alert('This row is not yet marked Reconciled.'); return;
  }
  var receiptNo = String(sheet.getRange(row, 3).getValue()).trim();
  if (!receiptNo) {
    ui.alert('No RefNo found in Col C.'); return;
  }
  // Skip if PDF already generated
  var existing = String(sheet.getRange(row, 9).getValue()).trim();
  if (existing) {
    var overwrite = ui.alert(
      'Receipt already exists',
      'A PDF already exists for this receipt:\n' + existing +
      '\n\nGenerate again (overwrites existing)?',
      ui.ButtonSet.YES_NO
    );
    if (overwrite !== ui.Button.YES) return;
  }
  if (ui.alert(
    'Generate Receipt PDF for: ' + receiptNo + '\n\nPDF will be saved to Drive.\nEmail will NOT be sent yet.',
    ui.ButtonSet.YES_NO) !== ui.Button.YES) return;

  var result = generateConsolidatedReceipt(receiptNo);
  if (result.success) {
    ui.alert('PDF Generated!',
      'Receipt No : ' + result.receiptNo + '\n' +
      'Properties : ' + result.properties.join(', ') + '\n' +
      'Total      : Rs.' + fINR(result.totalAmount) + '\n\n' +
      'PDF saved to Drive.\n' +
      'Use "Send Receipt Email" when ready to notify the owner.',
      ui.ButtonSet.OK);
  } else {
    ui.alert('Failed', result.message, ui.ButtonSet.OK);
  }
}

// ── Send email for already-generated receipt ────────────────────────
function sendReceiptEmailFromMenu() {
  var ui    = SpreadsheetApp.getUi();
  var sheet = SpreadsheetApp.getActiveSheet();
  var row   = sheet.getActiveCell().getRow();
  if (sheet.getName() !== 'BankDetails') {
    ui.alert('Please select a row in the BankDetails sheet.'); return;
  }
  if (row <= 1) {
    ui.alert('Please select a data row (row 2 or below).'); return;
  }
  var receiptNo = String(sheet.getRange(row, 3).getValue()).trim();
  var pdfUrl    = String(sheet.getRange(row, 9).getValue()).trim();  // Col I
  if (!receiptNo) {
    ui.alert('No RefNo found in Col C.'); return;
  }
  if (!pdfUrl) {
    ui.alert('No PDF found for this row.\nPlease run "Generate Receipt PDF" first.'); return;
  }
  // Duplicate guard — check Col J
  var emailSentVal = String(sheet.getRange(row, 10).getValue()).trim();
  if (emailSentVal) {
    var resp = ui.alert(
      '⚠️ Email Already Sent',
      'An email was already sent for this receipt on:\n' + emailSentVal +
      '\n\nSend AGAIN to owner? (This may cause duplicate emails)',
      ui.ButtonSet.YES_NO
    );
    if (resp !== ui.Button.YES) return;
  }

  var ss        = SpreadsheetApp.openById(SS_ID);
  var bankRow   = getBankRow(ss, receiptNo);
  var txRows    = getTransactionRows(ss, receiptNo);
  var ioMap     = getInternalOrderMap(ss);
  var memberMap = {};
  txRows.forEach(function(tx) {
    tx.ioName   = ioMap[tx.internalOrder] || tx.internalOrder || '-';
    tx.invoices = tx.billId
      ? getInvoicesByBillIds(ss, tx.billId.split(',').map(function(b){ return b.trim(); }).filter(Boolean))
      : [];
    if (tx.propertyId && !memberMap[tx.propertyId])
      memberMap[tx.propertyId] = getMemberData(ss, tx.propertyId);
  });

  // Rebuild PDF blob from Drive file for attachment
  var fileId   = pdfUrl.replace('https://drive.google.com/file/d/','').replace('/view','');
  var pdfBlob  = DriveApp.getFileById(fileId).getBlob().setContentType('application/pdf');
  var fileName = 'RCPT-' + receiptNo + '.pdf';

  // Confirm before sending
  var emailList = [];
  txRows.forEach(function(tx) {
    var m = memberMap[tx.propertyId];
    if (!m) return;
    if (m.email) emailList.push(m.email);
    if (m.isProxy && m.proxyEmail) emailList.push(m.proxyEmail);
  });
  var uniqueEmails = emailList.filter(function(v,i,a){ return a.indexOf(v.toLowerCase()) === i; });
  if (!uniqueEmails.length) {
    ui.alert('No email addresses found for the properties in this receipt.'); return;
  }

  var confirm = ui.alert(
    'Send Receipt Email',
    'Receipt No : ' + receiptNo + '\n' +
    'Amount     : Rs.' + fINR(bankRow.amount) + '\n\n' +
    'Will send to:\n' + uniqueEmails.join('\n') + '\n\nProceed?',
    ui.ButtonSet.YES_NO
  );
  if (confirm !== ui.Button.YES) return;

  var emailResults = sendEmails(receiptNo, bankRow, txRows, memberMap, pdfBlob, pdfUrl, fileName);

  // Update log with email results
  logReceiptEmail(ss, receiptNo, emailResults);

  var summary = emailResults.map(function(r){
    return (r.sent ? 'Sent' : 'FAILED') + ' -> ' + r.to;
  }).join('\n');
  ui.alert('Email Done!', summary, ui.ButtonSet.OK);
}

// ── Update log row with email sent status ───────────────────────────
function logReceiptEmail(ss, receiptNo, emailResults) {
  var logSheet = ss.getSheetByName(RECEIPTS_LOG_SHEET);
  if (!logSheet) return;
  var data = logSheet.getDataRange().getValues();
  var sent = emailResults.filter(function(r){ return r.sent; })
    .map(function(r){ return r.to; }).join(', ') || 'None';
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][1]).trim() === receiptNo) {
      logSheet.getRange(i + 1, 8).setValue(sent);   // Col H = Emails Sent
      return;
    }
  }
}

// ── Open log sheet ───────────────────────────────────────────────────
function openLog() {
  var sheet = SpreadsheetApp.openById(SS_ID).getSheetByName(RECEIPTS_LOG_SHEET);
  if (sheet) SpreadsheetApp.setActiveSheet(sheet);
  else SpreadsheetApp.getUi().alert('No receipts generated yet.');
}

// ═══════════════════════════════════════════════════════════════════
//  TEST — run from Apps Script editor dropdown
// ═══════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════
//  TEST FUNCTIONS
// ═══════════════════════════════════════════════════════════════════
function testReceiptGeneration() {
  // Change receiptNo to test different receipts
  // Single property : 111862041743
  // Multi-property  : 120808133356
  var receiptNo = '120808133356';
  try {
    Logger.log('=== TEST START: ' + receiptNo + ' ===');
    var ss = SpreadsheetApp.openById(SS_ID);

    // Check bank row exists
    var bankRow = getBankRow(ss, receiptNo);
    Logger.log('BankRow: ' + JSON.stringify(bankRow));
    if (!bankRow) { Logger.log('FAIL: No bank row found'); return; }
    if (!bankRow.reconciled) { Logger.log('FAIL: Not reconciled — Col H value must be TRUE'); return; }

    // Check tx rows
    var txRows = getTransactionRows(ss, receiptNo);
    Logger.log('TxRows found: ' + txRows.length);
    if (!txRows.length) { Logger.log('FAIL: No transaction rows for this receipt'); return; }
    txRows.forEach(function(tx, i) {
      Logger.log('  TX['+i+']: PID='+tx.propertyId+' Amount='+tx.amount+' IO='+tx.internalOrder+' BillID='+tx.billId);
    });

    // Run full generation
    var result = generateConsolidatedReceipt(receiptNo);
    Logger.log('RESULT: ' + JSON.stringify(result));

    if (result.success) {
      Logger.log('=== SUCCESS ===');
      Logger.log('PDF URL: ' + result.pdfUrl);
      Logger.log('Properties: ' + result.properties.join(', '));
      Logger.log('Amount: Rs.' + result.totalAmount);
    } else {
      Logger.log('=== FAILED: ' + result.message + ' ===');
    }
  } catch(err) {
    Logger.log('=== EXCEPTION: ' + err.toString() + ' ===');
    Logger.log('Stack: ' + err.stack);
  }
}

function testSendEmail() {
  var receiptNo = '120808133356';
  try {
    Logger.log('=== TEST EMAIL START: ' + receiptNo + ' ===');
    var ss      = SpreadsheetApp.openById(SS_ID);
    var bankRow = getBankRow(ss, receiptNo);
    if (!bankRow) { Logger.log('FAIL: No bank row'); return; }

    // Get PDF URL from Col I
    var bSheet = ss.getSheetByName('BankDetails');
    var data   = bSheet.getDataRange().getValues();
    var pdfUrl = '';
    for (var i = 1; i < data.length; i++) {
      if (String(data[i][2]).trim() === receiptNo) { pdfUrl = String(data[i][8]).trim(); break; }
    }
    if (!pdfUrl) { Logger.log('FAIL: No PDF URL in Col I — run testReceiptGeneration first'); return; }
    Logger.log('PDF URL: ' + pdfUrl);

    var txRows    = getTransactionRows(ss, receiptNo);
    var ioMap     = getInternalOrderMap(ss);
    var memberMap = {};
    txRows.forEach(function(tx) {
      tx.ioName   = ioMap[tx.internalOrder] || tx.internalOrder || '-';
      tx.invoices = tx.billId
        ? getInvoicesByBillIds(ss, tx.billId.split(',').map(function(b){ return b.trim(); }).filter(Boolean))
        : [];
      if (tx.propertyId && !memberMap[tx.propertyId])
        memberMap[tx.propertyId] = getMemberData(ss, tx.propertyId);
    });

    var fileId  = pdfUrl.replace('https://drive.google.com/file/d/','').replace('/view','');
    var pdfBlob = DriveApp.getFileById(fileId).getBlob().setContentType('application/pdf');
    var results = sendEmails(receiptNo, bankRow, txRows, memberMap, pdfBlob, pdfUrl, 'RCPT-' + receiptNo + '.pdf');
    Logger.log('Email results: ' + JSON.stringify(results));
  } catch(err) {
    Logger.log('=== EMAIL EXCEPTION: ' + err.toString() + ' ===');
  }
}
