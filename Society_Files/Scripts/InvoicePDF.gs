// ═══════════════════════════════════════════════════════════════════════════
//  InvoicePDF.gs  — SCRWA Invoice PDF Generator  v2.0
// ═══════════════════════════════════════════════════════════════════════════
//  - One PDF per PropertyID (Active owners only)
//  - Outstanding invoices only (unpaid + partial)
//  - Trigger 1: monthlyInvoiceTrigger()  — time-based, 1st of month
//  - Trigger 2: processInvoiceFlags()    — AppSheet sets GenerateInvoice='Yes'
//  - Trigger 3: bulkGenerateInvoices()   — manual run from GAS editor
//  - Email: PDF attached + Drive download link
//  - WhatsApp: wa.me link with pre-filled message
//  - Drive: SCRWA_Invoices/YYYY-MM/INV-{propertyId}-{date}.pdf
//  - Log: Invoice_Log sheet
//
//  COLUMN MAP — OwnerDetails (header row 1, data row 2+):
//    Col A [0]  propertyID
//    Col B [1]  propertylocation (PlotNo)
//    Col D [3]  ownershiptype
//    Col E [4]  ownername1
//    Col F [5]  ownername2
//    Col J [9]  OwnerStatus       ← 'Active' filter
//    Col K [10] EmailID
//    Col L [11] Phonenumber
//    Col M [12] IsWhatsapp
//    Col O [14] IsProxy
//
//  COLUMN MAP — ProxyDetails (header row 2, data row 3+):
//    Col A [0]  propertyID
//    Col E [4]  REmailID
//    Col F [5]  RPhonenumber
//    Col H [7]  RIsWhatsapp
//
//  COLUMN MAP — Invoice (header row 1=labels, row 2=headers, data row 3+):
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
// ═══════════════════════════════════════════════════════════════════════════

var INV_FOLDER       = 'SCRWA_Invoices';
var INV_SHEET        = 'Invoice';
var INV_OWNER_SHEET  = 'OwnerDetails';
var INV_PROXY_SHEET  = 'ProxyDetails';
var INV_LOG_SHEET    = 'Invoice_Log';

// ════════════════════════════════════════════════════════════════════════
//  TRIGGER 1 — Monthly auto (set time-based trigger on this function)
//  Runs 1st of each month — generates invoices for ALL active properties
//  with outstanding invoices in current BillPeriod
// ════════════════════════════════════════════════════════════════════════
function monthlyInvoiceTrigger() {
  var tz         = Session.getScriptTimeZone();
  var now        = new Date();
  var billPeriod = Utilities.formatDate(now, tz, 'MMM yyyy');
  Logger.log('=== Monthly Invoice Trigger: ' + billPeriod + ' ===');
  bulkGenerateInvoices(billPeriod);
}

// ════════════════════════════════════════════════════════════════════════
//  TRIGGER 2 — AppSheet ad-hoc
//  AppSheet sets GenerateInvoice = 'Yes' on Invoice row →
//  GAS generates PDF for that PropertyID → clears flag
// ════════════════════════════════════════════════════════════════════════
function processInvoiceFlags() {
  var ss    = SpreadsheetApp.openById(SS_ID);
  var sheet = ss.getSheetByName(INV_SHEET);
  if (!sheet) { Logger.log('Invoice sheet not found'); return; }
  var data  = sheet.getDataRange().getValues();

  // Col K [10] = GenerateInvoice flag
  var processed = {};
  for (var i = 2; i < data.length; i++) {
    var flag   = String(data[i][10] || '').trim().toUpperCase();
    if (flag !== 'YES') continue;
    var propId = String(data[i][1] || '').trim();
    if (!propId || processed[propId]) continue;
    processed[propId] = true;

    Logger.log('Ad-hoc invoice for PropertyID: ' + propId);
    try {
      var result = generateInvoiceForProperty(propId, null);
      Logger.log(propId + ' → ' + (result.success ? '✅ ' + result.invoiceNo : '❌ ' + result.error));
      sheet.getRange(i + 1, 11).setValue('');  // clear flag
    } catch(err) {
      Logger.log('Error for ' + propId + ': ' + err.toString());
    }
  }
  SpreadsheetApp.flush();
}

// ════════════════════════════════════════════════════════════════════════
//  TRIGGER 3 — Bulk manual
//  Run from GAS editor: bulkGenerateInvoices('Jun 2026')
//  billPeriodFilter = null → all outstanding regardless of period
// ════════════════════════════════════════════════════════════════════════
function bulkGenerateInvoices(billPeriodFilter) {
  var ss       = SpreadsheetApp.openById(SS_ID);
  var ownerMap = getOwnerMap(ss);

  // Get all active PropertyIDs
  var activePropIds = Object.keys(ownerMap).filter(function(pid) {
    return ownerMap[pid].isActive;
  });

  Logger.log('Active properties: ' + activePropIds.length +
    (billPeriodFilter ? ' | Period: ' + billPeriodFilter : ' | All outstanding'));

  var done = 0, skipped = 0;
  activePropIds.forEach(function(propId) {
    try {
      var result = generateInvoiceForProperty(propId, billPeriodFilter);
      if (result.success) {
        done++;
        Logger.log('[✅] ' + propId + ' → ' + result.invoiceNo);
      } else {
        skipped++;
        Logger.log('[⏭] ' + propId + ' → ' + result.error);
      }
    } catch(err) {
      skipped++;
      Logger.log('[❌] ' + propId + ' → ' + err.toString());
    }
  });

  Logger.log('=== Bulk complete: ' + done + ' generated, ' + skipped + ' skipped ===');
}

// ════════════════════════════════════════════════════════════════════════
//  Core: generate invoice for one PropertyID
// ════════════════════════════════════════════════════════════════════════
function generateInvoiceForProperty(propId, billPeriodFilter) {
  var ss       = SpreadsheetApp.openById(SS_ID);
  var ownerMap = getOwnerMap(ss);
  var owner    = ownerMap[propId];

  if (!owner)           return { success: false, error: 'Owner not found: ' + propId };
  if (!owner.isActive)  return { success: false, error: 'Inactive property: ' + propId };

  var invoices = getOutstandingInvoices(ss, propId, billPeriodFilter);
  if (!invoices.length) return { success: false, error: 'No outstanding invoices' };

  var tz          = Session.getScriptTimeZone();
  var now         = new Date();
  var monthKey    = Utilities.formatDate(now, tz, 'yyyy-MM');
  var displayDate = Utilities.formatDate(now, tz, 'dd MMM yyyy');
  var invoiceNo   = 'INV-' + propId + '-' + Utilities.formatDate(now, tz, 'yyyyMMdd');

  // ── Build HTML → PDF ────────────────────────────────────────────────
  var html     = buildInvoiceHtml(owner, invoices, invoiceNo, displayDate);
  var htmlBlob = Utilities.newBlob(html, 'text/html', invoiceNo + '.html');
  var htmlFile = DriveApp.createFile(htmlBlob);
  var pdfBlob  = htmlFile.getAs('application/pdf').setName(invoiceNo + '.pdf');
  htmlFile.setTrashed(true);

  // ── Save to Drive ────────────────────────────────────────────────────
  var folder      = getOrCreateInvFolder(monthKey);
  var savedFile   = folder.createFile(pdfBlob);
  savedFile.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  var pdfUrl      = 'https://drive.google.com/uc?export=download&id=' + savedFile.getId();

  var totalOut    = invoices.reduce(function(s, i) { return s + i.balance; }, 0);

  // ── Send email ────────────────────────────────────────────────────────
  var emailResult = sendInvoiceEmail(owner, invoices, savedFile, pdfUrl, invoiceNo, displayDate, totalOut);

  // ── Log ───────────────────────────────────────────────────────────────
  logInvoice(ss, owner, invoices, invoiceNo, pdfUrl, emailResult);

  return { success: true, invoiceNo: invoiceNo, pdfUrl: pdfUrl, emailResult: emailResult };
}

// ════════════════════════════════════════════════════════════════════════
//  Build Invoice HTML
// ════════════════════════════════════════════════════════════════════════
function buildInvoiceHtml(owner, invoices, invoiceNo, displayDate) {
  var totalBill = invoices.reduce(function(s, i) { return s + i.billAmt;  }, 0);
  var totalPaid = invoices.reduce(function(s, i) { return s + i.paidAmt;  }, 0);
  var totalOut  = invoices.reduce(function(s, i) { return s + i.balance;  }, 0);

  // Group rows by InternalOrder
  var ioGroups = {};
  invoices.forEach(function(inv) {
    if (!ioGroups[inv.io]) ioGroups[inv.io] = [];
    ioGroups[inv.io].push(inv);
  });

  var rows = '';
  Object.keys(ioGroups).forEach(function(io) {
    var grp     = ioGroups[io];
    var ioTotal = grp.reduce(function(s, r) { return s + r.balance; }, 0);
    rows +=
      '<tr style="background:#eef2ff">' +
      '<td colspan="6" style="padding:5px 10px;font-size:11px;font-weight:700;color:#1e3a8a">' + io + '</td>' +
      '</tr>';
    grp.forEach(function(inv) {
      var sc = inv.balance <= 0 ? '#16a34a' : '#dc2626';
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
    rows +=
      '<tr style="background:#f8fafc;border-top:1px solid #d1dce8">' +
      '<td colspan="5" style="padding:4px 8px;font-size:10px;font-weight:700;text-align:right">Sub-total:</td>' +
      '<td style="padding:4px 8px;font-size:10px;font-weight:700;color:#dc2626;text-align:right">₹' + fINR(ioTotal) + '</td>' +
      '<td></td></tr>';
  });

  return '<!DOCTYPE html><html><head><meta charset="UTF-8">' +
    '<style>body{font-family:Arial,sans-serif;margin:0;padding:20px;color:#1e293b}' +
    'table{border-collapse:collapse;width:100%}' +
    'th{background:#1a3c5e;color:#fff;padding:6px 8px;font-size:10px;text-align:left}</style>' +
    '</head><body>' +

    // Header
    '<div style="background:linear-gradient(135deg,#1a3c5e,#2563eb);color:#fff;padding:16px 20px;border-radius:10px 10px 0 0">' +
    '<div style="display:flex;justify-content:space-between;align-items:center">' +
    '<div><div style="font-size:18px;font-weight:700">' + SOCIETY_NAME + '</div>' +
    '<div style="font-size:11px;margin-top:4px;opacity:.85">' + SOCIETY_SHORT + ' | ' + SOCIETY_REGD + '</div>' +
    '<div style="font-size:11px;opacity:.85">' + SOCIETY_EMAIL + '</div></div>' +
    '<div style="text-align:right">' +
    '<div style="font-size:22px;font-weight:700;letter-spacing:2px">INVOICE</div>' +
    '<div style="font-size:10px;margin-top:4px">No: ' + invoiceNo + '</div>' +
    '<div style="font-size:10px">Date: ' + displayDate + '</div></div>' +
    '</div></div>' +

    // Member details + outstanding box
    '<div style="border:1px solid #d1dce8;border-top:none;padding:10px 16px;background:#f8fafc">' +
    '<table><tr>' +
    '<td style="width:55%;font-size:11px;vertical-align:top">' +
    '<div style="font-weight:700;color:#1a3c5e;margin-bottom:4px">BILL TO</div>' +
    '<div style="font-weight:600;font-size:13px">' + owner.ownername1 +
      (owner.ownername2 ? ' / ' + owner.ownername2 : '') + '</div>' +
    '<div>Plot No: ' + owner.plotNo + ' &nbsp;|&nbsp; Property ID: ' + owner.propertyId + '</div>' +
    '<div>' + SOCIETY_SHORT + '</div></td>' +
    '<td style="width:45%;text-align:right;vertical-align:top">' +
    '<div style="background:#fef2f2;border:2px solid #dc2626;border-radius:8px;display:inline-block;padding:8px 16px">' +
    '<div style="font-size:10px;color:#dc2626;font-weight:700;text-transform:uppercase">Total Outstanding</div>' +
    '<div style="font-size:26px;font-weight:700;color:#dc2626">₹' + fINR(totalOut) + '</div>' +
    '</div></td></tr></table></div>' +

    // Invoice table
    '<div style="border:1px solid #d1dce8;border-top:none;padding:10px 14px">' +
    '<div style="font-weight:700;font-size:11px;color:#1a3c5e;margin-bottom:8px;padding:4px 8px;' +
      'background:#eef2ff;border-left:3px solid #2563eb">OUTSTANDING INVOICE DETAILS</div>' +
    '<table><tr>' +
    '<th>Bill ID</th><th>Bill Date</th><th>Period</th>' +
    '<th style="text-align:right">Bill Amt</th>' +
    '<th style="text-align:right">Paid</th>' +
    '<th style="text-align:right">Balance</th>' +
    '<th>Status</th></tr>' +
    rows + '</table></div>' +

    // Total bar
    '<div style="background:linear-gradient(135deg,#fef2f2,#fee2e2);border:2px solid #dc2626;' +
      'padding:8px 16px;display:flex;justify-content:space-between;align-items:center;margin-top:8px">' +
    '<div><div style="font-size:12px;font-weight:700;color:#991b1b">TOTAL AMOUNT DUE</div>' +
    '<div style="font-size:11px;color:#991b1b;font-style:italic">Rupees ' + numberToWords(totalOut) + ' Only</div></div>' +
    '<div style="font-size:26px;font-weight:700;color:#dc2626">₹' + fINR(totalOut) + '</div>' +
    '</div>' +

    // Payment instructions
    '<div style="border:1px solid #d1dce8;padding:10px 14px;margin-top:8px;background:#f0fdf4;' +
      'border-radius:0 0 10px 10px;font-size:10px;color:#166534">' +
    '<div style="font-weight:700;margin-bottom:4px">💳 PAYMENT INSTRUCTIONS</div>' +
    '<div>Please pay via UPI / NEFT / Bank Transfer to the Society account.</div>' +
    '<div style="margin-top:4px">For queries, contact: ' + SOCIETY_EMAIL +
      ' | Quote Property ID <strong>' + owner.propertyId + '</strong> in all communications.</div>' +
    '<div style="margin-top:8px;font-size:9px;color:#94a3b8;text-align:center">' +
      'Generated on ' + displayDate + ' | ' + SOCIETY_NAME + '</div>' +
    '</div></body></html>';
}

// ════════════════════════════════════════════════════════════════════════
//  Send Invoice Email
// ════════════════════════════════════════════════════════════════════════
function sendInvoiceEmail(owner, invoices, savedFile, pdfUrl, invoiceNo, displayDate, totalOut) {
  // Use proxy email if owner has no direct email
  var emailTo = owner.email || owner.proxyEmail || '';
  if (!emailTo) {
    Logger.log('No email for ' + owner.propertyId + ' — skipping email');
    return { sent: false, reason: 'No email address' };
  }

  var subject =
    'Invoice – Outstanding Dues | ' + SOCIETY_SHORT + ' | ' +
    owner.ownername1 + ' (Plot: ' + owner.plotNo + ')';

  var body =
    '<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">' +
    '<div style="background:#1a3c5e;color:#fff;padding:16px;border-radius:8px 8px 0 0">' +
    '<h2 style="margin:0;font-size:16px">' + SOCIETY_NAME + '</h2>' +
    '<div style="font-size:11px;opacity:.8">' + SOCIETY_SHORT + ' | ' + SOCIETY_REGD + '</div></div>' +
    '<div style="padding:20px;border:1px solid #e2e8f0;border-top:none">' +
    '<p>Dear <strong>' + owner.ownername1 + '</strong>,</p>' +
    '<p>Please find attached your invoice for outstanding maintenance dues for ' +
      '<strong>Plot No: ' + owner.plotNo + ' (Property ID: ' + owner.propertyId + ')</strong>.</p>' +
    '<div style="background:#fef2f2;border:1px solid #dc2626;border-radius:8px;' +
      'padding:12px;margin:16px 0;text-align:center">' +
    '<div style="font-size:11px;color:#991b1b;font-weight:700">TOTAL AMOUNT DUE</div>' +
    '<div style="font-size:28px;font-weight:700;color:#dc2626">₹' + fINR(totalOut) + '</div></div>' +
    '<p>The detailed invoice is attached. You can also download it here:</p>' +
    '<p><a href="' + pdfUrl + '" style="background:#2563eb;color:#fff;padding:8px 16px;' +
      'border-radius:4px;text-decoration:none;font-size:12px">📄 Download Invoice</a></p>' +
    '<p style="font-size:11px;color:#64748b">Invoice No: ' + invoiceNo +
      ' &nbsp;|&nbsp; Date: ' + displayDate + '</p>' +
    '<p style="font-size:11px">For queries, please quote your Property ID <strong>' +
      owner.propertyId + '</strong> in your communication with the Society office.</p>' +
    '<hr style="border:none;border-top:1px solid #e2e8f0;margin:16px 0">' +
    '<p style="font-size:10px;color:#94a3b8">Regards,<br>' +
      '<strong>SCRWA Management Committee</strong><br>' +
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
function getOutstandingInvoices(ss, propId, billPeriodFilter) {
  var sheet = ss.getSheetByName(INV_SHEET);
  if (!sheet) return [];
  var data  = sheet.getDataRange().getValues();
  var tz    = Session.getScriptTimeZone();
  var found = [];

  for (var i = 2; i < data.length; i++) {
    var billId = String(data[i][0] || '').trim();
    var pid    = String(data[i][1] || '').trim();
    if (!billId || pid !== propId) continue;

    var status  = String(data[i][9] || '').trim();
    var balance = parseFloat(String(data[i][8]).replace(/[₹,\s]/g, '')) || 0;

    // Skip fully paid


    // BillPeriod
    var billPeriod = '';
    if (data[i][4] instanceof Date) {
      billPeriod = Utilities.formatDate(data[i][4], tz, 'MMM yyyy');
    } else if (data[i][4]) {
      billPeriod = String(data[i][4]).trim();
    }
    if (billPeriodFilter &&
        billPeriod.toLowerCase() !== billPeriodFilter.toLowerCase()) continue;

    // BillDate from Col F
    var billDate = '';
    if (data[i][5] instanceof Date) {
      billDate = Utilities.formatDate(data[i][5], tz, 'dd-MMM-yy');
    } else if (data[i][5]) {
      billDate = String(data[i][5]).trim().substring(0, 11);
    }

    found.push({
      billId:     billId,
      propertyId: pid,
      io:         String(data[i][2] || '').trim(),
      billDate:   billDate,
      billPeriod: billPeriod,
      billAmt:    Math.abs(parseFloat(String(data[i][6]).replace(/[₹,\s]/g,'')) || 0),
      paidAmt:    Math.abs(parseFloat(String(data[i][7]).replace(/[₹,\s]/g,'')) || 0),
      balance:    Math.abs(balance),
      status:     status.replace(/^[^\w\s✅⚠️⏳]+\s*/, '')
    });
  }
  return found;
}

function getOwnerMap(ss) {
  var sheet = ss.getSheetByName(INV_OWNER_SHEET);
  if (!sheet) return {};
  var data  = sheet.getDataRange().getValues();
  var map   = {};

  // Proxy map for email/phone fallback
  var proxyMap = getProxyMap(ss);

  for (var i = 1; i < data.length; i++) {
    var pid    = String(data[i][0] || '').trim();
    var status = String(data[i][9] || '').trim().toUpperCase();
    if (!pid) continue;
    var proxy  = proxyMap[pid] || {};
    map[pid] = {
      propertyId:  pid,
      plotNo:      String(data[i][1]  || '').trim(),
      ownername1:  String(data[i][4]  || '').trim(),
      ownername2:  String(data[i][5]  || '').trim(),
      email:       String(data[i][10] || '').trim(),
      phone:       String(data[i][11] || '').trim(),
      isWhatsapp:  String(data[i][12] || '').trim().toUpperCase() === 'TRUE',
      isActive:    status.replace(/[^a-zA-Z]/g,'').toUpperCase() === 'ACTIVE',
      proxyEmail:  proxy.email  || '',
      proxyPhone:  proxy.phone  || '',
      proxyWA:     proxy.isWA   || false
    };
  }
  return map;
}

function getProxyMap(ss) {
  var sheet = ss.getSheetByName(INV_PROXY_SHEET);
  if (!sheet) return {};
  var data  = sheet.getDataRange().getValues();
  var map   = {};
  // ProxyDetails header row 2, data from row 3 (index 2)
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

function logInvoice(ss, owner, invoices, invoiceNo, pdfUrl, emailResult) {
  var logSheet = ss.getSheetByName(INV_LOG_SHEET);
  if (!logSheet) {
    logSheet = ss.insertSheet(INV_LOG_SHEET);
    logSheet.appendRow([
      'Timestamp','InvoiceNo','PropertyID','PlotNo','OwnerName',
      'InvoiceCount','TotalOutstanding','PDFUrl','EmailSent','EmailTo'
    ]);
    logSheet.getRange(1, 1, 1, 10).setFontWeight('bold');
  }
  var tz   = Session.getScriptTimeZone();
  var now  = Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd HH:mm:ss');
  var tot  = invoices.reduce(function(s, i) { return s + i.balance; }, 0);
  logSheet.appendRow([
    now, invoiceNo, owner.propertyId, owner.plotNo, owner.ownername1,
    invoices.length, tot, pdfUrl,
    emailResult.sent ? 'Yes' : 'No',
    emailResult.to || emailResult.reason || emailResult.error || ''
  ]);
}
