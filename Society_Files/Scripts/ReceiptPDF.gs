/**
 * ═══════════════════════════════════════════════════════════════════
 *  SCRWA — Consolidated Receipt PDF Generator  v3.0
 * ═══════════════════════════════════════════════════════════════════
 *  Account   : scwa.vampuguda@gmail.com
 *  Sheet ID  : 1oXmvMIfQDm51KoHHtkhg8KgK1Qi5mwFYSBdrwir85CA
 *
 *  WHAT THIS SCRIPT DOES:
 *  ──────────────────────
 *  1. Triggered from AppSheet action button on BankDetails row
 *     (when Reconciled = TRUE)
 *  2. Finds ALL TransactionDetails rows sharing the same ReceiptNo
 *     (one UPI payment can cover multiple properties)
 *  3. Builds ONE consolidated PDF receipt covering all properties
 *  4. Saves PDF to Drive → SCRWA_Receipts/YYYY-MM/RCPT-{receiptNo}.pdf
 *  5. Writes PDF URL to:
 *       BankDetails      Col J [9]  ReceiptPDF
 *       TransactionDetails Col P [15] ReceiptPDF  ← for EACH matched row
 *  6. Sends email (PDF attached) to every available address:
 *       Owner email      (OwnerDetails Col K)
 *       Proxy email      (ProxyDetails Col E)  — only if isProxy = Yes
 *  7. Logs to Receipts_Log sheet
 *
 *  WHATSAPP — HANDLED ENTIRELY BY APPSHEET:
 *  ─────────────────────────────────────────
 *  AppSheet already has:
 *    WhatsAppDraftMessage  — virtual formula column (per TransactionData row)
 *    WhatsAppNumber        — virtual formula column
 *    WhatsAppPURL          — virtual formula column → wa.me link
 *    Action button         — opens WhatsApp with pre-filled message
 *
 *  Once script writes ReceiptPDF URL to TransactionDetails Col P,
 *  update WhatsAppDraftMessage formula to append:
 *    IF(NOT(ISBLANK([ReceiptPDF])),
 *       CONCATENATE(CHAR(10), CHAR(10), "📄 Receipt PDF: ", [ReceiptPDF]), "")
 *
 *  This script does NOT build WA links — AppSheet owns that entirely.
 *
 *  ── SHEET COLUMNS USED ──────────────────────────────────────────
 *
 *  BankDetails (header row 1, data from row 2):
 *    Col A [0]  TxnDate
 *    Col B [1]  Narration
 *    Col C [2]  RefNo           ← KEY — matches TransactionDetails.ReceiptNo
 *    Col D [3]  ValueDate
 *    Col E [4]  Withdrawal
 *    Col F [5]  Deposit         ← bank credit amount
 *    Col G [6]  Balance
 *    Col H [7]  Reconciled      ← formula: TRUE when all TxIDs mapped
 *    Col I [8]  Source          (XLSX / ALERT / PLAIN)
 *    Col J [9]  ReceiptPDF      ← NEW: script writes PDF URL here
 *
 *  TransactionDetails (row 1=section label, row 2=headers, data row 3+):
 *    Col A [0]  TransactionID
 *    Col B [1]  ReceiptNo       ← matches BankDetails.RefNo
 *    Col C [2]  Date
 *    Col D [3]  Type
 *    Col E [4]  Mode
 *    Col F [5]  AccountHead
 *    Col G [6]  AccountSubHead
 *    Col H [7]  Amount
 *    Col I [8]  PropertyID
 *    Col J [9]  InternalOrder
 *    Col K [10] BillID
 *    Col L [11] Remarks
 *    Col M [12] Notes
 *    Col N [13] Attachments     ← manual voucher — DO NOT TOUCH
 *    Col O [14] FY Year
 *    Col P [15] ReceiptPDF      ← NEW: script writes PDF URL here
 *
 *  OwnerDetails (header row 1, data from row 2):
 *    Col A [0]  PropertyID
 *    Col B [1]  PlotNo
 *    Col D [3]  OwnershipType
 *    Col E [4]  Name
 *    Col F [5]  Name2
 *    Col H [7]  LaneNo
 *    Col J [9]  Status
 *    Col K [10] Email
 *    Col L [11] PhoneNumber
 *    Col M [12] IsWhatsApp      (not used by script — AppSheet handles WA)
 *    Col O [14] IsProxy         ("Yes" / "No")
 *
 *  ProxyDetails (header rows 1-2, data from row 3):
 *    Col A [0]  PropertyID
 *    Col B [1]  RepresentedBy
 *    Col C [2]  Relation
 *    Col E [4]  ProxyEmail
 *    Col F [5]  ProxyMobile
 *    Col G [6]  RPhonenumber    (not used by script — AppSheet handles WA)
 *    Col H [7]  RIsWhatsapp     (not used by script — AppSheet handles WA)
 *
 *  Invoice (header rows 1-2, data from row 3):
 *    Col A [0]  BillID
 *    Col B [1]  PropertyID
 *    Col E [4]  BillPeriod
 *    Col G [6]  BillAmount
 *    Col H [7]  PaidAmount
 *    Col I [8]  Balance
 *    Col J [9]  Status
 *
 *  ── APPSHEET SETUP ──────────────────────────────────────────────
 *
 *  Table: BankDetails
 *  Action: "📄 Generate Receipt"
 *    Condition : [Reconciled] = TRUE AND ISBLANK([ReceiptPDF])
 *    Type      : Call a webhook (HTTP POST to this script's doPost URL)
 *    Body      : { "action": "generateReceipt", "receiptNo": "<<[RefNo]>>" }
 *
 *  Action: "🔄 Re-generate Receipt"
 *    Condition : [Reconciled] = TRUE AND NOT(ISBLANK([ReceiptPDF]))
 *    Body      : same as above
 *
 *  Action: "📄 View Receipt"
 *    Condition : NOT(ISBLANK([ReceiptPDF]))
 *    Type      : Open a link → [ReceiptPDF]
 *
 *  ── SHEET SETUP CHECKLIST ───────────────────────────────────────
 *  BankDetails      → Add Col J header: ReceiptPDF
 *  TransactionDetails → Add Col P header: ReceiptPDF
 *  (All other columns already exist)
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
//  MAIN
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

  // 2. All TransactionDetails rows for this ReceiptNo
  var txRows = getTransactionRowsByReceiptNo(ss, receiptNo);
  if (!txRows.length)
    return { success: false, message: 'No TransactionDetails rows for: ' + receiptNo };

  // 3. Member data per PropertyID
  var memberMap = {};
  txRows.forEach(function(tx) {
    if (tx.propertyId && !memberMap[tx.propertyId]) {
      var m = getMemberData(ss, tx.propertyId);
      if (m) memberMap[tx.propertyId] = m;
    }
  });

  // 4. Invoices per TxID
  txRows.forEach(function(tx) {
    tx.invoices = [];
    if (tx.billId) {
      var ids = tx.billId.split(',').map(function(b){ return b.trim(); }).filter(Boolean);
      tx.invoices = getInvoicesByBillIds(ss, ids);
    }
  });

  // 5. Build PDF
  var pdfBlob = buildConsolidatedPdf(receiptNo, bankRow, txRows, memberMap, tz);

  // 6. Save to Drive
  var folder   = getOrCreateReceiptFolder(bankRow.date);
  var fileName = 'RCPT-' + receiptNo.replace(/[\/\\:*?"<>|]/g, '') + '.pdf';
  var iter = folder.getFilesByName(fileName);
  if (iter.hasNext()) iter.next().setTrashed(true);  // remove old version if re-generating
  var file = folder.createFile(pdfBlob.setName(fileName));
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  var pdfUrl = 'https://drive.google.com/file/d/' + file.getId() + '/view';

  // 7. Write PDF URL to BankDetails Col J + all TransactionDetails Col P rows
  writePdfUrl(ss, bankRow.sheetRow, txRows, pdfUrl);

  // 8. Send email to all available addresses (owner + proxy, no conditions)
  var emailResults = sendEmails(receiptNo, bankRow, txRows, memberMap, pdfBlob, pdfUrl, fileName);

  // 9. Log
  logReceipt(ss, receiptNo, bankRow, txRows, memberMap, fileName, pdfUrl, emailResults);

  return {
    success:      true,
    receiptNo:    receiptNo,
    pdfUrl:       pdfUrl,
    fileName:     fileName,
    txCount:      txRows.length,
    properties:   txRows.map(function(t){ return t.propertyId; }),
    totalAmount:  bankRow.amount,
    emailResults: emailResults,
    message:      'Done. PDF generated, ' + emailResults.length + ' email(s) sent. ' +
                  'WhatsApp handled by AppSheet via ReceiptPDF column.'
  };
}

// ─── GET BANK ROW ─────────────────────────────────────────────────
function getBankRow(ss, receiptNo) {
  var sheet = ss.getSheetByName('BankDetails');
  if (!sheet) return null;
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
    var deposit    = Math.abs(parseFloat(String(row[5]).replace(/[₹,]/g, '')) || 0);
    var withdrawal = Math.abs(parseFloat(String(row[4]).replace(/[₹,]/g, '')) || 0);

    return {
      sheetRow:    i + 1,
      date:        dateStr,
      displayDate: displayDate,
      narration:   String(row[1] || '').trim(),
      receiptNo:   String(row[2] || '').trim(),
      deposit:     deposit,
      withdrawal:  withdrawal,
      amount:      deposit || withdrawal,
      reconciled:  String(row[7]).trim().toUpperCase() === 'TRUE',
      source:      String(row[8] || '').trim()
    };
  }
  return null;
}

// ─── GET TRANSACTION ROWS BY ReceiptNo ───────────────────────────
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
      dateStr     = String(row[2]).substring(0, 10);
      displayDate = dateStr;
    }

    var fyYear = String(row[14] || '').trim();
    if (!fyYear && dateStr) {
      var mo = parseInt(dateStr.substring(5, 7), 10);
      var yr = parseInt(dateStr.substring(0, 4), 10);
      fyYear = mo >= 4 ? yr + '-' + (yr + 1) : (yr - 1) + '-' + yr;
    }

    result.push({
      sheetRow:       i + 1,
      txId:           String(row[0]  || '').trim(),
      receiptNo:      String(row[1]  || '').trim(),
      date:           dateStr,
      displayDate:    displayDate,
      modeClean:      String(row[4]  || '').trim().replace(/^[^\w\s₹(]+\s*/, ''),
      accountHead:    String(row[5]  || '').trim().replace(/^[^\w\s]+\s*/, ''),
      accountSubHead: String(row[6]  || '').trim().replace(/^[^\w\s]+\s*/, ''),
      amount:         Math.abs(parseFloat(row[7]) || 0),
      propertyId:     String(row[8]  || '').trim(),
      internalOrder:  String(row[9]  || '').trim(),
      billId:         String(row[10] || '').trim(),
      remarks:        String(row[11] || '').trim(),
      description:    String(row[12] || row[11] || '').trim().replace(/^[^\w\s₹(]+\s*/, ''),
      fyYear:         fyYear,
      invoices:       []
    });
  }

  Logger.log('Found ' + result.length + ' tx row(s) for ReceiptNo: ' + receiptNo);
  return result;
}

// ─── GET MEMBER DATA ─────────────────────────────────────────────
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
      member.plotNo    = String(owData[i][1]  || '').trim().replace('.0', '');
      member.ownerType = String(owData[i][3]  || 'Single').trim();
      member.name      = String(owData[i][4]  || '').trim();
      member.name2     = String(owData[i][5]  || '').trim();
      member.laneNo    = String(owData[i][7]  || '').trim();
      member.status    = String(owData[i][9]  || '').trim();
      member.email     = String(owData[i][10] || '').trim();  // Col K
      member.mobile    = String(owData[i][11] || '').trim();  // Col L PhoneNumber
      var isProxyRaw   = String(owData[i][14] || '').trim().toLowerCase();
      member.isProxy   = isProxyRaw === 'yes' || isProxyRaw === 'y' || isProxyRaw === 'true';
      member.fullName  = member.name + (member.name2 ? ' & ' + member.name2 : '');
      break;
    }
  }
  if (!member.name) return null;

  // Proxy details — only populated when AppSheet has set isProxy = Yes
  if (member.isProxy) {
    var prSheet = ss.getSheetByName('ProxyDetails');
    if (prSheet) {
      var prData = prSheet.getDataRange().getValues();
      for (var j = 2; j < prData.length; j++) {
        if (String(prData[j][0]).trim() !== propertyId) continue;
        member.proxyName   = String(prData[j][1] || '').trim();  // Col B RepresentedBy
        member.proxyEmail  = String(prData[j][4] || '').trim();  // Col E ProxyEmail
        member.proxyMobile = String(prData[j][5] || '').trim();  // Col F ProxyMobile
        break;
      }
    }
  }
  return member;
}

// ─── GET INVOICES ────────────────────────────────────────────────
function getInvoicesByBillIds(ss, billIds) {
  var sheet = ss.getSheetByName('Invoice');
  if (!sheet || !billIds || !billIds.length) return [];
  var data  = sheet.getDataRange().getValues();
  var tz    = Session.getScriptTimeZone();
  var found = [];
  var idSet = {};
  billIds.forEach(function(b) { idSet[b] = true; });

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
      status:     String(row[9] || '').trim().replace(/^[^\w\s]+\s*/, '')
    });
  }
  return found;
}

// ─── WRITE PDF URL TO SHEETS ─────────────────────────────────────
function writePdfUrl(ss, bankSheetRow, txRows, pdfUrl) {
  // BankDetails Col J [9] = ReceiptPDF
  var bankSheet = ss.getSheetByName('BankDetails');
  if (bankSheet) bankSheet.getRange(bankSheetRow, 10).setValue(pdfUrl);

  // TransactionDetails Col P [15] = ReceiptPDF — write to every matched row
  var txSheet = ss.getSheetByName('TransactionDetails');
  if (txSheet) {
    txRows.forEach(function(tx) {
      txSheet.getRange(tx.sheetRow, 16).setValue(pdfUrl);
    });
  }
}

// ─── DRIVE FOLDER ────────────────────────────────────────────────
function getOrCreateReceiptFolder(dateStr) {
  var root = DriveApp.getRootFolder();
  var mf   = root.getFoldersByName(RECEIPTS_FOLDER);
  var main = mf.hasNext() ? mf.next() : root.createFolder(RECEIPTS_FOLDER);
  var monthKey = dateStr
    ? dateStr.substring(0, 7)
    : Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM');
  var sf = main.getFoldersByName(monthKey);
  return sf.hasNext() ? sf.next() : main.createFolder(monthKey);
}

// ─── SEND EMAILS ─────────────────────────────────────────────────
// Sends to ALL available email addresses — owner + proxy both, no conditions.
// Deduped by lowercase email address so no duplicate if both share same address.
function sendEmails(receiptNo, bankRow, txRows, memberMap, pdfBlob, pdfUrl, fileName) {
  var results  = [];
  var emailMap = {};  // lowercase addr → { displayName, proxyNote, entries[] }

  function addAddr(addr, displayName, proxyNote, tx, member) {
    var a = String(addr || '').trim().toLowerCase();
    if (!a || a.indexOf('@') < 1) return;
    if (!emailMap[a]) emailMap[a] = { displayName: displayName, proxyNote: proxyNote, entries: [] };
    emailMap[a].entries.push({ tx: tx, member: member });
  }

  txRows.forEach(function(tx) {
    var m = memberMap[tx.propertyId];
    if (!m) return;
    // Owner email — always
    addAddr(m.email, m.fullName, '', tx, m);
    // Proxy email — always if present (isProxy = Yes enforced by AppSheet)
    if (m.proxyEmail) {
      addAddr(m.proxyEmail,
        m.proxyName || m.fullName,
        m.proxyName ? ' (Representative for ' + m.fullName + ')' : '',
        tx, m);
    }
  });

  var isMulti = txRows.length > 1;

  Object.keys(emailMap).forEach(function(addr) {
    var info = emailMap[addr];

    // Property breakdown rows for this recipient
    var propRowsHtml = info.entries.map(function(e) {
      var inv = e.tx.invoices.length > 0
        ? e.tx.invoices.map(function(i) { return i.period; }).join(', ')
        : (e.tx.description || '—');
      var mm = memberMap[e.tx.propertyId] || {};
      return '<tr>' +
        '<td style="padding:7px 12px;background:#f8fafc;border-bottom:1px solid #e2e8f0">' +
          'Plot ' + (mm.plotNo || e.tx.propertyId) + '</td>' +
        '<td style="padding:7px 12px;border-bottom:1px solid #e2e8f0">' + inv + '</td>' +
        '<td style="padding:7px 12px;border-bottom:1px solid #e2e8f0;' +
          'text-align:right;color:#15803d;font-weight:700">₹' + fINR(e.tx.amount) + '</td>' +
        '</tr>';
    }).join('');

    var subject = '🧾 Receipt #' + receiptNo +
                  ' — ₹' + fINR(bankRow.amount) +
                  (isMulti ? ' (' + txRows.length + ' Properties)' : '') +
                  ' | ' + SOCIETY_SHORT;

    var body =
      '<div style="font-family:Arial,sans-serif;max-width:560px;color:#1a1a2e">' +
      '<div style="background:linear-gradient(135deg,#0f2744,#1e4d8c);color:#fff;' +
        'padding:16px 20px;border-radius:8px 8px 0 0">' +
      '<h2 style="margin:0;font-size:15px">🏘️ ' + SOCIETY_SHORT + '</h2>' +
      '<p style="margin:4px 0 0;font-size:11px;opacity:.8">' + SOCIETY_REGD + '</p>' +
      '</div>' +
      '<div style="border:1px solid #d1dce8;border-top:none;padding:20px;' +
        'border-radius:0 0 8px 8px">' +
      '<p>Dear <strong>' + info.displayName + '</strong>' + info.proxyNote + ',</p>' +
      '<p>Your payment has been received and reconciled. Receipt details:</p>' +

      // Summary table
      '<table style="width:100%;border-collapse:collapse;font-size:13px;margin:10px 0">' +
      '<tr><td style="padding:7px 12px;background:#f8fafc;width:38%;' +
        'border-bottom:1px solid #e2e8f0"><b>Receipt No</b></td>' +
        '<td style="padding:7px 12px;border-bottom:1px solid #e2e8f0">' + receiptNo + '</td></tr>' +
      '<tr><td style="padding:7px 12px;background:#f8fafc;border-bottom:1px solid #e2e8f0">' +
        '<b>Date</b></td>' +
        '<td style="padding:7px 12px;border-bottom:1px solid #e2e8f0">' + bankRow.displayDate + '</td></tr>' +
      '<tr><td style="padding:7px 12px;background:#f8fafc;border-bottom:1px solid #e2e8f0">' +
        '<b>Total Amount</b></td>' +
        '<td style="padding:7px 12px;border-bottom:1px solid #e2e8f0;' +
        'color:#15803d;font-weight:700">₹' + fINR(bankRow.amount) + '</td></tr>' +
      '</table>' +

      // Multi-property note
      (isMulti
        ? '<p style="font-size:12px;background:#fef3c7;padding:8px 12px;border-radius:6px">' +
          '⚡ Consolidated payment covering <strong>' + txRows.length + ' properties</strong>.</p>'
        : '') +

      // Per-property breakdown
      '<table style="width:100%;border-collapse:collapse;font-size:12px;margin-top:8px">' +
      '<tr style="background:#1e4d8c;color:#fff">' +
      '<th style="padding:7px 12px;text-align:left">Plot</th>' +
      '<th style="padding:7px 12px;text-align:left">For Period</th>' +
      '<th style="padding:7px 12px;text-align:right">Amount</th></tr>' +
      propRowsHtml + '</table>' +

      // PDF links
      '<p style="margin-top:16px">📎 <strong>Receipt PDF is attached to this email.</strong></p>' +
      '<p>🔗 <a href="' + pdfUrl + '" style="color:#1e4d8c">' +
        'View / Download Receipt (Google Drive)</a></p>' +

      '<hr style="border:none;border-top:1px solid #e2e8f0;margin:14px 0">' +
      '<p style="font-size:11px;color:#64748b">' +
        'System-generated email · Do not reply directly.<br>' +
        '📧 ' + SOCIETY_EMAIL + ' · ' + SOCIETY_REGD + '</p>' +
      '</div></div>';

    try {
      GmailApp.sendEmail(
        addr,
        subject,
        'Please use an HTML email client to view this message.',
        {
          htmlBody:    body,
          attachments: [pdfBlob.setName(fileName)],
          name:        SOCIETY_SHORT,
          replyTo:     SOCIETY_EMAIL
        }
      );
      results.push({ to: addr, name: info.displayName, sent: true });
      Logger.log('✅ Email sent → ' + addr);
    } catch (err) {
      results.push({ to: addr, name: info.displayName, sent: false, error: err.toString() });
      Logger.log('❌ Email failed → ' + addr + ' | ' + err.toString());
    }
  });

  return results;
}

// ─── LOG ─────────────────────────────────────────────────────────
function logReceipt(ss, receiptNo, bankRow, txRows, memberMap, fileName, pdfUrl, emailResults) {
  var logSheet = ss.getSheetByName(RECEIPTS_LOG_SHEET);
  if (!logSheet) {
    logSheet = ss.insertSheet(RECEIPTS_LOG_SHEET);
    logSheet.appendRow(['Generated At', 'Receipt No', 'Date', 'Total ₹',
                        '# Properties', 'Property IDs', 'Owners',
                        'Emails Sent', 'File', 'PDF URL']);
    logSheet.getRange(1, 1, 1, 10)
      .setFontWeight('bold').setBackground('#0f2744').setFontColor('#ffffff');
    logSheet.setFrozenRows(1);
  }
  var now   = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');
  var pids  = txRows.map(function(t) { return t.propertyId; }).join(', ');
  var names = txRows.map(function(t) {
    var m = memberMap[t.propertyId];
    return m ? m.fullName : t.propertyId;
  }).join(' | ');
  var sent  = emailResults
    .filter(function(r) { return r.sent; })
    .map(function(r) { return r.to; })
    .join(', ');

  logSheet.appendRow([now, receiptNo, bankRow.displayDate, bankRow.amount,
                      txRows.length, pids, names, sent || 'None', fileName, pdfUrl]);
}

// ═══════════════════════════════════════════════════════════════════
//  BUILD CONSOLIDATED PDF
// ═══════════════════════════════════════════════════════════════════
function buildConsolidatedPdf(receiptNo, bankRow, txRows, memberMap, tz) {
  var isMulti  = txRows.length > 1;
  var totalAmt = bankRow.amount;
  var fyYear   = txRows.length > 0 ? txRows[0].fyYear    : '';
  var mode     = txRows.length > 0 ? txRows[0].modeClean : 'UPI / Online';

  var propRows = txRows.map(function(tx, idx) {
    var m = memberMap[tx.propertyId] || {};

    // Invoice detail
    var invDetail = '';
    if (tx.invoices.length > 0) {
      invDetail = tx.invoices.map(function(inv) {
        return inv.period + ' (₹' + fINR(inv.billAmount) + ')';
      }).join(', ');
    } else if (tx.billId) {
      var mRes = tx.billId.match(/([A-Za-z]{3})(\d{4})/);
      if (mRes) invDetail = mRes[1] + ' ' + mRes[2];
      else invDetail = tx.description || '—';
    } else {
      invDetail = tx.description || '—';
    }

    // Badges
    var jointBadge = m.ownerType === 'Joint'
      ? ' <span style="background:#dbeafe;color:#1e40af;font-size:10px;' +
        'padding:1px 6px;border-radius:8px">Joint</span>' : '';
    var proxyNote = (m.isProxy && m.proxyName)
      ? '<br><span style="font-size:10px;color:#64748b">Rep: ' + m.proxyName + '</span>' : '';
    var bg = idx % 2 === 0 ? '#ffffff' : '#f8faff';

    return '<tr style="background:' + bg + '">' +
      '<td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;font-weight:600">' +
        (m.plotNo || tx.propertyId) + '</td>' +
      '<td style="padding:8px 10px;border-bottom:1px solid #e2e8f0">' +
        (m.fullName || '—') + jointBadge + proxyNote + '</td>' +
      '<td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;' +
        'font-size:11px;color:#475569">' + (m.laneNo || '—') + '</td>' +
      '<td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;font-size:11px">' +
        invDetail + '</td>' +
      '<td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;' +
        'text-align:right;font-weight:600;color:#15803d">₹' + fINR(tx.amount) + '</td>' +
      '</tr>';
  }).join('');

  var html =
    '<!DOCTYPE html><html><head><meta charset="UTF-8"><style>' +
    'body{font-family:Arial,Helvetica,sans-serif;margin:0;padding:0;color:#1a1a2e;font-size:13px}' +
    '.page{width:700px;margin:0 auto;padding:28px}' +
    '.hdr{background:linear-gradient(135deg,#0f2744,#1e4d8c);color:#fff;padding:18px 24px;' +
      'border-radius:10px 10px 0 0;display:flex;align-items:center;justify-content:space-between}' +
    '.hdr h1{margin:0;font-size:16px;font-weight:700}' +
    '.hdr p{margin:4px 0 0;font-size:11px;opacity:.8}' +
    '.badge{background:#FFD700;color:#0f2744;padding:5px 18px;border-radius:20px;' +
      'font-weight:700;font-size:14px}' +
    '.body{border:1px solid #d1dce8;border-top:none;border-radius:0 0 10px 10px;' +
      'padding:22px 24px;background:#fff}' +
    '.mgrid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px 20px;margin-bottom:16px}' +
    '.mi .lbl{font-size:10px;color:#94a3b8;font-weight:600;text-transform:uppercase;letter-spacing:.4px}' +
    '.mi .val{font-size:13px;color:#1a1a2e;font-weight:600;margin-top:2px}' +
    '.sec{font-weight:700;font-size:11px;color:#0f2744;margin:14px 0 8px;padding:4px 10px;' +
      'background:#f0f5ff;border-left:3px solid #1e4d8c;border-radius:0 4px 4px 0;' +
      'text-transform:uppercase;letter-spacing:.5px}' +
    '.ptbl{width:100%;border-collapse:collapse;font-size:12px}' +
    '.ptbl th{background:#1e4d8c;color:#fff;padding:8px 10px;text-align:left;' +
      'font-size:11px;font-weight:600}' +
    '.ptbl th:last-child{text-align:right}' +
    '.amt-box{background:linear-gradient(135deg,#f0fdf4,#dcfce7);border:2px solid #16a34a;' +
      'border-radius:10px;padding:14px 20px;margin:16px 0;text-align:center}' +
    '.amt-box .amt{font-size:26px;font-weight:700;color:#15803d}' +
    '.amt-box .wds{font-size:12px;color:#166534;margin-top:3px;font-style:italic}' +
    '.brow{display:flex;gap:10px;margin-bottom:6px}' +
    '.blbl{width:150px;font-size:12px;font-weight:600;color:#64748b;flex-shrink:0}' +
    '.bval{font-size:12px;color:#1a1a2e}' +
    '.cbadge{display:inline-block;background:#fef3c7;color:#92400e;font-size:11px;' +
      'padding:2px 10px;border-radius:10px;margin-bottom:10px;font-weight:600}' +
    '.stamp-row{text-align:right;margin-top:16px}' +
    '.stamp{display:inline-block;border:2.5px solid #15803d;color:#15803d;' +
      'padding:5px 20px;border-radius:4px;font-weight:700;font-size:13px;transform:rotate(-8deg)}' +
    '.ftr{text-align:center;margin-top:20px;font-size:11px;color:#94a3b8;' +
      'border-top:1px solid #e2e8f0;padding-top:14px;line-height:1.8}' +
    '</style></head><body><div class="page">' +

    // Header
    '<div class="hdr">' +
    '<div><h1>🏘️ ' + SOCIETY_NAME + '</h1>' +
    '<p>' + SOCIETY_REGD + ' · Vampuguda, Hyderabad</p></div>' +
    '<div class="badge">RECEIPT</div>' +
    '</div>' +

    '<div class="body">' +
    (isMulti
      ? '<div class="cbadge">⚡ Consolidated Payment — ' + txRows.length + ' Properties</div>'
      : '') +

    // Meta
    '<div class="mgrid">' +
    '<div class="mi"><div class="lbl">Receipt No</div>' +
      '<div class="val">' + receiptNo + '</div></div>' +
    '<div class="mi"><div class="lbl">Date</div>' +
      '<div class="val">' + bankRow.displayDate + '</div></div>' +
    '<div class="mi"><div class="lbl">FY Year</div>' +
      '<div class="val">' + fyYear + '</div></div>' +
    '</div>' +

    // Bank details
    '<div class="sec">🏦 Bank Transaction</div>' +
    '<div class="brow"><span class="blbl">UPI Ref / Receipt No</span>' +
      '<span class="bval"><strong>' + receiptNo + '</strong></span></div>' +
    '<div class="brow"><span class="blbl">Narration</span>' +
      '<span class="bval">' + bankRow.narration + '</span></div>' +
    '<div class="brow"><span class="blbl">Payment Mode</span>' +
      '<span class="bval">' + mode + '</span></div>' +

    // Amount
    '<div class="amt-box">' +
    '<div class="amt">₹' + fINR(totalAmt) + '</div>' +
    '<div class="wds">Rupees ' + numberToWords(totalAmt) + ' Only</div>' +
    '</div>' +

    // Properties table
    '<div class="sec">📋 ' +
      (isMulti ? 'Properties Covered' : 'Member & Invoice Details') + '</div>' +
    '<table class="ptbl"><thead><tr>' +
    '<th>Plot</th><th>Owner</th><th>Lane</th>' +
    '<th>For Period / Invoice</th><th style="text-align:right">Amount</th>' +
    '</tr></thead><tbody>' + propRows + '</tbody>' +
    (isMulti
      ? '<tfoot><tr>' +
        '<td colspan="4" style="padding:8px 10px;font-weight:700;text-align:right;' +
          'background:#f8faff;font-size:12px">Total</td>' +
        '<td style="padding:8px 10px;text-align:right;font-weight:700;' +
          'color:#15803d;background:#f8faff">₹' + fINR(totalAmt) + '</td>' +
        '</tr></tfoot>'
      : '') +
    '</table>' +

    '<div class="stamp-row"><span class="stamp">✓ RECEIVED</span></div>' +

    '<div class="ftr">' +
    'System-generated receipt · No signature required<br>' +
    SOCIETY_NAME + ' · ' + SOCIETY_REGD + '<br>' +
    '📧 ' + SOCIETY_EMAIL + '<br>' +
    '<span style="font-size:10px;color:#cbd5e1">Generated: ' +
    Utilities.formatDate(new Date(), tz, "dd MMM yyyy 'at' HH:mm") + ' IST</span>' +
    '</div>' +
    '</div></div></body></html>';

  return Utilities.newBlob(html, 'text/html', 'receipt.html').getAs('application/pdf');
}

// ─── HELPERS ─────────────────────────────────────────────────────
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
    if (num < 1000)     return ones[Math.floor(num/100)] + ' Hundred' +
                               (num%100 ? ' '+w(num%100) : '');
    if (num < 100000)   return w(Math.floor(num/1000))   + ' Thousand' +
                               (num%1000   ? ' '+w(num%1000)   : '');
    if (num < 10000000) return w(Math.floor(num/100000)) + ' Lakh'     +
                               (num%100000 ? ' '+w(num%100000) : '');
    return w(Math.floor(num/10000000)) + ' Crore' +
           (num%10000000 ? ' '+w(num%10000000) : '');
  }
  return w(n).trim();
}

// ─── SHEET MENU ──────────────────────────────────────────────────
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
    ui.alert('⚠️ Please open the BankDetails sheet and select any cell in a data row first.');
    return;
  }
  if (row <= 1) {
    ui.alert('⚠️ Please select a data row (row 2 or below).');
    return;
  }
  var reconciled = String(sheet.getRange(row, 8).getValue()).trim().toUpperCase();
  if (reconciled !== 'TRUE') {
    ui.alert('⚠️ Row not yet Reconciled.\nMap the transaction in TransactionDetails first.');
    return;
  }
  var receiptNo = String(sheet.getRange(row, 3).getValue()).trim();
  if (!receiptNo) {
    ui.alert('⚠️ No RefNo found in Col C of selected row.');
    return;
  }

  var confirm = ui.alert(
    '📄 Generate Receipt',
    'ReceiptNo: ' + receiptNo + '\n\nThis will:\n' +
    '• Generate consolidated PDF\n' +
    '• Send email(s) with PDF attached\n' +
    '• Write PDF URL to BankDetails Col J + TransactionDetails Col P\n' +
    '  (AppSheet WhatsApp button will include PDF link automatically)',
    ui.ButtonSet.YES_NO
  );
  if (confirm !== ui.Button.YES) return;

  var result = generateConsolidatedReceipt(receiptNo);

  if (result.success) {
    var emailSummary = result.emailResults
      .map(function(r) { return (r.sent ? '✅' : '❌') + ' ' + r.to; })
      .join('\n') || 'None — no email on record';

    ui.alert('✅ Done!',
      'Receipt No  : ' + result.receiptNo + '\n' +
      'Properties  : ' + result.properties.join(', ') + '\n' +
      'Total       : ₹' + fINR(result.totalAmount) + '\n' +
      'Transactions: ' + result.txCount + '\n\n' +
      'Emails:\n' + emailSummary + '\n\n' +
      'WhatsApp: Open AppSheet → tap Send WhatsApp on each transaction row\n' +
      '(ReceiptPDF link now included in message automatically)',
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

// ─── TEST ────────────────────────────────────────────────────────
function testReceiptGeneration() {
  // Single property  : 111862041743  (PID 141, ₹500)
  // Multi-property   : 454154939921  (PID 137 + PID 138, ₹2000)
  var testReceiptNo = '111862041743';
  Logger.log('▶ Test: ReceiptNo ' + testReceiptNo);
  var result = generateConsolidatedReceipt(testReceiptNo);
  Logger.log(JSON.stringify(result, null, 2));
}
