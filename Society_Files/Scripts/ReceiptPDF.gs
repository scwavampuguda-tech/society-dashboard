/**
 * ═══════════════════════════════════════════════════════════════════
 *  SCRWA — Receipt PDF Generator  v1.1
 * ═══════════════════════════════════════════════════════════════════
 *  Google Sheet : SocietyData
 *  Account      : scwa.vampuguda@gmail.com
 *  Sheet ID     : 1oXmvMIfQDm51KoHHtkhg8KgK1Qi5mwFYSBdrwir85CA
 *
 *  WORKFLOW:
 *    Bank alert → BankSync records transaction → mapped to invoice
 *    → AppSheet action "📄 Generate Receipt" → this script runs
 *    → PDF saved to Google Drive (SCRWA_Receipts/YYYY-MM/)
 *    → PDF URL written back to TransactionDetails Col N (Attachments)
 *    → Email sent with PDF attached
 *    → WhatsApp link returned to AppSheet for sending
 *
 *  APPSHEET INTEGRATION:
 *    Action: Call a webhook (HTTP POST)
 *    Body:   { "action": "generateReceipt", "txId": "<<[TransactionID]>>" }
 *
 *  ── EXACT COLUMN MAP (from live sheet) ──────────────────────────
 *
 *  TransactionDetails (data from row 3, index 2+):
 *    Col A [0]  TransactionID
 *    Col B [1]  ReceiptNo        ← UPI ref / payment ref
 *    Col C [2]  Date
 *    Col D [3]  Type             (💰Cash In / Cash Out)
 *    Col E [4]  Mode             (💳 UPI / Online, Cash, Cheque...)
 *    Col F [5]  AccountHead      (Monthly Maintenance...)
 *    Col G [6]  AccountSubHead   (Regular Charges...)
 *    Col H [7]  Amount           (negative = inflow)
 *    Col I [8]  PropertyID       (Cash In only — member reference)
 *    Col J [9]  InternalOrder    (MOMEN01...)
 *    Col K [10] BillID           (141Oct2025MOMEN01...)
 *    Col L [11] Remarks          (UPI narration string)
 *    Col M [12] Notes            (human description: "Towards Monthly...")
 *    Col N [13] Attachments      ← PDF URL written here after generation
 *    Col O [14] FY Year          (2025-2026...)
 *
 *  OwnerDetails (data from row 2, index 1+):
 *    Col A [0]  PropertyID
 *    Col B [1]  PlotNo
 *    Col C [2]  Space
 *    Col D [3]  OwnershipType    (Single / Joint)
 *    Col E [4]  Name             (Owner 1)
 *    Col F [5]  Name2            (Owner 2 — joint)
 *    Col G [6]  —
 *    Col H [7]  LaneNo
 *    Col I [8]  —
 *    Col J [9]  Status
 *    Col K [10] Email
 *    Col L [11] Mobile
 *    Col M [12] —
 *    Col N [13] —
 *    Col O [14] IsProxy          ("Yes" / "")
 *
 *  ProxyDetails (data from row 3, index 2+):
 *    Col A [0]  PropertyID
 *    Col B [1]  RepresentedBy    (proxy person name)
 *    Col C [2]  Relation
 *    Col D [3]  —
 *    Col E [4]  ProxyEmail
 *    Col F [5]  ProxyMobile
 *
 *  Invoice (data from row 3, index 2+):
 *    Col A [0]  BillID
 *    Col B [1]  PropertyID
 *    Col C [2]  —
 *    Col D [3]  —
 *    Col E [4]  BillPeriod       (Date object → "MMM yyyy")
 *    Col F [5]  BillDate         (Date)
 *    Col G [6]  BillAmount
 *    Col H [7]  PaidAmount
 *    Col I [8]  Balance
 *    Col J [9]  Status
 * ═══════════════════════════════════════════════════════════════════
 */

// ─── CONFIG ────────────────────────────────────────────────────────
var SPREADSHEET_ID_RECEIPT = '1oXmvMIfQDm51KoHHtkhg8KgK1Qi5mwFYSBdrwir85CA';
var RECEIPTS_FOLDER_NAME   = 'SCRWA_Receipts';
var SOCIETY_NAME           = 'Senior Citizens Residential Welfare Association (SCRWA)';
var SOCIETY_SHORT          = 'SCRWA, Vampuguda';
var SOCIETY_REGD           = 'Regd. No: 2240/2006';
var SOCIETY_EMAIL          = 'scwa.vampuguda@gmail.com';
var RECEIPTS_LOG_SHEET     = 'Receipts_Log';

// ─── doPost — AppSheet webhook entry point ─────────────────────────
/**
 * AppSheet calls this via HTTP POST with:
 *   { "action": "generateReceipt", "txId": "TX-a6c75cd7" }
 *
 * Returns JSON:
 *   { success, txId, receiptNo, pdfUrl, waLink, emailSent, emailTo, message, fileName }
 */
function doPost(e) {
  try {
    var payload = JSON.parse(e.postData.contents);
    var action  = payload.action || '';
    var txId    = String(payload.txId || '').trim();

    if (action === 'generateReceipt' && txId) {
      var result = generateReceiptForTx(txId);
      return ContentService
        .createTextOutput(JSON.stringify(result))
        .setMimeType(ContentService.MimeType.JSON);
    }

    return ContentService
      .createTextOutput(JSON.stringify({ success: false, message: 'Unknown action or missing txId' }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ success: false, message: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// ─── MAIN ORCHESTRATOR ─────────────────────────────────────────────
function generateReceiptForTx(txId) {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID_RECEIPT);
  var tz = Session.getScriptTimeZone();

  // 1. Find the transaction row
  var tx = getTransactionRow(ss, txId);
  if (!tx) {
    return { success: false, message: 'Transaction not found: ' + txId };
  }

  // 2. Get member (owner + proxy)
  var member = getMemberData(ss, tx.propertyId);
  if (!member) {
    return { success: false, message: 'No member found for PropertyID: ' + tx.propertyId };
  }

  // 3. Get mapped invoices (BillID can be single or comma-separated)
  var invoices = [];
  if (tx.billId) {
    var billIds = tx.billId.split(',').map(function(b){ return b.trim(); }).filter(Boolean);
    invoices = getInvoicesByBillIds(ss, billIds);
  }

  // 4. Build PDF blob
  var pdfBlob = buildReceiptPdf(tx, member, invoices, tz);

  // 5. Save to Google Drive (SCRWA_Receipts/YYYY-MM/)
  var folder   = getOrCreateReceiptFolder(tx.date);
  var fileName = buildFileName(tx, member);
  // Replace existing file if re-generated
  var iter = folder.getFilesByName(fileName);
  if (iter.hasNext()) { iter.next().setTrashed(true); }
  var file = folder.createFile(pdfBlob.setName(fileName));
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  var pdfUrl = 'https://drive.google.com/file/d/' + file.getId() + '/view';

  // 6. Write PDF URL back to Col N (Attachments) of TransactionDetails
  writeReceiptUrlToSheet(ss, tx.sheetRow, pdfUrl);

  // 7. Log to Receipts_Log sheet
  logReceipt(ss, tx, member, fileName, pdfUrl);

  // 8. Send email
  var emailResult = sendReceiptEmail(tx, member, invoices, pdfBlob, pdfUrl, fileName);

  // 9. Build WhatsApp link
  var waLink = buildWhatsAppLink(tx, member, pdfUrl);

  return {
    success:   true,
    txId:      txId,
    receiptNo: tx.receiptNo,
    pdfUrl:    pdfUrl,
    waLink:    waLink,
    emailSent: emailResult.sent,
    emailTo:   emailResult.to,
    message:   'Receipt generated successfully',
    fileName:  fileName
  };
}

// ─── READ TRANSACTION ROW ──────────────────────────────────────────
// TransactionDetails: row 1 = section label, row 2 = headers, row 3+ = data
function getTransactionRow(ss, txId) {
  var sheet = ss.getSheetByName('TransactionDetails');
  if (!sheet) { Logger.log('ERROR: TransactionDetails sheet not found'); return null; }

  var data = sheet.getDataRange().getValues();
  var tz   = Session.getScriptTimeZone();

  for (var i = 2; i < data.length; i++) {
    var row = data[i];
    if (String(row[0]).trim() !== txId) continue;

    // Date formatting
    var dateStr = '', displayDate = '';
    if (row[2] instanceof Date) {
      dateStr     = Utilities.formatDate(row[2], tz, 'yyyy-MM-dd');
      displayDate = Utilities.formatDate(row[2], tz, 'dd MMM yyyy');
    } else if (row[2]) {
      dateStr = String(row[2]).substring(0, 10);
      try {
        var d = new Date(dateStr);
        displayDate = Utilities.formatDate(d, tz, 'dd MMM yyyy');
      } catch(e) { displayDate = dateStr; }
    }

    // Amount — always positive
    var rawAmt = parseFloat(row[7]) || 0;
    var amount = Math.abs(rawAmt);

    // FY Year (Col O [14]) — derive if blank
    var fyYear = String(row[14] || '').trim();
    if (!fyYear && dateStr) {
      var mo = parseInt(dateStr.substring(5,7), 10);
      var yr = parseInt(dateStr.substring(0,4), 10);
      fyYear = mo >= 4 ? yr + '-' + (yr+1) : (yr-1) + '-' + yr;
    }

    // Mode: strip emoji prefix
    var modeRaw   = String(row[4]  || '').trim();
    var modeClean = modeRaw.replace(/^[^\w\s₹(]+\s*/, '');

    // Description: prefer Notes (Col M [12]), fallback to Remarks (Col L [11])
    var description = String(row[12] || row[11] || '').trim()
                        .replace(/^[^\w\s₹(]+\s*/, '');

    return {
      sheetRow:      i + 1,        // 1-based sheet row number
      txId:          String(row[0]  || '').trim(),
      receiptNo:     String(row[1]  || '').trim(),
      date:          dateStr,
      displayDate:   displayDate,
      typeRaw:       String(row[3]  || '').trim(),
      modeRaw:       modeRaw,
      modeClean:     modeClean,
      accountHead:   String(row[5]  || '').trim().replace(/^[^\w\s]+\s*/,''),
      accountSubHead:String(row[6]  || '').trim().replace(/^[^\w\s]+\s*/,''),
      amount:        amount,
      propertyId:    String(row[8]  || '').trim(),
      internalOrder: String(row[9]  || '').trim(),
      billId:        String(row[10] || '').trim(),
      remarks:       String(row[11] || '').trim(),
      description:   description,
      currentPdfUrl: String(row[13] || '').trim(),   // Col N — existing PDF if any
      fyYear:        fyYear
    };
  }
  Logger.log('Transaction not found: ' + txId);
  return null;
}

// ─── READ MEMBER DATA ──────────────────────────────────────────────
// OwnerDetails: row 1 = headers (index 0 skipped), data from row 2 (index 1+)
// ProxyDetails: row 1 = section label, row 2 = headers, data from row 3 (index 2+)
function getMemberData(ss, propertyId) {
  if (!propertyId) return null;

  var member = {
    propertyId:  propertyId,
    plotNo:      '',
    laneNo:      '',
    ownerType:   'Single',       // Single / Joint
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

  // ── OwnerDetails ──
  var owSheet = ss.getSheetByName('OwnerDetails');
  if (owSheet) {
    var owData = owSheet.getDataRange().getValues();
    for (var i = 1; i < owData.length; i++) {
      if (String(owData[i][0]).trim() !== propertyId) continue;
      member.plotNo    = String(owData[i][1]  || '').trim().replace('.0','');
      member.ownerType = String(owData[i][3]  || 'Single').trim();  // Col D
      member.name      = String(owData[i][4]  || '').trim();         // Col E
      member.name2     = String(owData[i][5]  || '').trim();         // Col F
      member.laneNo    = String(owData[i][7]  || '').trim();         // Col H
      member.status    = String(owData[i][9]  || '').trim();         // Col J
      member.email     = String(owData[i][10] || '').trim();         // Col K
      member.mobile    = String(owData[i][11] || '').trim();         // Col L
      member.isProxy   = String(owData[i][14] || '').trim().toLowerCase() === 'yes'; // Col O
      // Build full display name (single or joint)
      member.fullName  = member.name + (member.name2 ? ' & ' + member.name2 : '');
      break;
    }
  }

  if (!member.name) {
    Logger.log('Member not found in OwnerDetails: ' + propertyId);
    return null;
  }

  // ── ProxyDetails (if isProxy = Yes) ──
  if (member.isProxy) {
    var prSheet = ss.getSheetByName('ProxyDetails');
    if (prSheet) {
      var prData = prSheet.getDataRange().getValues();
      for (var j = 2; j < prData.length; j++) {  // data from row 3 (index 2)
        if (String(prData[j][0]).trim() !== propertyId) continue;
        member.proxyName   = String(prData[j][1] || '').trim();  // Col B
        member.proxyMobile = String(prData[j][5] || '').trim();  // Col F
        member.proxyEmail  = String(prData[j][4] || '').trim();  // Col E
        break;
      }
    }
  }

  return member;
}

// ─── READ INVOICES BY BILL IDs ─────────────────────────────────────
// Invoice sheet: row 1 = section label, row 2 = headers, data row 3+ (index 2+)
function getInvoicesByBillIds(ss, billIds) {
  var sheet = ss.getSheetByName('Invoice');
  if (!sheet || !billIds || billIds.length === 0) return [];

  var data     = sheet.getDataRange().getValues();
  var tz       = Session.getScriptTimeZone();
  var found    = [];
  var idSet    = {};
  billIds.forEach(function(b){ idSet[b] = true; });

  for (var i = 2; i < data.length; i++) {
    var row    = data[i];
    var billId = String(row[0] || '').trim();
    if (!idSet[billId]) continue;

    // BillPeriod (Col E [4]) — Date object
    var periodStr = '';
    if (row[4] instanceof Date) {
      periodStr = Utilities.formatDate(row[4], tz, 'MMM yyyy');
    } else if (row[4]) {
      periodStr = String(row[4]).trim();
    }

    // BillDate (Col F [5])
    var billDate = '';
    if (row[5] instanceof Date) {
      billDate = Utilities.formatDate(row[5], tz, 'dd MMM yyyy');
    } else if (row[5]) {
      billDate = String(row[5]).substring(0, 10);
    }

    var billAmt = parseFloat(row[6]) || 0;       // Col G
    var paidAmt = Math.abs(parseFloat(row[7]) || 0);  // Col H
    var balance = parseFloat(row[8]) || (billAmt - paidAmt);  // Col I
    var status  = String(row[9] || '').trim().replace(/^[^\w\s]+\s*/,'');  // Col J

    found.push({
      billId:     billId,
      period:     periodStr,
      billDate:   billDate,
      billAmount: billAmt,
      paidAmount: paidAmt,
      balance:    balance,
      status:     status
    });
  }
  return found;
}

// ─── BUILD PDF ─────────────────────────────────────────────────────
function buildReceiptPdf(tx, member, invoices, tz) {

  // Invoice rows HTML
  var invoiceRows = '';
  if (invoices.length > 0) {
    invoices.forEach(function(inv) {
      var balColor = inv.balance > 0 ? '#dc2626' : '#16a34a';
      var statusClean = inv.status.replace(/^[^\w\s]+\s*/, '');
      invoiceRows +=
        '<tr>' +
        '<td style="padding:7px 10px;border-bottom:1px solid #f0f4f8">' + inv.billId + '</td>' +
        '<td style="padding:7px 10px;border-bottom:1px solid #f0f4f8">' + inv.period + '</td>' +
        '<td style="padding:7px 10px;border-bottom:1px solid #f0f4f8;text-align:right">₹' + formatINR(inv.billAmount) + '</td>' +
        '<td style="padding:7px 10px;border-bottom:1px solid #f0f4f8;text-align:right;color:#16a34a">₹' + formatINR(inv.paidAmt||inv.paidAmount) + '</td>' +
        '<td style="padding:7px 10px;border-bottom:1px solid #f0f4f8;text-align:right;color:' + balColor + '">₹' + formatINR(inv.balance) + '</td>' +
        '<td style="padding:7px 10px;border-bottom:1px solid #f0f4f8;font-size:11px;color:#64748b">' + statusClean + '</td>' +
        '</tr>';
    });
  }

  // Proxy / Representative line
  var proxyHtml = '';
  if (member.isProxy && member.proxyName) {
    proxyHtml = '<div class="row"><span class="label">Represented by</span>' +
                '<span class="value">' + member.proxyName +
                (member.proxyMobile ? ' · ' + member.proxyMobile : '') + '</span></div>';
  }

  // Owner type badge
  var ownerBadge = member.ownerType === 'Joint'
    ? '<span style="background:#dbeafe;color:#1e40af;font-size:11px;padding:2px 8px;border-radius:10px;margin-left:8px">Joint Ownership</span>'
    : '';

  // Description line
  var descLine = tx.description || tx.accountSubHead || tx.accountHead;

  // Period line from invoices or BillID
  var periodLine = '';
  if (invoices.length === 1) {
    periodLine = invoices[0].period;
  } else if (invoices.length > 1) {
    periodLine = invoices.map(function(i){ return i.period; }).join(', ');
  } else if (tx.billId) {
    // Parse from BillID e.g. 141Oct2025MOMEN01
    var mRes = tx.billId.match(/([A-Za-z]{3})(\d{4})/);
    if (mRes) periodLine = mRes[1] + ' ' + mRes[2];
  }

  var amtWords = numberToWords(tx.amount);

  var html =
    '<!DOCTYPE html><html><head><meta charset="UTF-8"><style>' +
    'body{font-family:Arial,Helvetica,sans-serif;margin:0;padding:0;color:#1a1a2e;font-size:13px}' +
    '.page{width:680px;margin:0 auto;padding:28px}' +
    '.header{background:linear-gradient(135deg,#0f2744,#1e4d8c);color:#fff;padding:18px 24px;border-radius:10px 10px 0 0;display:flex;align-items:center;justify-content:space-between}' +
    '.header-left h1{margin:0;font-size:16px;font-weight:700;line-height:1.3}' +
    '.header-left p{margin:4px 0 0;font-size:11px;opacity:.8}' +
    '.receipt-badge{background:#FFD700;color:#0f2744;padding:5px 18px;border-radius:20px;font-weight:700;font-size:14px;letter-spacing:.5px}' +
    '.body{border:1px solid #d1dce8;border-top:none;border-radius:0 0 10px 10px;padding:22px 24px;background:#fff}' +
    '.meta-grid{display:grid;grid-template-columns:1fr 1fr;gap:4px 20px;margin-bottom:14px}' +
    '.meta-item{display:flex;flex-direction:column}' +
    '.meta-label{font-size:10px;color:#94a3b8;font-weight:600;text-transform:uppercase;letter-spacing:.4px}' +
    '.meta-value{font-size:13px;color:#1a1a2e;font-weight:600;margin-top:1px}' +
    '.divider{border:none;border-top:1px dashed #cbd5e1;margin:14px 0}' +
    '.section-title{font-weight:700;font-size:12px;color:#0f2744;margin:14px 0 8px;padding:4px 10px;background:#f0f5ff;border-left:3px solid #1e4d8c;border-radius:0 4px 4px 0;text-transform:uppercase;letter-spacing:.4px}' +
    '.row{display:flex;margin-bottom:8px;align-items:flex-start}' +
    '.label{width:150px;font-weight:600;color:#64748b;font-size:12px;flex-shrink:0;padding-top:1px}' +
    '.value{color:#1a1a2e;font-size:13px;flex:1}' +
    '.amount-box{background:linear-gradient(135deg,#f0fdf4,#dcfce7);border:2px solid #16a34a;border-radius:10px;padding:16px 20px;margin:14px 0;text-align:center}' +
    '.amount-box .amt{font-size:28px;font-weight:700;color:#15803d}' +
    '.amount-box .words{font-size:12px;color:#166534;margin-top:3px;font-style:italic}' +
    '.inv-table{width:100%;border-collapse:collapse;font-size:12px;margin-top:6px}' +
    '.inv-table th{background:#1e4d8c;color:#fff;padding:7px 10px;text-align:left;font-weight:600;font-size:11px}' +
    '.inv-table th:nth-child(3),.inv-table th:nth-child(4),.inv-table th:nth-child(5){text-align:right}' +
    '.inv-table tr:nth-child(even) td{background:#f8faff}' +
    '.stamp-row{text-align:right;margin-top:18px}' +
    '.stamp{display:inline-block;border:2.5px solid #15803d;color:#15803d;padding:5px 20px;border-radius:4px;font-weight:700;font-size:13px;transform:rotate(-8deg);letter-spacing:.5px}' +
    '.footer{text-align:center;margin-top:20px;font-size:11px;color:#94a3b8;border-top:1px solid #e2e8f0;padding-top:14px;line-height:1.8}' +
    '</style></head><body><div class="page">' +

    // ── Header ──
    '<div class="header">' +
    '<div class="header-left">' +
    '<h1>🏘️ ' + SOCIETY_NAME + '</h1>' +
    '<p>' + SOCIETY_REGD + ' &nbsp;|&nbsp; Vampuguda, Hyderabad</p>' +
    '</div>' +
    '<div class="receipt-badge">RECEIPT</div>' +
    '</div>' +

    // ── Body ──
    '<div class="body">' +

    // Receipt meta grid
    '<div class="meta-grid">' +
    '<div class="meta-item"><span class="meta-label">Receipt No</span><span class="meta-value">' + (tx.receiptNo || '—') + '</span></div>' +
    '<div class="meta-item"><span class="meta-label">Transaction ID</span><span class="meta-value">' + tx.txId + '</span></div>' +
    '<div class="meta-item"><span class="meta-label">Date</span><span class="meta-value">' + tx.displayDate + '</span></div>' +
    '<div class="meta-item"><span class="meta-label">FY Year</span><span class="meta-value">' + tx.fyYear + '</span></div>' +
    (periodLine ? '<div class="meta-item"><span class="meta-label">For Period</span><span class="meta-value">' + periodLine + '</span></div>' : '') +
    '</div>' +
    '<hr class="divider">' +

    // Member section
    '<div class="section-title">📍 Member Details</div>' +
    '<div class="row"><span class="label">Property ID</span><span class="value">' + member.propertyId + '</span></div>' +
    '<div class="row"><span class="label">Plot No</span><span class="value">' + member.plotNo + '</span></div>' +
    '<div class="row"><span class="label">Lane</span><span class="value">' + member.laneNo + '</span></div>' +
    '<div class="row"><span class="label">Owner</span><span class="value"><strong>' + member.fullName + '</strong>' + ownerBadge + '</span></div>' +
    proxyHtml +

    '<hr class="divider">' +

    // Payment section
    '<div class="section-title">💳 Payment Details</div>' +
    '<div class="row"><span class="label">Description</span><span class="value">' + descLine + '</span></div>' +
    '<div class="row"><span class="label">Category</span><span class="value">' + tx.accountHead + (tx.accountSubHead && tx.accountSubHead !== tx.accountHead ? ' › ' + tx.accountSubHead : '') + '</span></div>' +
    '<div class="row"><span class="label">Payment Mode</span><span class="value">' + tx.modeClean + '</span></div>' +
    (tx.internalOrder ? '<div class="row"><span class="label">Internal Order</span><span class="value">' + tx.internalOrder + '</span></div>' : '') +

    // Amount box
    '<div class="amount-box">' +
    '<div class="amt">₹' + formatINR(tx.amount) + '</div>' +
    '<div class="words">Rupees ' + amtWords + ' Only</div>' +
    '</div>' +

    // Invoice mapping table (if available)
    (invoices.length > 0 ?
      '<div class="section-title">📋 Invoice Mapping</div>' +
      '<table class="inv-table"><thead><tr>' +
      '<th>Bill ID</th><th>Period</th><th style="text-align:right">Billed</th>' +
      '<th style="text-align:right">Paid</th><th style="text-align:right">Balance</th><th>Status</th>' +
      '</tr></thead><tbody>' + invoiceRows + '</tbody></table>'
    : '') +

    // Received stamp
    '<div class="stamp-row"><span class="stamp">✓ RECEIVED</span></div>' +

    // Footer
    '<div class="footer">' +
    'This is a system-generated receipt. No signature required.<br>' +
    SOCIETY_NAME + ' &nbsp;|&nbsp; ' + SOCIETY_REGD + '<br>' +
    '📧 ' + SOCIETY_EMAIL + '<br>' +
    '<span style="font-size:10px;color:#cbd5e1">Generated: ' +
    Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "dd MMM yyyy 'at' HH:mm") + ' IST</span>' +
    '</div>' +

    '</div></div></body></html>';

  var blob = Utilities.newBlob(html, 'text/html', 'receipt.html');
  return blob.getAs('application/pdf');
}

// ─── HELPERS ───────────────────────────────────────────────────────
function formatINR(n) {
  n = Math.round(n || 0);
  return n.toLocaleString('en-IN');
}

function buildFileName(tx, member) {
  // RCPT-{receiptNo}-PID{propertyId}-Plot{plotNo}.pdf
  var rcptSafe = (tx.receiptNo || tx.txId).replace(/[\/\\:*?"<>|]/g, '');
  var plotSafe = member.plotNo.replace(/[\/\\:*?"<>|]/g, '');
  return 'RCPT-' + rcptSafe + '-PID' + member.propertyId + '-Plot' + plotSafe + '.pdf';
}

function getOrCreateReceiptFolder(dateStr) {
  // Root folder: SCRWA_Receipts
  var rootFolders = DriveApp.getRootFolder().getFoldersByName(RECEIPTS_FOLDER_NAME);
  var mainFolder  = rootFolders.hasNext()
    ? rootFolders.next()
    : DriveApp.getRootFolder().createFolder(RECEIPTS_FOLDER_NAME);

  // Sub-folder by month: 2026-07
  var monthKey = dateStr
    ? dateStr.substring(0, 7)
    : Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM');
  var subFolders = mainFolder.getFoldersByName(monthKey);
  return subFolders.hasNext()
    ? subFolders.next()
    : mainFolder.createFolder(monthKey);
}

function writeReceiptUrlToSheet(ss, sheetRow, url) {
  var sheet = ss.getSheetByName('TransactionDetails');
  if (!sheet) return;
  sheet.getRange(sheetRow, 14).setValue(url); // Col N = column 14
}

function logReceipt(ss, tx, member, fileName, pdfUrl) {
  var logSheet = ss.getSheetByName(RECEIPTS_LOG_SHEET);
  if (!logSheet) {
    logSheet = ss.insertSheet(RECEIPTS_LOG_SHEET);
    var headers = ['Generated At','TxID','Receipt No','Property ID','Plot No',
                   'Owner','Amount (₹)','Mode','Period/BillId','FY Year',
                   'PDF File','PDF URL'];
    logSheet.appendRow(headers);
    logSheet.getRange(1,1,1,headers.length)
      .setFontWeight('bold')
      .setBackground('#0f2744')
      .setFontColor('#ffffff');
    logSheet.setFrozenRows(1);
  }
  var now = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');
  logSheet.appendRow([
    now, tx.txId, tx.receiptNo, member.propertyId, member.plotNo,
    member.fullName, tx.amount, tx.modeClean,
    tx.billId || tx.description, tx.fyYear, fileName, pdfUrl
  ]);
}

// ─── SEND EMAIL ────────────────────────────────────────────────────
function sendReceiptEmail(tx, member, invoices, pdfBlob, pdfUrl, fileName) {
  // Collect email addresses (owner + proxy if different)
  var toList = [];
  if (member.email)     toList.push(member.email);
  if (member.proxyEmail && member.proxyEmail !== member.email)
    toList.push(member.proxyEmail);

  if (toList.length === 0) {
    Logger.log('No email address for ' + member.propertyId + ' — email not sent');
    return { sent: false, to: '', reason: 'No email on record' };
  }

  var periodLine = invoices.length > 0
    ? invoices.map(function(i){ return i.period; }).join(', ')
    : tx.description;

  var subject = '🧾 Receipt #' + (tx.receiptNo || tx.txId) +
                ' — ₹' + formatINR(tx.amount) + ' | ' + SOCIETY_SHORT;

  var body =
    '<div style="font-family:Arial,sans-serif;max-width:560px;color:#1a1a2e">' +
    '<div style="background:linear-gradient(135deg,#0f2744,#1e4d8c);color:#fff;padding:16px 20px;border-radius:8px 8px 0 0">' +
    '<h2 style="margin:0;font-size:16px">🏘️ ' + SOCIETY_SHORT + '</h2>' +
    '<p style="margin:4px 0 0;font-size:11px;opacity:.8">' + SOCIETY_REGD + ' · Vampuguda, Hyderabad</p>' +
    '</div>' +
    '<div style="border:1px solid #d1dce8;border-top:none;padding:20px;border-radius:0 0 8px 8px;background:#fff">' +
    '<p>Dear <strong>' + member.fullName + '</strong>' +
    (member.isProxy && member.proxyName ? ' (Represented by: ' + member.proxyName + ')' : '') + ',</p>' +
    '<p>Your payment has been received and a receipt has been generated:</p>' +
    '<table style="width:100%;border-collapse:collapse;font-size:13px;margin:12px 0;border:1px solid #e2e8f0">' +
    '<tr><td style="padding:8px 12px;background:#f8fafc;width:40%;border-bottom:1px solid #e2e8f0"><strong>Receipt No</strong></td>' +
    '<td style="padding:8px 12px;border-bottom:1px solid #e2e8f0">' + (tx.receiptNo || '—') + '</td></tr>' +
    '<tr><td style="padding:8px 12px;background:#f8fafc;border-bottom:1px solid #e2e8f0"><strong>Date</strong></td>' +
    '<td style="padding:8px 12px;border-bottom:1px solid #e2e8f0">' + tx.displayDate + '</td></tr>' +
    '<tr><td style="padding:8px 12px;background:#f8fafc;border-bottom:1px solid #e2e8f0"><strong>Amount</strong></td>' +
    '<td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;color:#15803d;font-weight:700">₹' + formatINR(tx.amount) + '</td></tr>' +
    '<tr><td style="padding:8px 12px;background:#f8fafc;border-bottom:1px solid #e2e8f0"><strong>Payment Mode</strong></td>' +
    '<td style="padding:8px 12px;border-bottom:1px solid #e2e8f0">' + tx.modeClean + '</td></tr>' +
    (periodLine ? '<tr><td style="padding:8px 12px;background:#f8fafc;border-bottom:1px solid #e2e8f0"><strong>For Period</strong></td>' +
    '<td style="padding:8px 12px;border-bottom:1px solid #e2e8f0">' + periodLine + '</td></tr>' : '') +
    '<tr><td style="padding:8px 12px;background:#f8fafc"><strong>Property</strong></td>' +
    '<td style="padding:8px 12px">Plot ' + member.plotNo + ' (PID: ' + member.propertyId + ')</td></tr>' +
    '</table>' +
    '<p>📎 <strong>Receipt PDF is attached</strong> to this email.</p>' +
    '<p>🔗 Or <a href="' + pdfUrl + '" style="color:#1e4d8c">view receipt online (Google Drive)</a></p>' +
    '<hr style="border:none;border-top:1px solid #e2e8f0;margin:16px 0">' +
    '<p style="font-size:11px;color:#64748b">This is a system-generated email. Please do not reply.<br>' +
    '📧 For queries contact: ' + SOCIETY_EMAIL + '</p>' +
    '<p style="font-size:11px;color:#64748b">' + SOCIETY_NAME + ' · ' + SOCIETY_REGD + '</p>' +
    '</div></div>';

  GmailApp.sendEmail(
    toList.join(','),
    subject,
    'Please use an HTML-compatible email client to view this message.',
    {
      htmlBody:    body,
      attachments: [pdfBlob.setName(fileName)],
      name:        SOCIETY_SHORT,
      replyTo:     SOCIETY_EMAIL
    }
  );

  Logger.log('Email sent to: ' + toList.join(', '));
  return { sent: true, to: toList.join(', ') };
}

// ─── WHATSAPP LINK ─────────────────────────────────────────────────
function buildWhatsAppLink(tx, member, pdfUrl) {
  // Prefer proxy mobile if isProxy, else owner mobile
  var phone = (member.isProxy && member.proxyMobile) ? member.proxyMobile : member.mobile;
  if (!phone) return '';

  // Normalise to 91XXXXXXXXXX
  var digits = phone.replace(/[^0-9]/g, '');
  var waNum  = digits.startsWith('91') ? digits : '91' + digits.slice(-10);

  var periodLine = tx.description || tx.internalOrder;

  var msg =
    '🧾 *Receipt from SCRWA, Vampuguda*\n\n' +
    'Dear ' + member.fullName + ',\n\n' +
    'Your payment receipt is ready:\n\n' +
    '🔢 *Receipt No*  : ' + (tx.receiptNo || tx.txId) + '\n' +
    '📅 *Date*         : ' + tx.displayDate + '\n' +
    '🏠 *Plot No*      : ' + member.plotNo + '\n' +
    '💰 *Amount*       : ₹' + formatINR(tx.amount) + '\n' +
    '💳 *Mode*         : ' + tx.modeClean + '\n' +
    (periodLine ? '📋 *Description*  : ' + periodLine + '\n' : '') +
    '\n📄 *View/Download Receipt PDF:*\n' + pdfUrl +
    '\n\nThank you for your payment! 🙏\n' +
    '_— SCRWA Management Committee_\n' +
    '_' + SOCIETY_REGD + '_';

  return 'https://wa.me/' + waNum + '?text=' + encodeURIComponent(msg);
}

// ─── NUMBER TO WORDS (Indian system) ──────────────────────────────
function numberToWords(n) {
  n = Math.round(n || 0);
  if (n === 0) return 'Zero';
  var ones = ['','One','Two','Three','Four','Five','Six','Seven','Eight','Nine',
              'Ten','Eleven','Twelve','Thirteen','Fourteen','Fifteen','Sixteen',
              'Seventeen','Eighteen','Nineteen'];
  var tens = ['','','Twenty','Thirty','Forty','Fifty','Sixty','Seventy','Eighty','Ninety'];
  function w(num) {
    if (num === 0) return '';
    if (num < 20)  return ones[num];
    if (num < 100) return tens[Math.floor(num/10)] + (num%10 ? ' '+ones[num%10] : '');
    if (num < 1000) return ones[Math.floor(num/100)]+' Hundred'+(num%100 ? ' '+w(num%100) : '');
    if (num < 100000)  return w(Math.floor(num/1000))+' Thousand'+(num%1000   ? ' '+w(num%1000)   : '');
    if (num < 10000000) return w(Math.floor(num/100000))+' Lakh'+(num%100000  ? ' '+w(num%100000)  : '');
    return w(Math.floor(num/10000000))+' Crore'+(num%10000000 ? ' '+w(num%10000000) : '');
  }
  return w(n).trim();
}

// ─── SHEET MENU (manual trigger from Google Sheet) ─────────────────
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('🧾 SCRWA Receipts')
    .addItem('📄 Generate Receipt — Selected Row', 'generateReceiptFromMenu')
    .addSeparator()
    .addItem('📋 Open Receipts Log', 'openReceiptsLog')
    .addToUi();
}

function generateReceiptFromMenu() {
  var ui    = SpreadsheetApp.getUi();
  var sheet = SpreadsheetApp.getActiveSheet();
  var row   = sheet.getActiveCell().getRow();

  if (sheet.getName() !== 'TransactionDetails') {
    ui.alert('⚠️ Please open the TransactionDetails sheet and select a data row first.');
    return;
  }
  if (row <= 2) {
    ui.alert('⚠️ Please select a data row (row 3 or below).');
    return;
  }

  var txId = String(sheet.getRange(row, 1).getValue()).trim(); // Col A
  if (!txId) {
    ui.alert('⚠️ No TransactionID found in column A of the selected row.');
    return;
  }

  var confirm = ui.alert(
    '📄 Generate Receipt',
    'Generate receipt for Transaction: ' + txId + '\n\nProceed?',
    ui.ButtonSet.YES_NO
  );
  if (confirm !== ui.Button.YES) return;

  var result = generateReceiptForTx(txId);

  if (result.success) {
    ui.alert(
      '✅ Receipt Generated!',
      'File     : ' + result.fileName + '\n\n' +
      'PDF URL  : ' + result.pdfUrl   + '\n\n' +
      'Email    : ' + (result.emailSent ? '✅ Sent to ' + result.emailTo : '⚠️ Not sent — no email on record') + '\n\n' +
      'PDF link written to Column N of this row.\n' +
      'WhatsApp link available in response.',
      ui.ButtonSet.OK
    );
  } else {
    ui.alert('❌ Failed', result.message, ui.ButtonSet.OK);
  }
}

function openReceiptsLog() {
  var ss    = SpreadsheetApp.openById(SPREADSHEET_ID_RECEIPT);
  var sheet = ss.getSheetByName(RECEIPTS_LOG_SHEET);
  if (sheet) {
    SpreadsheetApp.setActiveSheet(sheet);
  } else {
    SpreadsheetApp.getUi().alert('No receipts have been generated yet. The log will be created on first receipt.');
  }
}

// ─── TEST FUNCTION ─────────────────────────────────────────────────
// Replace txId with a real TransactionID from your sheet before running
function testReceiptGeneration() {
  var testTxId = 'TX-a6c75cd7';   // ← replace with real TxID
  Logger.log('Testing receipt generation for: ' + testTxId);
  var result = generateReceiptForTx(testTxId);
  Logger.log(JSON.stringify(result, null, 2));
}
