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
 *    Col I [8]  ReceiptPDF      ← script writes PDF URL here      ← script writes PDF URL here
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
  var pdfBlob  = buildPdf(receiptNo, bankRow, txRows, memberMap, ioMap, tz);

  // 7. Save to Drive
  var folder   = getOrCreateFolder(bankRow.date);
  var fileName = 'RCPT-' + receiptNo.replace(/[\/\\:*?"<>|]/g,'') + '.pdf';
  var iter     = folder.getFilesByName(fileName);
  if (iter.hasNext()) iter.next().setTrashed(true);
  var file     = folder.createFile(pdfBlob.setName(fileName));
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  var pdfUrl   = 'https://drive.google.com/file/d/' + file.getId() + '/view';

  // 8. Write URL to BankDetails Col J + TransactionDetails Col P
  writePdfUrl(ss, bankRow.sheetRow, txRows, pdfUrl);

  // 9. Log (email NOT sent here — treasurer sends manually via menu)
  logReceipt(ss, receiptNo, bankRow, txRows, memberMap, fileName, pdfUrl, []);

  return {
    success:      true,
    receiptNo:    receiptNo,
    pdfUrl:       pdfUrl,
    fileName:     fileName,
    txCount:      txRows.length,
    properties:   txRows.map(function(t){ return t.propertyId; }),
    totalAmount:  bankRow.amount,
    emailSent:    false,
    message:      'PDF generated. Use "Send Receipt Email" to email the owner.'
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
    found.push({
      billId:    billId,
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
function writePdfUrl(ss, bankSheetRow, txRows, pdfUrl) {
  var bSheet = ss.getSheetByName('BankDetails');
  if (bSheet) bSheet.getRange(bankSheetRow, 9).setValue(pdfUrl);    // Col I ReceiptPDF
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

  // ── TEST MODE: set to "" to send to real addresses ──────────
  var TEST_EMAIL = 'parthok@gmail.com';
  // ────────────────────────────────────────────────────────────

  var emailMap = {};   // lowercase addr → { displayName, entries[] }

  function addAddr(addr, displayName, tx, member) {
    var a = String(addr || '').trim().toLowerCase();
    if (!a || a.indexOf('@') < 1) return;
    if (!emailMap[a]) emailMap[a] = { displayName: displayName, entries: [] };
    emailMap[a].entries.push({ tx: tx, member: member });
  }

  txRows.forEach(function(tx) {
    var m = memberMap[tx.propertyId];
    if (!m) return;
    addAddr(m.email,       m.fullName,                       tx, m);   // owner email
    addAddr(m.proxyEmail,  m.proxyName || m.fullName,        tx, m);   // proxy email
  });

  var isMulti = txRows.length > 1;

  Object.keys(emailMap).forEach(function(addr) {
    var info = emailMap[addr];
    var propRowsHtml = info.entries.map(function(e) {
      var tx = e.tx;
      var mm = memberMap[tx.propertyId] || {};
      var invRows = '';
      if (tx.invoices && tx.invoices.length > 0) {
        invRows = tx.invoices.map(function(inv) {
          return '<tr style="font-size:11px">' +
            '<td style="padding:4px 8px;color:#475569;border-bottom:1px solid #f1f5f9">' + inv.billId + '</td>' +
            '<td style="padding:4px 8px;border-bottom:1px solid #f1f5f9">' + inv.period + '</td>' +
            '<td style="padding:4px 8px;text-align:right;border-bottom:1px solid #f1f5f9">₹' + fINR(inv.billAmt) + '</td>' +
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

        // ── Row 1: LocationName · Plot No · PropertyID ───────────
        '<tr style="background:#0f2744;color:#fff">' +
        '<td style="padding:6px 12px;font-size:12px;font-weight:700">' +
          (mm.locationName || 'Property') +
        '</td>' +
        '<td style="padding:6px 12px;font-size:11px;opacity:.8;text-align:right">' +
          'Plot No: ' + (mm.plotNo || '—') +
          ' &nbsp;|&nbsp; Property ID: ' + tx.propertyId +
        '</td>' +
        '</tr>' +

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
          '<div style="font-size:10px;opacity:.75;margin-top:2px">FY: ' + tx.fyYear + '</div>' +
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

    var body =
      '<div style="font-family:Arial,sans-serif;max-width:620px;color:#1a1a2e">' +

      // Header
      '<div style="background:linear-gradient(135deg,#0f2744,#1e4d8c);color:#fff;' +
        'padding:16px 22px;border-radius:8px 8px 0 0;display:flex;' +
        'justify-content:space-between;align-items:center">' +
      '<div><h2 style="margin:0;font-size:15px">' + SOCIETY_SHORT + '</h2>' +
      '<p style="margin:3px 0 0;font-size:11px;opacity:.8">' + SOCIETY_REGD + '</p></div>' +
      '<div style="background:#FFD700;color:#0f2744;padding:4px 14px;border-radius:16px;' +
        'font-weight:700;font-size:13px">RECEIPT</div>' +
      '</div>' +

      '<div style="border:1px solid #d1dce8;border-top:none;padding:20px 22px;' +
        'border-radius:0 0 8px 8px">' +
      '<p>Dear <strong>' + info.displayName + '</strong>,</p>' +
      '<p>This is to confirm that your payment has been received and reconciled. Details are provided below.</p>' +

      // Summary row
      '<table style="width:100%;border-collapse:collapse;font-size:13px;margin:10px 0">' +
      '<tr><td style="padding:7px 10px;background:#f8fafc;width:35%;border-bottom:1px solid #e2e8f0"><b>Receipt No</b></td>' +
        '<td style="padding:7px 10px;border-bottom:1px solid #e2e8f0"><b>' + receiptNo + '</b></td></tr>' +
      '<tr><td style="padding:7px 10px;background:#f8fafc;border-bottom:1px solid #e2e8f0"><b>Date</b></td>' +
        '<td style="padding:7px 10px;border-bottom:1px solid #e2e8f0">' + bankRow.displayDate + '</td></tr>' +
      '<tr><td style="padding:7px 10px;background:#f8fafc;border-bottom:1px solid #e2e8f0"><b>Total Amount</b></td>' +
        '<td style="padding:7px 10px;border-bottom:1px solid #e2e8f0;color:#15803d;font-weight:700">' +
        '₹' + fINR(bankRow.amount) + '</td></tr>' +
      (isMulti
        ? '<tr><td style="padding:7px 10px;background:#f8fafc;border-bottom:1px solid #e2e8f0"><b>Properties</b></td>' +
          '<td style="padding:7px 10px;border-bottom:1px solid #e2e8f0">' + txRows.length + ' plots covered</td></tr>'
        : '') +
      '</table>' +

      // Property + invoice detail
      '<p style="font-weight:700;font-size:12px;color:#0f2744;margin:14px 0 6px;' +
        'border-left:3px solid #1e4d8c;padding-left:8px">PAYMENT DETAILS</p>' +
      '<table style="width:100%;border-collapse:collapse">' + propRowsHtml + '</table>' +

      // PDF links
      '<div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;' +
        'padding:12px 16px;margin:14px 0">' +
      '<p style="margin:0 0 6px;font-weight:700;font-size:12px">Receipt PDF</p>' +
      '<p style="margin:0 0 4px;font-size:12px">The receipt PDF is attached to this email. Please save it for your records.</p>' +
      '<p style="margin:0;font-size:12px"><a href="' + pdfUrl +
        '" style="color:#1e4d8c">View / Download online (Google Drive)</a></p>' +
      '</div>' +

      '<hr style="border:none;border-top:1px solid #e2e8f0;margin:14px 0">' +
      '<p style="font-size:11px;color:#64748b;margin:0">' +
        'This is a system-generated email. Please do not reply to this message.<br>' +
        SOCIETY_EMAIL + ' | ' + SOCIETY_REGD + '</p>' +
      '</div></div>';

    try {
      GmailApp.sendEmail(TEST_EMAIL || addr, TEST_EMAIL ? '[TEST to: ' + addr + '] ' + subject : subject,
        'Please use an HTML-capable email client to view this receipt.',
        {
          htmlBody:    body,
          attachments: [pdfBlob.setName(fileName)],
          name:        SOCIETY_SHORT,
          replyTo:     SOCIETY_EMAIL
        });
      results.push({ to: addr, name: info.displayName, sent: true });
      Logger.log('✅ Email → ' + addr);
    } catch(err) {
      results.push({ to: addr, name: info.displayName, sent: false, error: err.toString() });
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

  // ── Per-property blocks ─────────────────────────────────────────
  var propBlocks = txRows.map(function(tx, idx) {
    var m        = memberMap[tx.propertyId] || {};
    var ioLabel  = tx.ioName || tx.internalOrder || '—';
    var bg       = idx % 2 === 0 ? '#ffffff' : '#f8faff';

    // Invoice breakup rows
    var invRows = '';
    var invSubtotal = { bill: 0, paid: 0, bal: 0 };
    if (tx.invoices && tx.invoices.length > 0) {
      tx.invoices.forEach(function(inv) {
        invSubtotal.bill += inv.billAmt;
        invSubtotal.paid += inv.paidAmt;
        invSubtotal.bal  += inv.balance;
        invRows += '<tr>' +
          '<td style="padding:5px 8px;font-size:10px;color:#475569;border-bottom:1px solid #f1f5f9">' + inv.billId + '</td>' +
          '<td style="padding:5px 8px;font-size:11px;border-bottom:1px solid #f1f5f9">' + inv.period + '</td>' +
          '<td style="padding:5px 8px;font-size:11px;text-align:right;border-bottom:1px solid #f1f5f9">₹' + fINR(inv.billAmt) + '</td>' +
          '<td style="padding:5px 8px;font-size:11px;text-align:right;border-bottom:1px solid #f1f5f9;color:#15803d">₹' + fINR(inv.paidAmt) + '</td>' +
          '<td style="padding:5px 8px;font-size:11px;text-align:right;border-bottom:1px solid #f1f5f9;color:' +
            (inv.balance > 0 ? '#dc2626' : '#64748b') + '">' +
            (inv.balance > 0 ? '₹'+fINR(inv.balance) : '₹0') + '</td>' +
          '<td style="padding:5px 8px;font-size:11px;border-bottom:1px solid #f1f5f9">' + inv.status + '</td>' +
          '</tr>';
      });
      // Subtotal row (only if multiple invoices)
      if (tx.invoices.length > 1) {
        invRows += '<tr style="background:#f0fdf4;font-weight:700">' +
          '<td colspan="2" style="padding:5px 8px;font-size:11px">Sub-total</td>' +
          '<td style="padding:5px 8px;font-size:11px;text-align:right">₹' + fINR(invSubtotal.bill) + '</td>' +
          '<td style="padding:5px 8px;font-size:11px;text-align:right;color:#15803d">₹' + fINR(invSubtotal.paid) + '</td>' +
          '<td style="padding:5px 8px;font-size:11px;text-align:right;color:' +
            (invSubtotal.bal > 0 ? '#dc2626' : '#64748b') + '">' +
            (invSubtotal.bal > 0 ? '₹'+fINR(invSubtotal.bal) : '₹0') + '</td>' +
          '<td></td></tr>';
      }
    }

    var jointBadge = m.ownerType === '👥 Joint' || m.ownerType === 'Joint'
      ? ' <span style="background:rgba(219,234,254,.3);color:#bfdbfe;font-size:9px;' +
        'padding:1px 5px;border-radius:6px">Joint</span>' : '';
    var proxyNote = (m.isProxy && m.proxyName)
      ? ' <span style="font-size:10px;opacity:.8">| Rep: ' + m.proxyName + '</span>' : '';

    return '<div style="border:1px solid #d1dce8;border-radius:8px;margin-bottom:14px;' +
      'background:' + bg + ';overflow:hidden">' +

      // ── Block title bar: LocationName · Plot No · PropertyID ────
      '<div style="background:#0f2744;color:#ffffff;padding:7px 14px;' +
        'display:flex;justify-content:space-between;align-items:center">' +
      '<div style="font-size:12px;font-weight:700;letter-spacing:.3px;color:#ffffff">' +
        (m.locationName || 'Property') +
      '</div>' +
      '<div style="font-size:11px;opacity:.8">' +
        'Plot No: ' + (m.plotNo || '—') +
        ' &nbsp;|&nbsp; Property ID: ' + tx.propertyId +
      '</div>' +
      '</div>' +

      // ── Owner + Purpose + Amount bar ────────────────────────────
      '<div style="background:#1e4d8c;color:#ffffff;padding:9px 14px;' +
        'display:flex;justify-content:space-between;align-items:flex-start">' +
      '<div>' +
      '<div style="font-size:13px;font-weight:700;color:#ffffff">' + (m.fullName || '-') + jointBadge + '</div>' +
      proxyNote +
      '<div style="font-size:12px;margin-top:4px;font-weight:600;opacity:.95">' +
        ioLabel +
        ' <span style="font-weight:400;opacity:.75;font-size:10px">(' + tx.internalOrder + ')</span>' +
      '</div>' +
      '</div>' +
      '<div style="text-align:right">' +
      '<div style="font-size:20px;font-weight:700">₹' + fINR(tx.amount) + '</div>' +
      '<div style="font-size:10px;margin-top:2px;opacity:.75">FY: ' + tx.fyYear + '</div>' +
      '</div>' +
      '</div>' +

      // Invoice breakup
      (invRows
        ? '<div style="padding:8px 12px">' +
          '<table style="width:100%;border-collapse:collapse">' +
          '<tr style="background:#e8f0fe">' +
          '<th style="padding:5px 8px;text-align:left;font-size:10px;font-weight:600;color:#475569">Bill ID</th>' +
          '<th style="padding:5px 8px;text-align:left;font-size:10px;font-weight:600;color:#475569">Period</th>' +
          '<th style="padding:5px 8px;text-align:right;font-size:10px;font-weight:600;color:#475569">Bill Amt</th>' +
          '<th style="padding:5px 8px;text-align:right;font-size:10px;font-weight:600;color:#475569">Paid</th>' +
          '<th style="padding:5px 8px;text-align:right;font-size:10px;font-weight:600;color:#475569">Balance</th>' +
          '<th style="padding:5px 8px;text-align:left;font-size:10px;font-weight:600;color:#475569">Status</th>' +
          '</tr>' + invRows + '</table></div>'
        : '<div style="padding:8px 12px;font-size:11px;color:#94a3b8">' +
          (tx.notes || tx.remarks ? (tx.notes || tx.remarks) : 'Direct payment — no invoice linked') +
          '</div>') +
      '</div>';
  }).join('');

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
    'body{font-family:Arial,Helvetica,sans-serif;margin:0;padding:0;color:#1a1a2e;font-size:13px}' +
    '.page{width:680px;margin:0 auto;padding:24px}' +
    '</style></head><body><div class="page">' +

    // Page header
    '<div style="background:linear-gradient(135deg,#0f2744,#1e4d8c);color:#fff;' +
      'padding:16px 20px;border-radius:10px 10px 0 0;' +
      'display:flex;justify-content:space-between;align-items:center">' +
    '<div>' +
    '<h1 style="margin:0;font-size:15px;font-weight:700;color:#ffffff">' + SOCIETY_NAME + '</h1>' +
    '<p style="margin:3px 0 0;font-size:11px;opacity:.8">' + SOCIETY_REGD + ' · Vampuguda, Hyderabad</p>' +
    '</div>' +
    '<div style="background:#FFD700;color:#0f2744;padding:5px 18px;' +
      'border-radius:20px;font-weight:700;font-size:14px">RECEIPT</div>' +
    '</div>' +

    '<div style="border:1px solid #d1dce8;border-top:none;border-radius:0 0 10px 10px;' +
      'padding:20px;background:#fff">' +

    // Consolidated badge
    (isMulti
      ? '<div style="display:inline-block;background:#fef3c7;color:#92400e;font-size:11px;' +
        'padding:3px 12px;border-radius:10px;margin-bottom:12px;font-weight:600">' +
        'Consolidated Payment - ' + txRows.length + ' Properties</div>'
      : '') +

    // ── HEADER: Bank transaction data only ──────────────────────
    '<div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;' +
      'padding:14px 18px;margin-bottom:16px">' +

    // Receipt meta row
    '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px 20px;margin-bottom:12px">' +
    metaBox('Receipt No', receiptNo) +
    metaBox('Date', bankRow.displayDate) +
    metaBox('Payment Mode', mode) +
    '</div>' +

    // Narration
    '<div style="font-size:12px;margin-bottom:10px">' +
    '<span style="color:#64748b;font-weight:600;width:110px;display:inline-block">Narration</span>' +
    bankRow.narration +
    '</div>' +

    // Amount box inside header
    '<div style="background:linear-gradient(135deg,#f0fdf4,#dcfce7);border:2px solid #16a34a;' +
      'border-radius:8px;padding:10px 16px;display:flex;justify-content:space-between;align-items:center">' +
    '<div>' +
    '<div style="font-size:11px;color:#166534;font-weight:600">TOTAL AMOUNT RECEIVED</div>' +
    '<div style="font-size:11px;color:#166534;font-style:italic;margin-top:2px">' +
      'Rupees ' + numberToWords(totalAmt) + ' Only' +
    '</div>' +
    '</div>' +
    '<div style="font-size:26px;font-weight:700;color:#15803d">₹' + fINR(totalAmt) + '</div>' +
    '</div>' +

    '</div>' +

    // Section label
    '<div style="font-weight:700;font-size:11px;color:#0f2744;margin:0 0 10px;padding:4px 10px;' +
      'background:#f0f5ff;border-left:3px solid #1e4d8c;border-radius:0 4px 4px 0;' +
      'text-transform:uppercase;letter-spacing:.5px'>' + (isMulti ? 'Properties and Invoice Detail' : 'Invoice Detail') + '</div>' +

    // Property blocks
    propBlocks +

    // Grand total (multi only)
    grandTotal +

    // Received stamp
    '<div style="text-align:right;margin-bottom:16px">' +
    '<span style="display:inline-block;border:2.5px solid #15803d;color:#15803d;' +
      'padding:5px 20px;border-radius:4px;font-weight:700;font-size:13px;' +
      'transform:rotate(-8deg);display:inline-block">RECEIVED</span>' +
    '</div>' +

    // Footer
    '<div style="text-align:center;font-size:11px;color:#94a3b8;' +
      'border-top:1px solid #e2e8f0;padding-top:12px;line-height:1.9">' +
    'This is a system-generated receipt. No signature is required.<br>' +
    SOCIETY_NAME + ' · ' + SOCIETY_REGD + '<br>' +
    SOCIETY_EMAIL + '<br>' +
    '<span style="font-size:10px;color:#cbd5e1">Generated: ' +
    Utilities.formatDate(new Date(), tz, "dd MMM yyyy 'at' HH:mm") + ' IST</span>' +
    '</div>' +
    '</div></div></body></html>';

  return Utilities.newBlob(html, 'text/html', 'receipt.html').getAs('application/pdf');
}

function metaBox(label, value) {
  return '<div style="background:#f8fafc;border-radius:6px;padding:8px 10px">' +
    '<div style="font-size:10px;color:#94a3b8;font-weight:600;text-transform:uppercase;' +
      'letter-spacing:.4px">' + label + '</div>' +
    '<div style="font-size:13px;font-weight:600;color:#1a1a2e;margin-top:3px">' + value + '</div>' +
    '</div>';
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
