/**
 * ═══════════════════════════════════════════════════════════════════
 *  SCRWA — Consolidated Receipt PDF Generator  v2.1
 * ═══════════════════════════════════════════════════════════════════
 *  Google Sheet : SocietyData
 *  Account      : scwa.vampuguda@gmail.com
 *  Sheet ID     : 1oXmvMIfQDm51KoHHtkhg8KgK1Qi5mwFYSBdrwir85CA
 *
 *  WHATSAPP DESIGN (no API):
 *  ─────────────────────────
 *  We do NOT auto-send WhatsApp (no API).
 *  Instead, we build a wa.me clickable link with the message pre-filled.
 *  The treasurer clicks the link → WhatsApp opens → message pre-loaded → tap Send.
 *
 *  WhatsApp links are written to BankDetails Col K (WhatsAppLinks).
 *  In AppSheet, show these as clickable URL buttons.
 *
 *  WHO GETS WHATSAPP:
 *  ─────────────────
 *  OwnerDetails Col P [15] = IsWhatsApp  ("Y" / "" or "N")
 *  ProxyDetails Col G [6]  = IsWhatsApp  ("Y" / "" or "N")
 *
 *  Priority rule per property:
 *    1. If isProxy = "Yes" AND proxy has WhatsApp "Y" → use proxy mobile
 *    2. Else if owner has WhatsApp "Y" → use owner mobile
 *    3. Else → no WhatsApp link for this property
 *
 *  NOTE: Add these columns to your sheets BEFORE running:
 *    OwnerDetails  → Col P  header: IsWhatsApp   (Y / blank)
 *    ProxyDetails  → Col G  header: IsWhatsApp   (Y / blank)
 *
 *  ── SHEETS REQUIRED ─────────────────────────────────────────────
 *
 *  BankDetails (data from row 2):
 *    Col A [0]  TxnDate
 *    Col B [1]  Narration
 *    Col C [2]  RefNo           ← KEY — matches TransactionDetails.ReceiptNo
 *    Col D [3]  ValueDate
 *    Col E [4]  Withdrawal
 *    Col F [5]  Deposit         ← bank credit amount
 *    Col G [6]  Balance
 *    Col H [7]  Reconciled      ← formula TRUE when fully mapped
 *    Col I [8]  Source          (XLSX / ALERT / PLAIN)
 *    Col J [9]  ReceiptPDF      ← NEW: PDF Drive URL written by script
 *    Col K [10] WhatsAppLinks   ← NEW: pipe-separated wa.me links
 *
 *  TransactionDetails (row 2 = headers, data from row 3):
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
 *    Col P [15] ReceiptPDF      ← NEW: PDF URL per TxID row
 *
 *  OwnerDetails (data from row 2):
 *    Col A [0]  PropertyID
 *    Col B [1]  PlotNo
 *    Col D [3]  OwnershipType
 *    Col E [4]  Name
 *    Col F [5]  Name2
 *    Col H [7]  LaneNo
 *    Col J [9]  Status
 *    Col K [10] Email
 *    Col L [11] Mobile
 *    Col O [14] IsProxy         ("Yes" / "")
 *    Col P [15] IsWhatsApp      ← NEW: "Y" if owner is on WhatsApp
 *
 *  ProxyDetails (data from row 3):
 *    Col A [0]  PropertyID
 *    Col B [1]  RepresentedBy
 *    Col C [2]  Relation
 *    Col E [4]  ProxyEmail
 *    Col F [5]  ProxyMobile
 *    Col G [6]  IsWhatsApp      ← NEW: "Y" if proxy is on WhatsApp
 *
 *  Invoice (data from row 3):
 *    Col A [0]  BillID
 *    Col B [1]  PropertyID
 *    Col E [4]  BillPeriod
 *    Col F [5]  BillDate
 *    Col G [6]  BillAmount
 *    Col H [7]  PaidAmount
 *    Col I [8]  Balance
 *    Col J [9]  Status
 *
 *  ── APPSHEET SETUP ──────────────────────────────────────────────
 *  Table: BankDetails
 *
 *  Actions:
 *    📄 Generate Receipt
 *      Condition : [Reconciled] = TRUE AND [ReceiptPDF] = ""
 *      Type      : Call webhook (HTTP POST)
 *      Body      : { "action": "generateReceipt", "receiptNo": "<<[RefNo]>>" }
 *
 *    🔄 Re-generate Receipt
 *      Condition : [Reconciled] = TRUE AND [ReceiptPDF] <> ""
 *      Same body as above
 *
 *    📄 View Receipt PDF
 *      Condition : [ReceiptPDF] <> ""
 *      Type      : Open a link → [ReceiptPDF]
 *
 *    💬 Send WhatsApp (opens in browser — no API needed)
 *      Condition : [WhatsAppLinks] <> ""
 *      Type      : Open a link → first link from [WhatsAppLinks]
 *      Note      : For multi-property consolidated payments where
 *                  multiple members need WA, the links are also shown
 *                  in the receipt email to treasurer.
 *
 *  ── OUTSTANDING SHEET SETUP STEPS ───────────────────────────────
 *  1. BankDetails      → Add Col J header "ReceiptPDF"
 *  2. BankDetails      → Add Col K header "WhatsAppLinks"
 *  3. TransactionDetails → Add Col P header "ReceiptPDF"
 *  4. OwnerDetails     → Add Col P header "IsWhatsApp"  → fill Y for WA members
 *  5. ProxyDetails     → Add Col G header "IsWhatsApp"  → fill Y for WA proxies
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

// ─── doPost — AppSheet webhook entry ──────────────────────────────
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
//  MAIN ORCHESTRATOR
// ═══════════════════════════════════════════════════════════════════
function generateConsolidatedReceipt(receiptNo) {
  var ss = SpreadsheetApp.openById(SS_ID);
  var tz = Session.getScriptTimeZone();

  // 1. Bank row
  var bankRow = getBankRow(ss, receiptNo);
  if (!bankRow) return { success: false, message: 'ReceiptNo not found in BankDetails: ' + receiptNo };
  if (!bankRow.reconciled) return { success: false, message: 'Not yet Reconciled: ' + receiptNo };

  // 2. All TransactionDetails rows for this ReceiptNo
  var txRows = getTransactionRowsByReceiptNo(ss, receiptNo);
  if (!txRows.length) return { success: false, message: 'No TransactionDetails rows for: ' + receiptNo };

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
  var fileName = 'RCPT-' + receiptNo.replace(/[\/\\:*?"<>|]/g,'') + '.pdf';
  var iter = folder.getFilesByName(fileName);
  if (iter.hasNext()) iter.next().setTrashed(true);
  var file = folder.createFile(pdfBlob.setName(fileName));
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  var pdfUrl = 'https://drive.google.com/file/d/' + file.getId() + '/view';

  // 7. Build WhatsApp links (only for members with IsWhatsApp = Y)
  var waLinks = buildWhatsAppLinks(receiptNo, bankRow, txRows, memberMap, pdfUrl);

  // 8. Write URLs to sheets
  writePdfUrlToBankDetails(ss, bankRow.sheetRow, pdfUrl, waLinks);
  txRows.forEach(function(tx) { writePdfUrlToTransactionDetails(ss, tx.sheetRow, pdfUrl); });

  // 9. Log
  logReceipt(ss, receiptNo, bankRow, txRows, memberMap, fileName, pdfUrl, waLinks);

  // 10. Send emails — includes WA links in body for treasurer convenience
  var emailResults = sendConsolidatedEmails(receiptNo, bankRow, txRows, memberMap,
                                            pdfBlob, pdfUrl, fileName, waLinks);

  return {
    success:      true,
    receiptNo:    receiptNo,
    pdfUrl:       pdfUrl,
    fileName:     fileName,
    txCount:      txRows.length,
    properties:   txRows.map(function(t){ return t.propertyId; }),
    totalAmount:  bankRow.amount,
    waLinksCount: waLinks.length,
    emailResults: emailResults,
    message:      'Done. ' + txRows.length + ' transaction(s), ' +
                  waLinks.length + ' WhatsApp link(s) generated.'
  };
}

// ─── GET BANK ROW ──────────────────────────────────────────────────
function getBankRow(ss, receiptNo) {
  var sheet = ss.getSheetByName('BankDetails');
  if (!sheet) return null;
  var data = sheet.getDataRange().getValues();
  var tz   = Session.getScriptTimeZone();

  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    if (String(row[2]).trim() !== receiptNo) continue;

    var dateStr = '', displayDate = '';
    if (row[0] instanceof Date) {
      dateStr     = Utilities.formatDate(row[0], tz, 'yyyy-MM-dd');
      displayDate = Utilities.formatDate(row[0], tz, 'dd MMM yyyy');
    }
    var deposit    = Math.abs(parseFloat(String(row[5]).replace(/[₹,]/g,'')) || 0);
    var withdrawal = Math.abs(parseFloat(String(row[4]).replace(/[₹,]/g,'')) || 0);

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
      source:      String(row[8] || '').trim(),
      existingPdf: String(row[9] || '').trim()
    };
  }
  return null;
}

// ─── GET TRANSACTION ROWS BY ReceiptNo ────────────────────────────
function getTransactionRowsByReceiptNo(ss, receiptNo) {
  var sheet = ss.getSheetByName('TransactionDetails');
  if (!sheet) return [];
  var data   = sheet.getDataRange().getValues();
  var tz     = Session.getScriptTimeZone();
  var result = [];

  for (var i = 2; i < data.length; i++) {
    var row = data[i];
    if (String(row[1]).trim() !== receiptNo) continue;

    var dateStr = '', displayDate = '';
    if (row[2] instanceof Date) {
      dateStr     = Utilities.formatDate(row[2], tz, 'yyyy-MM-dd');
      displayDate = Utilities.formatDate(row[2], tz, 'dd MMM yyyy');
    } else if (row[2]) {
      dateStr     = String(row[2]).substring(0,10);
      displayDate = dateStr;
    }

    var rawAmt = parseFloat(row[7]) || 0;
    var fyYear = String(row[14] || '').trim();
    if (!fyYear && dateStr) {
      var mo = parseInt(dateStr.substring(5,7),10);
      var yr = parseInt(dateStr.substring(0,4),10);
      fyYear = mo >= 4 ? yr+'-'+(yr+1) : (yr-1)+'-'+yr;
    }

    result.push({
      sheetRow:       i + 1,
      txId:           String(row[0]  || '').trim(),
      receiptNo:      String(row[1]  || '').trim(),
      date:           dateStr,
      displayDate:    displayDate,
      modeClean:      String(row[4]  || '').trim().replace(/^[^\w\s₹(]+\s*/,''),
      accountHead:    String(row[5]  || '').trim().replace(/^[^\w\s]+\s*/,''),
      accountSubHead: String(row[6]  || '').trim().replace(/^[^\w\s]+\s*/,''),
      amount:         Math.abs(rawAmt),
      propertyId:     String(row[8]  || '').trim(),
      internalOrder:  String(row[9]  || '').trim(),
      billId:         String(row[10] || '').trim(),
      remarks:        String(row[11] || '').trim(),
      description:    String(row[12] || row[11] || '').trim().replace(/^[^\w\s₹(]+\s*/,''),
      fyYear:         fyYear,
      invoices:       []
    });
  }
  Logger.log('Found ' + result.length + ' tx row(s) for ReceiptNo: ' + receiptNo);
  return result;
}

// ─── GET MEMBER DATA ──────────────────────────────────────────────
// Reads OwnerDetails (Col P [15] = IsWhatsApp) and ProxyDetails (Col G [6] = IsWhatsApp)
function getMemberData(ss, propertyId) {
  if (!propertyId) return null;
  var member = {
    propertyId:    propertyId,
    plotNo:        '',
    laneNo:        '',
    ownerType:     'Single',
    name:          '',
    name2:         '',
    fullName:      '',
    email:         '',
    mobile:        '',
    status:        '',
    isProxy:       false,
    isWhatsApp:    false,   // owner WhatsApp flag (Col P)
    proxyName:     '',
    proxyMobile:   '',
    proxyEmail:    '',
    proxyWA:       false    // proxy WhatsApp flag (Col G)
  };

  var owSheet = ss.getSheetByName('OwnerDetails');
  if (owSheet) {
    var owData = owSheet.getDataRange().getValues();
    for (var i = 1; i < owData.length; i++) {
      if (String(owData[i][0]).trim() !== propertyId) continue;
      member.plotNo     = String(owData[i][1]  || '').trim().replace('.0','');
      member.ownerType  = String(owData[i][3]  || 'Single').trim();
      member.name       = String(owData[i][4]  || '').trim();
      member.name2      = String(owData[i][5]  || '').trim();
      member.laneNo     = String(owData[i][7]  || '').trim();
      member.status     = String(owData[i][9]  || '').trim();
      member.email      = String(owData[i][10] || '').trim();
      member.mobile     = String(owData[i][11] || '').trim();
      member.isProxy    = String(owData[i][14] || '').trim().toLowerCase() === 'yes';
      // Col P [15] = IsWhatsApp
      member.isWhatsApp = String(owData[i][15] || '').trim().toUpperCase() === 'Y';
      member.fullName   = member.name + (member.name2 ? ' & ' + member.name2 : '');
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
        // Col G [6] = IsWhatsApp for proxy
        member.proxyWA     = String(prData[j][6] || '').trim().toUpperCase() === 'Y';
        break;
      }
    }
  }
  return member;
}

// ─── GET INVOICES ─────────────────────────────────────────────────
function getInvoicesByBillIds(ss, billIds) {
  var sheet = ss.getSheetByName('Invoice');
  if (!sheet || !billIds || !billIds.length) return [];
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

// ═══════════════════════════════════════════════════════════════════
//  BUILD WHATSAPP LINKS  (no API — treasurer clicks to send)
// ═══════════════════════════════════════════════════════════════════
/**
 * Returns one WA link per UNIQUE mobile where IsWhatsApp = Y.
 *
 * Priority per property:
 *   1. isProxy AND proxyWA = Y → proxy mobile gets the message
 *   2. owner isWhatsApp = Y    → owner mobile gets the message
 *   3. Neither                 → skip (no WA link for this property)
 *
 * For consolidated multi-property payments, a member may appear across
 * multiple properties. We deduplicate by mobile number — one message
 * covers all properties that share the same WA number.
 */
function buildWhatsAppLinks(receiptNo, bankRow, txRows, memberMap, pdfUrl) {
  var isMulti  = txRows.length > 1;
  var mobileMap = {};  // waNumber → { name, txList[] }

  txRows.forEach(function(tx) {
    var m = memberMap[tx.propertyId];
    if (!m) return;

    var waPhone = null;
    var waName  = null;

    // Priority 1: proxy with WhatsApp
    if (m.isProxy && m.proxyWA && m.proxyMobile) {
      waPhone = m.proxyMobile;
      waName  = m.proxyName + ' (Proxy for ' + m.fullName + ')';
    }
    // Priority 2: owner with WhatsApp
    else if (m.isWhatsApp && m.mobile) {
      waPhone = m.mobile;
      waName  = m.fullName;
    }

    if (!waPhone) return;  // no WhatsApp for this property — skip

    var digits = waPhone.replace(/[^0-9]/g,'');
    var waNum  = digits.startsWith('91') ? digits : '91' + digits.slice(-10);

    if (!mobileMap[waNum]) {
      mobileMap[waNum] = { name: waName, member: m, txList: [] };
    }
    mobileMap[waNum].txList.push(tx);
  });

  var links = [];

  Object.keys(mobileMap).forEach(function(waNum) {
    var entry   = mobileMap[waNum];
    var m       = entry.member;
    var txList  = entry.txList;

    // Build property summary lines
    var propLines = txList.map(function(tx) {
      var inv = tx.invoices.length > 0
        ? tx.invoices.map(function(i){ return i.period; }).join(', ')
        : (tx.description || '');
      var mm  = memberMap[tx.propertyId];
      var plot = mm ? mm.plotNo : tx.propertyId;
      return '  🏠 Plot ' + plot + ' — ₹' + fINR(tx.amount) + (inv ? ' (' + inv + ')' : '');
    }).join('\n');

    var msg =
      '🧾 *Receipt | ' + SOCIETY_SHORT + '*\n\n' +
      'Dear ' + entry.name + ',\n\n' +
      'Your payment has been received and reconciled. ✅\n\n' +
      '─────────────────────\n' +
      '🔢 *Receipt No* : ' + receiptNo + '\n' +
      '📅 *Date*       : ' + bankRow.displayDate + '\n' +
      '💰 *Amount Paid*: ₹' + fINR(bankRow.amount) + '\n' +
      (isMulti
        ? '⚡ *Consolidated — ' + txRows.length + ' properties*\n'
        : '') +
      '─────────────────────\n' +
      '*Payment for:*\n' + propLines + '\n\n' +
      '📄 *Receipt PDF:*\n' + pdfUrl + '\n\n' +
      'Thank you! 🙏\n' +
      '_— ' + SOCIETY_SHORT + '_\n' +
      '_' + SOCIETY_REGD + '_';

    links.push({
      mobile:     waNum,
      name:       entry.name,
      properties: txList.map(function(t){ return t.propertyId; }),
      waLink:     'https://wa.me/' + waNum + '?text=' + encodeURIComponent(msg),
      message:    msg   // stored for display in email to treasurer
    });
  });

  Logger.log('WhatsApp links built: ' + links.length + ' (WA-enabled members)');
  return links;
}

// ─── WRITE PDF URL TO SHEETS ──────────────────────────────────────
function writePdfUrlToBankDetails(ss, sheetRow, pdfUrl, waLinks) {
  var sheet = ss.getSheetByName('BankDetails');
  if (!sheet) return;
  sheet.getRange(sheetRow, 10).setValue(pdfUrl);   // Col J = ReceiptPDF

  // Col K = WhatsAppLinks — store first WA link (AppSheet opens it directly)
  // For multiple links, all are in the receipt email to treasurer
  if (waLinks && waLinks.length > 0) {
    // Store first link in Col K for AppSheet action
    sheet.getRange(sheetRow, 11).setValue(waLinks[0].waLink);
  }
}

function writePdfUrlToTransactionDetails(ss, sheetRow, pdfUrl) {
  var sheet = ss.getSheetByName('TransactionDetails');
  if (!sheet) return;
  sheet.getRange(sheetRow, 16).setValue(pdfUrl);   // Col P = ReceiptPDF
}

// ─── DRIVE FOLDER ─────────────────────────────────────────────────
function getOrCreateReceiptFolder(dateStr) {
  var root = DriveApp.getRootFolder();
  var mf   = root.getFoldersByName(RECEIPTS_FOLDER);
  var mainFolder = mf.hasNext() ? mf.next() : root.createFolder(RECEIPTS_FOLDER);
  var monthKey = dateStr
    ? dateStr.substring(0,7)
    : Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM');
  var sf = mainFolder.getFoldersByName(monthKey);
  return sf.hasNext() ? sf.next() : mainFolder.createFolder(monthKey);
}

// ─── LOG ──────────────────────────────────────────────────────────
function logReceipt(ss, receiptNo, bankRow, txRows, memberMap, fileName, pdfUrl, waLinks) {
  var logSheet = ss.getSheetByName(RECEIPTS_LOG_SHEET);
  if (!logSheet) {
    logSheet = ss.insertSheet(RECEIPTS_LOG_SHEET);
    logSheet.appendRow(['Generated At','Receipt No','Date','Total ₹','# Props',
                        'Property IDs','Owners','WA Links Sent','File','PDF URL']);
    logSheet.getRange(1,1,1,10).setFontWeight('bold')
      .setBackground('#0f2744').setFontColor('#ffffff');
    logSheet.setFrozenRows(1);
  }
  var now   = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');
  var pids  = txRows.map(function(t){ return t.propertyId; }).join(', ');
  var names = txRows.map(function(t){
    var m = memberMap[t.propertyId];
    return m ? m.fullName : t.propertyId;
  }).join(' | ');
  var waSent = waLinks && waLinks.length
    ? waLinks.map(function(w){ return w.name + ' (' + w.mobile + ')'; }).join(', ')
    : 'None';
  logSheet.appendRow([now, receiptNo, bankRow.displayDate, bankRow.amount,
                      txRows.length, pids, names, waSent, fileName, pdfUrl]);
}

// ─── SEND EMAILS ─────────────────────────────────────────────────
// Member email: receipt + PDF attachment
// If multiple WA links exist → also sends treasurer a summary with all clickable WA links
function sendConsolidatedEmails(receiptNo, bankRow, txRows, memberMap,
                                pdfBlob, pdfUrl, fileName, waLinks) {
  var results = [];

  // ── Group tx rows by unique member email ─────────────────────────
  var emailMap = {};
  txRows.forEach(function(tx) {
    var m = memberMap[tx.propertyId];
    if (!m) return;
    var emails = [];
    if (m.email)      emails.push({ addr: m.email, name: m.fullName, proxyNote: '' });
    if (m.proxyEmail && m.proxyEmail !== m.email)
      emails.push({ addr: m.proxyEmail, name: m.proxyName, proxyNote: ' (Proxy for ' + m.fullName + ')' });

    emails.forEach(function(e) {
      if (!e.addr) return;
      if (!emailMap[e.addr]) emailMap[e.addr] = { name: e.name, proxyNote: e.proxyNote, entries: [] };
      emailMap[e.addr].entries.push({ tx: tx, member: m });
    });
  });

  // ── Send one email per unique address ────────────────────────────
  Object.keys(emailMap).forEach(function(email) {
    var info     = emailMap[email];
    var isMulti  = txRows.length > 1;
    var propRowsHtml = info.entries.map(function(e) {
      var inv = e.tx.invoices.length > 0
        ? e.tx.invoices.map(function(i){ return i.period; }).join(', ')
        : (e.tx.description || '—');
      var mm = memberMap[e.tx.propertyId] || {};
      return '<tr>' +
        '<td style="padding:7px 12px;background:#f8fafc;border-bottom:1px solid #e2e8f0">Plot ' + (mm.plotNo || e.tx.propertyId) + '</td>' +
        '<td style="padding:7px 12px;border-bottom:1px solid #e2e8f0">' + inv + '</td>' +
        '<td style="padding:7px 12px;border-bottom:1px solid #e2e8f0;text-align:right;color:#15803d;font-weight:700">₹' + fINR(e.tx.amount) + '</td>' +
        '</tr>';
    }).join('');

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
      '<p>Dear <strong>' + info.name + '</strong>' + info.proxyNote + ',</p>' +
      '<p>Your payment has been received and reconciled. Receipt details:</p>' +
      '<table style="width:100%;border-collapse:collapse;font-size:13px;margin:10px 0">' +
      '<tr><td style="padding:7px 12px;background:#f8fafc;width:38%;border-bottom:1px solid #e2e8f0"><b>Receipt No</b></td>' +
      '<td style="padding:7px 12px;border-bottom:1px solid #e2e8f0">' + receiptNo + '</td></tr>' +
      '<tr><td style="padding:7px 12px;background:#f8fafc;border-bottom:1px solid #e2e8f0"><b>Date</b></td>' +
      '<td style="padding:7px 12px;border-bottom:1px solid #e2e8f0">' + bankRow.displayDate + '</td></tr>' +
      '<tr><td style="padding:7px 12px;background:#f8fafc;border-bottom:1px solid #e2e8f0"><b>Total Amount</b></td>' +
      '<td style="padding:7px 12px;border-bottom:1px solid #e2e8f0;color:#15803d;font-weight:700">₹' + fINR(bankRow.amount) + '</td></tr>' +
      '</table>' +
      (isMulti ? '<p style="font-size:12px;background:#fef3c7;padding:8px 12px;border-radius:6px">⚡ Consolidated payment covering <strong>' + txRows.length + ' properties</strong>.</p>' : '') +
      '<table style="width:100%;border-collapse:collapse;font-size:12px;margin-top:8px">' +
      '<tr style="background:#1e4d8c;color:#fff">' +
      '<th style="padding:7px 12px;text-align:left">Plot</th>' +
      '<th style="padding:7px 12px;text-align:left">For Period</th>' +
      '<th style="padding:7px 12px;text-align:right">Amount</th></tr>' +
      propRowsHtml + '</table>' +
      '<p style="margin-top:16px">📎 <strong>Receipt PDF attached.</strong></p>' +
      '<p>🔗 <a href="' + pdfUrl + '" style="color:#1e4d8c">View receipt online (Google Drive)</a></p>' +
      '<hr style="border:none;border-top:1px solid #e2e8f0;margin:14px 0">' +
      '<p style="font-size:11px;color:#64748b">System-generated email. Do not reply.<br>' +
      '📧 ' + SOCIETY_EMAIL + ' · ' + SOCIETY_REGD + '</p>' +
      '</div></div>';

    try {
      GmailApp.sendEmail(email, subject,
        'Please use an HTML email client.',
        { htmlBody: body, attachments: [pdfBlob.setName(fileName)],
          name: SOCIETY_SHORT, replyTo: SOCIETY_EMAIL });
      results.push({ to: email, type: 'member', sent: true });
      Logger.log('Email sent → ' + email);
    } catch(err) {
      results.push({ to: email, type: 'member', sent: false, error: err.toString() });
      Logger.log('Email FAILED → ' + email + ' | ' + err.toString());
    }
  });

  // ── Treasurer summary email when multiple WA links to dispatch ───
  // (Treasurer needs all WA links in one place when payment covers 2+ properties)
  if (waLinks && waLinks.length > 1) {
    _sendTreasurerWhatsAppSummary(receiptNo, bankRow, txRows, memberMap, pdfUrl, waLinks, results);
  }

  return results;
}

// ─── TREASURER WA SUMMARY EMAIL ───────────────────────────────────
// Only sent when consolidated payment has 2+ WA links to dispatch.
// Gives treasurer all pre-filled WA links in one click-friendly email.
function _sendTreasurerWhatsAppSummary(receiptNo, bankRow, txRows, memberMap,
                                       pdfUrl, waLinks, results) {
  var linkRows = waLinks.map(function(w) {
    return '<tr>' +
      '<td style="padding:8px 12px;border-bottom:1px solid #e2e8f0">' + w.name + '</td>' +
      '<td style="padding:8px 12px;border-bottom:1px solid #e2e8f0">' + w.mobile + '</td>' +
      '<td style="padding:8px 12px;border-bottom:1px solid #e2e8f0">' +
        w.properties.join(', ') + '</td>' +
      '<td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;text-align:center">' +
        '<a href="' + w.waLink + '" style="background:#25D366;color:#fff;padding:5px 14px;' +
        'border-radius:20px;text-decoration:none;font-size:12px;font-weight:700">📲 Send WA</a>' +
      '</td>' +
      '</tr>';
  }).join('');

  var body =
    '<div style="font-family:Arial,sans-serif;max-width:600px;color:#1a1a2e">' +
    '<div style="background:linear-gradient(135deg,#0f2744,#1e4d8c);color:#fff;padding:16px 20px;border-radius:8px 8px 0 0">' +
    '<h2 style="margin:0;font-size:15px">💬 WhatsApp Receipts to Dispatch</h2>' +
    '<p style="margin:4px 0 0;font-size:11px;opacity:.8">' + SOCIETY_SHORT + ' — Treasurer Action Required</p>' +
    '</div>' +
    '<div style="border:1px solid #d1dce8;border-top:none;padding:20px;border-radius:0 0 8px 8px">' +
    '<p>Receipt <strong>#' + receiptNo + '</strong> (₹' + fINR(bankRow.amount) + ') has been generated ' +
    'for <strong>' + txRows.length + ' properties</strong>.</p>' +
    '<p>The following members have WhatsApp. Click <strong>Send WA</strong> to open ' +
    'WhatsApp with the message pre-filled — just tap <em>Send</em> in WhatsApp.</p>' +
    '<table style="width:100%;border-collapse:collapse;font-size:13px;margin:12px 0">' +
    '<tr style="background:#1e4d8c;color:#fff">' +
    '<th style="padding:8px 12px;text-align:left">Member</th>' +
    '<th style="padding:8px 12px;text-align:left">Mobile</th>' +
    '<th style="padding:8px 12px;text-align:left">Properties</th>' +
    '<th style="padding:8px 12px;text-align:center">Action</th></tr>' +
    linkRows + '</table>' +
    '<p style="font-size:12px;color:#64748b;margin-top:14px">' +
    '📄 <a href="' + pdfUrl + '" style="color:#1e4d8c">View Receipt PDF</a> · ' +
    'Links are valid for 24 hours (WhatsApp web/app must be open).</p>' +
    '</div></div>';

  try {
    GmailApp.sendEmail(
      SOCIETY_EMAIL,
      '💬 WhatsApp Receipts to Send — #' + receiptNo + ' (' + waLinks.length + ' members) | ' + SOCIETY_SHORT,
      'Open in HTML email client to see WhatsApp dispatch links.',
      { htmlBody: body, name: SOCIETY_SHORT + ' (System)' }
    );
    results.push({ to: SOCIETY_EMAIL, type: 'treasurer-wa-summary', sent: true });
    Logger.log('Treasurer WA summary email sent → ' + SOCIETY_EMAIL);
  } catch(err) {
    results.push({ to: SOCIETY_EMAIL, type: 'treasurer-wa-summary', sent: false, error: err.toString() });
    Logger.log('Treasurer WA summary FAILED: ' + err.toString());
  }
}

// ═══════════════════════════════════════════════════════════════════
//  BUILD CONSOLIDATED PDF
// ═══════════════════════════════════════════════════════════════════
function buildConsolidatedPdf(receiptNo, bankRow, txRows, memberMap, tz) {
  var isMulti   = txRows.length > 1;
  var totalAmt  = bankRow.amount;
  var dateDisp  = bankRow.displayDate;
  var modeClean = txRows.length > 0 ? txRows[0].modeClean : 'UPI / Online';
  var fyYear    = txRows.length > 0 ? txRows[0].fyYear    : '';

  // Property rows for the PDF table
  var propRows = txRows.map(function(tx, idx) {
    var m = memberMap[tx.propertyId] || {};
    var invDetail = '';
    if (tx.invoices.length > 0) {
      invDetail = tx.invoices.map(function(inv){
        return inv.period + ' (₹' + fINR(inv.billAmount) + ')';
      }).join(', ');
    } else if (tx.billId) {
      var mRes = tx.billId.match(/([A-Za-z]{3})(\d{4})/);
      if (mRes) invDetail = mRes[1] + ' ' + mRes[2];
    }
    var proxyNote = (m.isProxy && m.proxyName)
      ? '<br><span style="font-size:10px;color:#64748b">Rep: ' + m.proxyName + '</span>' : '';
    var badge = m.ownerType === 'Joint'
      ? ' <span style="background:#dbeafe;color:#1e40af;font-size:10px;padding:1px 6px;border-radius:8px">Joint</span>' : '';
    var waBadge = (m.isWhatsApp || (m.isProxy && m.proxyWA))
      ? ' <span style="background:#dcfce7;color:#166534;font-size:9px;padding:1px 5px;border-radius:8px">📲 WA</span>' : '';
    var bg = idx % 2 === 0 ? '#ffffff' : '#f8faff';

    return '<tr style="background:' + bg + '">' +
      '<td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;font-weight:600">' + (m.plotNo || tx.propertyId) + '</td>' +
      '<td style="padding:8px 10px;border-bottom:1px solid #e2e8f0">' + (m.fullName || '—') + badge + waBadge + proxyNote + '</td>' +
      '<td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;font-size:11px;color:#475569">' + (m.laneNo || '—') + '</td>' +
      '<td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;font-size:11px">' + (invDetail || tx.description || '—') + '</td>' +
      '<td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;text-align:right;font-weight:600;color:#15803d">₹' + fINR(tx.amount) + '</td>' +
      '</tr>';
  }).join('');

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
    '.bank-row{display:flex;gap:10px;margin-bottom:6px}' +
    '.bank-lbl{width:150px;font-size:12px;font-weight:600;color:#64748b;flex-shrink:0}' +
    '.bank-val{font-size:12px;color:#1a1a2e}' +
    '.multi-badge{display:inline-block;background:#fef3c7;color:#92400e;font-size:11px;padding:2px 10px;border-radius:10px;margin-bottom:10px;font-weight:600}' +
    '.stamp-row{text-align:right;margin-top:16px}' +
    '.stamp{display:inline-block;border:2.5px solid #15803d;color:#15803d;padding:5px 20px;border-radius:4px;font-weight:700;font-size:13px;transform:rotate(-8deg)}' +
    '.footer{text-align:center;margin-top:20px;font-size:11px;color:#94a3b8;border-top:1px solid #e2e8f0;padding-top:14px;line-height:1.8}' +
    '</style></head><body><div class="page">' +

    '<div class="header">' +
    '<div><h1>🏘️ ' + SOCIETY_NAME + '</h1>' +
    '<p>' + SOCIETY_REGD + ' · Vampuguda, Hyderabad</p></div>' +
    '<div class="receipt-badge">RECEIPT</div>' +
    '</div>' +

    '<div class="body">' +
    (isMulti ? '<div class="multi-badge">⚡ Consolidated Payment — ' + txRows.length + ' Properties</div>' : '') +

    '<div class="meta-grid">' +
    '<div class="meta-item"><div class="lbl">Receipt No</div><div class="val">' + receiptNo + '</div></div>' +
    '<div class="meta-item"><div class="lbl">Date</div><div class="val">' + dateDisp + '</div></div>' +
    '<div class="meta-item"><div class="lbl">FY Year</div><div class="val">' + fyYear + '</div></div>' +
    '</div>' +

    '<div class="section-title">🏦 Bank Transaction</div>' +
    '<div class="bank-row"><span class="bank-lbl">UPI Ref / Receipt No</span><span class="bank-val"><strong>' + receiptNo + '</strong></span></div>' +
    '<div class="bank-row"><span class="bank-lbl">Narration</span><span class="bank-val">' + bankRow.narration + '</span></div>' +
    '<div class="bank-row"><span class="bank-lbl">Payment Mode</span><span class="bank-val">' + modeClean + '</span></div>' +

    '<div class="amount-box">' +
    '<div class="amt">₹' + fINR(totalAmt) + '</div>' +
    '<div class="words">Rupees ' + amtWords + ' Only</div>' +
    '</div>' +

    '<div class="section-title">📋 ' + (isMulti ? 'Properties Covered' : 'Member & Invoice Details') + '</div>' +
    '<table class="prop-table"><thead><tr>' +
    '<th>Plot</th><th>Owner</th><th>Lane</th><th>For Period / Invoice</th><th style="text-align:right">Amount</th>' +
    '</tr></thead><tbody>' + propRows + '</tbody>' +
    (isMulti
      ? '<tfoot><tr>' +
        '<td colspan="4" style="padding:8px 10px;font-weight:700;text-align:right;background:#f8faff;font-size:12px">Total</td>' +
        '<td style="padding:8px 10px;text-align:right;font-weight:700;color:#15803d;background:#f8faff">₹' + fINR(totalAmt) + '</td>' +
        '</tr></tfoot>'
      : '') +
    '</table>' +

    '<div class="stamp-row"><span class="stamp">✓ RECEIVED</span></div>' +

    '<div class="footer">' +
    'This is a system-generated receipt · No signature required<br>' +
    SOCIETY_NAME + ' · ' + SOCIETY_REGD + '<br>' +
    '📧 ' + SOCIETY_EMAIL + '<br>' +
    '<span style="font-size:10px;color:#cbd5e1">Generated: ' +
    Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "dd MMM yyyy 'at' HH:mm") + ' IST</span>' +
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
    if (num === 0)       return '';
    if (num < 20)        return ones[num];
    if (num < 100)       return tens[Math.floor(num/10)] + (num%10 ? ' '+ones[num%10] : '');
    if (num < 1000)      return ones[Math.floor(num/100)]+' Hundred'+(num%100 ? ' '+w(num%100) : '');
    if (num < 100000)    return w(Math.floor(num/1000))   +' Thousand'+(num%1000    ? ' '+w(num%1000)    : '');
    if (num < 10000000)  return w(Math.floor(num/100000)) +' Lakh'   +(num%100000  ? ' '+w(num%100000)  : '');
    return w(Math.floor(num/10000000))+' Crore'+(num%10000000 ? ' '+w(num%10000000) : '');
  }
  return w(n).trim();
}

// ─── SHEET MENU ───────────────────────────────────────────────────
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
    ui.alert('⚠️ Row not yet Reconciled.\nPlease map the transaction in TransactionDetails first.');
    return;
  }
  var receiptNo = String(sheet.getRange(row, 3).getValue()).trim();
  if (!receiptNo) {
    ui.alert('⚠️ No RefNo found in Col C of selected row.');
    return;
  }

  var confirm = ui.alert('📄 Generate Consolidated Receipt',
    'ReceiptNo: ' + receiptNo + '\nThis will generate PDF + send emails + build WA links.',
    ui.ButtonSet.YES_NO);
  if (confirm !== ui.Button.YES) return;

  var result = generateConsolidatedReceipt(receiptNo);

  if (result.success) {
    var emailSummary = (result.emailResults || [])
      .map(function(r){ return (r.sent ? '✅' : '❌') + ' ' + r.to + ' (' + r.type + ')'; })
      .join('\n');
    var waSummary = result.waLinksCount > 0
      ? result.waLinksCount + ' WA link(s) built → written to Col K + emailed to treasurer.'
      : 'No WhatsApp links — no members marked IsWhatsApp = Y for this payment.';

    ui.alert('✅ Receipt Generated!',
      'Receipt No  : ' + result.receiptNo + '\n' +
      'Properties  : ' + (result.properties || []).join(', ') + '\n' +
      'Total       : ₹' + fINR(result.totalAmount) + '\n' +
      'Transactions: ' + result.txCount + '\n\n' +
      'Emails:\n' + (emailSummary || 'None') + '\n\n' +
      'WhatsApp:\n' + waSummary,
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

// ─── TEST ─────────────────────────────────────────────────────────
function testReceiptGeneration() {
  // Single-property:  111862041743  (PID 141, ₹500, has email)
  // Multi-property:   454154939921  (PID 137 + 138, ₹2000 consolidated)
  var testReceiptNo = '111862041743';
  Logger.log('▶ Testing receipt for ReceiptNo: ' + testReceiptNo);
  var result = generateConsolidatedReceipt(testReceiptNo);
  Logger.log(JSON.stringify(result, null, 2));
}
