/**
 * ========================================================
 * Society Member Statement - Google Apps Script
 * ========================================================
 * Google Sheet: SocietyData
 * Account: scwa.vampuguda@gmail.com
 * Sheet ID: 1oXmvMIfQDm51KoHHtkhg8KgK1Qi5mwFYSBdrwir85CA
 * ========================================================
 *
 * SETUP INSTRUCTIONS:
 * -------------------
 * 1. Open Google Sheet: https://docs.google.com/spreadsheets/d/1oXmvMIfQDm51KoHHtkhg8KgK1Qi5mwFYSBdrwir85CA/edit
 * 2. Login with: scwa.vampuguda@gmail.com
 * 3. Go to Extensions → Apps Script
 * 4. Delete any existing code
 * 5. Paste this ENTIRE script
 * 6. Click Save (Ctrl+S)
 * 7. Click Deploy → Manage deployments → Edit (pencil icon)
 * 8. Select "New version" → Deploy
 *    (URL stays the same — no need to update HTML files)
 *
 * WHAT'S NEW (v2):
 * ----------------
 * + getCashOutTransactions()  → returns Cash Out from TransactionDetails
 * + getBankDebits()           → returns debit entries from BankDetails
 * + doGet now returns { members, cashOut, bankDebits, summary }
 * ========================================================
 */

// Spreadsheet ID
const SPREADSHEET_ID = '1oXmvMIfQDm51KoHHtkhg8KgK1Qi5mwFYSBdrwir85CA';

// ============================================================
// doGet — main entry point (called by HTML files via fetch)
// ============================================================
function doGet(e) {
  try {
    const result = getFullData();

    return ContentService
      .createTextOutput(JSON.stringify(result))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (error) {
    return ContentService
      .createTextOutput(JSON.stringify({ error: error.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// ============================================================
// getFullData — combines member data + cash out + summary
// ============================================================
function getFullData() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);

  // ── existing data ──
  const owners       = getOwnerDetails(ss);
  const properties   = getPropertyDetails(ss);
  const proxies      = getProxyDetails(ss);
  const invoices     = getInvoices(ss);
  const cashInByPid  = getTransactions(ss);        // Cash In per member (unchanged)

  // ── NEW: Cash Out ──
  const cashOutList  = getCashOutTransactions(ss); // Expenses from TransactionDetails
  const bankDebits   = getBankDebits(ss);          // Debit entries from BankDetails

  // ── member map (same as before) ──
  const members = {};
  for (const propId in owners) {
    const owner = owners[propId];
    const prop  = properties[propId] || {};
    const proxy = proxies[propId]    || {};

    members[propId] = {
      propertyID:      propId,
      plotNo:          owner.plotNo,
      name:            owner.name + (owner.name2 ? ' & ' + owner.name2 : ''),
      house:           prop.house            || '',
      laneNo:          owner.laneNo          || '',
      occupancyStatus: prop.occupancyStatus  || '',
      facing:          prop.facing           || '',
      mobile:          owner.mobile          || '',
      email:           owner.email           || '',
      status:          owner.status          || '',
      isProxy:         owner.isProxy         || '',
      representedBy:   proxy.representedBy   || '',
      proxyRelation:   proxy.relation        || '',
      proxyMobile:     proxy.proxyMobile     || '',
      proxyEmail:      proxy.proxyEmail      || '',
      invoices:        invoices[propId]      || [],
      payments:        cashInByPid[propId]   || []
    };
  }

  // ── summary totals ──
  const totalCashIn  = Object.values(cashInByPid)
    .flat().reduce((s, t) => s + (t.amount || 0), 0);
  const totalCashOut = cashOutList.reduce((s, t) => s + (t.amount || 0), 0);
  const totalBankOut = bankDebits.reduce((s, t) => s + (t.amount || 0), 0);

  return {
    members:    members,           // existing — all member data with Cash In
    cashOut:    cashOutList,       // NEW — society expense transactions
    bankDebits: bankDebits,        // NEW — bank debit entries
    summary: {
      totalMembers:    Object.keys(members).length,
      totalCashIn:     totalCashIn,
      totalCashOut:    totalCashOut,
      totalBankDebits: totalBankOut,
      netBalance:      totalCashIn - totalCashOut,
      generatedAt:     new Date().toISOString()
    }
  };
}

// ============================================================
// EXISTING FUNCTIONS — unchanged
// ============================================================

// Read OwnerDetails sheet
function getOwnerDetails(ss) {
  const sheet = ss.getSheetByName('OwnerDetails');
  if (!sheet) return {};

  const data   = sheet.getDataRange().getValues();
  const owners = {};

  for (let i = 1; i < data.length; i++) {
    const row    = data[i];
    const propId = String(row[0] || '').trim();
    if (!propId) continue;

    let plotNo = row[1];
    if (plotNo) plotNo = String(plotNo).replace('.0', '');

    owners[propId] = {
      propertyID:    propId,
      plotNo:        plotNo || propId,
      space:         row[2]  || '',
      ownershipType: row[3]  || '',
      name:          row[4]  || '',
      name2:         row[5]  || '',
      laneNo:        row[7]  || '',
      email:         row[10] || '',
      mobile:        row[11] || '',
      status:        row[9]  || '',
      isProxy:       row[14] || ''
    };
  }
  return owners;
}

// Read PropertyDetails sheet
function getPropertyDetails(ss) {
  const sheet = ss.getSheetByName('PropertyDetails');
  if (!sheet) return {};

  const data       = sheet.getDataRange().getValues();
  const properties = {};

  for (let i = 1; i < data.length; i++) {
    const row    = data[i];
    const propId = String(row[0] || '').trim();
    if (!propId) continue;

    properties[propId] = {
      house:           row[1]  || '',
      occupancyStatus: row[4]  || '',
      facing:          row[10] || ''
    };
  }
  return properties;
}

// Read ProxyDetails sheet
function getProxyDetails(ss) {
  const sheet = ss.getSheetByName('ProxyDetails');
  if (!sheet) return {};

  const data    = sheet.getDataRange().getValues();
  const proxies = {};

  // Headers in row 2, data from row 3
  for (let i = 2; i < data.length; i++) {
    const row    = data[i];
    const propId = String(row[0] || '').trim();
    if (!propId) continue;

    proxies[propId] = {
      representedBy: row[1] || '',
      relation:      row[2] || '',
      proxyEmail:    row[4] || '',
      proxyMobile:   row[5] || ''
    };
  }
  return proxies;
}

// Read Invoice sheet
function getInvoices(ss) {
  const sheet = ss.getSheetByName('Invoice');
  if (!sheet) return {};

  const data     = sheet.getDataRange().getValues();
  const invoices = {};

  // Headers in row 2, data from row 3
  for (let i = 2; i < data.length; i++) {
    const row    = data[i];
    const billId = row[0];
    const propId = String(row[1] || '').trim();
    if (!billId || !propId) continue;

    let periodStr = '';
    let dateStr   = '';

    if (row[4] instanceof Date) {
      periodStr = Utilities.formatDate(row[4], Session.getScriptTimeZone(), 'MMM yyyy');
    } else if (row[4]) {
      periodStr = String(row[4]).substring(0, 10);
    }

    if (row[5] instanceof Date) {
      dateStr = Utilities.formatDate(row[5], Session.getScriptTimeZone(), 'yyyy-MM-dd');
    } else if (row[5]) {
      dateStr = String(row[5]).substring(0, 10);
    }

    let billAmt = parseFloat(row[6]) || 0;
    let paidAmt = parseFloat(row[7]) || 0;
    if (paidAmt < 0) paidAmt = Math.abs(paidAmt);
    let balance = parseFloat(row[8]) || (billAmt - paidAmt);

    if (!invoices[propId]) invoices[propId] = [];
    invoices[propId].push({
      billId:     String(billId),
      period:     periodStr,
      billDate:   dateStr,
      billAmount: billAmt,
      paidAmount: paidAmt,
      balance:    balance,
      status:     row[9] || ''
    });
  }

  // Sort by date descending
  for (const propId in invoices) {
    invoices[propId].sort((a, b) => b.billDate.localeCompare(a.billDate));
  }
  return invoices;
}

// Read TransactionDetails — Cash In per member (unchanged)
function getTransactions(ss) {
  const sheet = ss.getSheetByName('TransactionDetails');
  if (!sheet) return {};

  const data         = sheet.getDataRange().getValues();
  const transactions = {};

  // Headers in row 2, data from row 3
  for (let i = 2; i < data.length; i++) {
    const row    = data[i];
    const propId = String(row[8] || '').trim();
    const txType = String(row[3] || '');

    // Cash In only (member payments)
    if (!propId || !txType.includes('Cash In')) continue;

    let dateStr    = '';
    let billPeriod = '';

    if (row[2] instanceof Date) {
      dateStr = Utilities.formatDate(row[2], Session.getScriptTimeZone(), 'yyyy-MM-dd');
      const category = String(row[6] || row[5] || '');
      if (category.includes('Regular') || category.includes('Maintenance')) {
        billPeriod = Utilities.formatDate(row[2], Session.getScriptTimeZone(), 'MMM yyyy');
      }
    } else if (row[2]) {
      dateStr = String(row[2]).substring(0, 10);
    }

    let amount = parseFloat(row[7]) || 0;
    if (amount < 0) amount = Math.abs(amount);

    if (!transactions[propId]) transactions[propId] = [];
    transactions[propId].push({
      date:        dateStr,
      receiptNo:   String(row[1] || ''),
      category:    row[6]  || row[5] || '',
      description: String(row[12] || row[11] || '').substring(0, 60),
      amount:      amount,
      mode:        row[4]  || '',
      billPeriod:  billPeriod
    });
  }

  // Sort by date descending
  for (const propId in transactions) {
    transactions[propId].sort((a, b) => b.date.localeCompare(a.date));
  }
  return transactions;
}

// ============================================================
// NEW FUNCTION 1 — getCashOutTransactions
// Reads TransactionDetails — returns Cash OUT rows
// (society expenses — rows where type is NOT "Cash In")
// ============================================================
function getCashOutTransactions(ss) {
  const sheet = ss.getSheetByName('TransactionDetails');
  if (!sheet) return [];

  const data    = sheet.getDataRange().getValues();
  const cashOut = [];

  // Headers in row 2, data from row 3
  for (let i = 2; i < data.length; i++) {
    const row    = data[i];
    const txType = String(row[3] || '').trim();

    // Skip Cash In rows — those are member payments
    if (!txType || txType.includes('Cash In')) continue;

    // Skip empty rows
    const receiptNo = String(row[1] || '').trim();
    const amount    = parseFloat(row[7]) || 0;
    if (!receiptNo && amount === 0) continue;

    let dateStr = '';
    if (row[2] instanceof Date) {
      dateStr = Utilities.formatDate(row[2], Session.getScriptTimeZone(), 'yyyy-MM-dd');
    } else if (row[2]) {
      dateStr = String(row[2]).substring(0, 10);
    }

    cashOut.push({
      date:        dateStr,
      receiptNo:   receiptNo,
      txType:      txType,                                   // e.g. "Cash Out", "Bank Transfer", "Expense"
      category:    String(row[6] || row[5] || ''),           // category / head
      description: String(row[12] || row[11] || row[9] || '').substring(0, 80),
      mode:        String(row[4] || ''),                     // payment mode
      amount:      Math.abs(amount)                          // always positive
    });
  }

  // Sort by date descending
  cashOut.sort((a, b) => b.date.localeCompare(a.date));
  return cashOut;
}

// ============================================================
// NEW FUNCTION 2 — getBankDebits
// Reads BankDetails sheet — returns debit (withdrawal) rows
// BankDetails columns: [Date, Narration, RefNo, ValueDate, Withdrawal, Deposit, Balance, Reconciled]
//                       col1   col2       col3   col4        col5        col6     col7     col8
// ============================================================
function getBankDebits(ss) {
  const sheet = ss.getSheetByName('BankDetails');
  if (!sheet) return [];

  const data    = sheet.getDataRange().getValues();
  const debits  = [];

  // Row 1 = header, data from row 2
  for (let i = 1; i < data.length; i++) {
    const row        = data[i];
    const withdrawal = parseFloat(row[4]) || 0;

    // Only debit (withdrawal) rows
    if (withdrawal <= 0) continue;

    let dateStr = '';
    if (row[0] instanceof Date) {
      dateStr = Utilities.formatDate(row[0], Session.getScriptTimeZone(), 'yyyy-MM-dd');
    } else if (row[0]) {
      dateStr = String(row[0]).substring(0, 10);
    }

    const refNo      = String(row[2] || '').trim();
    const narration  = String(row[1] || '').trim();
    const balance    = parseFloat(row[6]) || 0;
    const reconciled = row[7] ? String(row[7]) : '';

    // Skip empty rows
    if (!dateStr && !refNo && withdrawal === 0) continue;

    debits.push({
      date:        dateStr,
      narration:   narration.substring(0, 80),
      refNo:       refNo,
      amount:      Math.abs(withdrawal),
      balance:     balance,
      reconciled:  reconciled
    });
  }

  // Sort by date descending
  debits.sort((a, b) => b.date.localeCompare(a.date));
  return debits;
}

// ============================================================
// TEST FUNCTIONS — run these in Apps Script editor to verify
// ============================================================

// Test: verify full data structure
function testGetFullData() {
  const result = getFullData();
  Logger.log('✅ Members       : ' + Object.keys(result.members).length);
  Logger.log('🔴 Cash Out rows : ' + result.cashOut.length);
  Logger.log('🏦 Bank Debits   : ' + result.bankDebits.length);
  Logger.log('📊 Summary       : ' + JSON.stringify(result.summary, null, 2));

  if (result.cashOut.length > 0) {
    Logger.log('📋 Sample Cash Out: ' + JSON.stringify(result.cashOut[0], null, 2));
  }
  if (result.bankDebits.length > 0) {
    Logger.log('🏦 Sample Bank Debit: ' + JSON.stringify(result.bankDebits[0], null, 2));
  }
}

// Test: check available sheet names
function testSheetNames() {
  const ss     = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheets = ss.getSheets();
  Logger.log('📋 Available sheets:');
  sheets.forEach(sheet => {
    Logger.log('  - ' + sheet.getName() + ' (' + sheet.getLastRow() + ' rows)');
  });
}

// Test: Cash Out only
function testCashOut() {
  const ss      = SpreadsheetApp.openById(SPREADSHEET_ID);
  const cashOut = getCashOutTransactions(ss);
  Logger.log('🔴 Total Cash Out transactions: ' + cashOut.length);
  if (cashOut.length > 0) Logger.log('Sample: ' + JSON.stringify(cashOut[0], null, 2));
}

// Test: Bank Debits only
function testBankDebits() {
  const ss     = SpreadsheetApp.openById(SPREADSHEET_ID);
  const debits = getBankDebits(ss);
  Logger.log('🏦 Total Bank Debits: ' + debits.length);
  if (debits.length > 0) Logger.log('Sample: ' + JSON.stringify(debits[0], null, 2));
}
