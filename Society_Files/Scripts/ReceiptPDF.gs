/**
 * ═══════════════════════════════════════════════════════════════════
 *  SCRWA — Receipt PDF Generator  v1.0
 * ═══════════════════════════════════════════════════════════════════
 *  Google Sheet : SocietyData
 *  Account      : scwa.vampuguda@gmail.com
 *  Sheet ID     : 1oXmvMIfQDm51KoHHtkhg8KgK1Qi5mwFYSBdrwir85CA
 *
 *  WORKFLOW:
 *    Bank alert → BankSync records transaction → mapped to invoice
 *    → AppSheet action "📄 Generate Receipt" → this script runs
 *    → PDF saved to Google Drive → email sent + WhatsApp link shown
 *
 *  APPSHEET INTEGRATION:
 *    Action Type : Call a webhook (or App Action → Run a script)
 *    URL         : This script's doPost endpoint
 *    HTTP Method : POST
 *    Body        : { "action": "generateReceipt", "txId": "<<TransactionID>>" }
 *
 *  SHEETS USED:
 *    TransactionDetails  — payment records (Col A=TxID, B=ReceiptNo, etc.)
 *    OwnerDetails        — member name, mobile, email
 *    PropertyDetails     — plotNo, laneNo
 *    ProxyDetails        — proxy/rep info
 *    Invoices            — billId, period, amount
 *    Receipts_Log        — audit log of all generated receipts (auto-created)
 *
 *  DRIVE FOLDER:
 *    SCRWA_Receipts/YYYY-MM/  (auto-created, organised by month)
 *
 *  PDF FILENAME FORMAT:
 *    RCPT-{receiptNo}-PID{propertyId}-{plotNo}.pdf
 *    e.g. RCPT-307914352494-PID121-044P.pdf
 * ═══════════════════════════════════════════════════════════════════
 */

// ─── CONFIG ────────────────────────────────────────────────────────
const SPREADSHEET_ID_RECEIPT = '1oXmvMIfQDm51KoHHtkhg8KgK1Qi5mwFYSBdrwir85CA';
const RECEIPTS_FOLDER_NAME   = 'SCRWA_Receipts';
const SOCIETY_NAME           = 'Senior Citizens Residential Welfare Association (SCRWA)';
const SOCIETY_SHORT          = 'SCRWA, Vampuguda';
const SOCIETY_REGD           = 'Regd. No: 2240/2006';
const SOCIETY_EMAIL          = 'scwa.vampuguda@gmail.com';
const SOCIETY_WHATSAPP       = '919100000000'; // update with actual WhatsApp number
const RECEIPTS_LOG_SHEET     = 'Receipts_Log';

// ─── doPost — AppSheet webhook entry point ─────────────────────────
/**
 * AppSheet calls this via HTTP POST with:
 *   { "action": "generateReceipt", "txId": "TX-a6c75cd7" }
 *
 * Returns JSON: { success, pdfUrl, receiptNo, message }
 */
function doPost(e) {
  try {
    var payload = JSON.parse(e.postData.contents);
    var action  = payload.action || '';
    var txId    = payload.txId   || '';

    if (action === 'generateReceipt' && txId) {
      var result = generateReceiptForTx(txId);
      return ContentService
        .createTextOutput(JSON.stringify(result))
        .setMimeType(ContentService.MimeType.JSON);
    }

    return ContentService
      .createTextOutput(JSON.stringify({ success: false, message: 'Unknown action: ' + action }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ success: false, message: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// ─── MAIN: generateReceiptForTx ────────────────────────────────────
/**
 * Called by AppSheet action OR directly from Sheet menu.
 * txId = TransactionID from TransactionDetails sheet (Col A)
 *
 * Steps:
 *  1. Look up transaction row by txId
 *  2. Look up member (owner/proxy) by propertyId
 *  3. Look up mapped invoices by billId
 *  4. Build PDF using HtmlService → Blob
 *  5. Save PDF to Google Drive (organised by month)
 *  6. Log to Receipts_Log sheet
 *  7. Write PDF URL back to TransactionDetails (Col N = Attachments)
 *  8. Send email with PDF attached
 *  9. Return result (includes WhatsApp link)
 */
function generateReceiptForTx(txId) {
  var ss      = SpreadsheetApp.openById(SPREADSHEET_ID_RECEIPT);
  var tz      = Session.getScriptTimeZone();

  // ── 1. Find transaction row ───────────────────────────────────────
  var txData  = getTransactionRow(ss, txId);
  if (!txData) {
    return { success: false, message: 'Transaction not found: ' + txId };
  }

  // ── 2. Look up member ─────────────────────────────────────────────
  var member  = getMemberData(ss, txData.propertyId);
  if (!member) {
    return { success: false, message: 'Member not found for PropertyID: ' + txData.propertyId };
  }

  // ── 3. Look up mapped invoices ────────────────────────────────────
  var invoices = [];
  if (txData.billId) {
    var billIds = txData.billId.split(',').map(function(b){ return b.trim(); }).filter(Boolean);
    invoices = getInvoicesByIds(ss, billIds);
  }

  // ── 4. Generate PDF ───────────────────────────────────────────────
  var pdfBlob = buildReceiptPdf(txData, member, invoices, tz);

  // ── 5. Save to Drive ──────────────────────────────────────────────
  var folder   = getOrCreateReceiptFolder(txData.date);
  var fileName = buildFileName(txData, member);
  var existing = folder.getFilesByName(fileName);
  if (existing.hasNext()) {
    existing.next().setTrashed(true); // replace if re-generated
  }
  var file     = folder.createFile(pdfBlob.setName(fileName));
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  var pdfUrl   = file.getUrl();
  var pdfId    = file.getId();
  var directUrl = 'https://drive.google.com/file/d/' + pdfId + '/view';

  // ── 6. Log to Receipts_Log ────────────────────────────────────────
  logReceipt(ss, txData, member, fileName, directUrl);

  // ── 7. Write URL back to TransactionDetails Col N (Attachments) ───
  writeReceiptUrlToSheet(ss, txData.rowIndex, directUrl);

  // ── 8. Send email ─────────────────────────────────────────────────
  var emailResult = sendReceiptEmail(txData, member, invoices, pdfBlob, directUrl);

  // ── 9. Build WhatsApp link ────────────────────────────────────────
  var waLink = buildWhatsAppLink(txData, member, directUrl);

  return {
    success:    true,
    txId:       txId,
    receiptNo:  txData.receiptNo,
    pdfUrl:     directUrl,
    waLink:     waLink,
    emailSent:  emailResult.sent,
    emailTo:    emailResult.to,
    message:    'Receipt generated successfully',
    fileName:   fileName
  };
}

// ─── GET TRANSACTION ROW ───────────────────────────────────────────
function getTransactionRow(ss, txId) {
  var sheet = ss.getSheetByName('TransactionDetails');
  if (!sheet) return null;

  var data  = sheet.getDataRange().getValues();
  // Row 1 = section label, Row 2 = headers, data from Row 3 (index 2)
  for (var i = 2; i < data.length; i++) {
    var row = data[i];
    if (String(row[0]).trim() === txId) {
      var tz     = Session.getScriptTimeZone();
      var dateStr = '';
      var displayDate = '';
      if (row[2] instanceof Date) {
        dateStr     = Utilities.formatDate(row[2], tz, 'yyyy-MM-dd');
        displayDate = Utilities.formatDate(row[2], tz, 'dd MMM yyyy');
      } else if (row[2]) {
        dateStr     = String(row[2]).substring(0, 10);
        displayDate = dateStr;
      }

      // FY Year
      var fyYear = String(row[14] || '').trim();
      if (!fyYear && dateStr) {
        var mo = parseInt(dateStr.substring(5,7), 10);
        var yr = parseInt(dateStr.substring(0,4), 10);
        fyYear = mo >= 4 ? yr+'-'+(yr+1) : (yr-1)+'-'+yr;
      }

      // Amount
      var rawAmt = parseFloat(row[7]) || 0;
      var amount = Math.abs(rawAmt);

      return {
        rowIndex:      i,            // 0-based index in data array
        sheetRow:      i + 1,        // 1-based sheet row
        txId:          String(row[0]  || '').trim(),
        receiptNo:     String(row[1]  || '').trim(),
        date:          dateStr,
        displayDate:   displayDate,
        type:          String(row[3]  || '').trim(),
        mode:          String(row[4]  || '').trim().replace(/^[^\w\s]+\s*/,''),
        accountHead:   String(row[5]  || '').trim().replace(/^[^\w\s]+\s*/,''),
        accountSubHead:String(row[6]  || '').trim().replace(/^[^\w\s]+\s*/,''),
        amount:        amount,
        propertyId:    String(row[8]  || '').trim(),
        internalOrder: String(row[9]  || '').trim(),
        billId:        String(row[10] || '').trim(),
        remarks:       String(row[11] || '').trim().replace(/^[^\w\s]+\s*/,''),
        notes:         String(row[12] || '').trim(),
        fyYear:        fyYear
      };
    }
  }
  return null;
}

// ─── GET MEMBER DATA ───────────────────────────────────────────────
function getMemberData(ss, propertyId) {
  if (!propertyId) return null;

  // OwnerDetails sheet
  var owSheet = ss.getSheetByName('OwnerDetails');
  var propSheet = ss.getSheetByName('PropertyDetails');
  var proxySheet = ss.getSheetByName('ProxyDetails');

  var member = {
    propertyId: propertyId,
    name:       '',
    name2:      '',
    fullName:   '',
    plotNo:     '',
    laneNo:     '',
    laneName:   '',
    mobile:     '',
    email:      '',
    status:     '',
    isProxy:    false,
    proxyName:  '',
    proxyMobile:'',
    proxyEmail: ''
  };

  // Owner details (Col A=PropID, B=Name, C=Name2, D=PlotNo, E=LaneNo,
  //                F=Mobile, G=Email, H=Status, I=IsProxy)
  if (owSheet) {
    var owData = owSheet.getDataRange().getValues();
    for (var i = 1; i < owData.length; i++) {
      if (String(owData[i][0]).trim() === propertyId) {
        member.name    = String(owData[i][1] || '').trim();
        member.name2   = String(owData[i][2] || '').trim();
        member.fullName= member.name + (member.name2 ? ' & ' + member.name2 : '');
        member.plotNo  = String(owData[i][3] || '').trim();
        member.laneNo  = String(owData[i][4] || '').trim();
        member.mobile  = String(owData[i][5] || '').trim();
        member.email   = String(owData[i][6] || '').trim();
        member.status  = String(owData[i][7] || '').trim();
        member.isProxy = String(owData[i][8] || '').trim() === 'Yes';
        break;
      }
    }
  }

  // Proxy details
  if (proxySheet && member.isProxy) {
    var prData = proxySheet.getDataRange().getValues();
    for (var j = 1; j < prData.length; j++) {
      if (String(prData[j][0]).trim() === propertyId) {
        member.proxyName   = String(prData[j][1] || '').trim();
        member.proxyMobile = String(prData[j][3] || '').trim();
        member.proxyEmail  = String(prData[j][4] || '').trim();
        break;
      }
    }
  }

  // Lane name from PropertyDetails
  if (propSheet) {
    var prpData = propSheet.getDataRange().getValues();
    for (var k = 1; k < prpData.length; k++) {
      if (String(prpData[k][0]).trim() === propertyId) {
        member.laneName = String(prpData[k][3] || member.laneNo).trim();
        break;
      }
    }
  }
  if (!member.laneName) member.laneName = member.laneNo;

  return member.name ? member : null;
}

// ─── GET INVOICES BY IDs ───────────────────────────────────────────
function getInvoicesByIds(ss, billIds) {
  var sheet = ss.getSheetByName('Invoices');
  if (!sheet || !billIds || billIds.length === 0) return [];

  var data     = sheet.getDataRange().getValues();
  var found    = [];
  var billIdSet = {};
  billIds.forEach(function(b){ billIdSet[b] = true; });

  for (var i = 1; i < data.length; i++) {
    var row    = data[i];
    var billId = String(row[0] || '').trim();
    if (billIdSet[billId]) {
      found.push({
        billId:     billId,
        propertyId: String(row[1] || '').trim(),
        period:     String(row[2] || '').trim(),
        billDate:   String(row[3] || '').trim(),
        billAmount: parseFloat(row[4]) || 0,
        paidAmount: parseFloat(row[5]) || 0,
        balance:    parseFloat(row[6]) || 0,
        status:     String(row[7] || '').trim().replace(/^[^\w\s]+\s*/,'')
      });
    }
  }
  return found;
}

// ─── BUILD RECEIPT PDF ─────────────────────────────────────────────
function buildReceiptPdf(txData, member, invoices, tz) {

  // Determine owner display (single / joint / proxy)
  var ownerLine   = member.fullName;
  var proxyLine   = '';
  if (member.isProxy && member.proxyName) {
    proxyLine = member.proxyName;
  }

  // Invoice rows HTML
  var invoiceRows = '';
  if (invoices.length > 0) {
    invoices.forEach(function(inv) {
      invoiceRows +=
        '<tr>' +
        '<td style="padding:6px 10px;border-bottom:1px solid #f0f0f0">' + inv.billId + '</td>' +
        '<td style="padding:6px 10px;border-bottom:1px solid #f0f0f0">' + inv.period + '</td>' +
        '<td style="padding:6px 10px;border-bottom:1px solid #f0f0f0;text-align:right">₹' + inv.billAmount.toLocaleString('en-IN') + '</td>' +
        '<td style="padding:6px 10px;border-bottom:1px solid #f0f0f0;text-align:right;color:#16a34a">₹' + inv.paidAmount.toLocaleString('en-IN') + '</td>' +
        '<td style="padding:6px 10px;border-bottom:1px solid #f0f0f0;text-align:right;color:' + (inv.balance > 0 ? '#dc2626' : '#16a34a') + '">₹' + inv.balance.toLocaleString('en-IN') + '</td>' +
        '</tr>';
    });
  }

  // Clean mode display (strip emoji)
  var modeDisplay = txData.mode.replace(/^[^\w\s₹(]+\s*/, '');

  // Amount in words (simple)
  var amtWords = numberToWords(txData.amount);

  var html = '<!DOCTYPE html><html><head><meta charset="UTF-8">' +
  '<style>' +
  'body{font-family:Arial,sans-serif;margin:0;padding:0;color:#1a1a2e;font-size:13px}' +
  '.page{width:700px;margin:0 auto;padding:32px}' +
  '.header{background:linear-gradient(135deg,#1a3c5e,#2d6a9f);color:#fff;padding:20px 28px;border-radius:10px 10px 0 0;display:flex;align-items:center;gap:16px}' +
  '.header h1{margin:0;font-size:18px;font-weight:700}' +
  '.header p{margin:4px 0 0;font-size:12px;opacity:.85}' +
  '.receipt-badge{background:#FFD700;color:#1a3c5e;padding:4px 16px;border-radius:20px;font-weight:700;font-size:13px;white-space:nowrap}' +
  '.body{border:1px solid #dde3ec;border-top:none;border-radius:0 0 10px 10px;padding:24px 28px}' +
  '.row{display:flex;margin-bottom:10px}' +
  '.label{width:160px;font-weight:600;color:#64748b;font-size:12px;flex-shrink:0}' +
  '.value{color:#1a1a2e;font-size:13px}' +
  '.divider{border:none;border-top:1px dashed #cbd5e1;margin:16px 0}' +
  '.amount-box{background:#f0fdf4;border:2px solid #16a34a;border-radius:8px;padding:14px 20px;margin:16px 0;text-align:center}' +
  '.amount-box .amt{font-size:26px;font-weight:700;color:#16a34a}' +
  '.amount-box .words{font-size:12px;color:#64748b;margin-top:4px}' +
  '.inv-table{width:100%;border-collapse:collapse;margin-top:8px;font-size:12px}' +
  '.inv-table th{background:#f1f5f9;padding:8px 10px;text-align:left;font-weight:600;color:#475569}' +
  '.inv-table th:nth-child(3),.inv-table th:nth-child(4),.inv-table th:nth-child(5){text-align:right}' +
  '.section-title{font-weight:700;font-size:13px;color:#1a3c5e;margin:16px 0 8px;border-left:3px solid #2d6a9f;padding-left:10px}' +
  '.footer{text-align:center;margin-top:24px;font-size:11px;color:#94a3b8;border-top:1px solid #e2e8f0;padding-top:16px}' +
  '.stamp{display:inline-block;border:2px solid #16a34a;color:#16a34a;padding:6px 18px;border-radius:4px;font-weight:700;font-size:13px;transform:rotate(-8deg);margin-top:12px}' +
  '</style></head><body><div class="page">' +

  // Header
  '<div class="header">' +
  '<div style="flex:1">' +
  '<h1>🏘️ ' + SOCIETY_NAME + '</h1>' +
  '<p>' + SOCIETY_SHORT + ' &nbsp;|&nbsp; ' + SOCIETY_REGD + '</p>' +
  '</div>' +
  '<div class="receipt-badge">RECEIPT</div>' +
  '</div>' +

  // Body
  '<div class="body">' +

  // Receipt meta
  '<div class="row"><span class="label">Receipt No</span><span class="value"><strong>' + (txData.receiptNo || '—') + '</strong></span></div>' +
  '<div class="row"><span class="label">Transaction ID</span><span class="value">' + txData.txId + '</span></div>' +
  '<div class="row"><span class="label">Date</span><span class="value">' + txData.displayDate + '</span></div>' +
  '<div class="row"><span class="label">FY Year</span><span class="value">' + txData.fyYear + '</span></div>' +

  '<hr class="divider">' +

  // Member info
  '<p class="section-title">📍 Member Details</p>' +
  '<div class="row"><span class="label">Property ID</span><span class="value">' + member.propertyId + '</span></div>' +
  '<div class="row"><span class="label">Plot No</span><span class="value">' + member.plotNo + '</span></div>' +
  '<div class="row"><span class="label">Lane</span><span class="value">' + member.laneName + '</span></div>' +
  '<div class="row"><span class="label">Owner</span><span class="value"><strong>' + ownerLine + '</strong></span></div>' +
  (proxyLine ? '<div class="row"><span class="label">Proxy / Rep</span><span class="value">' + proxyLine + '</span></div>' : '') +

  '<hr class="divider">' +

  // Payment info
  '<p class="section-title">💳 Payment Details</p>' +
  '<div class="row"><span class="label">Description</span><span class="value">' + (txData.remarks || txData.accountSubHead || txData.accountHead) + '</span></div>' +
  '<div class="row"><span class="label">Category</span><span class="value">' + txData.accountHead + '</span></div>' +
  '<div class="row"><span class="label">Payment Mode</span><span class="value">' + modeDisplay + '</span></div>' +
  (txData.internalOrder ? '<div class="row"><span class="label">Internal Order</span><span class="value">' + txData.internalOrder + '</span></div>' : '') +

  // Amount box
  '<div class="amount-box">' +
  '<div class="amt">₹' + txData.amount.toLocaleString('en-IN') + '</div>' +
  '<div class="words">Rupees ' + amtWords + ' Only</div>' +
  '</div>' +

  // Invoice mapping (if any)
  (invoices.length > 0 ?
    '<p class="section-title">📋 Invoice Mapping</p>' +
    '<table class="inv-table"><thead><tr>' +
    '<th>Bill ID</th><th>Period</th><th>Billed</th><th>Paid</th><th>Balance</th>' +
    '</tr></thead><tbody>' + invoiceRows + '</tbody></table>'
    : '') +

  // Stamp
  '<div style="text-align:right;margin-top:20px"><span class="stamp">✓ RECEIVED</span></div>' +

  // Footer
  '<div class="footer">' +
  '<p>This is a system-generated receipt. No signature required.</p>' +
  '<p>' + SOCIETY_NAME + ' &nbsp;|&nbsp; ' + SOCIETY_REGD + '</p>' +
  '<p>📧 ' + SOCIETY_EMAIL + '</p>' +
  '<p style="font-size:10px;color:#cbd5e1">Generated on ' +
    Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd MMM yyyy HH:mm') + ' IST' +
  '</p>' +
  '</div>' +

  '</div></div></body></html>';

  // Convert HTML to PDF blob
  var blob = Utilities.newBlob(html, 'text/html', 'receipt.html');
  return blob.getAs('application/pdf');
}

// ─── FILENAME BUILDER ──────────────────────────────────────────────
function buildFileName(txData, member) {
  // RCPT-{receiptNo}-PID{propertyId}-{plotNo}.pdf
  // Sanitise plotNo: 107/P → 107P
  var plotSafe = member.plotNo.replace(/[\/\\:*?"<>|]/g, '');
  var rcptSafe = (txData.receiptNo || txData.txId).replace(/[\/\\:*?"<>|]/g, '');
  return 'RCPT-' + rcptSafe + '-PID' + member.propertyId + '-' + plotSafe + '.pdf';
}

// ─── DRIVE FOLDER ─────────────────────────────────────────────────
function getOrCreateReceiptFolder(dateStr) {
  // Root: SCRWA_Receipts
  var root   = DriveApp.getRootFolder();
  var rootFolders = root.getFoldersByName(RECEIPTS_FOLDER_NAME);
  var mainFolder  = rootFolders.hasNext()
    ? rootFolders.next()
    : root.createFolder(RECEIPTS_FOLDER_NAME);

  // Sub-folder: YYYY-MM (e.g. 2026-07)
  var monthKey = dateStr ? dateStr.substring(0, 7) : Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM');
  var subFolders = mainFolder.getFoldersByName(monthKey);
  return subFolders.hasNext()
    ? subFolders.next()
    : mainFolder.createFolder(monthKey);
}

// ─── WRITE PDF URL BACK TO SHEET (Col N = Attachments) ────────────
function writeReceiptUrlToSheet(ss, rowIndex, url) {
  var sheet  = ss.getSheetByName('TransactionDetails');
  if (!sheet) return;
  // rowIndex is 0-based array index; sheet row = rowIndex + 1
  // Col N = index 13 → column 14
  sheet.getRange(rowIndex + 1, 14).setValue(url);
}

// ─── LOG TO Receipts_Log ───────────────────────────────────────────
function logReceipt(ss, txData, member, fileName, pdfUrl) {
  var sheet = ss.getSheetByName(RECEIPTS_LOG_SHEET);
  if (!sheet) {
    sheet = ss.insertSheet(RECEIPTS_LOG_SHEET);
    sheet.appendRow([
      'Generated At', 'TxID', 'Receipt No', 'Property ID', 'Plot No',
      'Owner', 'Amount', 'Mode', 'Period/BillId', 'FY Year', 'PDF File', 'PDF URL'
    ]);
    sheet.getRange(1, 1, 1, 12).setFontWeight('bold').setBackground('#1a3c5e').setFontColor('#ffffff');
  }
  var now = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');
  sheet.appendRow([
    now,
    txData.txId,
    txData.receiptNo,
    member.propertyId,
    member.plotNo,
    member.fullName,
    txData.amount,
    txData.mode,
    txData.billId || txData.remarks,
    txData.fyYear,
    fileName,
    pdfUrl
  ]);
}

// ─── SEND EMAIL ───────────────────────────────────────────────────
function sendReceiptEmail(txData, member, invoices, pdfBlob, pdfUrl) {
  // Determine recipient emails
  var toEmails = [];
  if (member.email)      toEmails.push(member.email);
  if (member.proxyEmail && member.proxyEmail !== member.email)
    toEmails.push(member.proxyEmail);

  if (toEmails.length === 0) {
    return { sent: false, to: '', reason: 'No email address on record' };
  }

  var subject = '🧾 Receipt #' + (txData.receiptNo || txData.txId) +
                ' — ₹' + txData.amount.toLocaleString('en-IN') +
                ' | ' + SOCIETY_SHORT;

  // Invoice period summary
  var periodSummary = invoices.length > 0
    ? invoices.map(function(i){ return i.period; }).join(', ')
    : txData.remarks || '';

  var body =
    '<div style="font-family:Arial,sans-serif;max-width:560px;color:#1a1a2e">' +
    '<div style="background:#1a3c5e;color:#fff;padding:16px 20px;border-radius:8px 8px 0 0">' +
    '<h2 style="margin:0;font-size:16px">🏘️ ' + SOCIETY_SHORT + '</h2>' +
    '<p style="margin:4px 0 0;font-size:12px;opacity:.8">' + SOCIETY_REGD + '</p>' +
    '</div>' +
    '<div style="border:1px solid #dde3ec;border-top:none;padding:20px;border-radius:0 0 8px 8px">' +
    '<p>Dear <strong>' + member.fullName + '</strong>,</p>' +
    '<p>Please find your payment receipt attached for the following transaction:</p>' +
    '<table style="width:100%;border-collapse:collapse;font-size:13px;margin:12px 0">' +
    '<tr><td style="padding:6px;background:#f8fafc;width:40%"><strong>Receipt No</strong></td><td style="padding:6px">' + (txData.receiptNo || '—') + '</td></tr>' +
    '<tr><td style="padding:6px;background:#f8fafc"><strong>Date</strong></td><td style="padding:6px">' + txData.displayDate + '</td></tr>' +
    '<tr><td style="padding:6px;background:#f8fafc"><strong>Amount</strong></td><td style="padding:6px;color:#16a34a;font-weight:700">₹' + txData.amount.toLocaleString('en-IN') + '</td></tr>' +
    '<tr><td style="padding:6px;background:#f8fafc"><strong>Mode</strong></td><td style="padding:6px">' + txData.mode.replace(/^[^\w\s₹(]+\s*/,'') + '</td></tr>' +
    (periodSummary ? '<tr><td style="padding:6px;background:#f8fafc"><strong>For Period</strong></td><td style="padding:6px">' + periodSummary + '</td></tr>' : '') +
    '<tr><td style="padding:6px;background:#f8fafc"><strong>Property</strong></td><td style="padding:6px">Plot ' + member.plotNo + ' (ID: ' + member.propertyId + ')</td></tr>' +
    '</table>' +
    '<p>📎 Receipt PDF is attached to this email.</p>' +
    '<p>🔗 You can also <a href="' + pdfUrl + '" style="color:#2d6a9f">view the receipt online</a>.</p>' +
    '<hr style="border:none;border-top:1px solid #e2e8f0;margin:16px 0">' +
    '<p style="font-size:12px;color:#64748b">Thank you for your payment. This is a system-generated email.</p>' +
    '<p style="font-size:12px;color:#64748b">📧 ' + SOCIETY_EMAIL + ' &nbsp;|&nbsp; ' + SOCIETY_REGD + '</p>' +
    '</div></div>';

  var fileName = buildFileName(txData, member);

  GmailApp.sendEmail(
    toEmails.join(','),
    subject,
    'Please enable HTML to view this email.',
    {
      htmlBody:    body,
      attachments: [pdfBlob.setName(fileName)],
      name:        SOCIETY_SHORT,
      replyTo:     SOCIETY_EMAIL
    }
  );

  return { sent: true, to: toEmails.join(', ') };
}

// ─── BUILD WHATSAPP LINK ───────────────────────────────────────────
function buildWhatsAppLink(txData, member, pdfUrl) {
  var phone = member.proxyMobile || member.mobile;
  if (!phone) return '';

  var wp = phone.replace(/[^0-9]/g, '');
  var waNum = wp.length === 10 ? '91' + wp : wp;

  var msg =
    '🧾 *Receipt from SCRWA, Vampuguda*\n\n' +
    'Dear ' + member.fullName + ',\n\n' +
    'Your payment receipt has been generated:\n\n' +
    '🔢 Receipt No  : ' + (txData.receiptNo || txData.txId) + '\n' +
    '📅 Date        : ' + txData.displayDate + '\n' +
    '🏠 Plot No     : ' + member.plotNo + '\n' +
    '💰 Amount      : ₹' + txData.amount.toLocaleString('en-IN') + '\n' +
    '💳 Mode        : ' + txData.mode.replace(/^[^\w\s₹(]+\s*/,'') + '\n\n' +
    '📄 View Receipt PDF:\n' + pdfUrl + '\n\n' +
    'Thank you for your payment! 🙏\n' +
    '-- SCRWA Management Committee\n' +
    SOCIETY_REGD;

  return 'https://wa.me/' + waNum + '?text=' + encodeURIComponent(msg);
}

// ─── UTILITY: Number to Words ─────────────────────────────────────
function numberToWords(n) {
  n = Math.round(n);
  if (n === 0) return 'Zero';
  var ones = ['','One','Two','Three','Four','Five','Six','Seven','Eight','Nine',
              'Ten','Eleven','Twelve','Thirteen','Fourteen','Fifteen','Sixteen',
              'Seventeen','Eighteen','Nineteen'];
  var tens = ['','','Twenty','Thirty','Forty','Fifty','Sixty','Seventy','Eighty','Ninety'];
  function words(num) {
    if (num < 20)  return ones[num];
    if (num < 100) return tens[Math.floor(num/10)] + (num%10 ? ' '+ones[num%10] : '');
    if (num < 1000) return ones[Math.floor(num/100)] + ' Hundred' + (num%100 ? ' '+words(num%100) : '');
    if (num < 100000) return words(Math.floor(num/1000)) + ' Thousand' + (num%1000 ? ' '+words(num%1000) : '');
    if (num < 10000000) return words(Math.floor(num/100000)) + ' Lakh' + (num%100000 ? ' '+words(num%100000) : '');
    return words(Math.floor(num/10000000)) + ' Crore' + (num%10000000 ? ' '+words(num%10000000) : '');
  }
  return words(n);
}

// ─── SHEET MENU (for manual testing from Google Sheet) ───────────
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('🧾 SCRWA Receipts')
    .addItem('Generate Receipt for Selected Row', 'generateReceiptFromMenu')
    .addItem('📋 View Receipts Log', 'openReceiptsLog')
    .addToUi();
}

function generateReceiptFromMenu() {
  var ui     = SpreadsheetApp.getUi();
  var sheet  = SpreadsheetApp.getActiveSheet();
  var row    = sheet.getActiveCell().getRow();

  if (sheet.getName() !== 'TransactionDetails') {
    ui.alert('⚠️ Please select a row in the TransactionDetails sheet first.');
    return;
  }
  if (row <= 2) {
    ui.alert('⚠️ Please select a data row (row 3 or below).');
    return;
  }

  var txId = sheet.getRange(row, 1).getValue(); // Col A = TransactionID
  if (!txId) {
    ui.alert('⚠️ No TransactionID found in column A of the selected row.');
    return;
  }

  ui.alert('⏳ Generating receipt for ' + txId + '...\nThis may take 10-15 seconds.');

  var result = generateReceiptForTx(String(txId));

  if (result.success) {
    var msg =
      '✅ Receipt generated!\n\n' +
      '📄 File   : ' + result.fileName + '\n' +
      '🔗 URL    : ' + result.pdfUrl   + '\n' +
      '📧 Email  : ' + (result.emailSent ? 'Sent to ' + result.emailTo : 'Not sent (no email)') + '\n\n' +
      'PDF link also written to Column N of this row.';
    ui.alert('Receipt Ready', msg, ui.ButtonSet.OK);
  } else {
    ui.alert('❌ Failed: ' + result.message);
  }
}

function openReceiptsLog() {
  var ss    = SpreadsheetApp.openById(SPREADSHEET_ID_RECEIPT);
  var sheet = ss.getSheetByName(RECEIPTS_LOG_SHEET);
  if (sheet) {
    SpreadsheetApp.setActiveSheet(sheet);
  } else {
    SpreadsheetApp.getUi().alert('No receipts generated yet.');
  }
}

// ─── TEST FUNCTION ────────────────────────────────────────────────
function testReceiptGeneration() {
  // Replace with a real TransactionID from your sheet
  var testTxId = 'TX-a6c75cd7';
  var result = generateReceiptForTx(testTxId);
  Logger.log(JSON.stringify(result, null, 2));
}
