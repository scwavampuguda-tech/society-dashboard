// ═══════════════════════════════════════════════════════════════════════════
// HOW TO IDENTIFY WHERE TO PASTE IN YOUR EXISTING SCRIPT
//
// In your Apps Script, find the doGet() function.
// It will look roughly like this (variable names may differ):
//
//   function doGet(e) {
//     var ss     = SpreadsheetApp.getActiveSpreadsheet();
//     var output = {};
//
//     // ... lots of code building output ...
//     output["_financial"]      = { ... };
//     output["_internalOrders"] = { ... };
//
//     // <── PASTE THE ADDITION BLOCK HERE, just before return
//
//     return ContentService
//       .createTextOutput(JSON.stringify(output))
//       .setMimeType(ContentService.MimeType.JSON);
//   }
//
// ── EXACT CODE TO PASTE ────────────────────────────────────────────────────
// (Replace "ss" with whatever your SpreadsheetApp variable is named,
//  and "output" with whatever your response object is named)
// ──────────────────────────────────────────────────────────────────────────

  // ── TransactionDetails → _transactions ──────────────────────────────────
  var txSheet   = ss.getSheetByName("TransactionDetails");
  var txAllData = txSheet.getDataRange().getValues();
  var txHeaders = txAllData[1].map(function(h){ return String(h).trim(); });
  var txList    = [];

  for (var ti = 2; ti < txAllData.length; ti++) {
    var txRow = txAllData[ti];
    if (!txRow[0]) continue;
    var txObj = {};
    for (var ci = 0; ci < txHeaders.length; ci++) {
      var h = txHeaders[ci];
      var v = txRow[ci];
      if (!h) continue;
      if (v instanceof Date) {
        txObj[h] = Utilities.formatDate(v, Session.getScriptTimeZone(), "yyyy-MM-dd");
      } else {
        txObj[h] = v;
      }
    }
    txList.push(txObj);
  }
  output["_transactions"] = txList;
  // ── END TransactionDetails ───────────────────────────────────────────────

// ── AFTER ADDING, DEPLOY ───────────────────────────────────────────────────
// 1. Click  Deploy → Manage deployments
// 2. Click the pencil ✏️ edit icon on your existing deployment
// 3. Change version:  "New version"
// 4. Click  Deploy
// 5. Copy the new Web App URL  (or it stays the same if you update existing)
// ──────────────────────────────────────────────────────────────────────────
