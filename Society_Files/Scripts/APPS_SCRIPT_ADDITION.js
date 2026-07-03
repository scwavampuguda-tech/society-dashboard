// ═══════════════════════════════════════════════════════════════════════════
// APPS SCRIPT ADDITION — Add this block inside your doGet() function
// just before the final  return ContentService...  line
//
// This adds  _transactions  key to the API response with full
// TransactionDetails data — income + expense, all rows, all months.
// ═══════════════════════════════════════════════════════════════════════════

// ── Read TransactionDetails sheet ──────────────────────────────────────────
var txSheet   = ss.getSheetByName("TransactionDetails");
var txData    = txSheet.getDataRange().getValues();
var txHeaders = txData[1].map(function(h){ return String(h).trim(); }); // row 2 = headers

var transactions = [];

for (var ti = 2; ti < txData.length; ti++) {           // data starts row 3 (index 2)
  var row = txData[ti];
  if (!row[0]) continue;                               // skip empty rows

  var txObj = {};
  for (var ci = 0; ci < txHeaders.length; ci++) {
    var hdr = txHeaders[ci];
    var val = row[ci];
    if (!hdr) continue;

    // Format date as YYYY-MM-DD string
    if (val instanceof Date) {
      var y  = val.getFullYear();
      var mo = String(val.getMonth()+1).padStart(2,'0');
      var d  = String(val.getDate()).padStart(2,'0');
      txObj[hdr] = y + '-' + mo + '-' + d;
    } else {
      txObj[hdr] = val;
    }
  }
  transactions.push(txObj);
}

// Attach to output object  (output is whatever you named your response object)
output["_transactions"] = transactions;

// ═══════════════════════════════════════════════════════════════════════════
// DONE — The API will now return:
//   _transactions : [
//     { "Date": "2024-06-01", "Type": "Cash In", "Amount": 500,
//       "AccountHead": "Maintenance Charges", "Description": "...",
//       "InternalOrder": "MOMEN01", ... },
//     ...
//   ]
// ═══════════════════════════════════════════════════════════════════════════
