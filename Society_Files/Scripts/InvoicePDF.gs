// ═══════════════════════════════════════════════════════════════════════════
//  InvoicePDF.gs  — SCRWA Invoice PDF Generator  v3.0
// ═══════════════════════════════════════════════════════════════════════════
//  - One PDF per PropertyID (Active owners only)
//  - Generates for a given BillPeriod (e.g. Jul-2026) — NO balance filter
//  - Trigger 1: monthlyInvoiceTrigger()     — time-based, 1st of month
//  - Trigger 2: processInvoiceFlags()       — AppSheet sets Col N = 'Yes'
//  - Trigger 3: bulkGenerateInvoices()      — manual from GAS editor
//  - Writes PDF URL, EmailSent, WASent timestamps back to Invoice sheet
//
//  COLUMN MAP — Invoice (header row 1=labels, row 2=headers, data row 3+):
//    Col A  [0]  BillID
//    Col B  [1]  PropertyID
//    Col C  [2]  InternalOrder
//    Col D  [3]  StartPeriod
//    Col E  [4]  BillPeriod
//    Col F  [5]  BillDate
//    Col G  [6]  BillAmount
//    Col H  [7]  PaidAmount
//    Col I  [8]  BalanceRemaining
//    Col J  [9]  Status
//    Col K  [10] InvoicePDF       ← Drive URL written by GAS
//    Col L  [11] EmailSent        ← timestamp written by GAS
//    Col M  [12] WASent           ← timestamp written by GAS
//    Col N  [13] GenerateInvoice  ← AppSheet sets 'Yes' for ad-hoc
//
//  COLUMN MAP — OwnerDetails (header row 1, data row 2+):
//    Col A  [0]  propertyID
//    Col B  [1]  propertylocation (PlotNo)
//    Col E  [4]  ownername1
//    Col F  [5]  ownername2
//    Col J  [9]  OwnerStatus       ← '✅ Active' filter
//    Col K  [10] EmailID
//    Col L  [11] Phonenumber
//    Col M  [12] IsWhatsapp
//
//  COLUMN MAP — ProxyDetails (header row 2, data row 3+):
//    Col A  [0]  propertyID
//    Col E  [4]  REmailID
//    Col F  [5]  RPhonenumber
//    Col H  [7]  RIsWhatsapp
// ═══════════════════════════════════════════════════════════════════════════

var INV_FOLDER      = 'SCRWA_Invoices';
var INV_SHEET       = 'Invoice';
var INV_OWNER_SHEET = 'OwnerDetails';
var INV_PROXY_SHEET = 'ProxyDetails';
var INV_LOG_SHEET   = 'Invoice_Log';

// Column indices in Invoice sheet (0-based)
var INV_COL_BILLID     = 0;
var INV_COL_PROPID     = 1;
var INV_COL_IO         = 2;
var INV_COL_START      = 3;
var INV_COL_PERIOD     = 4;
var INV_COL_BILLDATE   = 5;
var INV_COL_BILLAMT    = 6;
var INV_COL_PAIDAMT    = 7;
var INV_COL_BALANCE    = 8;
var INV_COL_STATUS     = 9;
var INV_COL_PDF        = 10;   // Col K — InvoicePDF
var INV_COL_EMAIL      = 11;   // Col L — EmailSent
var INV_COL_WA         = 12;   // Col M — WASent
var INV_COL_GENFLAG    = 13;   // Col N — GenerateInvoice

// ════════════════════════════════════════════════════════════════════════
//  TRIGGER 1 — Monthly auto (set time-based trigger on this function)
//  Runs 1st of each month — generates invoices for current BillPeriod
// ════════════════════════════════════════════════════════════════════════
function monthlyInvoiceTrigger() {
  var tz         = Session.getScriptTimeZone();
  var now        = new Date();
  var billPeriod = Utilities.formatDate(now, tz, 'MMM-yyyy');  // e.g. Jul-2026
  Logger.log('=== Monthly Invoice Trigger: ' + billPeriod + ' ===');
  bulkGenerateInvoices(billPeriod);
}

// ════════════════════════════════════════════════════════════════════════
//  TRIGGER 2 — AppSheet ad-hoc
//  AppSheet sets Col N = 'Yes' → GAS generates PDF for that PropertyID
// ════════════════════════════════════════════════════════════════════════
function processInvoiceFlags() {
  var ss    = SpreadsheetApp.openById(SS_ID);
  var sheet = ss.getSheetByName(INV_SHEET);
  if (!sheet) { Logger.log('Invoice sheet not found'); return; }
  var data  = sheet.getDataRange().getValues();
  var tz    = Session.getScriptTimeZone();
  var processed = {};

  for (var i = 2; i < data.length; i++) {
    var flag   = String(data[i][INV_COL_GENFLAG] || '').trim().toUpperCase();
    if (flag !== 'YES') continue;
    var propId = String(data[i][INV_COL_PROPID] || '').trim();
    var period = normalizePeriod(data[i][INV_COL_PERIOD], tz);
    var key    = propId + '|' + period;
    if (!propId || processed[key]) continue;
    processed[key] = true;

    Logger.log('Ad-hoc invoice: ' + propId + ' | ' + period);
    try {
      var result = generateInvoiceForProperty(propId, period);
      Logger.log(propId + ' → ' + (result.success ? '✅ ' + result.invoiceNo : '❌ ' + result.error));
      sheet.getRange(i + 1, INV_COL_GENFLAG + 1).setValue('');  // clear flag
    } catch(err) {
      Logger.log('Error for ' + propId + ': ' + err.toString());
    }
  }
  SpreadsheetApp.flush();
  Logger.log('processInvoiceFlags complete');
}

// ════════════════════════════════════════════════════════════════════════
//  TRIGGER 3 — Bulk manual
//  Run from GAS editor: bulkGenerateInvoices('Jul-2026')
// ════════════════════════════════════════════════════════════════════════
function bulkGenerateInvoices(billPeriod) {
  if (!billPeriod) {
    var tz = Session.getScriptTimeZone();
    billPeriod = Utilities.formatDate(new Date(), tz, 'MMM-yyyy');
  }
  var ss       = SpreadsheetApp.openById(SS_ID);
  var ownerMap = getOwnerMap(ss);

  // Get distinct active PropertyIDs that have invoices for this period
  var propIds  = getPropertyIdsForPeriod(ss, billPeriod, ownerMap);
  Logger.log('Properties to invoice for ' + billPeriod + ': ' + propIds.length);

  var done = 0, skipped = 0;
  propIds.forEach(function(propId) {
    try {
      var result = generateInvoiceForProperty(propId, billPeriod);
      if (result.success) {
        done++;
        Logger.log('[✅] ' + propId + ' → ' + result.invoiceNo);
      } else {
        skipped++;
        Logger.log('[⏭] ' + propId + ' → ' + result.error);
      }
    } catch(err) {
      skipped++;
      Logger.log('[❌] ' + propId + ': ' + err.toString());
    }
  });
  Logger.log('=== Bulk complete: ' + done + ' generated, ' + skipped + ' skipped ===');
}

// ════════════════════════════════════════════════════════════════════════
//  Core: generate invoice PDF for one PropertyID + BillPeriod
// ════════════════════════════════════════════════════════════════════════
function generateInvoiceForProperty(propId, billPeriod) {
  var ss       = SpreadsheetApp.openById(SS_ID);
  var ownerMap = getOwnerMap(ss);
  var owner    = ownerMap[propId];

  if (!owner)          return { success: false, error: 'Owner not found: ' + propId };
  if (!owner.isActive) return { success: false, error: 'Inactive property: ' + propId };

  // Get all invoice rows for this property + period
  var invoiceRows = getInvoiceRows(ss, propId, billPeriod);
  if (!invoiceRows.length) return { success: false, error: 'No invoices for ' + propId + ' | ' + billPeriod };

  var tz          = Session.getScriptTimeZone();
  var now         = new Date();
  var monthKey    = Utilities.formatDate(now, tz, 'yyyy-MM');
  var displayDate = Utilities.formatDate(now, tz, 'dd MMM yyyy');
  var invoiceNo   = 'INV-' + propId + '-' + billPeriod.replace(/[^a-zA-Z0-9]/g,'-');

  // ── Build HTML → PDF ─────────────────────────────────────────────────
  var html     = buildInvoiceHtml(owner, invoiceRows, invoiceNo, displayDate, billPeriod);
  var htmlBlob = Utilities.newBlob(html, 'text/html', invoiceNo + '.html');
  var htmlFile = DriveApp.createFile(htmlBlob);
  var pdfBlob  = htmlFile.getAs('application/pdf').setName(invoiceNo + '.pdf');
  htmlFile.setTrashed(true);

  // ── Save to Drive ────────────────────────────────────────────────────
  var folder    = getOrCreateInvFolder(monthKey);
  var savedFile = folder.createFile(pdfBlob);
  savedFile.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  var pdfUrl    = 'https://drive.google.com/uc?export=download&id=' + savedFile.getId();

  var totalAmt  = invoiceRows.reduce(function(s, r) { return s + r.billAmt; }, 0);

  // ── Write PDF URL back to Invoice sheet Col K ────────────────────────
  writeInvoiceTracking(ss, invoiceRows, pdfUrl, null, null);

  // ── Send email ────────────────────────────────────────────────────────
  var emailResult = sendInvoiceEmail(owner, invoiceRows, savedFile, pdfUrl, invoiceNo, displayDate, billPeriod, totalAmt);
  if (emailResult.sent) {
    var stamp = Utilities.formatDate(now, tz, 'dd-MMM-yyyy HH:mm');
    writeInvoiceTracking(ss, invoiceRows, null, stamp, null);
  }

  // ── Log ───────────────────────────────────────────────────────────────
  logInvoice(ss, owner, invoiceRows, invoiceNo, pdfUrl, billPeriod, emailResult);

  return { success: true, invoiceNo: invoiceNo, pdfUrl: pdfUrl, emailResult: emailResult };
}

// ════════════════════════════════════════════════════════════════════════
//  Write tracking columns back to Invoice sheet
//  pdfUrl → Col K, emailStamp → Col L, waStamp → Col M
// ════════════════════════════════════════════════════════════════════════
function writeInvoiceTracking(ss, invoiceRows, pdfUrl, emailStamp, waStamp) {
  var sheet = ss.getSheetByName(INV_SHEET);
  if (!sheet) return;
  invoiceRows.forEach(function(row) {
    if (pdfUrl)      sheet.getRange(row.sheetRow, INV_COL_PDF   + 1).setValue(pdfUrl);
    if (emailStamp)  sheet.getRange(row.sheetRow, INV_COL_EMAIL + 1).setValue(emailStamp);
    if (waStamp)     sheet.getRange(row.sheetRow, INV_COL_WA    + 1).setValue(waStamp);
  });
  SpreadsheetApp.flush();
}

// ════════════════════════════════════════════════════════════════════════
//  Build Invoice HTML
// ════════════════════════════════════════════════════════════════════════
function buildInvoiceHtml(owner, invoiceRows, invoiceNo, displayDate, billPeriod) {
  var totalAmt  = invoiceRows.reduce(function(s, r) { return s + r.billAmt;  }, 0);
  var totalPaid = invoiceRows.reduce(function(s, r) { return s + r.paidAmt;  }, 0);
  var totalBal  = invoiceRows.reduce(function(s, r) { return s + r.balance;  }, 0);

  // Group by InternalOrder
  var ioGroups = {};
  invoiceRows.forEach(function(inv) {
    if (!ioGroups[inv.io]) ioGroups[inv.io] = [];
    ioGroups[inv.io].push(inv);
  });

  var rows = '';
  Object.keys(ioGroups).forEach(function(io) {
    var grp = ioGroups[io];
    rows +=
      '<tr style="background:#eef2ff">' +
      '<td colspan="6" style="padding:5px 10px;font-size:11px;font-weight:700;color:#1e3a8a">' +
        io + '</td></tr>';
    grp.forEach(function(inv) {
      var sc = inv.balance <= 0 ? '#16a34a' : '#b45309';
      rows +=
        '<tr style="border-bottom:1px solid #f1f5f9">' +
        '<td style="padding:4px 8px;font-size:10px">' + inv.billId     + '</td>' +
        '<td style="padding:4px 8px;font-size:10px">' + inv.billDate   + '</td>' +
        '<td style="padding:4px 8px;font-size:10px">' + inv.billPeriod + '</td>' +
        '<td style="padding:4px 8px;font-size:10px;text-align:right">₹' + fINR(inv.billAmt)  + '</td>' +
        '<td style="padding:4px 8px;font-size:10px;text-align:right">₹' + fINR(inv.paidAmt)  + '</td>' +
        '<td style="padding:4px 8px;font-size:10px;text-align:right;font-weight:700;color:' + sc + '">₹' + fINR(inv.balance) + '</td>' +
        '<td style="padding:4px 8px;font-size:10px;color:' + sc + '">' + inv.status + '</td>' +
        '</tr>';
    });
  });

  // Summary totals row
  rows +=
    '<tr style="background:#1a3c5e;color:#fff;font-weight:700">' +
    '<td colspan="3" style="padding:5px 10px;font-size:11px">TOTAL</td>' +
    '<td style="padding:5px 8px;font-size:11px;text-align:right">₹' + fINR(totalAmt)  + '</td>' +
    '<td style="padding:5px 8px;font-size:11px;text-align:right">₹' + fINR(totalPaid) + '</td>' +
    '<td style="padding:5px 8px;font-size:11px;text-align:right">₹' + fINR(totalBal)  + '</td>' +
    '<td></td></tr>';

  return '<!DOCTYPE html><html><head><meta charset="UTF-8">' +
    '<style>body{font-family:Arial,sans-serif;margin:0;padding:20px;color:#1e293b}' +
    'table{border-collapse:collapse;width:100%}' +
    'th{background:#1a3c5e;color:#fff;padding:6px 8px;font-size:10px;text-align:left}</style>' +
    '</head><body>' +

    // ── Header ──────────────────────────────────────────────────────────
    '<div style="background:linear-gradient(135deg,#1a3c5e,#2563eb);color:#fff;' +
      'padding:16px 20px;border-radius:10px 10px 0 0">' +
    '<div style="display:flex;justify-content:space-between;align-items:center">' +
    '<div>' +
    '<div style="font-size:18px;font-weight:700">' + SOCIETY_NAME + '</div>' +
    '<div style="font-size:11px;margin-top:4px;opacity:.85">' + SOCIETY_SHORT + ' | ' + SOCIETY_REGD + '</div>' +
    '<div style="font-size:11px;opacity:.85">' + SOCIETY_EMAIL + '</div>' +
    '</div>' +
    '<div style="text-align:right">' +
    '<div style="font-size:22px;font-weight:700;letter-spacing:2px">INVOICE</div>' +
    '<div style="font-size:10px;margin-top:4px">No: ' + invoiceNo + '</div>' +
    '<div style="font-size:10px">Date: ' + displayDate + '</div>' +
    '<div style="font-size:10px;font-weight:600">Period: ' + billPeriod + '</div>' +
    '</div></div></div>' +

    // ── Member details ────────────────────────────────────────────────
    '<div style="border:1px solid #d1dce8;border-top:none;padding:10px 16px;background:#f8fafc">' +
    '<table><tr>' +
    '<td style="width:55%;font-size:11px;vertical-align:top">' +
    '<div style="font-weight:700;color:#1a3c5e;margin-bottom:4px">BILL TO</div>' +
    '<div style="font-weight:600;font-size:13px">' + owner.ownername1 +
      (owner.ownername2 ? ' / ' + owner.ownername2 : '') + '</div>' +
    '<div>Plot No: ' + owner.plotNo + ' &nbsp;|&nbsp; Property ID: ' + owner.propertyId + '</div>' +
    '</td>' +
    '<td style="width:45%;text-align:right;vertical-align:top">' +
    '<div style="background:#fffbeb;border:2px solid #b45309;border-radius:8px;display:inline-block;padding:8px 16px">' +
    '<div style="font-size:10px;color:#b45309;font-weight:700;text-transform:uppercase">Invoice Amount</div>' +
    '<div style="font-size:26px;font-weight:700;color:#b45309">₹' + fINR(totalAmt) + '</div>' +
    '</div></td></tr></table></div>' +

    // ── Invoice table ─────────────────────────────────────────────────
    '<div style="border:1px solid #d1dce8;border-top:none;padding:10px 14px">' +
    '<div style="font-weight:700;font-size:11px;color:#1a3c5e;margin-bottom:8px;padding:4px 8px;' +
      'background:#eef2ff;border-left:3px solid #2563eb">INVOICE DETAILS — ' + billPeriod + '</div>' +
    '<table><tr>' +
    '<th>Bill ID</th><th>Bill Date</th><th>Period</th>' +
    '<th style="text-align:right">Bill Amt</th>' +
    '<th style="text-align:right">Paid</th>' +
    '<th style="text-align:right">Balance</th>' +
    '<th>Status</th></tr>' +
    rows + '</table></div>' +

    // ── Amount due box ────────────────────────────────────────────────
    '<div style="background:linear-gradient(135deg,#fffbeb,#fef3c7);border:2px solid #b45309;' +
      'padding:8px 16px;display:flex;justify-content:space-between;align-items:center;margin-top:8px">' +
    '<div>' +
    '<div style="font-size:12px;font-weight:700;color:#92400e">TOTAL INVOICE AMOUNT</div>' +
    '<div style="font-size:11px;color:#92400e;font-style:italic">Rupees ' + numberToWords(totalAmt) + ' Only</div>' +
    '</div>' +
    '<div style="font-size:26px;font-weight:700;color:#b45309">₹' + fINR(totalAmt) + '</div>' +
    '</div>' +

    // ── Payment instructions ──────────────────────────────────────────
    '<div style="border:1px solid #d1dce8;padding:10px 14px;margin-top:8px;background:#f0fdf4;' +
      'border-radius:0 0 10px 10px;font-size:10px;color:#166534">' +
    '<div style="font-weight:700;margin-bottom:4px">💳 PAYMENT INSTRUCTIONS</div>' +
    '<div>Please pay via UPI / NEFT / Bank Transfer to the Society account.</div>' +
    '<div style="margin-top:4px">For queries, contact: ' + SOCIETY_EMAIL +
      ' | Quote Property ID <strong>' + owner.propertyId + '</strong> in all communications.</div>' +
    '<div style="margin-top:8px;font-size:9px;color:#94a3b8;text-align:center">' +
      'This is a system-generated invoice. | Generated on ' + displayDate + ' | ' + SOCIETY_NAME +
    '</div></div>' +
    '</body></html>';
}

// ════════════════════════════════════════════════════════════════════════
//  Send Invoice Email
// ════════════════════════════════════════════════════════════════════════
function sendInvoiceEmail(owner, invoiceRows, savedFile, pdfUrl, invoiceNo, displayDate, billPeriod, totalAmt) {
  var emailTo = owner.email || owner.proxyEmail || '';
  if (!emailTo) {
    Logger.log('No email for ' + owner.propertyId);
    return { sent: false, reason: 'No email address' };
  }

  var subject =
    'Invoice ' + billPeriod + ' | ' + SOCIETY_SHORT + ' | ' +
    owner.ownername1 + ' (Plot: ' + owner.plotNo + ')';

  var body =
    '<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">' +
    '<div style="background:#1a3c5e;color:#fff;padding:16px;border-radius:8px 8px 0 0">' +
    '<h2 style="margin:0;font-size:16px">' + SOCIETY_NAME + '</h2>' +
    '<div style="font-size:11px;opacity:.8">' + SOCIETY_SHORT + ' | ' + SOCIETY_REGD + '</div></div>' +
    '<div style="padding:20px;border:1px solid #e2e8f0;border-top:none">' +
    '<p>Dear <strong>' + owner.ownername1 + '</strong>,</p>' +
    '<p>Please find attached your maintenance invoice for <strong>' + billPeriod + '</strong> for ' +
      'Plot No: <strong>' + owner.plotNo + '</strong> (Property ID: ' + owner.propertyId + ').</p>' +
    '<div style="background:#fffbeb;border:1px solid #b45309;border-radius:8px;' +
      'padding:12px;margin:16px 0;text-align:center">' +
    '<div style="font-size:11px;color:#92400e;font-weight:700">INVOICE AMOUNT</div>' +
    '<div style="font-size:28px;font-weight:700;color:#b45309">₹' + fINR(totalAmt) + '</div>' +
    '</div>' +
    '<p>The invoice is attached to this email and also available for download:</p>' +
    '<p><a href="' + pdfUrl + '" style="background:#2563eb;color:#fff;padding:8px 16px;' +
      'border-radius:4px;text-decoration:none;font-size:12px">📄 Download Invoice</a></p>' +
    '<p style="font-size:11px;color:#64748b">Invoice No: ' + invoiceNo + ' &nbsp;|&nbsp; Date: ' + displayDate + '</p>' +
    '<p style="font-size:11px">Please ensure payment before the due date to avoid any penalties.</p>' +
    '<p style="font-size:11px">For queries, please quote Property ID <strong>' +
      owner.propertyId + '</strong> in your communication with the Society office.</p>' +
    '<hr style="border:none;border-top:1px solid #e2e8f0;margin:16px 0">' +
    '<p style="font-size:10px;color:#94a3b8">Regards,<br><strong>SCRWA Management Committee</strong><br>' +
      SOCIETY_SHORT + ' | ' + SOCIETY_REGD + '<br>' + SOCIETY_EMAIL + '</p>' +
    '</div></div>';

  try {
    GmailApp.sendEmail(emailTo, subject, '', {
      htmlBody:    body,
      attachments: [savedFile.getBlob().setName(invoiceNo + '.pdf')],
      name:        SOCIETY_SHORT
    });
    Logger.log('✅ Invoice email → ' + emailTo);
    return { sent: true, to: emailTo };
  } catch(err) {
    Logger.log('❌ Email failed → ' + emailTo + ': ' + err.toString());
    return { sent: false, error: err.toString() };
  }
}

// ════════════════════════════════════════════════════════════════════════
//  Data helpers
// ════════════════════════════════════════════════════════════════════════

// Get all active PropertyIDs that have invoice rows for given BillPeriod
function getPropertyIdsForPeriod(ss, billPeriod, ownerMap) {
  var sheet = ss.getSheetByName(INV_SHEET);
  if (!sheet) return [];
  var data  = sheet.getDataRange().getValues();
  var tz    = Session.getScriptTimeZone();
  var found = {};
  for (var i = 2; i < data.length; i++) {
    var pid    = String(data[i][INV_COL_PROPID] || '').trim();
    var period = normalizePeriod(data[i][INV_COL_PERIOD], tz);
    if (!pid || period.toLowerCase() !== billPeriod.toLowerCase()) continue;
    var owner  = ownerMap[pid];
    if (!owner || !owner.isActive) continue;
    found[pid] = true;
  }
  return Object.keys(found);
}

// Get invoice rows for a specific PropertyID + BillPeriod
function getInvoiceRows(ss, propId, billPeriod) {
  var sheet = ss.getSheetByName(INV_SHEET);
  if (!sheet) return [];
  var data  = sheet.getDataRange().getValues();
  var tz    = Session.getScriptTimeZone();
  var found = [];
  for (var i = 2; i < data.length; i++) {
    var pid    = String(data[i][INV_COL_PROPID]  || '').trim();
    var period = normalizePeriod(data[i][INV_COL_PERIOD], tz);
    if (pid !== propId || period.toLowerCase() !== billPeriod.toLowerCase()) continue;

    var billDate = '';
    if (data[i][INV_COL_BILLDATE] instanceof Date) {
      billDate = Utilities.formatDate(data[i][INV_COL_BILLDATE], tz, 'dd-MMM-yy');
    } else if (data[i][INV_COL_BILLDATE]) {
      billDate = String(data[i][INV_COL_BILLDATE]).trim().substring(0, 11);
    }

    found.push({
      sheetRow:   i + 1,
      billId:     String(data[i][INV_COL_BILLID]  || '').trim(),
      propertyId: pid,
      io:         String(data[i][INV_COL_IO]       || '').trim(),
      billDate:   billDate,
      billPeriod: period,
      billAmt:    Math.abs(parseFloat(String(data[i][INV_COL_BILLAMT] ).replace(/[₹,\s]/g,'')) || 0),
      paidAmt:    Math.abs(parseFloat(String(data[i][INV_COL_PAIDAMT] ).replace(/[₹,\s]/g,'')) || 0),
      balance:         parseFloat(String(data[i][INV_COL_BALANCE]).replace(/[₹,\s]/g,''))  || 0,
      status:     String(data[i][INV_COL_STATUS]   || '').trim()
    });
  }
  return found;
}

function normalizePeriod(val, tz) {
  if (val instanceof Date) return Utilities.formatDate(val, tz, 'MMM-yyyy');
  var s = String(val || '').trim();
  // Handle 'Jun-2026' or 'Jun 2026' or 'Jun2026'
  return s.replace(/\s+/, '-');
}

function getOwnerMap(ss) {
  var sheet = ss.getSheetByName(INV_OWNER_SHEET);
  if (!sheet) return {};
  var data  = sheet.getDataRange().getValues();
  var proxy = getProxyMap(ss);
  var map   = {};
  for (var i = 1; i < data.length; i++) {
    var pid    = String(data[i][0]  || '').trim();
    var status = String(data[i][9]  || '').trim();
    if (!pid) continue;
    var px = proxy[pid] || {};
    map[pid] = {
      propertyId:  pid,
      plotNo:      String(data[i][1]  || '').trim(),
      ownername1:  String(data[i][4]  || '').trim(),
      ownername2:  String(data[i][5]  || '').trim(),
      email:       String(data[i][10] || '').trim(),
      phone:       String(data[i][11] || '').trim(),
      isWhatsapp:  String(data[i][12] || '').trim().toUpperCase() === 'TRUE',
      isActive:    status.replace(/[^a-zA-Z]/g,'').toUpperCase() === 'ACTIVE',
      proxyEmail:  px.email || '',
      proxyPhone:  px.phone || '',
      proxyWA:     px.isWA  || false
    };
  }
  return map;
}

function getProxyMap(ss) {
  var sheet = ss.getSheetByName(INV_PROXY_SHEET);
  if (!sheet) return {};
  var data  = sheet.getDataRange().getValues();
  var map   = {};
  for (var i = 2; i < data.length; i++) {
    var pid = String(data[i][0] || '').trim();
    if (!pid) continue;
    map[pid] = {
      email: String(data[i][4] || '').trim(),
      phone: String(data[i][5] || '').trim(),
      isWA:  String(data[i][7] || '').trim().toUpperCase() === 'TRUE'
    };
  }
  return map;
}

function getOrCreateInvFolder(monthKey) {
  var root = DriveApp.getRootFolder();
  var mf   = root.getFoldersByName(INV_FOLDER);
  var main = mf.hasNext() ? mf.next() : root.createFolder(INV_FOLDER);
  var sf   = main.getFoldersByName(monthKey);
  return sf.hasNext() ? sf.next() : main.createFolder(monthKey);
}

function logInvoice(ss, owner, invoiceRows, invoiceNo, pdfUrl, billPeriod, emailResult) {
  var logSheet = ss.getSheetByName(INV_LOG_SHEET);
  if (!logSheet) {
    logSheet = ss.insertSheet(INV_LOG_SHEET);
    logSheet.appendRow([
      'Timestamp','InvoiceNo','PropertyID','PlotNo','OwnerName',
      'BillPeriod','InvoiceRows','TotalAmount','PDFUrl','EmailSent','EmailTo'
    ]);
    logSheet.getRange(1, 1, 1, 11).setFontWeight('bold');
  }
  var tz      = Session.getScriptTimeZone();
  var now     = Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd HH:mm:ss');
  var total   = invoiceRows.reduce(function(s, r) { return s + r.billAmt; }, 0);
  logSheet.appendRow([
    now, invoiceNo, owner.propertyId, owner.plotNo, owner.ownername1,
    billPeriod, invoiceRows.length, total, pdfUrl,
    emailResult.sent ? 'Yes' : 'No',
    emailResult.to || emailResult.reason || emailResult.error || ''
  ]);
}
