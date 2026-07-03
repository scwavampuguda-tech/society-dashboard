╔══════════════════════════════════════════════════════════════╗
║         SCRWA — Meeting Invite Sender Tool                   ║
║         Senior Citizens Residential Welfare Association      ║
╚══════════════════════════════════════════════════════════════╝

📁 FOLDER STRUCTURE
───────────────────
Society_Files\
└── Meeting_Invites\
    ├── SCRWA_MailMerge_List.csv         ← Member email list (keep updated)
    └── SCRWA_MeetingInviteTool\
        ├── scrwa_invite_sender.py       ← Main script (run this)
        ├── README.txt                   ← This file
        └── logs\                        ← Auto-created, one log per run


🚀 HOW TO USE FOR A NEW MEETING
────────────────────────────────
Step 1 — Open scrwa_invite_sender.py in Notepad or VS Code

Step 2 — Edit the "MEETING CONFIG" section at the top:

    "title_en"    → Meeting name in English
    "title_te"    → Meeting name in Telugu
    "date_en"     → e.g., "Sunday, 14th June 2026"
    "date_te"     → e.g., "జూన్ 14, 2026 (ఆదివారం)"
    "time_en"     → e.g., "9:00 AM"
    "time_te"     → e.g., "ఉదయం 9:00 గంటలకు"
    "ics_start"   → e.g., "20260614T090000"  (YYYYMMDDTHHMMSS)
    "ics_end"     → e.g., "20260614T103000"  (add 1.5 hrs)
    "venue_en"    → Venue in English
    "venue_te"    → Venue in Telugu
    "agenda_en"   → Agenda in English
    "agenda_te"   → Agenda in Telugu
    "ics_filename"→ e.g., "SCRWA_Meeting_14June2026.ics"

Step 3 — Run the script:
    Double-click scrwa_invite_sender.py
    OR open Command Prompt and type:
    python scrwa_invite_sender.py

Step 4 — Check the logs\ folder for delivery report


📋 MEMBER LIST (CSV FILE)
──────────────────────────
File  : SCRWA_MailMerge_List.csv
Update: Add/remove members as needed

Columns used:
  name           → Recipient name (used in greeting)
  email          → Delivery address
  house          → House number (shown in email)
  status         → ✅ Active = send  |  🧳 Exited / 🔄 Transferred = skip
  is_proxy_email → True = Proxy  |  False = Owner


🔐 GMAIL APP PASSWORD
──────────────────────
If the App Password stops working (e.g., changed Google password):
  1. Go to → myaccount.google.com/apppasswords
  2. Create a new App Password
  3. Open scrwa_invite_sender.py
  4. Update:  "app_password": "xxxx xxxx xxxx xxxx"


⏰ REMINDER TIMINGS
────────────────────
Default reminders (for a 9:00 AM meeting):
  120 min before → 7:00 AM
   60 min before → 8:00 AM
   30 min before → 8:30 AM
   15 min before → 8:45 AM
    0 min         → 9:00 AM (Meeting starts)

To change, edit "reminders_min" in the MEETING CONFIG:
  e.g., [60, 30, 15, 0]  → only 4 reminders


📬 WHAT EACH MEMBER RECEIVES
──────────────────────────────
  ✉️  Personalized email (English + Telugu)
  📋  Their name, role (Owner/Proxy), house number
  📅  .ics calendar file — auto-blocks slot in Google/Outlook/Apple Calendar
  🔔  5 automatic reminders at set times


📞 SUPPORT
───────────
Tool created by Orcha AI Assistant
For issues: re-run via Orcha chat with the CSV file attached
