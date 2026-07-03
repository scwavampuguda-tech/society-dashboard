"""
SCRWA Adhoc Meeting — Gmail SMTP Bulk Sender
Email source: SocietyData.xlsx → OwnerDetails + ProxyDetails

SETUP:
  1. myaccount.google.com → Security → 2-Step → App Passwords → create for Mail
  2. Paste 16-char password below
  3. Run: python send_adhoc_invites.py
"""
import smtplib, csv, os, time
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.mime.base import MIMEBase
from email import encoders
from datetime import datetime

# ══ FILL THIS ════════════════════════════════════════════
GMAIL_USER     = "scwa.vampuguda@gmail.com"
GMAIL_APP_PASS = "PASTE-16-CHAR-APP-PASSWORD-HERE"
# ════════════════════════════════════════════════════════

SUBJECT  = "📢 SCRWA Adhoc Meeting – Sunday 14 June 2026, 09:00 AM | అడ్హాక్ మీటింగ్ నోటీస్"
BASE_DIR = os.path.dirname(os.path.abspath(__file__))

with open(os.path.join(BASE_DIR,"AdhocMeeting_Email_Template.html"), encoding="utf-8") as f:
    template = f.read()
with open(os.path.join(BASE_DIR,"SCRWA_AdhocMeeting_14Jun2026.ics"), "rb") as f:
    ics_data = f.read()
with open(os.path.join(BASE_DIR,"SCRWA_AdhocMeeting_MailList.csv"), encoding="utf-8-sig") as f:
    all_recip = list(csv.DictReader(f))

# Only valid emails, skip inactive/❌
to_send = [r for r in all_recip
           if r["email"].strip()
           and "❌" not in r["status"]
           and "inactive" not in r["status"].lower()]

print(f"Recipients  : {len(to_send)} (from {len(all_recip)} total)")
print(f"From        : {GMAIL_USER}")
print("-"*65)

sent, failed = 0, []

with smtplib.SMTP_SSL("smtp.gmail.com", 465) as srv:
    srv.login(GMAIL_USER, GMAIL_APP_PASS)
    print("✅ Gmail login OK\n")

    for i, r in enumerate(to_send, 1):
        em    = r["email"].strip()
        name  = r["to_name"].strip() or "Member"
        house = r["house"].strip() or "-"
        lane  = r["lane"].strip() or "-"
        rtype = r.get("recipient_type","Owner")
        src   = r.get("source","")

        body = template.replace("{{NAME}}", name) \
                       .replace("{{HOUSE}}", house) \
                       .replace("{{LANE}}", lane)

        msg = MIMEMultipart("mixed")
        msg["From"]     = f"SCRWA Secretary <{GMAIL_USER}>"
        msg["To"]       = em
        msg["Subject"]  = SUBJECT
        msg["Reply-To"] = GMAIL_USER

        alt = MIMEMultipart("alternative")
        alt.attach(MIMEText(body, "html", "utf-8"))
        msg.attach(alt)

        ics_part = MIMEBase("text","calendar",method="REQUEST",
                            name="SCRWA_AdhocMeeting_14Jun2026.ics")
        ics_part.set_payload(ics_data)
        encoders.encode_base64(ics_part)
        ics_part.add_header("Content-Disposition","attachment",
                            filename="SCRWA_AdhocMeeting_14Jun2026.ics")
        msg.attach(ics_part)

        try:
            srv.sendmail(GMAIL_USER, em, msg.as_string())
            sent += 1
            print(f"[{i:3d}/{len(to_send)}] ✅ {rtype:<28} {name:<32} {em}")
            time.sleep(0.5)
        except Exception as e:
            failed.append((em, name, str(e)))
            print(f"[{i:3d}/{len(to_send)}] ❌ FAILED {name} <{em}>: {e}")

ts = datetime.now().strftime("%Y%m%d_%H%M")
log = os.path.join(BASE_DIR, f"send_log_{ts}.txt")
with open(log,"w",encoding="utf-8") as f:
    f.write(f"Sent:{sent}  Failed:{len(failed)}\n")
    for em,nm,err in failed:
        f.write(f"FAILED {nm} <{em}>: {err}\n")

print(f"\n✅ Sent: {sent}   ❌ Failed: {len(failed)}   Log: {log}")
