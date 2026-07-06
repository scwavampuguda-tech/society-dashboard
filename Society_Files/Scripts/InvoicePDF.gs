// ═══════════════════════════════════════════════════════════════════════════
//  InvoicePDF.gs  — SCRWA Invoice PDF Generator  v1.0
// ═══════════════════════════════════════════════════════════════════════════
//  Account   : scwa.vampuguda@gmail.com
//  Sheet ID  : same as ReceiptPDF.gs (SS_ID)
//
//  FEATURES:
//  1. Monthly auto-trigger — runs 1st of every month, sends to all owners
//     with outstanding invoices
//  2. Ad-hoc — AppSheet sets GenerateInvoice = 'Yes' on Invoice row →
//     GAS generates PDF for that owner → clears flag
//  3. Bulk manual — run bulkGenerateInvoices() from GAS editor with
//     optional BillPeriod filter
//
//  PDF CONTENT:
//  - Consolidated per owner (all properties in one PDF)
//  - Outstanding invoices only (unpaid + partial)
//  - Saves to Drive: SCRWA_Invoices/YYYY-MM/
//  - Sends email + WhatsApp link
//
//  INVOICE TABLE COLUMN MAP (header row 1=labels, row 2=headers, data row 3+):
//    Col A [0]  BillID
//    Col B [1]  PropertyID
//    Col C [2]  InternalOrder
//    Col D [3]  StartPeriod
//    Col E [4]  BillPeriod
//    Col F [5]  BillDate
//    Col G [6]  BillAmount
//    Col H [7]  PaidAmount
//    Col I [8]  BalanceRemaining
//    Col J [9]  Status
//
//  OWNER TABLE COLUMN MAP (header row 1, data row 2+):
//    Col A [0]  propertyID
//    Col B [1]  propertylocation (PlotNo)
//    Col D [3]  ownershiptype
//    Col E [4]  ownername1
//    Col F [5]  ownername2
//    Col H [7]  Lane No
// ═══════════════════════════════════════════════════════════════════════════

// ── Constants (shared with ReceiptPDF.gs) ───────────────────────────────
var INV_SS_ID           = SS_ID;
var INV_FOLDER          = 'SCRWA_Invoices';
var INV_SHEET           = 'Invoice';
var INV_OWNER_SHEET     = 'OwnerDetails';
var INV_LOG_SHEET       = 'Invoice_Log';
var INV_SOCIETY_NAME    = 'Senior Citizens Residential Welfare Association (SCRWA)';
var INV_SOCIETY_SHORT   = 'SCRWA, Vampuguda';
var INV_SOCIETY_REGD    = 'Regd. No: 2240/2006';
var INV_SOCIETY_EMAIL   = 'scwa.vampuguda@gmail.com';

// ── doPost hook — AppSheet ad-hoc trigger ───────────────────────────────
// AppSheet sends: { action: 'generateInvoice', propertyId: 'XXX', billPeriod: 'Jun-2026' }
function doPostInvoice(e) {
  try {
    var params = JSON.parse(e.postData.contents);
    if (params.action === 'generateInvoice') {
      var result = generateInvoiceForOwner(params.propertyId, params.billPeriod || null);
      return ContentService
        .createTextOutput(JSON.stringify(result))
        .setMimeType(ContentService.MimeType.JSON);
    }
  } catch(err) {
    return ContentService
      .createTextOutput(JSON.stringify({ success: false, error: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// ════════════════════════════════════════════════════════════════════════
//  TRIGGER 1 — Monthly auto (set time-based trigger on this function)
// ════════════════════════════════════════════════════════════════════════
function monthlyInvoiceTrigger() {
  var tz         = Session.getScriptTimeZone();
  var now        = new Date();
  var billPeriod = Utilities.formatDate(now, tz, 'MMM yyyy');  // e.g. "Jul 2026"
  Logger.log('=== Monthly Invoice Trigger: ' + billPeriod + ' ===');
  bulkGenerateInvoices(billPeriod);
}

// ════════════════════════════════════════════════════════════════════════
//  TRIGGER 2 — AppSheet ad-hoc: scan Invoice Col K (GenerateInvoice flag)
// ════════════════════════════════════════════════════════════════════════
function processInvoiceFlags() {
  var ss    = SpreadsheetApp.openById(INV_SS_ID);
  var sheet = ss.getSheetByName(INV_SHEET);
  if (!sheet) { Logger.log('Invoice sheet not found'); return; }
  var data  = sheet.getDataRange().getValues();

  // Col K [10] = GenerateInvoice flag (AppSheet sets 'Yes')
  var processed = {};
  for (var i = 2; i < data.length; i++) {
    var flag = String(data[i][10] || '').trim().toUpperCase();
    if (flag !== 'YES') continue;
    var propId = String(data[i][1] || '').trim();
    if (!propId || processed[propId]) continue;
    processed[propId] = true;

    Logger.log('Ad-hoc invoice trigger for PropertyID: ' + propId);
    try {
      generateInvoiceForOwner(propId, null);
      // Clear the flag
      sheet.getRange(i + 1, 11).setValue('');
    } catch(err) {
      Logger.log('Error generating invoice for ' + propId + ': ' + err.toString());
    }
  }
  SpreadsheetApp.flush();
  Logger.log('processInvoiceFlags complete');
}

// ════════════════════════════════════════════════════════════════════════
//  TRIGGER 3 — Bulk manual: run from GAS editor
//  billPeriodFilter: e.g. 'Jun 2026' or null for all outstanding
// ════════════════════════════════════════════════════════════════════════
function bulkGenerateInvoices(billPeriodFilter) {
  var ss        = SpreadsheetApp.openById(INV_SS_ID);
  var ownerMap  = getOwnerMap(ss);
  var invoices  = getOutstandingInvoices(ss, billPeriodFilter);

  if (!invoices.length) {
    Logger.log('No outstanding invoices found' + (billPeriodFilter ? ' for ' + billPeriodFilter : ''));
    return;
  }

  // Group invoices by ownername1 (consolidated per owner)
  var ownerGroups = {};
  invoices.forEach(function(inv) {
    var owner = ownerMap[inv.propertyId];
    if (!owner) return;
    var key = owner.ownername1 || inv.propertyId;
    if (!ownerGroups[key]) ownerGroups[key] = { owner: owner, invoices: [], propertyIds: [] };
    ownerGroups[key].invoices.push(inv);
    if (ownerGroups[key].propertyIds.indexOf(inv.propertyId) < 0) {
      ownerGroups[key].propertyIds.push(inv.propertyId);
    }
  });

  var total = Object.keys(ownerGroups).length;
  var done  = 0;
  Logger.log('Generating invoices for ' + total + ' owner(s)...');

  Object.keys(ownerGroups).forEach(function(key) {
    var group = ownerGroups[key];
    try {
      var result = generateInvoicePdf(ss, group.owner, group.invoices, group.propertyIds);
      Logger.log('[' + (++done) + '/' + total + '] ' + key + ' → ' + (result.success ? '✅' : '❌ ' + result.error));
    } catch(err) {
      Logger.log('Error for ' + key + ': ' + err.toString());
    }
  });

  Logger.log('=== Bulk invoice generation complete: ' + done + '/' + total + ' ===');
}

// ════════════════════════════════════════════════════════════════════════
//  Generate invoice for a single owner (by PropertyID)
// ════════════════════════════════════════════════════════════════════════
function generateInvoiceForOwner(propertyId, billPeriodFilter) {
  var ss       = SpreadsheetApp.openById(INV_SS_ID);
  var ownerMap = getOwnerMap(ss);
  var owner    = ownerMap[propertyId];

  if (!owner) {
    Logger.log('Owner not found for PropertyID: ' + propertyId);
    return { success: false, error: 'Owner not found' };
  }

  // Get all properties for this owner (same ownername1)
  var allPropIds = Object.keys(ownerMap).filter(function(pid) {
    return ownerMap[pid].ownername1 === owner.ownername1;
  });

  var invoices = getOutstandingInvoices(ss, billPeriodFilter, allPropIds);
  if (!invoices.length) {
    Logger.log('No outstanding invoices for ' + owner.ownername1);
    return { success: false, error: 'No outstanding invoices' };
  }

  return generateInvoicePdf(ss, owner, invoices, allPropIds);
}

// ════════════════════════════════════════════════════════════════════════
//  Core PDF generation + email + WhatsApp
// ════════════════════════════════════════════════════════════════════════
function generateInvoicePdf(ss, owner, invoices, propertyIds) {
  var tz          = Session.getScriptTimeZone();
  var now         = new Date();
  var monthKey    = Utilities.formatDate(now, tz, 'yyyy-MM');
  var displayDate = Utilities.formatDate(now, tz, 'dd MMM yyyy');
  var invoiceNo   = 'INV-' + owner.propertyId + '-' + Utilities.formatDate(now, tz, 'yyyyMMdd');

  // ── Build PDF HTML ──────────────────────────────────────────────────
  var html        = buildInvoiceHtml(owner, invoices, propertyIds, invoiceNo, displayDate, tz);
  var pdfBlob     = HtmlService.createHtmlOutput(html).getBlob()
                    .setName(invoiceNo + '.pdf')
                    .setContentType('application/pdf');

  // Convert HTML to PDF via Drive
  var htmlFile    = DriveApp.createFile(
                      HtmlService.createHtmlOutput(html).getBlob()
                      .setName(invoiceNo + '.html')
                      .setContentType('text/html')
                    );
  var pdfFile     = htmlFile.getAs('application/pdf');
  pdfFile.setName(invoiceNo + '.pdf');
  htmlFile.setTrashed(true);

  // ── Save to Drive ───────────────────────────────────────────────────
  var folder      = getOrCreateInvFolder(monthKey);
  var savedFile   = folder.createFile(pdfFile);
  savedFile.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  var pdfUrl      = 'https://drive.google.com/uc?export=download&id=' + savedFile.getId();

  // ── Send email ──────────────────────────────────────────────────────
  var totalOutstanding = invoices.reduce(function(s, inv) { return s + inv.balance; }, 0);
  var emailResult = sendInvoiceEmail(owner, invoices, savedFile, pdfUrl, invoiceNo, displayDate, totalOutstanding);

  // ── Log ─────────────────────────────────────────────────────────────
  logInvoice(ss, owner, invoices, invoiceNo, pdfUrl, emailResult);

  Logger.log('✅ Invoice generated for ' + owner.ownername1 + ': ' + pdfUrl);
  return { success: true, invoiceNo: invoiceNo, pdfUrl: pdfUrl, email: emailResult };
}

// ════════════════════════════════════════════════════════════════════════
//  Build Invoice HTML
// ════════════════════════════════════════════════════════════════════════
function buildInvoiceHtml(owner, invoices, propertyIds, invoiceNo, displayDate, tz) {
  var totalBill        = invoices.reduce(function(s, inv) { return s + inv.billAmt; }, 0);
  var totalPaid        = invoices.reduce(function(s, inv) { return s + inv.paidAmt; }, 0);
  var totalOutstanding = invoices.reduce(function(s, inv) { return s + inv.balance; }, 0);

  // Group by InternalOrder for display
  var ioGroups = {};
  invoices.forEach(function(inv) {
    if (!ioGroups[inv.internalOrder]) ioGroups[inv.internalOrder] = [];
    ioGroups[inv.internalOrder].push(inv);
  });

  var invoiceRows = '';
  Object.keys(ioGroups).forEach(function(io) {
    var rows     = ioGroups[io];
    var ioTotal  = rows.reduce(function(s, r) { return s + r.balance; }, 0);

    invoiceRows +=
      '<tr style="background:#eef2ff">' +
      '<td colspan="7" style="padding:5px 10px;font-size:11px;font-weight:700;color:#1e3a8a">' +
        io + ' — ' + (rows[0].ioName || io) +
      '</td></tr>';

    rows.forEach(function(inv) {
      var statusColor = inv.balance <= 0 ? '#16a34a' : '#dc2626';
      invoiceRows +=
        '<tr style="border-bottom:1px solid #f1f5f9">' +
        '<td style="padding:4px 8px;font-size:10px">' + inv.propertyId + '</td>' +
        '<td style="padding:4px 8px;font-size:10px">' + inv.plotNo + '</td>' +
        '<td style="padding:4px 8px;font-size:10px">' + inv.billId + '</td>' +
        '<td style="padding:4px 8px;font-size:10px">' + inv.billDate + '</td>' +
        '<td style="padding:4px 8px;font-size:10px">' + inv.billPeriod + '</td>' +
        '<td style="padding:4px 8px;font-size:10px;text-align:right">₹' + fINR(inv.billAmt) + '</td>' +
        '<td style="padding:4px 8px;font-size:10px;text-align:right">₹' + fINR(inv.paidAmt) + '</td>' +
        '<td style="padding:4px 8px;font-size:10px;text-align:right;font-weight:700;color:' + statusColor + '">₹' + fINR(inv.balance) + '</td>' +
        '<td style="padding:4px 8px;font-size:10px;color:' + statusColor + '">' + inv.status + '</td>' +
        '</tr>';
    });

    // IO subtotal
    invoiceRows +=
      '<tr style="background:#f8fafc;border-top:1px solid #d1dce8">' +
      '<td colspan="7" style="padding:4px 8px;font-size:10px;font-weight:700;text-align:right">Sub-total Outstanding:</td>' +
      '<td style="padding:4px 8px;font-size:10px;font-weight:700;color:#dc2626;text-align:right">₹' + fINR(ioTotal) + '</td>' +
      '<td></td></tr>';
  });

  return (
    '<!DOCTYPE html><html><head><meta charset="UTF-8">' +
    '<style>body{font-family:Arial,sans-serif;margin:0;padding:20px;color:#1e293b}' +
    'table{border-collapse:collapse;width:100%}' +
    'th{background:#1a3c5e;color:#fff;padding:6px 8px;font-size:10px;text-align:left}' +
    '</style></head><body>' +

    // ── Header ──────────────────────────────────────────────────────
    '<div style="background:linear-gradient(135deg,#1a3c5e,#2563eb);color:#fff;padding:16px 20px;border-radius:10px 10px 0 0">' +
    '<div style="display:flex;justify-content:space-between;align-items:center">' +
    '<div>' +
    '<div style="font-size:18px;font-weight:700">' + INV_SOCIETY_NAME + '</div>' +
    '<div style="font-size:11px;margin-top:4px;opacity:.85">' + INV_SOCIETY_SHORT + ' | ' + INV_SOCIETY_REGD + '</div>' +
    '<div style="font-size:11px;opacity:.85">' + INV_SOCIETY_EMAIL + '</div>' +
    '</div>' +
    '<div style="text-align:right">' +
    '<div style="font-size:22px;font-weight:700;letter-spacing:2px">INVOICE</div>' +
    '<div style="font-size:10px;margin-top:4px">No: ' + invoiceNo + '</div>' +
    '<div style="font-size:10px">Date: ' + displayDate + '</div>' +
    '</div>' +
    '</div></div>' +

    // ── Member details ───────────────────────────────────────────────
    '<div style="border:1px solid #d1dce8;border-top:none;padding:10px 16px;background:#f8fafc">' +
    '<table style="width:100%"><tr>' +
    '<td style="width:50%;font-size:11px;vertical-align:top">' +
    '<div style="font-weight:700;color:#1a3c5e;margin-bottom:4px">BILL TO</div>' +
    '<div style="font-weight:600">' + owner.ownername1 + (owner.ownername2 ? ' / ' + owner.ownername2 : '') + '</div>' +
    '<div>Plot No: ' + owner.plotNo + ' | Property ID: ' + owner.propertyId + '</div>' +
    '<div>' + INV_SOCIETY_SHORT + '</div>' +
    '</td>' +
    '<td style="width:50%;font-size:11px;vertical-align:top;text-align:right">' +
    '<div style="background:#fef2f2;border:2px solid #dc2626;border-radius:8px;display:inline-block;padding:8px 16px">' +
    '<div style="font-size:10px;color:#dc2626;font-weight:700;text-transform:uppercase">Total Outstanding</div>' +
    '<div style="font-size:24px;font-weight:700;color:#dc2626">₹' + fINR(totalOutstanding) + '</div>' +
    '</div>' +
    '</td></tr></table></div>' +

    // ── Invoice table ────────────────────────────────────────────────
    '<div style="border:1px solid #d1dce8;border-top:none;padding:10px 14px">' +
    '<div style="font-weight:700;font-size:11px;color:#1a3c5e;margin-bottom:8px;padding:4px 8px;' +
      'background:#eef2ff;border-left:3px solid #2563eb">OUTSTANDING INVOICE DETAILS</div>' +
    '<table>' +
    '<tr>' +
    '<th>Prop ID</th><th>Plot No</th><th>Bill ID</th><th>Bill Date</th>' +
    '<th>Period</th><th style="text-align:right">Bill Amt</th>' +
    '<th style="text-align:right">Paid</th><th style="text-align:right">Balance</th><th>Status</th>' +
    '</tr>' +
    invoiceRows +
    '</table></div>' +

    // ── Total bar ────────────────────────────────────────────────────
    '<div style="background:linear-gradient(135deg,#fef2f2,#fee2e2);border:2px solid #dc2626;' +
      'padding:8px 16px;display:flex;justify-content:space-between;align-items:center;margin-top:8px">' +
    '<div style="font-size:12px;font-weight:700;color:#991b1b">TOTAL AMOUNT DUE</div>' +
    '<div style="font-size:26px;font-weight:700;color:#dc2626">₹' + fINR(totalOutstanding) + '</div>' +
    '</div>' +

    // ── Payment instructions ─────────────────────────────────────────
    '<div style="border:1px solid #d1dce8;padding:10px 14px;margin-top:8px;background:#f0fdf4;' +
      'border-radius:0 0 10px 10px;font-size:10px;color:#166534">' +
    '<div style="font-weight:700;margin-bottom:4px">💳 PAYMENT INSTRUCTIONS</div>' +
    '<div>Please pay via UPI / NEFT / Bank Transfer to the Society account.</div>' +
    '<div style="margin-top:4px">For queries, contact: ' + INV_SOCIETY_EMAIL + ' | Quote your Property ID in all communications.</div>' +
    '<div style="margin-top:8px;font-size:9px;color:#94a3b8;text-align:center">' +
      'Generated on ' + displayDate + ' | ' + INV_SOCIETY_NAME +
    '</div>' +
    '</div>' +

    '</body></html>'
  );
}

// ════════════════════════════════════════════════════════════════════════
//  Send Invoice Email
// ════════════════════════════════════════════════════════════════════════
function sendInvoiceEmail(owner, invoices, pdfFile, pdfUrl, invoiceNo, displayDate, totalOutstanding) {
  if (!owner.email) {
    Logger.log('No email for ' + owner.ownername1);
    return { sent: false, reason: 'No email' };
  }

  var subject = 'Invoice – Outstanding Dues | ' + INV_SOCIETY_SHORT + ' | ' + owner.ownername1;
  var body    =
    '<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">' +
    '<div style="background:#1a3c5e;color:#fff;padding:16px;border-radius:8px 8px 0 0">' +
    '<h2 style="margin:0">' + INV_SOCIETY_NAME + '</h2>' +
    '<div style="font-size:12px;opacity:.8">' + INV_SOCIETY_SHORT + ' | ' + INV_SOCIETY_REGD + '</div>' +
    '</div>' +
    '<div style="padding:20px;border:1px solid #e2e8f0;border-top:none">' +
    '<p>Dear <strong>' + owner.ownername1 + '</strong>,</p>' +
    '<p>Please find attached your invoice for outstanding maintenance dues.</p>' +
    '<div style="background:#fef2f2;border:1px solid #dc2626;border-radius:8px;padding:12px;margin:16px 0;text-align:center">' +
    '<div style="font-size:12px;color:#991b1b;font-weight:700">TOTAL AMOUNT DUE</div>' +
    '<div style="font-size:28px;font-weight:700;color:#dc2626">₹' + fINR(totalOutstanding) + '</div>' +
    '</div>' +
    '<p>The detailed invoice is attached to this email and also available for download:</p>' +
    '<p><a href="' + pdfUrl + '" style="background:#2563eb;color:#fff;padding:8px 16px;' +
      'border-radius:4px;text-decoration:none;font-size:12px">📄 Download Invoice</a></p>' +
    '<p style="font-size:11px;color:#64748b">Invoice No: ' + invoiceNo + ' | Date: ' + displayDate + '</p>' +
    '<p style="font-size:11px">To view your outstanding dues, please check your Outstanding Report.</p>' +
    '<p style="font-size:11px">For any queries, please quote the Invoice Number in your communication with the Society office.</p>' +
    '<hr style="border:none;border-top:1px solid #e2e8f0;margin:16px 0">' +
    '<p style="font-size:10px;color:#94a3b8">Regards,<br><strong>SCRWA Management Committee</strong><br>' +
      INV_SOCIETY_SHORT + ' | ' + INV_SOCIETY_REGD + '<br>' + INV_SOCIETY_EMAIL + '</p>' +
    '</div></div>';

  try {
    var pdfBlob = pdfFile.getBlob().setName(invoiceNo + '.pdf');
    GmailApp.sendEmail(owner.email, subject, '', {
      htmlBody:    body,
      attachments: [pdfBlob],
      name:        INV_SOCIETY_SHORT
    });
    Logger.log('✅ Invoice email sent to ' + owner.email);
    return { sent: true, to: owner.email };
  } catch(err) {
    Logger.log('❌ Email failed for ' + owner.email + ': ' + err.toString());
    return { sent: false, error: err.toString() };
  }
}

// ════════════════════════════════════════════════════════════════════════
//  Data helpers
// ════════════════════════════════════════════════════════════════════════
function getOutstandingInvoices(ss, billPeriodFilter, propertyIdFilter) {
  var sheet = ss.getSheetByName(INV_SHEET);
  if (!sheet) return [];
  var data  = sheet.getDataRange().getValues();
  var tz    = Session.getScriptTimeZone();
  var ownerMap = getOwnerMap(ss);
  var result = [];

  for (var i = 2; i < data.length; i++) {
    var billId  = String(data[i][0] || '').trim();
    var propId  = String(data[i][1] || '').trim();
    var status  = String(data[i][9] || '').trim();
    var balance = parseFloat(String(data[i][8]).replace(/[₹,]/g,'')) || 0;

    if (!billId || !propId) continue;

    // Outstanding only — skip fully paid
    var isPaid = status.toUpperCase().indexOf('PAID') >= 0 && balance <= 0;
    if (isPaid) continue;
    if (balance <= 0 && status.toUpperCase().indexOf('PAID') >= 0) continue;

    // Property filter (for ad-hoc)
    if (propertyIdFilter && propertyIdFilter.indexOf(propId) < 0) continue;

    // BillPeriod filter (for monthly/manual)
    var billPeriod = '';
    if (data[i][4] instanceof Date) {
      billPeriod = Utilities.formatDate(data[i][4], tz, 'MMM yyyy');
    } else if (data[i][4]) {
      billPeriod = String(data[i][4]).trim();
    }
    if (billPeriodFilter && billPeriod.toLowerCase() !== billPeriodFilter.toLowerCase()) continue;

    // Bill date from Col F
    var billDate = '';
    if (data[i][5] instanceof Date) {
      billDate = Utilities.formatDate(data[i][5], tz, 'dd-MMM-yy');
    } else if (data[i][5]) {
      billDate = String(data[i][5]).trim().substring(0, 11);
    }

    var owner = ownerMap[propId] || {};
    result.push({
      billId:        billId,
      propertyId:    propId,
      internalOrder: String(data[i][2] || '').trim(),
      ioName:        '',
      billDate:      billDate,
      billPeriod:    billPeriod,
      billAmt:       Math.abs(parseFloat(String(data[i][6]).replace(/[₹,]/g,'')) || 0),
      paidAmt:       Math.abs(parseFloat(String(data[i][7]).replace(/[₹,]/g,'')) || 0),
      balance:       Math.abs(balance),
      status:        status.replace(/^[^\w\s✅⚠️⏳]+\s*/, ''),
      plotNo:        owner.plotNo || ''
    });
  }
  return result;
}

function getOwnerMap(ss) {
  var sheet = ss.getSheetByName(INV_OWNER_SHEET);
  if (!sheet) return {};
  var data  = sheet.getDataRange().getValues();
  var map   = {};
  for (var i = 1; i < data.length; i++) {
    var pid = String(data[i][0] || '').trim();
    if (!pid) continue;
    map[pid] = {
      propertyId:  pid,
      plotNo:      String(data[i][1] || '').trim(),
      ownername1:  String(data[i][4] || '').trim(),
      ownername2:  String(data[i][5] || '').trim(),
      email:       String(data[i][6] || '').trim(),  // adjust col if different
      phone:       String(data[i][8] || '').trim(),  // adjust col if different
      isWhatsapp:  String(data[i][9] || '').trim().toUpperCase() === 'TRUE'
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

function logInvoice(ss, owner, invoices, invoiceNo, pdfUrl, emailResult) {
  var logSheet = ss.getSheetByName(INV_LOG_SHEET);
  if (!logSheet) {
    logSheet = ss.insertSheet(INV_LOG_SHEET);
    logSheet.appendRow(['Timestamp','InvoiceNo','OwnerName','PropertyIDs','TotalOutstanding','PDFUrl','EmailSent','EmailTo']);
  }
  var tz           = Session.getScriptTimeZone();
  var now          = Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd HH:mm:ss');
  var propIds      = invoices.map(function(i){ return i.propertyId; }).filter(function(v,i,a){ return a.indexOf(v)===i; }).join(', ');
  var totalOut     = invoices.reduce(function(s, inv) { return s + inv.balance; }, 0);
  logSheet.appendRow([
    now, invoiceNo, owner.ownername1, propIds,
    totalOut, pdfUrl,
    emailResult.sent ? 'Yes' : 'No',
    emailResult.to || emailResult.reason || emailResult.error || ''
  ]);
}
