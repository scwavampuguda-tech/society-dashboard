/**
 * ═══════════════════════════════════════════════════════════════════
 *  SCRWA — Consolidated Receipt PDF Generator  v2.0
 * ═══════════════════════════════════════════════════════════════════
 *  Google Sheet : SocietyData
 *  Account      : scwa.vampuguda@gmail.com
 *  Sheet ID     : 1oXmvMIfQDm51KoHHtkhg8KgK1Qi5mwFYSBdrwir85CA
 *
 *  KEY DESIGN:
 *  ───────────
 *  One UPI payment (ReceiptNo / RefNo) can cover MULTIPLE properties.
 *  e.g. ReceiptNo 454154939921 → PID 137 (₹1000) + PID 138 (₹1000) = ₹2000
 *
 *  The TRIGGER is BankDetails.Reconciled (Col H) = TRUE.
 *  When reconciled, one CONSOLIDATED receipt PDF is generated covering
 *  all properties paid under that single bank transaction.
 *
 *  WORKFLOW:
 *  ─────────
 *  Bank alert → BankSync → BankDetails row (ReceiptNo = UPI RefNo)
 *    ↓
 *  You map TxIDs in TransactionDetails (each row = one property split)
 *    ↓
 *  BankDetails Col H (Reconciled) becomes TRUE (formula auto-checks)
 *    ↓
 *  AppSheet shows "📄 Generate Receipt" button on BankDetails row
 *    ↓
 *  generateConsolidatedReceipt(receiptNo) runs:
 *    → finds ALL TransactionDetails rows with this ReceiptNo
 *    → builds ONE PDF covering all properties + all invoices
 *    → saves to Drive: SCRWA_Receipts/YYYY-MM/RCPT-{receiptNo}.pdf
 *    → writes PDF URL to BankDetails Col J (ReceiptPDF)
 *    → writes PDF URL to each TransactionDetails Col P (ReceiptPDF)
 *    → sends email to each unique member (owner/proxy)
 *    → returns WhatsApp links for each member
 *
 *  APPSHEET INTEGRATION:
 *  ─────────────────────
 *  Table    : BankDetails
 *  Action   : "📄 Generate Receipt"
 *  Condition: [Reconciled] = TRUE AND [ReceiptPDF] = ""   ← only if not yet generated
 *  Type     : Call a webhook (HTTP POST)
 *  Body     : { "action": "generateReceipt", "receiptNo": "<<[RefNo]>>" }
 *
 *  Re-generate action (if needed):
 *  Condition: [Reconciled] = TRUE AND [ReceiptPDF] <> ""
 *  Body     : { "action": "generateReceipt", "receiptNo": "<<[RefNo]>>" }
 *
 *  View PDF action:
 *  Type     : Open a link → URL = [ReceiptPDF]
 *  Condition: [ReceiptPDF] <> ""
 *
 *  ── COLUMN MAPS ─────────────────────────────────────────────────
 *
 *  BankDetails (data from row 2):
 *    Col A [0]  TxnDate
 *    Col B [1]  Narration
 *    Col C [2]  RefNo           ← ReceiptNo / UPI ref — KEY JOIN FIELD
 *    Col D [3]  ValueDate
 *    Col E [4]  Withdrawal
 *    Col F [5]  Deposit         ← bank credit amount
 *    Col G [6]  Balance
 *    Col H [7]  Reconciled      ← formula: TRUE when all TxIDs mapped
 *    Col I [8]  Source          (XLSX/ALERT/PLAIN)
 *    Col J [9]  ReceiptPDF      ← NEW: PDF URL written here by script
 *
 *  TransactionDetails (row 1=section, row 2=headers, data row 3+):
 *    Col A [0]  TransactionID   ← unique per row
 *    Col B [1]  ReceiptNo       ← UPI ref — matches BankDetails.RefNo
 *    Col C [2]  Date
 *    Col D [3]  Type            (💰Cash In / Cash Out)
 *    Col E [4]  Mode
 *    Col F [5]  AccountHead
 *    Col G [6]  AccountSubHead
 *    Col H [7]  Amount
 *    Col I [8]  PropertyID      ← member reference
 *    Col J [9]  InternalOrder
 *    Col K [10] BillID          ← invoice reference
 *    Col L [11] Remarks         (UPI narration)
 *    Col M [12] Notes           (human description)
 *    Col N [13] Attachments     ← manual voucher/bill proof — DO NOT TOUCH
 *    Col O [14] FY Year
 *    Col P [15] ReceiptPDF      ← NEW: PDF URL written here per TxID row
 *
 *  OwnerDetails (data from row 2, index 1+):
 *    Col A [0]  PropertyID
 *    Col B [1]  PlotNo
 *    Col D [3]  OwnershipType   (Single / Joint)
 *    Col E [4]  Name
 *    Col F [5]  Name2           (joint owner)
 *    Col H [7]  LaneNo
 *    Col J [9]  Status
 *    Col K [10] Email
 *    Col L [11] Mobile
 *    Col O [14] IsProxy         ("Yes" / "")
 *
 *  ProxyDetails (data from row 3, index 2+):
 *    Col A [0]  PropertyID
 *    Col B [1]  RepresentedBy
 *    Col C [2]  Relation
 *    Col E [4]  ProxyEmail
 *    Col F [5]  ProxyMobile
 *
 *  Invoice (data from row 3, index 2+):
 *    Col A [0]  BillID
 *    Col B [1]  PropertyID
 *    Col E [4]  BillPeriod      (Date → "MMM yyyy")
 *    Col F [5]  BillDate
 *    Col G [6]  BillAmount
 *    Col H [7]  PaidAmount
 *    Col I [8]  Balance
 *    Col J [9]  Status
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

// ─── doPost — AppSheet webhook ─────────────────────────────────────
function doPost(e) {
  try {
    var payload   = JSON.parse(e.postData.contents);
    var action    = payload.action    || '';
    var receiptNo = String(payload.receiptNo || '').trim();

    if (action === 'generateReceipt' && receiptNo) {
      var result = generateConsolidatedReceipt(receiptNo);
      return ContentService
        .createTextOutput(JSON.stringify(result))
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
//  MAIN: generateConsolidatedReceipt(receiptNo)
// ═══════════════════════════════════════════════════════════════════
function generateConsolidatedReceipt(receiptNo) {
  var ss = SpreadsheetApp.openById(SS_ID);
  var tz = Session.getScriptTimeZone();

  // ── 1. Get BankDetails row for this ReceiptNo ───────────────────
  var bankRow = getBankRow(ss, receiptNo);
  if (!bankRow) {
    return { success: false, message: 'ReceiptNo not found in BankDetails: ' + receiptNo };
  }

  // ── 2. Check Reconciled = TRUE ──────────────────────────────────
  if (!bankRow.reconciled) {
    return { success: false, message: 'BankDetails row not yet Reconciled for ReceiptNo: ' + receiptNo };
  }

  // ── 3. Get ALL TransactionDetails rows for this ReceiptNo ───────
  var txRows = getTransactionRowsByReceiptNo(ss, receiptNo);
  if (!txRows || txRows.length === 0) {
    return { success: false, message: 'No TransactionDetails rows found for ReceiptNo: ' + receiptNo };
  }

  // ── 4. Get member data for each unique PropertyID ────────────────
  var memberMap = {};
  txRows.forEach(function(tx) {
    if (tx.propertyId && !memberMap[tx.propertyId]) {
      var m = getMemberData(ss, tx.propertyId);
      if (m) memberMap[tx.propertyId] = m;
    }
  });

  // ── 5. Get invoices for each TxID ───────────────────────────────
  txRows.forEach(function(tx) {
    tx.invoices = [];
    if (tx.billId) {
      var billIds = tx.billId.split(',').map(function(b){ return b.trim(); }).filter(Boolean);
      tx.invoices = getInvoicesByBillIds(ss, billIds);
    }
  });

  // ── 6. Build consolidated PDF ───────────────────────────────────
  var pdfBlob = buildConsolidatedPdf(receiptNo, bankRow, txRows, memberMap, tz);

  // ── 7. Save to Drive ────────────────────────────────────────────
  var folder   = getOrCreateReceiptFolder(bankRow.date);
  var fileName = 'RCPT-' + receiptNo.replace(/[\/\\:*?"<>|]/g,'') + '.pdf';
  var iter = folder.getFilesByName(fileName);
  if (iter.hasNext()) { iter.next().setTrashed(true); }
  var file = folder.createFile(pdfBlob.setName(fileName));
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  var pdfUrl = 'https://drive.google.com/file/d/' + file.getId() + '/view';

  // ── 8. Write PDF URL to BankDetails Col J ───────────────────────
  writePdfUrlToBankDetails(ss, bankRow.sheetRow, pdfUrl);

  // ── 9. Write PDF URL to each TransactionDetails row Col P ───────
  txRows.forEach(function(tx) {
    writePdfUrlToTransactionDetails(ss, tx.sheetRow, pdfUrl);
  });

  // ── 10. Log to Receipts_Log ──────────────────────────────────────
  logReceipt(ss, receiptNo, bankRow, txRows, memberMap, fileName, pdfUrl);

  // ── 11. Send emails ──────────────────────────────────────────────
  var emailResults = sendConsolidatedEmails(receiptNo, bankRow, txRows, memberMap, pdfBlob, pdfUrl, fileName);

  // ── 12. Build WhatsApp links ─────────────────────────────────────
  var waLinks = buildWhatsAppLinks(receiptNo, bankRow, txRows, memberMap, pdfUrl);

  return {
    success:      true,
    receiptNo:    receiptNo,
    pdfUrl:       pdfUrl,
    fileName:     fileName,
    txCount:      txRows.length,
    properties:   txRows.map(function(t){ return t.propertyId; }),
    totalAmount:  bankRow.deposit,
    emailResults: emailResults,
    waLinks:      waLinks,
    message:      'Consolidated receipt generated for ' + txRows.length + ' transaction(s)'
  };
}

// ─── GET BANK ROW ──────────────────────────────────────────────────
// BankDetails: data from row 2 (index 1+)
function getBankRow(ss, receiptNo) {
  var sheet = ss.getSheetByName('BankDetails');
  if (!sheet) { Logger.log('ERROR: BankDetails sheet not found'); return null; }

  var data = sheet.getDataRange().getValues();
  var tz   = Session.getScriptTimeZone();

  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    if (String(row[2]).trim() !== receiptNo) continue;  // Col C = RefNo

    var dateStr = '', displayDate = '';
    if (row[0] instanceof Date) {
      dateStr     = Utilities.formatDate(row[0], tz, 'yyyy-MM-dd');
      displayDate = Utilities.formatDate(row[0], tz, 'dd MMM yyyy');
    }

    var deposit    = Math.abs(parseFloat(String(row[5]).replace(/[₹,]/g,'')) || 0); // Col F
    var withdrawal = Math.abs(parseFloat(String(row[4]).replace(/[₹,]/g,'')) || 0); // Col E
    var reconciled = String(row[7]).trim().toUpperCase() === 'TRUE';                 // Col H

    return {
      sheetRow:    i + 1,
      date:        dateStr,
      displayDate: displayDate,
      narration:   String(row[1] || '').trim(),   // Col B
      receiptNo:   String(row[2] || '').trim(),   // Col C
      deposit:     deposit,
      withdrawal:  withdrawal,
      amount:      deposit || withdrawal,
      reconciled:  reconciled,
      source:      String(row[8] || '').trim(),   // Col I
      existingPdf: String(row[9] || '').trim()    // Col J
    };
  }
  return null;
}

// ─── GET ALL TRANSACTION ROWS BY ReceiptNo ─────────────────────────
// Returns all rows from TransactionDetails where Col B = receiptNo
function getTransactionRowsByReceiptNo(ss, receiptNo) {
  var sheet = ss.getSheetByName('TransactionDetails');
  if (!sheet) return [];

  var data   = sheet.getDataRange().getValues();
  var tz     = Session.getScriptTimeZone();
  var result = [];

  for (var i = 2; i < data.length; i++) {  // row 3+ = data (index 2+)
    var row = data[i];
    if (String(row[1]).trim() !== receiptNo) continue;  // Col B = ReceiptNo

    var dateStr = '', displayDate = '';
    if (row[2] instanceof Date) {
      dateStr     = Utilities.formatDate(row[2], tz, 'yyyy-MM-dd');
      displayDate = Utilities.formatDate(row[2], tz, 'dd MMM yyyy');
    } else if (row[2]) {
      dateStr     = String(row[2]).substring(0,10);
      displayDate = dateStr;
    }

    var rawAmt = parseFloat(row[7]) || 0;
    var amount = Math.abs(rawAmt);

    var fyYear = String(row[14] || '').trim();
    if (!fyYear && dateStr) {
      var mo = parseInt(dateStr.substring(5,7),10);
      var yr = parseInt(dateStr.substring(0,4),10);
      fyYear = mo >= 4 ? yr+'-'+(yr+1) : (yr-1)+'-'+yr;
    }

    result.push({
      sheetRow:      i + 1,
      txId:          String(row[0]  || '').trim(),
      receiptNo:     String(row[1]  || '').trim(),
      date:          dateStr,
      displayDate:   displayDate,
      modeRaw:       String(row[4]  || '').trim(),
      modeClean:     String(row[4]  || '').trim().replace(/^[^\w\s₹(]+\s*/,''),
      accountHead:   String(row[5]  || '').trim().replace(/^[^\w\s]+\s*/,''),
      accountSubHead:String(row[6]  || '').trim().replace(/^[^\w\s]+\s*/,''),
      amount:        amount,
      propertyId:    String(row[8]  || '').trim(),
      internalOrder: String(row[9]  || '').trim(),
      billId:        String(row[10] || '').trim(),
      remarks:       String(row[11] || '').trim(),
      description:   String(row[12] || row[11] || '').trim().replace(/^[^\w\s₹(]+\s*/,''),
      fyYear:        fyYear,
      invoices:      []  // populated later
    });
  }

  Logger.log('Found ' + result.length + ' transaction row(s) for ReceiptNo: ' + receiptNo);
  return result;
}

// ─── GET MEMBER DATA ───────────────────────────────────────────────
function getMemberData(ss, propertyId) {
  if (!propertyId) return null;
  var member = {
    propertyId:  propertyId,
    plotNo:      '',
    laneNo:      '',
    ownerType:   'Single',
    name:        '',
    name2:       '',
    fullName:    '',
    email:       '',
    mobile:      '',
    status:      '',
    isProxy:     false,
    proxyName:   '',
    proxyMobile: '',
    proxyEmail:  ''
  };

  var owSheet = ss.getSheetByName('OwnerDetails');
  if (owSheet) {
    var owData = owSheet.getDataRange().getValues();
    for (var i = 1; i < owData.length; i++) {
      if (String(owData[i][0]).trim() !== propertyId) continue;
      member.plotNo    = String(owData[i][1]  || '').trim().replace('.0','');
      member.ownerType = String(owData[i][3]  || 'Single').trim();
      member.name      = String(owData[i][4]  || '').trim();
      member.name2     = String(owData[i][5]  || '').trim();
      member.laneNo    = String(owData[i][7]  || '').trim();
      member.status    = String(owData[i][9]  || '').trim();
      member.email     = String(owData[i][10] || '').trim();
      member.mobile    = String(owData[i][11] || '').trim();
      member.isProxy   = String(owData[i][14] || '').trim().toLowerCase() === 'yes';
      member.fullName  = member.name + (member.name2 ? ' & ' + member.name2 : '');
      break;
    }
  }
  if (!member.name) return null;

  if (member.isProxy) {
    var prSheet = ss.getSheetByName('ProxyDetails');
    if (prSheet) {
      var prData = prSheet.getDataRange().getValues();
      for (var j = 2; j < prData.length; j++) {
        if (String(prData[j][0]).trim() !== propertyId) continue;
        member.proxyName   = String(prData[j][1] || '').trim();
        member.proxyMobile = String(prData[j][5] || '').trim();
        member.proxyEmail  = String(prData[j][4] || '').trim();
        break;
      }
    }
  }
  return member;
}

// ─── GET INVOICES ──────────────────────────────────────────────────
function getInvoicesByBillIds(ss, billIds) {
  var sheet = ss.getSheetByName('Invoice');
  if (!sheet || !billIds || billIds.length === 0) return [];

  var data  = sheet.getDataRange().getValues();
  var tz    = Session.getScriptTimeZone();
  var found = [];
  var idSet = {};
  billIds.forEach(function(b){ idSet[b] = true; });

  for (var i = 2; i < data.length; i++) {
    var row    = data[i];
    var billId = String(row[0] || '').trim();
    if (!idSet[billId]) continue;

    var period = '';
    if (row[4] instanceof Date) {
      period = Utilities.formatDate(row[4], tz, 'MMM yyyy');
    } else if (row[4]) {
      period = String(row[4]).trim();
    }

    found.push({
      billId:     billId,
      period:     period,
      billAmount: parseFloat(row[6]) || 0,
      paidAmount: Math.abs(parseFloat(row[7]) || 0),
      balance:    parseFloat(row[8]) || 0,
      status:     String(row[9] || '').trim().replace(/^[^\w\s]+\s*/,'')
    });
  }
  return found;
}

// ─── BUILD CONSOLIDATED PDF ────────────────────────────────────────
function buildConsolidatedPdf(receiptNo, bankRow, txRows, memberMap, tz) {
  var isMulti    = txRows.length > 1;
  var totalAmt   = bankRow.amount;
  var dateDisp   = bankRow.displayDate;
  var modeClean  = txRows.length > 0 ? txRows[0].modeClean : 'UPI / Online';
  var fyYear     = txRows.length > 0 ? txRows[0].fyYear : '';

  // ── Per-property rows HTML ────────────────────────────────────────
  var propRows = '';
  txRows.forEach(function(tx, idx) {
    var m = memberMap[tx.propertyId] || {};

    // Invoice detail
    var invDetail = '';
    if (tx.invoices.length > 0) {
      invDetail = tx.invoices.map(function(inv){
        return inv.period + ' (₹' + fINR(inv.billAmount) + ')';
      }).join(', ');
    } else if (tx.billId) {
      var mRes = tx.billId.match(/([A-Za-z]{3})(\d{4})/);
      if (mRes) invDetail = mRes[1] + ' ' + mRes[2];
    }

    // Proxy note
    var proxyNote = (m.isProxy && m.proxyName)
      ? '<br><span style="font-size:11px;color:#64748b">Rep: ' + m.proxyName + '</span>'
      : '';

    // Owner type badge
    var badge = m.ownerType === 'Joint'
      ? ' <span style="background:#dbeafe;color:#1e40af;font-size:10px;padding:1px 6px;border-radius:8px">Joint</span>'
      : '';

    var rowBg = idx % 2 === 0 ? '#ffffff' : '#f8faff';
    propRows +=
      '<tr style="background:' + rowBg + '">' +
      '<td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;font-weight:600">' + (m.plotNo || tx.propertyId) + '</td>' +
      '<td style="padding:8px 10px;border-bottom:1px solid #e2e8f0">' + (m.fullName || '—') + badge + proxyNote + '</td>' +
      '<td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;font-size:11px;color:#475569">' + (m.laneNo || '—') + '</td>' +
      '<td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;font-size:11px">' + (invDetail || tx.description || '—') + '</td>' +
      '<td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;text-align:right;font-weight:600;color:#15803d">₹' + fINR(tx.amount) + '</td>' +
      '</tr>';
  });

  var amtWords = numberToWords(totalAmt);

  var html =
    '<!DOCTYPE html><html><head><meta charset="UTF-8"><style>' +
    'body{font-family:Arial,Helvetica,sans-serif;margin:0;padding:0;color:#1a1a2e;font-size:13px}' +
    '.page{width:700px;margin:0 auto;padding:28px}' +
    '.header{background:linear-gradient(135deg,#0f2744,#1e4d8c);color:#fff;padding:18px 24px;border-radius:10px 10px 0 0;display:flex;align-items:center;justify-content:space-between}' +
    '.header h1{margin:0;font-size:16px;font-weight:700}' +
    '.header p{margin:4px 0 0;font-size:11px;opacity:.8}' +
    '.receipt-badge{background:#FFD700;color:#0f2744;padding:5px 18px;border-radius:20px;font-weight:700;font-size:14px}' +
    '.body{border:1px solid #d1dce8;border-top:none;border-radius:0 0 10px 10px;padding:22px 24px;background:#fff}' +
    '.meta-grid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px 20px;margin-bottom:16px}' +
    '.meta-item .lbl{font-size:10px;color:#94a3b8;font-weight:600;text-transform:uppercase;letter-spacing:.4px}' +
    '.meta-item .val{font-size:13px;color:#1a1a2e;font-weight:600;margin-top:2px}' +
    '.section-title{font-weight:700;font-size:11px;color:#0f2744;margin:14px 0 8px;padding:4px 10px;background:#f0f5ff;border-left:3px solid #1e4d8c;border-radius:0 4px 4px 0;text-transform:uppercase;letter-spacing:.5px}' +
    '.prop-table{width:100%;border-collapse:collapse;font-size:12px}' +
    '.prop-table th{background:#1e4d8c;color:#fff;padding:8px 10px;text-align:left;font-size:11px;font-weight:600}' +
    '.prop-table th:last-child{text-align:right}' +
    '.amount-box{background:linear-gradient(135deg,#f0fdf4,#dcfce7);border:2px solid #16a34a;border-radius:10px;padding:14px 20px;margin:16px 0;text-align:center}' +
    '.amount-box .amt{font-size:26px;font-weight:700;color:#15803d}' +
    '.amount-box .words{font-size:12px;color:#166534;margin-top:3px;font-style:italic}' +
    '.bank-row{display:flex;gap:10px;margin-bottom:6px;align-items:center}' +
    '.bank-lbl{width:140px;font-size:12px;font-weight:600;color:#64748b;flex-shrink:0}' +
    '.bank-val{font-size:12px;color:#1a1a2e}' +
    '.multi-badge{display:inline-block;background:#fef3c7;color:#92400e;font-size:11px;padding:2px 10px;border-radius:10px;margin-bottom:10px;font-weight:600}' +
    '.stamp-row{text-align:right;margin-top:16px}' +
    '.stamp{display:inline-block;border:2.5px solid #15803d;color:#15803d;padding:5px 20px;border-radius:4px;font-weight:700;font-size:13px;transform:rotate(-8deg)}' +
    '.footer{text-align:center;margin-top:20px;font-size:11px;color:#94a3b8;border-top:1px solid #e2e8f0;padding-top:14px;line-height:1.8}' +
    '</style></head><body><div class="page">' +

    // Header
    '<div class="header">' +
    '<div><h1>🏘️ ' + SOCIETY_NAME + '</h1>' +
    '<p>' + SOCIETY_REGD + ' · Vampuguda, Hyderabad</p></div>' +
    '<div class="receipt-badge">RECEIPT</div>' +
    '</div>' +

    '<div class="body">' +

    // Multi-property badge
    (isMulti ? '<div class="multi-badge">⚡ Consolidated Payment — ' + txRows.length + ' Properties</div>' : '') +

    // Meta grid
    '<div class="meta-grid">' +
    '<div class="meta-item"><div class="lbl">Receipt No</div><div class="val">' + receiptNo + '</div></div>' +
    '<div class="meta-item"><div class="lbl">Date</div><div class="val">' + dateDisp + '</div></div>' +
    '<div class="meta-item"><div class="lbl">FY Year</div><div class="val">' + fyYear + '</div></div>' +
    '</div>' +

    // Bank details
    '<div class="section-title">🏦 Bank Transaction</div>' +
    '<div class="bank-row"><span class="bank-lbl">UPI Ref / Receipt No</span><span class="bank-val"><strong>' + receiptNo + '</strong></span></div>' +
    '<div class="bank-row"><span class="bank-lbl">Narration</span><span class="bank-val">' + bankRow.narration + '</span></div>' +
    '<div class="bank-row"><span class="bank-lbl">Payment Mode</span><span class="bank-val">' + modeClean + '</span></div>' +

    // Amount box
    '<div class="amount-box">' +
    '<div class="amt">₹' + fINR(totalAmt) + '</div>' +
    '<div class="words">Rupees ' + amtWords + ' Only</div>' +
    '</div>' +

    // Properties table
    '<div class="section-title">📋 ' + (isMulti ? 'Properties Covered' : 'Member & Invoice Details') + '</div>' +
    '<table class="prop-table"><thead><tr>' +
    '<th>Plot</th><th>Owner</th><th>Lane</th><th>For Period / Invoice</th><th style="text-align:right">Amount</th>' +
    '</tr></thead><tbody>' + propRows + '</tbody>' +
    (isMulti ? '<tfoot><tr><td colspan="4" style="padding:8px 10px;font-weight:700;text-align:right;background:#f8faff;font-size:12px">Total</td>' +
    '<td style="padding:8px 10px;text-align:right;font-weight:700;color:#15803d;background:#f8faff">₹' + fINR(totalAmt) + '</td></tr></tfoot>' : '') +
    '</table>' +

    '<div class="stamp-row"><span class="stamp">✓ RECEIVED</span></div>' +

    // Footer
    '<div class="footer">' +
    'This is a system-generated receipt. No signature required.<br>' +
    SOCIETY_NAME + ' · ' + SOCIETY_REGD + '<br>' +
    '📧 ' + SOCIETY_EMAIL + '<br>' +
    '<span style="font-size:10px;color:#cbd5e1">Generated: ' +
    Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "dd MMM yyyy 'at' HH:mm") + ' IST</span>' +
    '</div>' +
    '</div></div></body></html>';

  return Utilities.newBlob(html, 'text/html', 'receipt.html').getAs('application/pdf');
}

// ─── WRITE PDF URL ──────────────────────────────────────────────────
function writePdfUrlToBankDetails(ss, sheetRow, url) {
  var sheet = ss.getSheetByName('BankDetails');
  if (!sheet) return;
  sheet.getRange(sheetRow, 10).setValue(url); // Col J = column 10
}

function writePdfUrlToTransactionDetails(ss, sheetRow, url) {
  var sheet = ss.getSheetByName('TransactionDetails');
  if (!sheet) return;
  sheet.getRange(sheetRow, 16).setValue(url); // Col P = column 16
}

// ─── DRIVE FOLDER ──────────────────────────────────────────────────
function getOrCreateReceiptFolder(dateStr) {
  var root = DriveApp.getRootFolder();
  var mf   = root.getFoldersByName(RECEIPTS_FOLDER);
  var mainFolder = mf.hasNext() ? mf.next() : root.createFolder(RECEIPTS_FOLDER);
  var monthKey = dateStr ? dateStr.substring(0,7)
    : Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM');
  var sf = mainFolder.getFoldersByName(monthKey);
  return sf.hasNext() ? sf.next() : mainFolder.createFolder(monthKey);
}

// ─── LOG ────────────────────────────────────────────────────────────
function logReceipt(ss, receiptNo, bankRow, txRows, memberMap, fileName, pdfUrl) {
  var logSheet = ss.getSheetByName(RECEIPTS_LOG_SHEET);
  if (!logSheet) {
    logSheet = ss.insertSheet(RECEIPTS_LOG_SHEET);
    logSheet.appendRow(['Generated At','Receipt No','Date','Total ₹','# Properties',
                        'Property IDs','Owners','File','PDF URL']);
    logSheet.getRange(1,1,1,9).setFontWeight('bold').setBackground('#0f2744').setFontColor('#ffffff');
    logSheet.setFrozenRows(1);
  }
  var now  = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');
  var pids = txRows.map(function(t){ return t.propertyId; }).join(', ');
  var names= txRows.map(function(t){
    var m = memberMap[t.propertyId];
    return m ? m.fullName : t.propertyId;
  }).join(' | ');
  logSheet.appendRow([now, receiptNo, bankRow.displayDate, bankRow.amount,
                      txRows.length, pids, names, fileName, pdfUrl]);
}

// ─── SEND EMAILS ────────────────────────────────────────────────────
// One email per unique member (owner/proxy), covering their properties
function sendConsolidatedEmails(receiptNo, bankRow, txRows, memberMap, pdfBlob, pdfUrl, fileName) {
  // Group txRows by unique email address
  var emailMap = {};  // email → [txRows]
  txRows.forEach(function(tx) {
    var m = memberMap[tx.propertyId];
    if (!m) return;
    var emails = [];
    if (m.email)      emails.push(m.email);
    if (m.proxyEmail && m.proxyEmail !== m.email) emails.push(m.proxyEmail);
    emails.forEach(function(em) {
      if (!emailMap[em]) emailMap[em] = [];
      emailMap[em].push({ tx: tx, member: m });
    });
  });

  var results = [];

  Object.keys(emailMap).forEach(function(email) {
    var entries  = emailMap[email];
    var m        = entries[0].member;
    var isMulti  = txRows.length > 1;

    // Property rows for this email
    var propRowsHtml = '';
    entries.forEach(function(e) {
      var inv = e.tx.invoices.length > 0
        ? e.tx.invoices.map(function(i){ return i.period; }).join(', ')
        : (e.tx.description || '');
      propRowsHtml +=
        '<tr><td style="padding:7px 12px;background:#f8fafc;border-bottom:1px solid #e2e8f0">Plot ' +
        (memberMap[e.tx.propertyId] ? memberMap[e.tx.propertyId].plotNo : e.tx.propertyId) + '</td>' +
        '<td style="padding:7px 12px;border-bottom:1px solid #e2e8f0">' + (inv || '—') + '</td>' +
        '<td style="padding:7px 12px;border-bottom:1px solid #e2e8f0;text-align:right;color:#15803d;font-weight:700">₹' +
        fINR(e.tx.amount) + '</td></tr>';
    });

    var subject = '🧾 Receipt #' + receiptNo + ' — ₹' + fINR(bankRow.amount) +
                  (isMulti ? ' (' + txRows.length + ' Properties)' : '') +
                  ' | ' + SOCIETY_SHORT;

    var body =
      '<div style="font-family:Arial,sans-serif;max-width:560px;color:#1a1a2e">' +
      '<div style="background:linear-gradient(135deg,#0f2744,#1e4d8c);color:#fff;padding:16px 20px;border-radius:8px 8px 0 0">' +
      '<h2 style="margin:0;font-size:15px">🏘️ ' + SOCIETY_SHORT + '</h2>' +
      '<p style="margin:4px 0 0;font-size:11px;opacity:.8">' + SOCIETY_REGD + '</p>' +
      '</div>' +
      '<div style="border:1px solid #d1dce8;border-top:none;padding:20px;border-radius:0 0 8px 8px">' +
      '<p>Dear <strong>' + m.fullName + '</strong>' +
      (m.isProxy && m.proxyName ? ' (Rep: ' + m.proxyName + ')' : '') + ',</p>' +
      '<p>Your payment has been received and reconciled. Please find the receipt below:</p>' +
      '<table style="width:100%;border-collapse:collapse;font-size:13px;margin:10px 0">' +
      '<tr><td style="padding:7px 12px;background:#f8fafc;width:38%;border-bottom:1px solid #e2e8f0"><b>Receipt No</b></td>' +
      '<td style="padding:7px 12px;border-bottom:1px solid #e2e8f0">' + receiptNo + '</td></tr>' +
      '<tr><td style="padding:7px 12px;background:#f8fafc;border-bottom:1px solid #e2e8f0"><b>Date</b></td>' +
      '<td style="padding:7px 12px;border-bottom:1px solid #e2e8f0">' + bankRow.displayDate + '</td></tr>' +
      '<tr><td style="padding:7px 12px;background:#f8fafc;border-bottom:1px solid #e2e8f0"><b>Total Amount</b></td>' +
      '<td style="padding:7px 12px;border-bottom:1px solid #e2e8f0;color:#15803d;font-weight:700">₹' + fINR(bankRow.amount) + '</td></tr>' +
      '</table>' +
      (isMulti ? '<p style="font-size:12px;background:#fef3c7;padding:8px 12px;border-radius:6px">⚡ This is a consolidated payment covering <strong>' + txRows.length + ' properties</strong>.</p>' : '') +
      '<table style="width:100%;border-collapse:collapse;font-size:12px;margin-top:8px">' +
      '<tr style="background:#1e4d8c;color:#fff"><th style="padding:7px 12px;text-align:left">Plot</th>' +
      '<th style="padding:7px 12px;text-align:left">For Period</th>' +
      '<th style="padding:7px 12px;text-align:right">Amount</th></tr>' +
      propRowsHtml + '</table>' +
      '<p style="margin-top:14px">📎 <strong>Receipt PDF is attached.</strong></p>' +
      '<p>🔗 <a href="' + pdfUrl + '" style="color:#1e4d8c">View receipt online (Google Drive)</a></p>' +
      '<hr style="border:none;border-top:1px solid #e2e8f0;margin:14px 0">' +
      '<p style="font-size:11px;color:#64748b">System-generated email. Do not reply directly.<br>' +
      '📧 ' + SOCIETY_EMAIL + ' · ' + SOCIETY_REGD + '</p>' +
      '</div></div>';

    try {
      GmailApp.sendEmail(email, subject,
        'Please use an HTML email client to view this message.',
        { htmlBody: body, attachments: [pdfBlob.setName(fileName)],
          name: SOCIETY_SHORT, replyTo: SOCIETY_EMAIL });
      results.push({ email: email, sent: true });
      Logger.log('Email sent to: ' + email);
    } catch (err) {
      results.push({ email: email, sent: false, error: err.toString() });
      Logger.log('Email failed for ' + email + ': ' + err.toString());
    }
  });

  return results;
}

// ─── WHATSAPP LINKS ────────────────────────────────────────────────
// Returns one WA link per unique mobile number
function buildWhatsAppLinks(receiptNo, bankRow, txRows, memberMap, pdfUrl) {
  var mobileMap = {};  // mobile → [entries]
  txRows.forEach(function(tx) {
    var m = memberMap[tx.propertyId];
    if (!m) return;
    var phone = (m.isProxy && m.proxyMobile) ? m.proxyMobile : m.mobile;
    if (!phone) return;
    var digits = phone.replace(/[^0-9]/g,'');
    var waNum  = digits.startsWith('91') ? digits : '91' + digits.slice(-10);
    if (!mobileMap[waNum]) mobileMap[waNum] = { member: m, txList: [] };
    mobileMap[waNum].txList.push(tx);
  });

  var links = [];
  var isMulti = txRows.length > 1;

  Object.keys(mobileMap).forEach(function(waNum) {
    var entry = mobileMap[waNum];
    var m     = entry.member;

    // Build property summary
    var propSummary = entry.txList.map(function(tx) {
      var inv = tx.invoices.length > 0
        ? tx.invoices.map(function(i){ return i.period; }).join(', ')
        : (tx.description || '');
      var plot = memberMap[tx.propertyId] ? memberMap[tx.propertyId].plotNo : tx.propertyId;
      return '  🏠 Plot ' + plot + ' — ₹' + fINR(tx.amount) + (inv ? ' (' + inv + ')' : '');
    }).join('\n');

    var msg =
      '🧾 *Receipt from SCRWA, Vampuguda*\n\n' +
      'Dear ' + m.fullName + ',\n\n' +
      'Your payment has been received & reconciled:\n\n' +
      '🔢 *Receipt No* : ' + receiptNo + '\n' +
      '📅 *Date*        : ' + bankRow.displayDate + '\n' +
      '💰 *Total Paid*  : ₹' + fINR(bankRow.amount) + '\n' +
      (isMulti ? '⚡ *Consolidated payment — ' + txRows.length + ' properties*\n' : '') +
      '\n*Details:*\n' + propSummary + '\n\n' +
      '📄 *View/Download Receipt PDF:*\n' + pdfUrl + '\n\n' +
      'Thank you for your payment! 🙏\n' +
      '_— SCRWA Management Committee_\n_' + SOCIETY_REGD + '_';

    links.push({
      mobile:  waNum,
      name:    m.fullName,
      waLink:  'https://wa.me/' + waNum + '?text=' + encodeURIComponent(msg)
    });
  });

  return links;
}

// ─── HELPERS ───────────────────────────────────────────────────────
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
    if (num === 0)  return '';
    if (num < 20)   return ones[num];
    if (num < 100)  return tens[Math.floor(num/10)] + (num%10 ? ' '+ones[num%10] : '');
    if (num < 1000) return ones[Math.floor(num/100)]+' Hundred'+(num%100?' '+w(num%100):'');
    if (num < 100000)   return w(Math.floor(num/1000))   +' Thousand'+(num%1000   ?  ' '+w(num%1000)  :'');
    if (num < 10000000) return w(Math.floor(num/100000)) +' Lakh'   +(num%100000 ? ' '+w(num%100000) :'');
    return w(Math.floor(num/10000000))+' Crore'+(num%10000000?' '+w(num%10000000):'');
  }
  return w(n).trim();
}

// ─── SHEET MENU ─────────────────────────────────────────────────────
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('🧾 SCRWA Receipts')
    .addItem('📄 Generate Receipt — Selected Bank Row', 'generateReceiptFromBankMenu')
    .addSeparator()
    .addItem('📋 Open Receipts Log', 'openReceiptsLog')
    .addToUi();
}

function generateReceiptFromBankMenu() {
  var ui    = SpreadsheetApp.getUi();
  var sheet = SpreadsheetApp.getActiveSheet();
  var row   = sheet.getActiveCell().getRow();

  if (sheet.getName() !== 'BankDetails') {
    ui.alert('⚠️ Please open the BankDetails sheet and select a row first.');
    return;
  }
  if (row <= 1) {
    ui.alert('⚠️ Please select a data row (row 2 or below).');
    return;
  }

  var reconciled = String(sheet.getRange(row, 8).getValue()).trim().toUpperCase();
  if (reconciled !== 'TRUE') {
    ui.alert('⚠️ This row is not yet Reconciled.\nReconcile the transaction in TransactionDetails first.');
    return;
  }

  var receiptNo = String(sheet.getRange(row, 3).getValue()).trim(); // Col C = RefNo
  if (!receiptNo) {
    ui.alert('⚠️ No RefNo found in column C of the selected row.');
    return;
  }

  var confirm = ui.alert('📄 Generate Receipt',
    'Generate consolidated receipt for:\nReceiptNo: ' + receiptNo, ui.ButtonSet.YES_NO);
  if (confirm !== ui.Button.YES) return;

  var result = generateConsolidatedReceipt(receiptNo);

  if (result.success) {
    var emailSummary = result.emailResults
      .map(function(r){ return (r.sent ? '✅ ' : '❌ ') + r.email; }).join('\n');
    ui.alert('✅ Receipt Generated!',
      'Receipt No : ' + result.receiptNo + '\n' +
      'Properties : ' + result.properties.join(', ') + '\n' +
      'Total      : ₹' + fINR(result.totalAmount) + '\n\n' +
      'Emails:\n' + (emailSummary || 'None — no email on record') + '\n\n' +
      'PDF URL written to BankDetails Col J.\n' +
      'PDF URL written to TransactionDetails Col P for each TxID.',
      ui.ButtonSet.OK);
  } else {
    ui.alert('❌ Failed', result.message, ui.ButtonSet.OK);
  }
}

function openReceiptsLog() {
  var ss    = SpreadsheetApp.openById(SS_ID);
  var sheet = ss.getSheetByName(RECEIPTS_LOG_SHEET);
  if (sheet) {
    SpreadsheetApp.setActiveSheet(sheet);
  } else {
    SpreadsheetApp.getUi().alert('No receipts generated yet.');
  }
}

// ─── TEST ────────────────────────────────────────────────────────────
function testReceiptGeneration() {
  // Single-property test:     TX-172 → ReceiptNo 111862041743
  // Multi-property test:      ReceiptNo 454154939921 → PID 137 + PID 138
  var testReceiptNo = '111862041743';  // ← change to test multi: '454154939921'
  Logger.log('Testing consolidated receipt for ReceiptNo: ' + testReceiptNo);
  var result = generateConsolidatedReceipt(testReceiptNo);
  Logger.log(JSON.stringify(result, null, 2));
}
