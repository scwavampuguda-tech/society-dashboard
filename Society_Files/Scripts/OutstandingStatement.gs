// ============================================================
// OutstandingStatement.gs — SCRWA Society
// 3 Actions: Generate PDF | Send Email | Send WhatsApp
// Triggered from AppSheet Owner Form via webhook
// ============================================================

// ─── CONFIG ──────────────────────────────────────────────────
var OS_CONFIG = {
  SOCIETY_NAME:    'Senior Citizens Residential Welfare Association (SCRWA)',
  SOCIETY_SUBNAME: 'REGD. NO: 2240/2006 · VAMPUGUDA, HYDERABAD',
  SOCIETY_EMAIL:   'scwa.vampuguda@gmail.com',
  SOCIETY_PHONE:   '+91-XXXXXXXXXX',   // update with actual number
  DRIVE_FOLDER:    'SCRWA_Outstanding', // Google Drive folder name
  SPREADSHEET_ID:  '1oXmvMIfQDm51KoHHtkhg8KgK1Qi5mwFYSBdrwir85CA',

  // OwnerDetails columns (0-based)
  OW_PROPID:       0,   // Col A — propertyID
  OW_LOCATION:     1,   // Col B — propertylocation
  OW_NAME1:        4,   // Col E — ownername1
  OW_NAME2:        5,   // Col F — ownername2
  OW_OWNERSHIP:    3,   // Col D — ownershiptype
  OW_EMAIL:        10,  // Col K — EmailID
  OW_PHONE:        11,  // Col L — Phonenumber
  OW_ISWP:         12,  // Col M — IsWhatsapp
  OW_PDF:          17,  // Col R — OutstandingPDF      (new)
  OW_EMAILSENT:    18,  // Col S — StatementEmailSent  (new)
  OW_WASENT:       19,  // Col T — StatementWASent     (new)

  // Invoice columns (0-based)
  INV_BILLID:      0,   // Col A
  INV_PROPID:      1,   // Col B
  INV_IO:          2,   // Col C — InternalOrder
  INV_START:       3,   // Col D — StartPeriod
  INV_PERIOD:      4,   // Col E — BillPeriod
  INV_BILLDATE:    5,   // Col F — BillDate
  INV_BILLAMT:     6,   // Col G — BillAmount
  INV_PAIDAMT:     7,   // Col H — PaidAmount
  INV_BALANCE:     8,   // Col I — BalanceRemaining
  INV_STATUS:      9,   // Col J — Status

  // Status values that are outstanding (pending / partial)
  PENDING_STATUS:  ['⚠️ Pending', '🔄 Partial', 'Pending', 'Partial',
                    '⚠️Pending', '🔄Partial'],
};

// ─── LOGO (base64) ─────────────────────────────────────────
// Reuse same logo as InvoicePDF.gs — fetched from Drive
function getLogoBase64_OS() {
  try {
    var files = DriveApp.getFilesByName('scrwa_logo.png');
    if (files.hasNext()) {
      var blob = files.next().getBlob();
      return 'data:image/png;base64,' + Utilities.base64Encode(blob.getBytes());
    }
  } catch(e) {}
  return '';
}

// ─── HELPER: get or create Drive folder ────────────────────
function getOSFolder_() {
  var folders = DriveApp.getFoldersByName(OS_CONFIG.DRIVE_FOLDER);
  return folders.hasNext() ? folders.next()
                           : DriveApp.createFolder(OS_CONFIG.DRIVE_FOLDER);
}

// ─── HELPER: format currency ───────────────────────────────
function fmtINR_(val) {
  var n = parseFloat(val) || 0;
  return '₹' + Math.abs(n).toLocaleString('en-IN', {minimumFractionDigits: 0, maximumFractionDigits: 0});
}

// ─── HELPER: format date ───────────────────────────────────
function fmtDate_(d) {
  if (!d) return '';
  if (d instanceof Date) return Utilities.formatDate(d, Session.getScriptTimeZone(), 'dd-MMM-yyyy');
  return String(d).trim().substring(0, 11);
}

// ─── HELPER: format period ─────────────────────────────────
function fmtPeriod_(d) {
  if (!d) return '';
  if (d instanceof Date) return Utilities.formatDate(d, Session.getScriptTimeZone(), 'MMM yyyy');
  var s = String(d).trim();
  return s.length >= 7 ? s.substring(0, 7) : s;
}

// ─── HELPER: get owner row by PropertyID ───────────────────
function getOwnerByPropId_(propId, owSheet) {
  var data = owSheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][OS_CONFIG.OW_PROPID]).trim() === String(propId).trim()) {
      return { row: i + 1, data: data[i] };
    }
  }
  return null;
}

// ─── HELPER: get outstanding invoices for a property ───────
function getOutstandingInvoices_(propId, invSheet) {
  var data    = invSheet.getDataRange().getValues();
  var pending = OS_CONFIG.PENDING_STATUS.map(function(s){ return s.toLowerCase().trim(); });
  var results = [];
  // row 0 = label, row 1 = header, data from row 2
  for (var i = 2; i < data.length; i++) {
    if (String(data[i][OS_CONFIG.INV_PROPID]).trim() !== String(propId).trim()) continue;
    var status = String(data[i][OS_CONFIG.INV_STATUS] || '').trim();
    if (pending.indexOf(status.toLowerCase().trim()) === -1) continue;
    results.push({
      rowIndex: i,
      billId:   String(data[i][OS_CONFIG.INV_BILLID] || '').trim(),
      period:   fmtPeriod_(data[i][OS_CONFIG.INV_PERIOD]),
      billDate: fmtDate_(data[i][OS_CONFIG.INV_BILLDATE]),
      billAmt:  Math.abs(parseFloat(data[i][OS_CONFIG.INV_BILLAMT]) || 0),
      paidAmt:  Math.abs(parseFloat(data[i][OS_CONFIG.INV_PAIDAMT]) || 0),
      balance:  Math.abs(parseFloat(data[i][OS_CONFIG.INV_BALANCE]) || 0),
      status:   status,
    });
  }
  return results;
}

// ─── BUILD HTML for Outstanding Statement ──────────────────
function buildOutstandingHTML_(owner, invoices, stmtDate) {
  var ownerName = [
    String(owner[OS_CONFIG.OW_NAME1] || '').trim(),
    String(owner[OS_CONFIG.OW_NAME2] || '').trim()
  ].filter(Boolean).join(' & ');

  var propId    = String(owner[OS_CONFIG.OW_PROPID]).trim();
  var location  = String(owner[OS_CONFIG.OW_LOCATION] || '').trim();
  var ownership = String(owner[OS_CONFIG.OW_OWNERSHIP] || '').trim();
  var logo      = getLogoBase64_OS();

  var totalBill = 0, totalPaid = 0, totalBal = 0;
  invoices.forEach(function(inv) {
    totalBill += inv.billAmt;
    totalPaid += inv.paidAmt;
    totalBal  += inv.balance;
  });

  // Build invoice rows
  var rows = '';
  invoices.forEach(function(inv, idx) {
    var statusColor = inv.status.toLowerCase().indexOf('partial') > -1
                    ? '#f59e0b' : '#ef4444';
    var statusLabel = inv.status.replace(/^[^\w\s₹⚠️🔄✅]+\s*/, '');
    rows += '<tr>' +
      '<td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;text-align:center;color:#64748b">' + (idx+1) + '</td>' +
      '<td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;font-family:monospace;font-size:11px;color:#1e3a5f">' + inv.billId + '</td>' +
      '<td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;color:#334155">' + inv.period + '</td>' +
      '<td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;color:#374151">' + inv.billDate + '</td>' +
      '<td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;text-align:right;color:#1e3a5f;font-weight:600">' + fmtINR_(inv.billAmt) + '</td>' +
      '<td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;text-align:right;color:#16a34a">' + fmtINR_(inv.paidAmt) + '</td>' +
      '<td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;text-align:right;color:#dc2626;font-weight:700">' + fmtINR_(inv.balance) + '</td>' +
      '<td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;text-align:center">' +
        '<span style="background:' + statusColor + ';color:#fff;padding:2px 8px;border-radius:10px;font-size:10px;font-weight:600">' + statusLabel + '</span>' +
      '</td>' +
    '</tr>';
  });

  var html =
  '<!DOCTYPE html><html><head><meta charset="UTF-8">' +
  '<style>body{font-family:Arial,sans-serif;margin:0;padding:0;background:#f8fafc}' +
  'table{border-collapse:collapse;width:100%}' +
  'th{background:#1e3a5f;color:#fff;padding:9px 10px;text-align:left;font-size:12px}' +
  'th.right{text-align:right}th.center{text-align:center}' +
  '</style></head><body>' +

  // Outer wrapper
  '<div style="max-width:780px;margin:0 auto;background:#fff;padding:30px">' +

  // Header
  '<table style="margin-bottom:20px"><tr>' +
  (logo ? '<td style="width:80px"><img src="' + logo + '" style="width:72px;height:72px;object-fit:contain"/></td>' : '') +
  '<td style="padding-left:16px">' +
  '<div style="color:#8b1a1a;font-size:18px;font-weight:700;letter-spacing:0.5px">' + OS_CONFIG.SOCIETY_NAME + '</div>' +
  '<div style="color:#b45309;font-size:11px;margin-top:3px">' + OS_CONFIG.SOCIETY_SUBNAME + '</div>' +
  '<div style="color:#64748b;font-size:11px">' + OS_CONFIG.SOCIETY_EMAIL + '</div>' +
  '</td>' +
  '<td style="text-align:right;vertical-align:top">' +
  '<div style="background:#1e3a5f;color:#fff;padding:8px 18px;border-radius:4px;font-size:14px;font-weight:700;letter-spacing:1px">OUTSTANDING</div>' +
  '<div style="background:#f1f5f9;color:#1e3a5f;padding:6px 18px;border-radius:4px;font-size:14px;font-weight:700;letter-spacing:1px;margin-top:4px">STATEMENT</div>' +
  '</td>' +
  '</tr></table>' +

  '<hr style="border:none;border-top:2px solid #1e3a5f;margin:0 0 16px">' +

  // Statement info box
  '<table style="margin-bottom:20px;border:1px solid #e2e8f0;border-radius:6px">' +
  '<tr>' +
  '<td style="padding:10px 16px;border-right:1px solid #e2e8f0;width:33%">' +
  '<div style="font-size:10px;color:#94a3b8;font-weight:600;text-transform:uppercase">Statement Date</div>' +
  '<div style="font-size:13px;font-weight:700;color:#1e293b;margin-top:3px">' + stmtDate + '</div>' +
  '</td>' +
  '<td style="padding:10px 16px;border-right:1px solid #e2e8f0;width:33%">' +
  '<div style="font-size:10px;color:#94a3b8;font-weight:600;text-transform:uppercase">Property ID · Location</div>' +
  '<div style="font-size:13px;font-weight:700;color:#1e293b;margin-top:3px">' + propId + ' · ' + location + '</div>' +
  '</td>' +
  '<td style="padding:10px 16px;width:34%">' +
  '<div style="font-size:10px;color:#94a3b8;font-weight:600;text-transform:uppercase">Owner · Type</div>' +
  '<div style="font-size:13px;font-weight:700;color:#1e293b;margin-top:3px">' + ownerName + ' · ' + ownership + '</div>' +
  '</td>' +
  '</tr>' +
  '</table>' +

  // Invoice table
  '<div style="font-size:12px;font-weight:700;color:#1e3a5f;margin-bottom:8px;text-transform:uppercase;letter-spacing:0.5px">⚠️ Outstanding Invoices</div>' +
  '<table style="margin-bottom:20px;border:1px solid #e2e8f0;border-radius:6px;overflow:hidden">' +
  '<thead><tr>' +
  '<th class="center" style="width:40px">#</th>' +
  '<th>Bill ID</th>' +
  '<th>Period</th>' +
  '<th>Bill Date</th>' +
  '<th class="right">Bill Amt</th>' +
  '<th class="right">Paid</th>' +
  '<th class="right">Balance</th>' +
  '<th class="center">Status</th>' +
  '</tr></thead>' +
  '<tbody>' + rows + '</tbody>' +
  '</table>' +

  // Summary box
  '<table style="margin-bottom:24px">' +
  '<tr>' +
  '<td style="width:60%"></td>' +
  '<td>' +
  '<table style="border:2px solid #dc2626;border-radius:8px;overflow:hidden;width:100%">' +
  '<tr style="background:#fef2f2">' +
  '<td style="padding:8px 16px;font-size:12px;color:#64748b;font-weight:600">Total Billed</td>' +
  '<td style="padding:8px 16px;text-align:right;font-size:13px;color:#1e293b;font-weight:700">' + fmtINR_(totalBill) + '</td>' +
  '</tr>' +
  '<tr style="background:#fef2f2">' +
  '<td style="padding:8px 16px;font-size:12px;color:#64748b;font-weight:600">Total Paid</td>' +
  '<td style="padding:8px 16px;text-align:right;font-size:13px;color:#16a34a;font-weight:700">' + fmtINR_(totalPaid) + '</td>' +
  '</tr>' +
  '<tr style="background:#dc2626">' +
  '<td style="padding:10px 16px;font-size:13px;color:#fff;font-weight:700">TOTAL OUTSTANDING</td>' +
  '<td style="padding:10px 16px;text-align:right;font-size:16px;color:#fff;font-weight:800">' + fmtINR_(totalBal) + '</td>' +
  '</tr>' +
  '</table>' +
  '</td>' +
  '</tr>' +
  '</table>' +

  // Payment instructions
  '<div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:6px;padding:14px 16px;margin-bottom:20px">' +
  '<div style="font-size:11px;font-weight:700;color:#166534;margin-bottom:6px">💳 PAYMENT INSTRUCTIONS</div>' +
  '<div style="font-size:11px;color:#166534;line-height:1.8">' +
  'Please make payment via UPI / Bank Transfer to:<br>' +
  '<strong>Account Name:</strong> SCRWA Vampuguda &nbsp;|&nbsp; ' +
  '<strong>UPI:</strong> scwa.vampuguda@sbi<br>' +
  'Kindly mention your <strong>Property ID</strong> in the payment remarks.' +
  '</div>' +
  '</div>' +

  // Footer
  '<hr style="border:none;border-top:1px solid #e2e8f0;margin-bottom:12px">' +
  '<div style="font-size:9px;color:#94a3b8;text-align:center;line-height:1.6">' +
  'This is a system-generated statement. For queries contact: ' + OS_CONFIG.SOCIETY_EMAIL +
  '</div>' +

  '</div></body></html>';

  return html;
}

// ═══════════════════════════════════════════════════════════
// ACTION 1 — generateOutstandingStatement(propId)
//   Called by AppSheet webhook: action on Owner Form
// ═══════════════════════════════════════════════════════════
function generateOutstandingStatement(propId) {
  var ss      = SpreadsheetApp.openById(OS_CONFIG.SPREADSHEET_ID);
  var owSheet = ss.getSheetByName('OwnerDetails');
  var invSheet= ss.getSheetByName('Invoice');
  var tz      = Session.getScriptTimeZone();

  // 1. Get owner
  var ownerRec = getOwnerByPropId_(propId, owSheet);
  if (!ownerRec) throw new Error('Property ' + propId + ' not found in OwnerDetails');
  var owner = ownerRec.data;

  // 2. Get outstanding invoices
  var invoices = getOutstandingInvoices_(propId, invSheet);
  if (invoices.length === 0) {
    Logger.log('No outstanding invoices for Property ' + propId);
    return { status: 'NO_OUTSTANDING', message: 'No pending invoices found for Property ' + propId };
  }

  // 3. Build HTML
  var stmtDate = Utilities.formatDate(new Date(), tz, 'dd-MMM-yyyy');
  var html     = buildOutstandingHTML_(owner, invoices, stmtDate);

  // 4. Convert to PDF
  var ownerName = String(owner[OS_CONFIG.OW_NAME1] || '').trim().replace(/\s+/g,'_');
  var fileName  = 'STMT-' + propId + '-' + ownerName + '-' + Utilities.formatDate(new Date(), tz, 'ddMMMyyyy') + '.pdf';
  var blob      = Utilities.newBlob(html, 'text/html', fileName + '.html')
                           .getAs('application/pdf');
  blob.setName(fileName);

  // 5. Save to Drive
  var folder  = getOSFolder_();
  // Delete old statement for same property if exists
  var oldFiles = folder.getFilesByName(fileName);
  while (oldFiles.hasNext()) oldFiles.next().setTrashed(true);
  var file    = folder.createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  var pdfUrl  = file.getUrl();

  // 6. Write PDF URL back to OwnerDetails Col R
  owSheet.getRange(ownerRec.row, OS_CONFIG.OW_PDF + 1).setValue(pdfUrl);

  Logger.log('✅ Statement generated for Property ' + propId + ': ' + fileName);
  return { status: 'OK', pdfUrl: pdfUrl, fileName: fileName, invoiceCount: invoices.length };
}

// ═══════════════════════════════════════════════════════════
// ACTION 2 — sendOutstandingEmail(propId)
//   Manual trigger from AppSheet action button
// ═══════════════════════════════════════════════════════════
function sendOutstandingEmail(propId) {
  var ss      = SpreadsheetApp.openById(OS_CONFIG.SPREADSHEET_ID);
  var owSheet = ss.getSheetByName('OwnerDetails');
  var tz      = Session.getScriptTimeZone();

  var ownerRec = getOwnerByPropId_(propId, owSheet);
  if (!ownerRec) throw new Error('Property ' + propId + ' not found');
  var owner   = ownerRec.data;

  var email   = String(owner[OS_CONFIG.OW_EMAIL] || '').trim();
  if (!email || email.indexOf('@') < 0) {
    throw new Error('No valid email for Property ' + propId + '. Please update EmailID in OwnerDetails.');
  }

  var pdfUrl  = String(owner[OS_CONFIG.OW_PDF + 1 - 1] || '').trim();  // Col R = index 17
  // Re-read correctly
  var pdfUrlVal = owSheet.getRange(ownerRec.row, OS_CONFIG.OW_PDF + 1).getValue();
  pdfUrl = String(pdfUrlVal || '').trim();

  if (!pdfUrl) {
    // Auto-generate if not done yet
    var result = generateOutstandingStatement(propId);
    if (result.status !== 'OK') {
      throw new Error(result.message || 'Could not generate statement');
    }
    pdfUrl = result.pdfUrl;
  }

  var ownerName = [
    String(owner[OS_CONFIG.OW_NAME1] || '').trim(),
    String(owner[OS_CONFIG.OW_NAME2] || '').trim()
  ].filter(Boolean).join(' & ');

  var subject = 'Outstanding Statement — Property ' + propId + ' | SCRWA Vampuguda';

  var body =
    '<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">' +
    '<div style="background:#1e3a5f;color:#fff;padding:16px 20px;border-radius:6px 6px 0 0">' +
    '<div style="font-size:16px;font-weight:700">' + OS_CONFIG.SOCIETY_NAME + '</div>' +
    '<div style="font-size:11px;opacity:0.8;margin-top:3px">' + OS_CONFIG.SOCIETY_SUBNAME + '</div>' +
    '</div>' +
    '<div style="background:#fff;border:1px solid #e2e8f0;border-top:none;padding:24px 20px">' +
    '<p style="color:#1e293b;font-size:14px">Dear <strong>' + ownerName + '</strong>,</p>' +
    '<p style="color:#475569;font-size:13px;line-height:1.7">' +
    'Please find your outstanding dues statement for <strong>Property ' + propId + '</strong> attached below.' +
    '</p>' +
    '<div style="background:#fef2f2;border:1px solid #fca5a5;border-radius:6px;padding:14px 16px;margin:16px 0">' +
    '<p style="color:#dc2626;font-weight:700;font-size:13px;margin:0 0 6px">⚠️ Action Required</p>' +
    '<p style="color:#7f1d1d;font-size:12px;margin:0;line-height:1.6">' +
    'Your account has pending dues. Kindly clear the outstanding amount at the earliest.<br>' +
    'Please mention your <strong>Property ID (' + propId + ')</strong> in payment remarks.' +
    '</p>' +
    '</div>' +
    '<p style="text-align:center;margin:20px 0">' +
    '<a href="' + pdfUrl + '" style="background:#1e3a5f;color:#fff;padding:10px 24px;border-radius:6px;text-decoration:none;font-size:13px;font-weight:700">📄 View Outstanding Statement</a>' +
    '</p>' +
    '<p style="color:#64748b;font-size:11px;line-height:1.8">' +
    '<strong>Payment:</strong> UPI / Bank Transfer<br>' +
    '<strong>UPI ID:</strong> scwa.vampuguda@sbi<br>' +
    '<strong>Remarks:</strong> Property ' + propId + ' dues' +
    '</p>' +
    '</div>' +
    '<div style="background:#f8fafc;border:1px solid #e2e8f0;border-top:none;padding:10px 20px;border-radius:0 0 6px 6px;text-align:center">' +
    '<span style="font-size:10px;color:#94a3b8">This is a system-generated email. Contact: ' + OS_CONFIG.SOCIETY_EMAIL + '</span>' +
    '</div></div>';

  GmailApp.sendEmail(email, subject, '', { htmlBody: body });

  // Stamp EmailSent timestamp
  var stamp = Utilities.formatDate(new Date(), tz, 'dd-MMM-yyyy HH:mm');
  owSheet.getRange(ownerRec.row, OS_CONFIG.OW_EMAILSENT + 1).setValue(stamp);

  Logger.log('✅ Email sent to ' + email + ' for Property ' + propId);
  return { status: 'OK', sentTo: email, timestamp: stamp };
}

// ═══════════════════════════════════════════════════════════
// ACTION 3 — getWhatsAppLink(propId)
//   Returns a wa.me link — AppSheet opens in browser
//   Phone number read from OwnerDetails (no country code hardcoding)
// ═══════════════════════════════════════════════════════════
function getWhatsAppLink(propId) {
  var ss      = SpreadsheetApp.openById(OS_CONFIG.SPREADSHEET_ID);
  var owSheet = ss.getSheetByName('OwnerDetails');
  var tz      = Session.getScriptTimeZone();

  var ownerRec = getOwnerByPropId_(propId, owSheet);
  if (!ownerRec) throw new Error('Property ' + propId + ' not found');
  var owner   = ownerRec.data;

  // Clean phone — keep digits and leading +
  var rawPhone = String(owner[OS_CONFIG.OW_PHONE] || '').trim();
  var phone    = rawPhone.replace(/[\s\-\(\)]/g, '');  // keep + and digits
  if (!phone) throw new Error('No phone number for Property ' + propId);

  var pdfUrl   = String(owSheet.getRange(ownerRec.row, OS_CONFIG.OW_PDF + 1).getValue() || '').trim();
  if (!pdfUrl) {
    var result = generateOutstandingStatement(propId);
    if (result.status !== 'OK') throw new Error(result.message || 'Could not generate statement');
    pdfUrl = result.pdfUrl;
  }

  var ownerName = String(owner[OS_CONFIG.OW_NAME1] || '').trim();
  var stmtDate  = Utilities.formatDate(new Date(), tz, 'dd-MMM-yyyy');

  var message =
    'Dear ' + ownerName + ',\n\n' +
    'This is a reminder from *SCRWA Vampuguda* regarding your outstanding dues for *Property ' + propId + '*.\n\n' +
    'Please find your outstanding statement here:\n' + pdfUrl + '\n\n' +
    'Kindly clear the dues at the earliest and mention *Property ' + propId + '* in payment remarks.\n\n' +
    'For queries: ' + OS_CONFIG.SOCIETY_EMAIL + '\n\n' +
    '_Statement Date: ' + stmtDate + '_';

  var encoded  = encodeURIComponent(message);
  var waLink   = 'https://wa.me/' + phone.replace('+','') + '?text=' + encoded;

  // Stamp WASent
  var stamp = Utilities.formatDate(new Date(), tz, 'dd-MMM-yyyy HH:mm');
  owSheet.getRange(ownerRec.row, OS_CONFIG.OW_WASENT + 1).setValue(stamp);

  Logger.log('✅ WA link generated for Property ' + propId + ': ' + waLink);
  return { status: 'OK', waLink: waLink, phone: phone, timestamp: stamp };
}

// ═══════════════════════════════════════════════════════════
// BULK ACTION — sendOutstandingEmailBulk()
//   Run from GAS manually — sends to all properties with
//   outstanding invoices that have a valid email
// ═══════════════════════════════════════════════════════════
function sendOutstandingEmailBulk() {
  var ss      = SpreadsheetApp.openById(OS_CONFIG.SPREADSHEET_ID);
  var owSheet = ss.getSheetByName('OwnerDetails');
  var invSheet= ss.getSheetByName('Invoice');
  var owData  = owSheet.getDataRange().getValues();

  var sent = 0, skipped = 0, errors = 0;

  for (var i = 1; i < owData.length; i++) {
    var propId = String(owData[i][OS_CONFIG.OW_PROPID] || '').trim();
    if (!propId) continue;
    var email  = String(owData[i][OS_CONFIG.OW_EMAIL] || '').trim();
    if (!email || email.indexOf('@') < 0) { skipped++; continue; }

    // Check if has outstanding invoices
    var invoices = getOutstandingInvoices_(propId, invSheet);
    if (invoices.length === 0) { skipped++; continue; }

    try {
      sendOutstandingEmail(propId);
      sent++;
      Utilities.sleep(1000); // stay within Gmail quota
    } catch(e) {
      Logger.log('ERROR Property ' + propId + ': ' + e.message);
      errors++;
    }
  }

  Logger.log('Bulk send complete — Sent: ' + sent + ' | Skipped: ' + skipped + ' | Errors: ' + errors);
  return { sent: sent, skipped: skipped, errors: errors };
}

// ═══════════════════════════════════════════════════════════
// TEST — run from GAS editor to verify
// ═══════════════════════════════════════════════════════════
function testOutstanding() {
  var result = generateOutstandingStatement('231');
  Logger.log(JSON.stringify(result));
}
