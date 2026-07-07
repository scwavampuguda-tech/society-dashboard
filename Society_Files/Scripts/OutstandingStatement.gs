// ============================================================
// OutstandingStatement.gs — SCRWA Society
// 3 Actions: Generate PDF | Send Email | Send WhatsApp
// Edge case: same plot, different PropertyID (sold/transferred)
// ============================================================

// ─── CONFIG ──────────────────────────────────────────────────
var OS_CONFIG = {
  SOCIETY_NAME:    'Senior Citizens Residential Welfare Association (SCRWA)',
  SOCIETY_SUBNAME: 'REGD. NO: 2240/2006 · VAMPUGUDA, HYDERABAD',
  SOCIETY_EMAIL:   'scwa.vampuguda@gmail.com',
  SOCIETY_PHONE:   '+91-XXXXXXXXXX',
  DRIVE_FOLDER:    'SCRWA_Outstanding',
  SPREADSHEET_ID:  '1oXmvMIfQDm51KoHHtkhg8KgK1Qi5mwFYSBdrwir85CA',

  // OwnerDetails columns (0-based)
  OW_PROPID:       0,   // Col A — propertyID
  OW_LOCATION:     1,   // Col B — propertylocation  ← PLOT MATCH KEY
  OW_SPACE:        2,   // Col C — Space
  OW_OWNERSHIP:    3,   // Col D — ownershiptype
  OW_NAME1:        4,   // Col E — ownername1
  OW_NAME2:        5,   // Col F — ownername2
  OW_STATUS:       9,   // Col J — OwnerStatus
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

  // Status values that count as outstanding
  PENDING_STATUS:  ['⚠️ Pending', '🔄 Partial', 'Pending', 'Partial',
                    '⚠️Pending', '🔄Partial'],

  // Owner statuses that are NOT active
  INACTIVE_STATUS: ['🚪 Exited', '🔄 Transferred', 'Exited', 'Transferred'],
};

// ─── HELPERS ─────────────────────────────────────────────────

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

function getOSFolder_() {
  var folders = DriveApp.getFoldersByName(OS_CONFIG.DRIVE_FOLDER);
  return folders.hasNext() ? folders.next()
                           : DriveApp.createFolder(OS_CONFIG.DRIVE_FOLDER);
}

function fmtINR_(val) {
  var n = parseFloat(val) || 0;
  return '₹' + Math.abs(n).toLocaleString('en-IN',
    { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function fmtDate_(d) {
  if (!d) return '';
  if (d instanceof Date)
    return Utilities.formatDate(d, Session.getScriptTimeZone(), 'dd-MMM-yyyy');
  return String(d).trim().substring(0, 11);
}

function fmtPeriod_(d) {
  if (!d) return '';
  if (d instanceof Date)
    return Utilities.formatDate(d, Session.getScriptTimeZone(), 'MMM yyyy');
  var s = String(d).trim();
  return s.length >= 7 ? s.substring(0, 7) : s;
}

function isPending_(status) {
  var s = String(status || '').trim().toLowerCase();
  return OS_CONFIG.PENDING_STATUS.some(function(p) {
    return s === p.toLowerCase().trim();
  });
}

function isInactive_(status) {
  var s = String(status || '').trim().toLowerCase();
  return OS_CONFIG.INACTIVE_STATUS.some(function(p) {
    return s === p.toLowerCase().trim();
  });
}

// ─── Get ALL owner rows from OwnerDetails ──────────────────
function getAllOwners_(owSheet) {
  var data = owSheet.getDataRange().getValues();
  var owners = [];
  for (var i = 1; i < data.length; i++) {
    var propId = String(data[i][OS_CONFIG.OW_PROPID] || '').trim();
    if (!propId) continue;
    owners.push({
      row:       i + 1,
      data:      data[i],
      propId:    propId,
      location:  String(data[i][OS_CONFIG.OW_LOCATION] || '').trim(),
      name1:     String(data[i][OS_CONFIG.OW_NAME1] || '').trim(),
      name2:     String(data[i][OS_CONFIG.OW_NAME2] || '').trim(),
      status:    String(data[i][OS_CONFIG.OW_STATUS] || '').trim(),
      email:     String(data[i][OS_CONFIG.OW_EMAIL] || '').trim(),
      phone:     String(data[i][OS_CONFIG.OW_PHONE] || '').trim(),
    });
  }
  return owners;
}

// ─── Get owner by PropertyID ───────────────────────────────
function getOwnerByPropId_(propId, allOwners) {
  return allOwners.filter(function(o) {
    return o.propId === String(propId).trim();
  })[0] || null;
}

// ─── Get outstanding invoices for a PropertyID ─────────────
function getOutstandingInvoices_(propId, invData) {
  var results = [];
  // row 0 = label, row 1 = header, data from row 2
  for (var i = 2; i < invData.length; i++) {
    if (String(invData[i][OS_CONFIG.INV_PROPID]).trim() !==
        String(propId).trim()) continue;
    if (!isPending_(invData[i][OS_CONFIG.INV_STATUS])) continue;
    results.push({
      billId:   String(invData[i][OS_CONFIG.INV_BILLID] || '').trim(),
      period:   fmtPeriod_(invData[i][OS_CONFIG.INV_PERIOD]),
      billDate: fmtDate_(invData[i][OS_CONFIG.INV_BILLDATE]),
      billAmt:  Math.abs(parseFloat(invData[i][OS_CONFIG.INV_BILLAMT]) || 0),
      paidAmt:  Math.abs(parseFloat(invData[i][OS_CONFIG.INV_PAIDAMT]) || 0),
      balance:  Math.abs(parseFloat(invData[i][OS_CONFIG.INV_BALANCE]) || 0),
      status:   String(invData[i][OS_CONFIG.INV_STATUS] || '').trim(),
    });
  }
  return results;
}

// ─── Find sibling PropertyIDs on same plot ─────────────────
// Returns [{propId, ownerName, status, balance, pdfUrl}]
function getSiblingOutstanding_(currentPropId, plotLocation, allOwners, invData, folder) {
  if (!plotLocation) return [];
  var siblings = [];

  allOwners.forEach(function(o) {
    // Same plot, different PropertyID
    if (o.propId === currentPropId) return;
    if (o.location !== plotLocation) return;

    var invoices = getOutstandingInvoices_(o.propId, invData);
    if (invoices.length === 0) return;

    var totalBal = invoices.reduce(function(s, inv) { return s + inv.balance; }, 0);
    if (totalBal <= 0) return;

    // Generate a PDF for sibling silently and get its URL
    var pdfUrl = '';
    try {
      var sibResult = generateStatementForPropId_(o, invoices, folder);
      pdfUrl = sibResult.pdfUrl || '';
    } catch(e) {
      Logger.log('Sibling PDF error for ' + o.propId + ': ' + e.message);
    }

    siblings.push({
      propId:    o.propId,
      ownerName: [o.name1, o.name2].filter(Boolean).join(' & '),
      status:    o.status,
      balance:   totalBal,
      pdfUrl:    pdfUrl,
      invoiceCount: invoices.length,
    });
  });

  return siblings;
}

// ─── Core PDF generator (reused for primary + siblings) ────
function generateStatementForPropId_(ownerObj, invoices, folder) {
  var tz       = Session.getScriptTimeZone();
  var stmtDate = Utilities.formatDate(new Date(), tz, 'dd-MMM-yyyy');
  var html     = buildOutstandingHTML_(ownerObj, invoices, stmtDate, []);
  var safeName = ownerObj.name1.replace(/\s+/g, '_');
  var fileName = 'STMT-' + ownerObj.propId + '-' + safeName + '-' +
                 Utilities.formatDate(new Date(), tz, 'ddMMMyyyy') + '.pdf';
  var blob     = Utilities.newBlob(html, 'text/html', fileName + '.html')
                          .getAs('application/pdf');
  blob.setName(fileName);

  // Replace old file
  var old = folder.getFilesByName(fileName);
  while (old.hasNext()) old.next().setTrashed(true);

  var file = folder.createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return { pdfUrl: file.getUrl(), fileName: fileName };
}

// ─── BUILD HTML ────────────────────────────────────────────
function buildOutstandingHTML_(ownerObj, invoices, stmtDate, siblings) {
  var logo      = getLogoBase64_OS();
  var ownerName = [ownerObj.name1, ownerObj.name2].filter(Boolean).join(' & ');
  var propId    = ownerObj.propId;
  var location  = ownerObj.location;
  var ownership = String(ownerObj.data[OS_CONFIG.OW_OWNERSHIP] || '').trim();
  var owStatus  = ownerObj.status;

  // Owner status badge
  var statusBadgeColor = isInactive_(owStatus) ? '#94a3b8' : '#16a34a';
  var statusBadge = '<span style="background:' + statusBadgeColor +
    ';color:#fff;padding:2px 8px;border-radius:10px;font-size:10px;font-weight:600">' +
    owStatus + '</span>';

  var totalBill = 0, totalPaid = 0, totalBal = 0;
  invoices.forEach(function(inv) {
    totalBill += inv.billAmt;
    totalPaid += inv.paidAmt;
    totalBal  += inv.balance;
  });

  // Invoice rows
  var rows = '';
  invoices.forEach(function(inv, idx) {
    var sc = inv.status.toLowerCase().indexOf('partial') > -1 ? '#f59e0b' : '#ef4444';
    var sl = inv.status.replace(/^[^\w\s₹⚠️🔄✅]+\s*/, '');
    rows +=
      '<tr>' +
      '<td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;text-align:center;color:#64748b">' + (idx+1) + '</td>' +
      '<td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;font-family:monospace;font-size:11px;color:#1e3a5f">' + inv.billId + '</td>' +
      '<td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;color:#334155">' + inv.period + '</td>' +
      '<td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;color:#374151">' + inv.billDate + '</td>' +
      '<td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;text-align:right;color:#1e3a5f;font-weight:600">' + fmtINR_(inv.billAmt) + '</td>' +
      '<td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;text-align:right;color:#16a34a">' + fmtINR_(inv.paidAmt) + '</td>' +
      '<td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;text-align:right;color:#dc2626;font-weight:700">' + fmtINR_(inv.balance) + '</td>' +
      '<td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;text-align:center">' +
        '<span style="background:' + sc + ';color:#fff;padding:2px 8px;border-radius:10px;font-size:10px;font-weight:600">' + sl + '</span>' +
      '</td>' +
      '</tr>';
  });

  // Sibling caveat block
  var siblingBlock = '';
  if (siblings && siblings.length > 0) {
    var sibRows = '';
    siblings.forEach(function(sib) {
      var sibStatusColor = isInactive_(sib.status) ? '#94a3b8' : '#16a34a';
      sibRows +=
        '<tr>' +
        '<td style="padding:8px 12px;border-bottom:1px solid #fde68a;color:#92400e;font-weight:700">' + sib.propId + '</td>' +
        '<td style="padding:8px 12px;border-bottom:1px solid #fde68a;color:#78350f">' + sib.ownerName + '</td>' +
        '<td style="padding:8px 12px;border-bottom:1px solid #fde68a;text-align:center">' +
          '<span style="background:' + sibStatusColor + ';color:#fff;padding:2px 8px;border-radius:10px;font-size:10px;font-weight:600">' + sib.status + '</span>' +
        '</td>' +
        '<td style="padding:8px 12px;border-bottom:1px solid #fde68a;text-align:center;color:#92400e">' + sib.invoiceCount + '</td>' +
        '<td style="padding:8px 12px;border-bottom:1px solid #fde68a;text-align:right;color:#dc2626;font-weight:700">' + fmtINR_(sib.balance) + '</td>' +
        '<td style="padding:8px 12px;border-bottom:1px solid #fde68a;text-align:center">' +
          (sib.pdfUrl
            ? '<a href="' + sib.pdfUrl + '" style="background:#1e3a5f;color:#fff;padding:4px 12px;border-radius:4px;text-decoration:none;font-size:11px;font-weight:600">📄 View</a>'
            : '<span style="color:#94a3b8;font-size:11px">Generating...</span>') +
        '</td>' +
        '</tr>';
    });

    siblingBlock =
      '<div style="background:#fffbeb;border:2px solid #f59e0b;border-radius:8px;padding:16px;margin-bottom:20px">' +
      '<div style="font-size:12px;font-weight:700;color:#92400e;margin-bottom:4px">⚠️ PLOT HISTORY ALERT — ' + location + '</div>' +
      '<div style="font-size:11px;color:#78350f;margin-bottom:12px;line-height:1.6">' +
        'This plot (<strong>' + location + '</strong>) has outstanding dues under previous Property ID(s) listed below. ' +
        'As the current owner, please note these for your records. The Society may require settlement of all plot-linked dues.' +
      '</div>' +
      '<table style="width:100%;border-collapse:collapse;border:1px solid #fde68a;border-radius:6px;overflow:hidden">' +
      '<thead><tr style="background:#f59e0b">' +
        '<th style="padding:8px 12px;text-align:left;color:#fff;font-size:11px">Prop ID</th>' +
        '<th style="padding:8px 12px;text-align:left;color:#fff;font-size:11px">Previous Owner</th>' +
        '<th style="padding:8px 12px;text-align:center;color:#fff;font-size:11px">Status</th>' +
        '<th style="padding:8px 12px;text-align:center;color:#fff;font-size:11px">Bills</th>' +
        '<th style="padding:8px 12px;text-align:right;color:#fff;font-size:11px">Outstanding</th>' +
        '<th style="padding:8px 12px;text-align:center;color:#fff;font-size:11px">Statement</th>' +
      '</tr></thead>' +
      '<tbody>' + sibRows + '</tbody>' +
      '</table>' +
      '<div style="font-size:10px;color:#92400e;margin-top:10px">📌 Click <strong>View</strong> to open the detailed outstanding statement for each previous property record.</div>' +
      '</div>';
  }

  var html =
    '<!DOCTYPE html><html><head><meta charset="UTF-8">' +
    '<style>body{font-family:Arial,sans-serif;margin:0;padding:0;background:#f8fafc}' +
    'table{border-collapse:collapse;width:100%}' +
    'th{background:#1e3a5f;color:#fff;padding:9px 10px;text-align:left;font-size:12px}' +
    'th.right{text-align:right}th.center{text-align:center}' +
    '</style></head><body>' +
    '<div style="max-width:800px;margin:0 auto;background:#fff;padding:30px">' +

    // ── Header ──
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
    '</td></tr></table>' +

    '<hr style="border:none;border-top:2px solid #1e3a5f;margin:0 0 16px">' +

    // ── Property / Owner info box ──
    '<table style="margin-bottom:20px;border:1px solid #e2e8f0;border-radius:6px">' +
    '<tr>' +
    '<td style="padding:10px 16px;border-right:1px solid #e2e8f0;width:25%">' +
      '<div style="font-size:10px;color:#94a3b8;font-weight:600;text-transform:uppercase">Statement Date</div>' +
      '<div style="font-size:13px;font-weight:700;color:#1e293b;margin-top:3px">' + stmtDate + '</div>' +
    '</td>' +
    '<td style="padding:10px 16px;border-right:1px solid #e2e8f0;width:20%">' +
      '<div style="font-size:10px;color:#94a3b8;font-weight:600;text-transform:uppercase">Property ID</div>' +
      '<div style="font-size:13px;font-weight:700;color:#1e293b;margin-top:3px">' + propId + '</div>' +
    '</td>' +
    '<td style="padding:10px 16px;border-right:1px solid #e2e8f0;width:25%">' +
      '<div style="font-size:10px;color:#94a3b8;font-weight:600;text-transform:uppercase">Plot Location</div>' +
      '<div style="font-size:13px;font-weight:700;color:#1e293b;margin-top:3px">' + location + '</div>' +
    '</td>' +
    '<td style="padding:10px 16px;width:30%">' +
      '<div style="font-size:10px;color:#94a3b8;font-weight:600;text-transform:uppercase">Owner · Status</div>' +
      '<div style="font-size:13px;font-weight:700;color:#1e293b;margin-top:3px">' +
        ownerName + ' &nbsp;' + statusBadge +
      '</div>' +
    '</td>' +
    '</tr></table>' +

    // ── Sibling caveat (plot history alert) ──
    siblingBlock +

    // ── Invoice table ──
    '<div style="font-size:12px;font-weight:700;color:#1e3a5f;margin-bottom:8px;text-transform:uppercase;letter-spacing:0.5px">' +
    '⚠️ Outstanding Invoices — Property ' + propId + '</div>' +
    '<table style="margin-bottom:20px;border:1px solid #e2e8f0;border-radius:6px;overflow:hidden">' +
    '<thead><tr>' +
      '<th class="center" style="width:36px">#</th>' +
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

    // ── Summary totals ──
    '<table style="margin-bottom:24px">' +
    '<tr><td style="width:55%"></td><td>' +
    '<table style="border:2px solid #dc2626;border-radius:8px;overflow:hidden;width:100%">' +
    '<tr style="background:#fef2f2"><td style="padding:8px 16px;font-size:12px;color:#64748b;font-weight:600">Total Billed</td>' +
      '<td style="padding:8px 16px;text-align:right;font-size:13px;color:#1e293b;font-weight:700">' + fmtINR_(totalBill) + '</td></tr>' +
    '<tr style="background:#fef2f2"><td style="padding:8px 16px;font-size:12px;color:#64748b;font-weight:600">Total Paid</td>' +
      '<td style="padding:8px 16px;text-align:right;font-size:13px;color:#16a34a;font-weight:700">' + fmtINR_(totalPaid) + '</td></tr>' +
    '<tr style="background:#dc2626"><td style="padding:10px 16px;font-size:13px;color:#fff;font-weight:700">TOTAL OUTSTANDING</td>' +
      '<td style="padding:10px 16px;text-align:right;font-size:16px;color:#fff;font-weight:800">' + fmtINR_(totalBal) + '</td></tr>' +
    '</table></td></tr></table>' +

    // ── Payment instructions ──
    '<div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:6px;padding:14px 16px;margin-bottom:20px">' +
    '<div style="font-size:11px;font-weight:700;color:#166534;margin-bottom:6px">💳 PAYMENT INSTRUCTIONS</div>' +
    '<div style="font-size:11px;color:#166534;line-height:1.8">' +
    'Please make payment via UPI / Bank Transfer to:<br>' +
    '<strong>Account Name:</strong> SCRWA Vampuguda &nbsp;|&nbsp; ' +
    '<strong>UPI:</strong> scwa.vampuguda@sbi<br>' +
    'Kindly mention your <strong>Property ID (' + propId + ')</strong> in the payment remarks.' +
    '</div></div>' +

    // ── Footer ──
    '<hr style="border:none;border-top:1px solid #e2e8f0;margin-bottom:12px">' +
    '<div style="font-size:9px;color:#94a3b8;text-align:center;line-height:1.6">' +
    'This is a system-generated statement. For queries contact: ' + OS_CONFIG.SOCIETY_EMAIL +
    '</div>' +

    '</div></body></html>';

  return html;
}

// ═══════════════════════════════════════════════════════════
// ACTION 1 — generateOutstandingStatement(propId)
// ═══════════════════════════════════════════════════════════
function generateOutstandingStatement(propId) {
  var ss       = SpreadsheetApp.openById(OS_CONFIG.SPREADSHEET_ID);
  var owSheet  = ss.getSheetByName('OwnerDetails');
  var invSheet = ss.getSheetByName('Invoice');
  var tz       = Session.getScriptTimeZone();
  var folder   = getOSFolder_();

  var allOwners = getAllOwners_(owSheet);
  var invData   = invSheet.getDataRange().getValues();

  // 1. Get current owner
  var ownerObj = getOwnerByPropId_(propId, allOwners);
  if (!ownerObj) throw new Error('Property ' + propId + ' not found in OwnerDetails');

  // 2. Get outstanding invoices for this PropertyID
  var invoices = getOutstandingInvoices_(propId, invData);
  if (invoices.length === 0) {
    Logger.log('No outstanding invoices for Property ' + propId);
    return { status: 'NO_OUTSTANDING',
             message: 'No pending invoices for Property ' + propId };
  }

  // 3. Find sibling PropertyIDs on same plot with outstanding
  var siblings = getSiblingOutstanding_(
    propId, ownerObj.location, allOwners, invData, folder
  );
  Logger.log('Siblings with outstanding for plot ' + ownerObj.location +
             ': ' + siblings.length);

  // 4. Build HTML + PDF
  var stmtDate = Utilities.formatDate(new Date(), tz, 'dd-MMM-yyyy');
  var html     = buildOutstandingHTML_(ownerObj, invoices, stmtDate, siblings);
  var safeName = ownerObj.name1.replace(/\s+/g, '_');
  var fileName = 'STMT-' + propId + '-' + safeName + '-' +
                 Utilities.formatDate(new Date(), tz, 'ddMMMyyyy') + '.pdf';
  var blob     = Utilities.newBlob(html, 'text/html', fileName + '.html')
                          .getAs('application/pdf');
  blob.setName(fileName);

  // 5. Save to Drive
  var old = folder.getFilesByName(fileName);
  while (old.hasNext()) old.next().setTrashed(true);
  var file = folder.createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  var pdfUrl = file.getUrl();

  // 6. Write URL back to OwnerDetails Col R
  owSheet.getRange(ownerObj.row, OS_CONFIG.OW_PDF + 1).setValue(pdfUrl);

  Logger.log('✅ Statement generated: ' + fileName +
             ' | Invoices: ' + invoices.length +
             ' | Siblings: ' + siblings.length);
  return {
    status:       'OK',
    pdfUrl:       pdfUrl,
    fileName:     fileName,
    invoiceCount: invoices.length,
    siblingCount: siblings.length,
  };
}

// ═══════════════════════════════════════════════════════════
// ACTION 2 — sendOutstandingEmail(propId)
// ═══════════════════════════════════════════════════════════
function sendOutstandingEmail(propId) {
  var ss      = SpreadsheetApp.openById(OS_CONFIG.SPREADSHEET_ID);
  var owSheet = ss.getSheetByName('OwnerDetails');
  var tz      = Session.getScriptTimeZone();

  var allOwners = getAllOwners_(owSheet);
  var ownerObj  = getOwnerByPropId_(propId, allOwners);
  if (!ownerObj) throw new Error('Property ' + propId + ' not found');

  var email = ownerObj.email;
  if (!email || email.indexOf('@') < 0)
    throw new Error('No valid email for Property ' + propId +
                    '. Update EmailID in OwnerDetails.');

  // Get or generate PDF
  var pdfUrl = String(owSheet.getRange(ownerObj.row, OS_CONFIG.OW_PDF + 1)
                             .getValue() || '').trim();
  if (!pdfUrl) {
    var result = generateOutstandingStatement(propId);
    if (result.status !== 'OK') throw new Error(result.message);
    pdfUrl = result.pdfUrl;
  }

  var ownerName = [ownerObj.name1, ownerObj.name2].filter(Boolean).join(' & ');
  var subject   = 'Outstanding Statement — Property ' + propId + ' | SCRWA Vampuguda';

  var body =
    '<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">' +
    '<div style="background:#1e3a5f;color:#fff;padding:16px 20px;border-radius:6px 6px 0 0">' +
      '<div style="font-size:16px;font-weight:700">' + OS_CONFIG.SOCIETY_NAME + '</div>' +
      '<div style="font-size:11px;opacity:0.8;margin-top:3px">' + OS_CONFIG.SOCIETY_SUBNAME + '</div>' +
    '</div>' +
    '<div style="background:#fff;border:1px solid #e2e8f0;border-top:none;padding:24px 20px">' +
      '<p style="color:#1e293b;font-size:14px">Dear <strong>' + ownerName + '</strong>,</p>' +
      '<p style="color:#475569;font-size:13px;line-height:1.7">' +
        'Please find your outstanding dues statement for <strong>Property ' + propId + '</strong>.' +
      '</p>' +
      '<div style="background:#fef2f2;border:1px solid #fca5a5;border-radius:6px;padding:14px 16px;margin:16px 0">' +
        '<p style="color:#dc2626;font-weight:700;font-size:13px;margin:0 0 6px">⚠️ Action Required</p>' +
        '<p style="color:#7f1d1d;font-size:12px;margin:0;line-height:1.6">' +
          'Your account has pending dues. Kindly clear at the earliest.<br>' +
          'Mention <strong>Property ID (' + propId + ')</strong> in payment remarks.' +
        '</p>' +
      '</div>' +
      '<p style="text-align:center;margin:20px 0">' +
        '<a href="' + pdfUrl + '" style="background:#1e3a5f;color:#fff;padding:10px 24px;' +
        'border-radius:6px;text-decoration:none;font-size:13px;font-weight:700">' +
        '📄 View Outstanding Statement</a>' +
      '</p>' +
      '<p style="color:#64748b;font-size:11px;line-height:1.8">' +
        '<strong>Payment:</strong> UPI / Bank Transfer<br>' +
        '<strong>UPI ID:</strong> scwa.vampuguda@sbi<br>' +
        '<strong>Remarks:</strong> Property ' + propId + ' dues' +
      '</p>' +
    '</div>' +
    '<div style="background:#f8fafc;border:1px solid #e2e8f0;border-top:none;' +
    'padding:10px 20px;border-radius:0 0 6px 6px;text-align:center">' +
      '<span style="font-size:10px;color:#94a3b8">' +
        'System-generated. Contact: ' + OS_CONFIG.SOCIETY_EMAIL + '</span>' +
    '</div></div>';

  GmailApp.sendEmail(email, subject, '', { htmlBody: body });

  var stamp = Utilities.formatDate(new Date(), tz, 'dd-MMM-yyyy HH:mm');
  owSheet.getRange(ownerObj.row, OS_CONFIG.OW_EMAILSENT + 1).setValue(stamp);

  Logger.log('✅ Email sent to ' + email + ' for Property ' + propId);
  return { status: 'OK', sentTo: email, timestamp: stamp };
}

// ═══════════════════════════════════════════════════════════
// ACTION 3 — getWhatsAppLink(propId)
// ═══════════════════════════════════════════════════════════
function getWhatsAppLink(propId) {
  var ss      = SpreadsheetApp.openById(OS_CONFIG.SPREADSHEET_ID);
  var owSheet = ss.getSheetByName('OwnerDetails');
  var tz      = Session.getScriptTimeZone();

  var allOwners = getAllOwners_(owSheet);
  var ownerObj  = getOwnerByPropId_(propId, allOwners);
  if (!ownerObj) throw new Error('Property ' + propId + ' not found');

  // Clean phone — preserve country code (+ prefix), remove spaces/dashes
  var phone = ownerObj.phone.replace(/[\s\-\(\)]/g, '');
  if (!phone) throw new Error('No phone number for Property ' + propId);

  // Get or generate PDF
  var pdfUrl = String(owSheet.getRange(ownerObj.row, OS_CONFIG.OW_PDF + 1)
                             .getValue() || '').trim();
  if (!pdfUrl) {
    var result = generateOutstandingStatement(propId);
    if (result.status !== 'OK') throw new Error(result.message);
    pdfUrl = result.pdfUrl;
  }

  var stmtDate = Utilities.formatDate(new Date(), tz, 'dd-MMM-yyyy');
  var message  =
    'Dear ' + ownerObj.name1 + ',\n\n' +
    'This is a reminder from *SCRWA Vampuguda* regarding outstanding dues for *Property ' + propId + '*.\n\n' +
    '📄 Outstanding Statement:\n' + pdfUrl + '\n\n' +
    'Kindly clear the dues and mention *Property ' + propId + '* in payment remarks.\n\n' +
    'Queries: ' + OS_CONFIG.SOCIETY_EMAIL + '\n' +
    '_Statement Date: ' + stmtDate + '_';

  // wa.me expects digits only (no +), country code preserved
  var waNumber = phone.replace('+', '');
  var waLink   = 'https://wa.me/' + waNumber + '?text=' + encodeURIComponent(message);

  var stamp = Utilities.formatDate(new Date(), tz, 'dd-MMM-yyyy HH:mm');
  owSheet.getRange(ownerObj.row, OS_CONFIG.OW_WASENT + 1).setValue(stamp);

  Logger.log('✅ WA link for Property ' + propId + ': ' + waLink);
  return { status: 'OK', waLink: waLink, phone: phone, timestamp: stamp };
}

// ═══════════════════════════════════════════════════════════
// BULK — sendOutstandingEmailBulk()
//   Run from GAS manually for all properties with outstanding
// ═══════════════════════════════════════════════════════════
function sendOutstandingEmailBulk() {
  var ss       = SpreadsheetApp.openById(OS_CONFIG.SPREADSHEET_ID);
  var owSheet  = ss.getSheetByName('OwnerDetails');
  var invSheet = ss.getSheetByName('Invoice');
  var invData  = invSheet.getDataRange().getValues();
  var allOwners = getAllOwners_(owSheet);

  var sent = 0, skipped = 0, errors = 0;

  allOwners.forEach(function(o) {
    if (!o.email || o.email.indexOf('@') < 0) { skipped++; return; }
    var invoices = getOutstandingInvoices_(o.propId, invData);
    if (invoices.length === 0) { skipped++; return; }
    try {
      sendOutstandingEmail(o.propId);
      sent++;
      Utilities.sleep(1200);
    } catch(e) {
      Logger.log('ERROR ' + o.propId + ': ' + e.message);
      errors++;
    }
  });

  Logger.log('Bulk complete — Sent: ' + sent +
             ' | Skipped: ' + skipped + ' | Errors: ' + errors);
  return { sent: sent, skipped: skipped, errors: errors };
}

// ═══════════════════════════════════════════════════════════
// TEST
// ═══════════════════════════════════════════════════════════
function testOutstanding() {
  var result = generateOutstandingStatement('231');
  Logger.log(JSON.stringify(result));
}
