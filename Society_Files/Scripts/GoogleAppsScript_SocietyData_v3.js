/**
 * ═══════════════════════════════════════════════════════════════════════════
 * SCRWA Society Data — Google Apps Script  v3.0
 * ═══════════════════════════════════════════════════════════════════════════
 * Google Sheet : SocietyData
 * Account      : scwa.vampuguda@gmail.com
 * Sheet ID     : 1oXmvMIfQDm51KoHHtkhg8KgK1Qi5mwFYSBdrwir85CA
 *
 * WHAT'S NEW IN v3.0 (2026-06-13)
 * ─────────────────────────────────
 * + getTransactionsFull()     → ALL rows from TransactionDetails with:
 *                               AccountHead, AccountSubHead, InternalOrder,
 *                               FY Year, Date — both Cash In + Cash Out
 * + getAccountHeadsMeta()     → AccountHeads & InternalOrder lookup data
 * + _transactions in output   → Full transaction list (all types)
 * + _meta in output           → Account head definitions + IO lookup
 *
 * TransactionDetails COLUMN MAP (row 2 = headers, data from row 3):
 *   Col A  [0]  TransactionID
 *   Col B  [1]  ReceiptNo
 *   Col C  [2]  Date
 *   Col D  [3]  Type            (💰Cash In / 💸Cash Out)
 *   Col E  [4]  Mode
 *   Col F  [5]  AccountHead
 *   Col G  [6]  AccountSubHead
 *   Col H  [7]  Amount          (negative = inflow, positive = outflow)
 *   Col I  [8]  PropertyID      (Cash In only — member reference)
 *   Col J  [9]  InternalOrder
 *   Col K  [10] BillID
 *   Col L  [11] Remarks
 *   Col M  [12] Notes
 *   Col N  [13] Attachments
 *   Col O  [14] FY Year
 *
 * SETUP / UPDATE INSTRUCTIONS
 * ─────────────────────────────
 * 1. Extensions → Apps Script → delete existing → paste this entire file
 * 2. Save (Ctrl+S)
 * 3. Deploy → Manage deployments → Edit (✏️) → New version → Deploy
 *    (Same URL — no need to update HTML files)
 * ═══════════════════════════════════════════════════════════════════════════
 */

const SPREADSHEET_ID = '1oXmvMIfQDm51KoHHtkhg8KgK1Qi5mwFYSBdrwir85CA';

// ═══════════════════════════════════════════════════════════════════════════
// doGet — main entry point
// ═══════════════════════════════════════════════════════════════════════════
function doGet(e) {
  try {
    const result = getFullData();
    return ContentService
      .createTextOutput(JSON.stringify(result))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (error) {
    return ContentService
      .createTextOutput(JSON.stringify({ error: error.toString(), stack: error.stack }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// getFullData — master builder
// ═══════════════════════════════════════════════════════════════════════════
function getFullData() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);

  // ── existing data (unchanged) ──────────────────────────────────────────
  const owners      = getOwnerDetails(ss);
  const properties  = getPropertyDetails(ss);
  const proxies     = getProxyDetails(ss);
  const invoices    = getInvoices(ss);
  const cashInByPid = getTransactions(ss);         // Cash In per member

  // ── NEW v3: full transactions + meta ──────────────────────────────────
  const txFull      = getTransactionsFull(ss);     // ALL rows — Cash In + Cash Out
  const meta        = getAccountHeadsMeta(ss);     // AccountHeads & IO lookup

  // ── member map ────────────────────────────────────────────────────────
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

  // ── summary ───────────────────────────────────────────────────────────
  const allIn  = txFull.filter(function(t){ return t.flowType === 'in';  });
  const allOut = txFull.filter(function(t){ return t.flowType === 'out'; });
  const totalIn  = allIn.reduce( function(s,t){ return s + t.amount; }, 0);
  const totalOut = allOut.reduce(function(s,t){ return s + t.amount; }, 0);

  // ── FY-wise summary from _transactions ────────────────────────────────
  const fyMap = {};
  txFull.forEach(function(t) {
    const fy = t.fyYear || 'Unknown';
    if (!fyMap[fy]) fyMap[fy] = { inflow: 0, outflow: 0, closing: 0 };
    if (t.flowType === 'in')  fyMap[fy].inflow  += t.amount;
    if (t.flowType === 'out') fyMap[fy].outflow += t.amount;
  });
  // compute running closing balance FY by FY (ascending)
  let runBal = 0;
  const sortedFYs = Object.keys(fyMap).sort();
  sortedFYs.forEach(function(fy) {
    runBal += fyMap[fy].inflow - fyMap[fy].outflow;
    fyMap[fy].closing = Math.round(runBal);
  });

  // ── income breakdown by AccountHead ───────────────────────────────────
  const incomeHeads = {};
  allIn.forEach(function(t) {
    const h = t.accountHead || 'Other';
    if (!incomeHeads[h]) incomeHeads[h] = 0;
    incomeHeads[h] += t.amount;
  });

  // ── expense breakdown by AccountHead → AccountSubHead ─────────────────
  const expenseHeads    = {};
  const expenseSubHeads = {};   // { head: { subHead: amount } }
  allOut.forEach(function(t) {
    const h = t.accountHead    || 'Other';
    const s = t.accountSubHead || 'General';
    if (!expenseHeads[h])    expenseHeads[h]    = 0;
    expenseHeads[h] += t.amount;
    if (!expenseSubHeads[h]) expenseSubHeads[h] = {};
    if (!expenseSubHeads[h][s]) expenseSubHeads[h][s] = 0;
    expenseSubHeads[h][s] += t.amount;
  });

  // ── InternalOrder summary ─────────────────────────────────────────────
  const ioSummary = {};
  txFull.forEach(function(t) {
    const io = t.internalOrder || '';
    if (!io) return;
    if (!ioSummary[io]) ioSummary[io] = { income: 0, expense: 0, net: 0 };
    if (t.flowType === 'in')  ioSummary[io].income  += t.amount;
    if (t.flowType === 'out') ioSummary[io].expense += t.amount;
  });
  Object.keys(ioSummary).forEach(function(io) {
    ioSummary[io].net = ioSummary[io].income - ioSummary[io].expense;
  });

  // ── _financial (keep existing structure for backward compat) ──────────
  const financial = buildFinancialBlock(txFull, fyMap, totalIn, totalOut);

  return {
    // ── existing keys (all reports continue to work unchanged) ────────
    ...buildMemberMap(members),     // '001'–'230' member objects
    _financial:      financial,
    _internalOrders: buildInternalOrders(txFull, meta),

    // ── NEW v3 keys ───────────────────────────────────────────────────
    _transactions: txFull,          // full transaction list with all fields
    _meta:         meta,            // AccountHeads & IO lookup tables

    // ── summary ───────────────────────────────────────────────────────
    _summary: {
      totalMembers:    Object.keys(members).length,
      totalIncome:     Math.round(totalIn),
      totalExpense:    Math.round(totalOut),
      netBalance:      Math.round(totalIn - totalOut),
      totalTxCount:    txFull.length,
      cashInCount:     allIn.length,
      cashOutCount:    allOut.length,
      fyWise:          fyMap,
      incomeByHead:    incomeHeads,
      expenseByHead:   expenseHeads,
      expenseBySubHead:expenseSubHeads,
      ioSummary:       ioSummary,
      generatedAt:     Utilities.formatDate(
                         new Date(), Session.getScriptTimeZone(),
                         "yyyy-MM-dd'T'HH:mm:ssZ")
    }
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// NEW v3: getTransactionsFull
// Returns ALL rows from TransactionDetails with rich fields
// ═══════════════════════════════════════════════════════════════════════════
function getTransactionsFull(ss) {
  const sheet = ss.getSheetByName('TransactionDetails');
  if (!sheet) return [];

  const data  = sheet.getDataRange().getValues();
  const txns  = [];
  const tz    = Session.getScriptTimeZone();

  // Row 1 = section label (ignored)
  // Row 2 = column headers  → index 1
  // Data  = row 3 onward    → index 2+
  for (var i = 2; i < data.length; i++) {
    var row = data[i];

    // Skip blank rows (no TransactionID AND no Date AND no Amount)
    if (!row[0] && !row[2] && !row[7]) continue;

    // ── Date ──────────────────────────────────────────────────────────
    var dateStr = '';
    var yyyymm  = '';
    var period  = '';
    if (row[2] instanceof Date) {
      dateStr = Utilities.formatDate(row[2], tz, 'yyyy-MM-dd');
      yyyymm  = Utilities.formatDate(row[2], tz, 'yyyyMM');
      period  = Utilities.formatDate(row[2], tz, 'MMM yyyy');
    } else if (row[2]) {
      dateStr = String(row[2]).substring(0, 10);
      // derive period from dateStr  e.g. "2025-07-15" → "Jul 2025"
      try {
        var dp = new Date(dateStr);
        period  = Utilities.formatDate(dp, tz, 'MMM yyyy');
        yyyymm  = Utilities.formatDate(dp, tz, 'yyyyMM');
      } catch(e) {}
    }

    // ── Amount (always positive; flowType says direction) ────────────
    var rawAmt = parseFloat(row[7]) || 0;
    var amount = Math.abs(rawAmt);

    // ── Flow direction ────────────────────────────────────────────────
    var typeRaw  = String(row[3] || '').trim();
    // Strip emoji prefix — keep text
    var typeClean = typeRaw.replace(/^[^\w\s]+\s*/, '');
    var flowType  = typeClean.toLowerCase().indexOf('cash in') >= 0  ? 'in'
                  : typeClean.toLowerCase().indexOf('cash out') >= 0 ? 'out'
                  : rawAmt <= 0                                       ? 'in'
                  : 'out';

    // ── FY Year ───────────────────────────────────────────────────────
    var fyYear = String(row[14] || '').trim();
    if (!fyYear && dateStr) {
      // derive FY from date (India: Apr–Mar)
      var mo = parseInt(dateStr.substring(5, 7), 10);
      var yr = parseInt(dateStr.substring(0, 4), 10);
      if (mo >= 4) {
        fyYear = yr + '-' + String(yr + 1).substring(2);
      } else {
        fyYear = (yr - 1) + '-' + String(yr).substring(2);
      }
    }

    // ── Clean text fields ─────────────────────────────────────────────
    function clean(v, maxLen) {
      var s = String(v || '').replace(/^[^\w\s₹()&,.\-\/]+\s*/, '').trim();
      return maxLen && s.length > maxLen ? s.substring(0, maxLen) : s;
    }
    function raw(v) {
      return String(v || '').trim();
    }

    txns.push({
      txId:           raw(row[0]),
      receiptNo:      raw(row[1]),
      date:           dateStr,
      period:         period,               // "Jul 2025"
      yyyymm:         yyyymm,               // "202507" — for easy sorting
      type:           typeRaw,              // original with emoji
      flowType:       flowType,             // 'in' or 'out'
      mode:           clean(row[4]),
      accountHead:    clean(row[5]),        // Col F
      accountSubHead: clean(row[6]),        // Col G
      amount:         amount,
      propertyId:     raw(row[8]),          // Col I (Cash In = member)
      internalOrder:  raw(row[9]),          // Col J
      billId:         raw(row[10]),
      remarks:        clean(row[11], 100),
      notes:          clean(row[12], 100),
      fyYear:         fyYear               // "2024-25" or "2024-2025"
    });
  }

  // Sort ascending by date
  txns.sort(function(a, b) { return a.date.localeCompare(b.date); });
  return txns;
}

// ═══════════════════════════════════════════════════════════════════════════
// NEW v3: getAccountHeadsMeta
// Reads AccountHeads & InternalOrder lookup sheet
// Returns { accountHeads: [...], internalOrders: [...] }
// ═══════════════════════════════════════════════════════════════════════════
function getAccountHeadsMeta(ss) {
  var meta = { accountHeads: [], internalOrders: [] };

  // ── AccountHeads & InternalOrder sheet ────────────────────────────────
  var ahSheet = ss.getSheetByName('AccountHeads & InternalOrder');
  if (!ahSheet) {
    // Try alternate names
    var sheets = ss.getSheets();
    for (var i = 0; i < sheets.length; i++) {
      if (sheets[i].getName().toLowerCase().indexOf('accounthead') >= 0 ||
          sheets[i].getName().toLowerCase().indexOf('account head') >= 0) {
        ahSheet = sheets[i];
        break;
      }
    }
  }
  if (!ahSheet) return meta;

  var data = ahSheet.getDataRange().getValues();
  var tz   = Session.getScriptTimeZone();

  // Read header row to map columns dynamically
  // Expected columns (either row 1 or row 2):
  //   HeadCode | AccountHead | SubHeadCode | AccountSubHead | Type | Description
  //   IOCode   | InternalOrder | Category  | Description
  // Strategy: scan first 3 rows for header markers

  var headerRow = -1;
  for (var r = 0; r < Math.min(3, data.length); r++) {
    var rowStr = data[r].join('|').toLowerCase();
    if (rowStr.indexOf('accounthead') >= 0 || rowStr.indexOf('account head') >= 0) {
      headerRow = r;
      break;
    }
  }

  // If no structured header found, return raw rows as-is
  if (headerRow === -1) {
    // Return all rows as generic key-value pairs
    var hdrs = data[0].map(function(h){ return String(h||'').trim(); });
    for (var ri = 1; ri < data.length; ri++) {
      var obj = {};
      for (var ci = 0; ci < hdrs.length; ci++) {
        if (hdrs[ci]) obj[hdrs[ci]] = String(data[ri][ci] || '').trim();
      }
      // Detect if it's an IO or AccountHead record
      var joined = data[ri].join('|');
      if (joined.indexOf('IO') >= 0 || joined.indexOf('Internal') >= 0) {
        meta.internalOrders.push(obj);
      } else if (joined.trim()) {
        meta.accountHeads.push(obj);
      }
    }
    return meta;
  }

  // Map header names to column indices
  var hdrs = data[headerRow].map(function(h){ return String(h||'').trim().toLowerCase(); });
  var col  = {};
  hdrs.forEach(function(h, i){ if (h) col[h] = i; });

  for (var ri = headerRow + 1; ri < data.length; ri++) {
    var row = data[ri];
    if (!row.join('').trim()) continue;   // skip blank

    var obj = {};
    hdrs.forEach(function(h, i) { if (h) obj[h] = String(row[i]||'').trim(); });

    // Classify: InternalOrder rows have IO-style codes (MOMEN01, FEDEN01, etc.)
    var code = obj['code'] || obj['iocode'] || obj['internalorder'] || '';
    var isIO = /^[A-Z]{3,6}\d{2}$/.test(code) ||
               String(row[0]).toUpperCase().indexOf('IO') >= 0 ||
               (obj['type'] || '').toLowerCase() === 'io';

    if (isIO) {
      meta.internalOrders.push({
        code:          code || obj['iocode'] || '',
        name:          obj['internalorder'] || obj['name'] || '',
        category:      obj['category'] || '',
        description:   obj['description'] || ''
      });
    } else {
      meta.accountHeads.push({
        head:         obj['accounthead']    || obj['head']    || '',
        subHead:      obj['accountsubhead'] || obj['subhead'] || '',
        type:         obj['type']  || '',       // 'Income' or 'Expense'
        description:  obj['description'] || ''
      });
    }
  }

  return meta;
}

// ═══════════════════════════════════════════════════════════════════════════
// buildFinancialBlock — keeps _financial structure identical to v2
// (backward compatibility — existing report HTMLs read this)
// ═══════════════════════════════════════════════════════════════════════════
function buildFinancialBlock(txFull, fyMap, totalIn, totalOut) {
  // Income heads
  var incomeHeads = {};
  var expenseHeads = {};
  var miscItems = {};
  var miscTotal = 0;

  txFull.forEach(function(t) {
    var h = t.accountHead || 'Other';
    var s = t.accountSubHead || '';
    if (t.flowType === 'in') {
      if (!incomeHeads[h]) incomeHeads[h] = { amount: 0, pct: 0 };
      incomeHeads[h].amount += t.amount;
    } else {
      if (!expenseHeads[h]) expenseHeads[h] = { amount: 0, pct: 0 };
      expenseHeads[h].amount += t.amount;
      // Misc breakdown
      if (h.toLowerCase().indexOf('miscellaneous') >= 0 ||
          h.toLowerCase().indexOf('misc') >= 0) {
        if (s) {
          if (!miscItems[s]) miscItems[s] = 0;
          miscItems[s] += t.amount;
          miscTotal    += t.amount;
        }
      }
    }
  });

  // Compute pct
  Object.keys(incomeHeads).forEach(function(h) {
    incomeHeads[h].pct = totalIn > 0
      ? Math.round(incomeHeads[h].amount / totalIn * 100)
      : 0;
  });
  Object.keys(expenseHeads).forEach(function(h) {
    expenseHeads[h].pct = totalOut > 0
      ? Math.round(expenseHeads[h].amount / totalOut * 100)
      : 0;
  });

  // miscBreakdown array
  var miscBreakdown = Object.keys(miscItems).map(function(s) {
    return { name: s, amount: Math.round(miscItems[s]) };
  }).sort(function(a, b){ return b.amount - a.amount; });

  // fyWise — normalise keys to "2024-25" format
  var fyWise = {};
  Object.keys(fyMap).forEach(function(fy) {
    // Accept "2024-2025" or "2024-25" → normalise to "2024-25"
    var norm = fy.replace(/^(\d{4})-(\d{4})$/, function(m, y1, y2) {
      return y1 + '-' + y2.substring(2);
    });
    fyWise[norm] = {
      inflow:  Math.round(fyMap[fy].inflow),
      outflow: Math.round(fyMap[fy].outflow),
      closing: Math.round(fyMap[fy].closing)
    };
  });

  return {
    fyWise:          fyWise,
    income:          incomeHeads,
    expense:         expenseHeads,
    miscBreakdown:   miscBreakdown,
    totalIncome:     Math.round(totalIn),
    totalExpense:    Math.round(totalOut),
    currentBalance:  Math.round(totalIn - totalOut)
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// buildInternalOrders — keeps _internalOrders structure identical to v2
// ═══════════════════════════════════════════════════════════════════════════
function buildInternalOrders(txFull, meta) {
  // Group by IO code
  var ioData = {};
  txFull.forEach(function(t) {
    var io = t.internalOrder || '';
    if (!io) return;
    if (!ioData[io]) ioData[io] = { income: 0, expense: 0 };
    if (t.flowType === 'in')  ioData[io].income  += t.amount;
    if (t.flowType === 'out') ioData[io].expense += t.amount;
  });

  // Enrich with IO names from meta lookup
  var ioLookup = {};
  (meta.internalOrders || []).forEach(function(io) {
    if (io.code) ioLookup[io.code] = io;
  });

  // Categorise by prefix convention:
  //   MOM* = society/maintenance  FED*,FES*,DIV* = festival  others = other
  var categories = { society: [], festival: [], other: [] };
  var catTotals  = {
    society:  { income: 0, expense: 0 },
    festival: { income: 0, expense: 0 },
    other:    { income: 0, expense: 0 }
  };

  Object.keys(ioData).forEach(function(io) {
    var d    = ioData[io];
    var meta = ioLookup[io] || {};
    var item = {
      code:    io,
      name:    meta.name || meta.internalorder || io,
      category:meta.category || '',
      income:  Math.round(d.income),
      expense: Math.round(d.expense),
      net:     Math.round(d.income - d.expense)
    };

    var cat = 'other';
    var pre = io.toUpperCase();
    if (pre.indexOf('MOM') === 0 || pre.indexOf('SOC') === 0 ||
        pre.indexOf('IND') === 0 || pre.indexOf('CON') === 0) {
      cat = 'society';
    } else if (pre.indexOf('FED') === 0 || pre.indexOf('FES') === 0 ||
               pre.indexOf('DIV') === 0 || pre.indexOf('EVT') === 0) {
      cat = 'festival';
    }
    categories[cat].push(item);
    catTotals[cat].income  += d.income;
    catTotals[cat].expense += d.expense;
  });

  // Sort each category by total activity desc
  ['society','festival','other'].forEach(function(cat) {
    categories[cat].sort(function(a,b){ return (b.income+b.expense) - (a.income+a.expense); });
  });

  return {
    society: {
      items:  categories.society,
      totals: {
        income:  Math.round(catTotals.society.income),
        expense: Math.round(catTotals.society.expense),
        net:     Math.round(catTotals.society.income - catTotals.society.expense)
      }
    },
    festival: {
      items:  categories.festival,
      totals: {
        income:  Math.round(catTotals.festival.income),
        expense: Math.round(catTotals.festival.expense),
        net:     Math.round(catTotals.festival.income - catTotals.festival.expense)
      }
    },
    other: {
      items:  categories.other,
      totals: {
        income:  Math.round(catTotals.other.income),
        expense: Math.round(catTotals.other.expense),
        net:     Math.round(catTotals.other.income - catTotals.other.expense)
      }
    }
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// buildMemberMap — spread member keys to top level (unchanged v2 pattern)
// ═══════════════════════════════════════════════════════════════════════════
function buildMemberMap(members) {
  // Return the members object directly; spread in getFullData via return {...members,...}
  // We need to return the 001–230 keys at top level for backward compatibility
  return members;
}

// ═══════════════════════════════════════════════════════════════════════════
// EXISTING FUNCTIONS v2 — UNCHANGED (backward compatible)
// ═══════════════════════════════════════════════════════════════════════════

function getOwnerDetails(ss) {
  const sheet = ss.getSheetByName('OwnerDetails');
  if (!sheet) return {};
  const data = sheet.getDataRange().getValues();
  const owners = {};
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
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

function getPropertyDetails(ss) {
  const sheet = ss.getSheetByName('PropertyDetails');
  if (!sheet) return {};
  const data = sheet.getDataRange().getValues();
  const properties = {};
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
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

function getProxyDetails(ss) {
  const sheet = ss.getSheetByName('ProxyDetails');
  if (!sheet) return {};
  const data = sheet.getDataRange().getValues();
  const proxies = {};
  for (let i = 2; i < data.length; i++) {
    const row = data[i];
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

function getInvoices(ss) {
  const sheet = ss.getSheetByName('Invoice');
  if (!sheet) return {};
  const data = sheet.getDataRange().getValues();
  const invoices = {};
  for (let i = 2; i < data.length; i++) {
    const row = data[i];
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
  for (const propId in invoices) {
    invoices[propId].sort((a, b) => b.billDate.localeCompare(a.billDate));
  }
  return invoices;
}

// getTransactions — Cash In per member (unchanged — member payment statements)
function getTransactions(ss) {
  const sheet = ss.getSheetByName('TransactionDetails');
  if (!sheet) return {};
  const data = sheet.getDataRange().getValues();
  const transactions = {};
  for (let i = 2; i < data.length; i++) {
    const row    = data[i];
    const propId = String(row[8] || '').trim();
    const txType = String(row[3] || '');
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
      date:           dateStr,
      receiptNo:      String(row[1]  || ''),
      transactionId:  String(row[0]  || ''),
      category:       row[6]  || row[5] || '',
      description:    String(row[12] || row[11] || '').substring(0, 60),
      amount:         amount,
      mode:           row[4]  || '',
      billPeriod:     billPeriod,
      internalOrder:  String(row[9]  || ''),
      fyYear:         String(row[14] || '')
    });
  }
  for (const propId in transactions) {
    transactions[propId].sort((a, b) => b.date.localeCompare(a.date));
  }
  return transactions;
}

// ═══════════════════════════════════════════════════════════════════════════
// TEST FUNCTIONS — run in Apps Script editor to verify
// ═══════════════════════════════════════════════════════════════════════════

function testV3() {
  const ss     = SpreadsheetApp.openById(SPREADSHEET_ID);
  const txFull = getTransactionsFull(ss);
  const meta   = getAccountHeadsMeta(ss);

  const cashIn  = txFull.filter(t => t.flowType === 'in');
  const cashOut = txFull.filter(t => t.flowType === 'out');
  const totalIn  = cashIn.reduce( (s,t) => s + t.amount, 0);
  const totalOut = cashOut.reduce((s,t) => s + t.amount, 0);

  Logger.log('═══ SCRWA v3 Test ═══');
  Logger.log('Total transactions : ' + txFull.length);
  Logger.log('Cash In  rows      : ' + cashIn.length  + '  ₹' + totalIn.toLocaleString('en-IN'));
  Logger.log('Cash Out rows      : ' + cashOut.length + '  ₹' + totalOut.toLocaleString('en-IN'));
  Logger.log('Net Balance        : ₹' + (totalIn - totalOut).toLocaleString('en-IN'));
  Logger.log('');
  Logger.log('Account Heads (meta)      : ' + meta.accountHeads.length);
  Logger.log('Internal Orders (meta)    : ' + meta.internalOrders.length);

  Logger.log('');
  Logger.log('── Sample Cash In ──');
  if (cashIn.length > 0) Logger.log(JSON.stringify(cashIn[0], null, 2));

  Logger.log('');
  Logger.log('── Sample Cash Out ──');
  if (cashOut.length > 0) Logger.log(JSON.stringify(cashOut[0], null, 2));

  Logger.log('');
  Logger.log('── Unique AccountHeads (Cash Out) ──');
  const heads = [...new Set(cashOut.map(t => t.accountHead))];
  Logger.log(heads.join('\n'));

  Logger.log('');
  Logger.log('── Unique AccountSubHeads (Cash Out) ──');
  const subHeads = [...new Set(cashOut.map(t => t.accountSubHead).filter(Boolean))];
  Logger.log(subHeads.join('\n'));

  Logger.log('');
  Logger.log('── FY breakdown ──');
  const fyMap = {};
  txFull.forEach(t => {
    const fy = t.fyYear || 'Unknown';
    if (!fyMap[fy]) fyMap[fy] = { in: 0, out: 0 };
    if (t.flowType === 'in')  fyMap[fy].in  += t.amount;
    if (t.flowType === 'out') fyMap[fy].out += t.amount;
  });
  Object.keys(fyMap).sort().forEach(fy => {
    const v = fyMap[fy];
    Logger.log(fy + ' → In: ₹' + v.in.toLocaleString('en-IN') + '  Out: ₹' + v.out.toLocaleString('en-IN') + '  Net: ₹' + (v.in-v.out).toLocaleString('en-IN'));
  });
}

function testSheetNames() {
  const ss     = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheets = ss.getSheets();
  Logger.log('Available sheets:');
  sheets.forEach(sheet => Logger.log('  ' + sheet.getName() + '  (' + sheet.getLastRow() + ' rows)'));
}

function testMeta() {
  const ss   = SpreadsheetApp.openById(SPREADSHEET_ID);
  const meta = getAccountHeadsMeta(ss);
  Logger.log('Account Heads  : ' + meta.accountHeads.length);
  Logger.log('Internal Orders: ' + meta.internalOrders.length);
  if (meta.accountHeads.length > 0)    Logger.log('Sample AH: '  + JSON.stringify(meta.accountHeads[0], null, 2));
  if (meta.internalOrders.length > 0)  Logger.log('Sample IO: '  + JSON.stringify(meta.internalOrders[0], null, 2));
}
