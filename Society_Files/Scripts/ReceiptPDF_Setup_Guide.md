# SCRWA Receipt PDF — Setup Guide
**File:** ReceiptPDF.gs  
**Date:** 04 Jul 2026

---

## STEP 1 — Add to Google Apps Script

1. Open Google Sheet → **Extensions → Apps Script**
2. Click **"+"** (New file) → Name it `ReceiptPDF`
3. Paste the full content of `ReceiptPDF.gs`
4. Click 💾 Save
5. **Deploy → Manage Deployments → New Deployment**
   - Type: Web App
   - Execute as: **Me (scwa.vampuguda@gmail.com)**
   - Who has access: **Anyone** ← required for AppSheet webhook
   - Click Deploy → copy the Web App URL

---

## STEP 2 — Set Drive Folder Permissions (one-time)

Run `testReceiptGeneration()` once from Apps Script:
- Replace `testTxId` with a real TransactionID from your sheet
- This auto-creates the `SCRWA_Receipts/` folder in Google Drive
- Check Drive → confirm folder created
- Check `Receipts_Log` sheet → confirm row logged

---

## STEP 3 — AppSheet Action Setup

Go to **AppSheet → SocietyData app → Actions → New Action**

### Action: "📄 Generate Receipt"
```
Action Name   : 📄 Generate Receipt
For a record of: TransactionDetails
Do this        : Call a webhook
URL            : https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec
HTTP Method    : POST
HTTP Content Type: JSON
Body:
{
  "action": "generateReceipt",
  "txId": "<<[TransactionID]>>"
}
```

### Action: "📄 View Receipt PDF"
```
Action Name   : 📄 View Receipt PDF  
For a record of: TransactionDetails
Do this        : Open a link
URL            : <<[Attachments]>>
Open in        : Browser
Visibility     : Show if [Attachments] <> ""
```

### Action: "💬 WhatsApp Receipt"
```
Action Name   : 💬 WhatsApp Receipt
For a record of: TransactionDetails  
Do this        : Open a link
URL            : https://wa.me/91<<[Mobile]>>?text=...
(Use the waLink returned from webhook — or build in AppSheet formula)
```

---

## STEP 4 — Add Attachments Column to TransactionDetails Sheet

The script writes the PDF URL to **Column N (Attachments)**  
In AppSheet, map this column to the `Attachments` field on TransactionDetails table.

---

## PDF Filename Format
```
RCPT-{receiptNo}-PID{propertyId}-{plotNo}.pdf
Example: RCPT-307914352494-PID121-044P.pdf
```

## Drive Folder Structure
```
My Drive/
  SCRWA_Receipts/
    2026-07/
      RCPT-307914352494-PID121-044P.pdf
      RCPT-470131622086-PID121-044P.pdf
    2026-06/
      ...
```

## Receipts_Log Sheet (auto-created)
| Generated At | TxID | Receipt No | Property ID | Plot No | Owner | Amount | Mode | Period | FY | PDF File | PDF URL |
|---|---|---|---|---|---|---|---|---|---|---|---|

---

## What the Receipt PDF Contains
```
┌────────────────────────────────────────────────────┐
│  🏘️ SENIOR CITIZENS RESIDENTIAL WELFARE ASSOC      │
│  SCRWA, Vampuguda | Regd. No: 2240/2006   [RECEIPT]│
├────────────────────────────────────────────────────┤
│  Receipt No    : 307914352494                       │
│  Transaction ID: TX-a6c75cd7                        │
│  Date          : 03 Jun 2026                        │
│  FY Year       : 2026-2027                          │
│  ─────────────────────────────────────────          │
│  📍 Member Details                                  │
│  Property ID   : 121                                │
│  Plot No       : 044/P                              │
│  Lane          : Lane 03 - ...                      │
│  Owner         : A. M. Lakshmi                      │
│  ─────────────────────────────────────────          │
│  💳 Payment Details                                 │
│  Description   : Towards Monthly Maintenance        │
│  Category      : Regular Charges                    │
│  Payment Mode  : UPI / Online                       │
│  ┌─────────────────────────────────────────┐        │
│  │        ₹ 500         [GREEN BOX]        │        │
│  │  Rupees Five Hundred Only               │        │
│  └─────────────────────────────────────────┘        │
│  📋 Invoice Mapping                                 │
│  BillID | Period | Billed | Paid | Balance          │
│  ─────────────────────────────────────────          │
│                        ✓ RECEIVED [STAMP]           │
│  This is a system-generated receipt.                │
└────────────────────────────────────────────────────┘
```

---

## Email Sent To
- Owner email (from OwnerDetails)
- Proxy email (if applicable)
- Subject: `🧾 Receipt #307914352494 — ₹500 | SCRWA, Vampuguda`
- PDF attached

## WhatsApp Message
- Sent to member's mobile (proxy mobile if applicable)
- Contains receipt summary + Google Drive PDF link

---

## Troubleshooting
| Issue | Fix |
|---|---|
| `Transaction not found` | Check TransactionID matches exactly (case-sensitive) |
| `Member not found` | Ensure PropertyID in TransactionDetails Col I matches OwnerDetails |
| PDF URL blank in sheet | Check Col N permission / Apps Script ran successfully |
| Email not sent | Check member has email in OwnerDetails Col G |
| Drive folder not found | Run testReceiptGeneration() once to initialize |
