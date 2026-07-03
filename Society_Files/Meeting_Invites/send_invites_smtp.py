"""
SCRWA Meeting Invite — SMTP Bulk Sender
========================================
Uses Gmail SMTP with App Password.
Steps:
  1. Go to Google Account → Security → 2FA → App Passwords
  2. Create app password → copy 16-char password
  3. Set GMAIL_USER and GMAIL_APP_PASS below
  4. Run: python send_invites_smtp.py
"""
import smtplib, csv, os
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.mime.base import MIMEBase
from email import encoders

# ── CONFIG — fill these ──────────────────────────────────────────────────────
GMAIL_USER     = "scwa.vampuguda@gmail.com"
GMAIL_APP_PASS = "PASTE-16-CHAR-APP-PASSWORD-HERE"   # ← fill this
SUBJECT        = "📅 SCRWA Meeting Tomorrow – 14 June 2026, 10AM | Calendar Invite Attached"
OUT_DIR        = os.path.dirname(os.path.abspath(__file__))
CSV_FILE       = os.path.join(OUT_DIR, "SCRWA_MailMerge_List.csv")
HTML_TEMPLATE  = os.path.join(OUT_DIR, "Email_Template_Meeting_Invite.html")
ICS_FILE       = os.path.join(OUT_DIR, "SCRWA_Meeting_14Jun2026_ALL.ics")

# Read template
with open(HTML_TEMPLATE, "r", encoding="utf-8") as f:
    template = f.read()

# Read ICS
with open(ICS_FILE, "rb") as f:
    ics_data = f.read()

# Read recipients
with open(CSV_FILE, "r", encoding="utf-8-sig") as f:
    members = list(csv.DictReader(f))

active_members = [m for m in members if "inactive" not in m["status"].lower()]
print(f"Sending to {len(active_members)} active members...")

sent, failed = 0, []

with smtplib.SMTP_SSL("smtp.gmail.com", 465) as server:
    server.login(GMAIL_USER, GMAIL_APP_PASS)

    for i, m in enumerate(active_members, 1):
        email = m["email"].strip()
        name  = m["name"].strip() or "Member"
        house = m["house"].strip() or "-"
        lane  = m["lane"].strip() or "-"

        # Personalise HTML
        body = (template
            .replace("{{NAME}}", name)
            .replace("{{HOUSE}}", house)
            .replace("{{LANE}}", lane))

        msg = MIMEMultipart("mixed")
        msg["From"]    = f"SCRWA Secretary <{GMAIL_USER}>"
        msg["To"]      = email
        msg["Subject"] = SUBJECT

        # HTML body
        alt = MIMEMultipart("alternative")
        alt.attach(MIMEText(body, "html", "utf-8"))
        msg.attach(alt)

        # ICS attachment
        part = MIMEBase("text", "calendar", method="REQUEST", name="SCRWA_Meeting.ics")
        part.set_payload(ics_data)
        encoders.encode_base64(part)
        part.add_header("Content-Disposition", "attachment", filename="SCRWA_Meeting_14Jun2026.ics")
        msg.attach(part)

        try:
            server.sendmail(GMAIL_USER, email, msg.as_string())
            sent += 1
            print(f"  [{i:3d}/{len(active_members)}] ✅ Sent to {name} <{email}>")
        except Exception as e:
            failed.append((email, str(e)))
            print(f"  [{i:3d}/{len(active_members)}] ❌ FAILED {email}: {e}")

print(f"\nDone: {sent} sent, {len(failed)} failed")
if failed:
    print("Failed list:")
    for em, err in failed:
        print(f"  {em}: {err}")
