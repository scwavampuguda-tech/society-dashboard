"""
╔══════════════════════════════════════════════════════════════╗
║         SCRWA — Society Meeting Invite Sender                ║
║         Senior Citizens Residential Welfare Association      ║
║         Vampuguda, Hyderabad                                 ║
╠══════════════════════════════════════════════════════════════╣
║  HOW TO USE FOR A NEW MEETING:                               ║
║  1. Edit the ── MEETING CONFIG ── section below              ║
║  2. Update the CSV file path if it changed                   ║
║  3. Run:  python scrwa_invite_sender.py                      ║
╚══════════════════════════════════════════════════════════════╝
"""

import smtplib
import csv
import os
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.mime.base import MIMEBase
from email import encoders
from datetime import datetime
import time

# ════════════════════════════════════════════════════════════
#  ── MEETING CONFIG ── Edit this section for each meeting ──
# ════════════════════════════════════════════════════════════

MEETING = {
    # Meeting basics
    "title_en"   : "Adhoc Society Meeting",
    "title_te"   : "అడ్హాక్ సొసైటీ మీటింగ్",

    # Date & Time  (use IST — India Standard Time)
    "date_en"    : "Sunday, 14th June 2026",
    "date_te"    : "జూన్ 14, 2026 (ఆదివారం)",
    "time_en"    : "9:00 AM",
    "time_te"    : "ఉదయం 9:00 గంటలకు",

    # ICS datetime  (YYYYMMDDTHHMMSS  in IST)
    "ics_start"  : "20260614T090000",   # ← Change this
    "ics_end"    : "20260614T103000",   # ← Assumed 1.5 hrs

    # Venue
    "venue_en"   : "Poleramma Temple, Plot Nos. 121 & 122",
    "venue_te"   : "పోలేరమ్మ ఆలయం, ప్లాట్ నం. 121 & 122",

    # Agenda
    "agenda_en"  : "Focused discussion will be held on pending issues, including drainage works and society development.",
    "agenda_te"  : "డ్రైనేజ్ పనులు మరియు సొసైటీ అభివృద్ధి అంశాలపై సమిష్టి చర్చలు జరుగుతాయి.",

    # Reminders before meeting start (in minutes)
    # Default: 7:00 AM, 8:00 AM, 8:30 AM, 8:45 AM, 9:00 AM (for 9 AM meeting)
    "reminders_min" : [120, 60, 30, 15, 0],

    # ICS filename
    "ics_filename": "SCRWA_Meeting_14June2026.ics",   # ← Change date each time
}

# ════════════════════════════════════════════════════════════
#  ── SENDER CONFIG ── (rarely changes)
# ════════════════════════════════════════════════════════════

SENDER = {
    "email"      : "scwa.vampuguda@gmail.com",
    "app_password": "ohlt xehv upmb gexi",    # Gmail App Password
    "name"       : "SCRWA",
    "org_en"     : "Senior Citizens Residential Welfare Association (SCRWA)",
    "org_te"     : "సీనియర్ సిటిజన్స్ రెసిడెన్షియల్ వెల్ఫేర్ అసోసియేషన్ (SCRWA)",
}

# ════════════════════════════════════════════════════════════
#  ── FILE PATHS ──
# ════════════════════════════════════════════════════════════

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
PARENT   = os.path.dirname(BASE_DIR)

CSV_FILE = os.path.join(PARENT, "SCRWA_MailMerge_List.csv")
LOG_DIR  = os.path.join(BASE_DIR, "logs")
os.makedirs(LOG_DIR, exist_ok=True)

LOG_FILE = os.path.join(
    LOG_DIR,
    f"send_log_{datetime.now().strftime('%Y%m%d_%H%M%S')}.txt"
)


# ════════════════════════════════════════════════════════════
#  BUILD ICS CALENDAR INVITE
# ════════════════════════════════════════════════════════════

def build_ics(name: str, email: str) -> str:
    uid = f"scrwa-{MEETING['ics_start'][:8]}-{name.replace(' ','').replace('&','and')[:20]}@scrwa"

    alarm_blocks = ""
    meeting_hour = int(MEETING['ics_start'][9:11])
    meeting_min  = int(MEETING['ics_start'][11:13])
    total_mins   = meeting_hour * 60 + meeting_min

    for offset in MEETING["reminders_min"]:
        remind_total = total_mins - offset
        rh = remind_total // 60
        rm = remind_total % 60
        if offset == 0:
            label = f"Meeting Starting NOW — {MEETING['time_en']} 🔔"
        else:
            label = f"Reminder — Meeting at {MEETING['time_en']} ({rh:02d}:{rm:02d} AM now)"
        alarm_blocks += f"""BEGIN:VALARM
TRIGGER:-PT{offset}M
ACTION:DISPLAY
DESCRIPTION:{label}
END:VALARM
"""

    ics = f"""BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//SCRWA//Meeting Invite//EN
CALSCALE:GREGORIAN
METHOD:REQUEST
BEGIN:VEVENT
UID:{uid}
SUMMARY:📢 {MEETING['title_en']} – SCRWA
DESCRIPTION:Dear {name}\\n{MEETING['agenda_en']}\\nYour presence is important.\\n\\n— {SENDER['org_en']}
LOCATION:{MEETING['venue_en']}
DTSTART;TZID=Asia/Kolkata:{MEETING['ics_start']}
DTEND;TZID=Asia/Kolkata:{MEETING['ics_end']}
DTSTAMP:{datetime.utcnow().strftime('%Y%m%dT%H%M%SZ')}
ORGANIZER;CN={SENDER['name']}:MAILTO:{SENDER['email']}
ATTENDEE;CN={name};RSVP=TRUE:MAILTO:{email}
STATUS:CONFIRMED
SEQUENCE:0
{alarm_blocks}END:VEVENT
END:VCALENDAR"""
    return ics


# ════════════════════════════════════════════════════════════
#  BUILD EMAIL HTML BODY
# ════════════════════════════════════════════════════════════

def build_email_body(name: str, house: str, is_proxy: bool) -> str:
    role = "Proxy Representative" if is_proxy else "Owner"
    reminder_times = "7:00 AM, 8:00 AM, 8:30 AM, 8:45 AM and 9:00 AM"

    html = f"""
<html>
<body style="font-family:Arial,sans-serif;font-size:14px;color:#222;max-width:620px;margin:0 auto;">

<!-- HEADER -->
<div style="background:#1a5276;color:white;padding:16px 20px;border-radius:8px 8px 0 0;">
  <h2 style="margin:0;font-size:18px;">📢 {MEETING['title_en']}</h2>
  <p style="margin:4px 0 0;font-size:13px;opacity:0.85;">{SENDER['org_en']}</p>
</div>

<!-- BODY -->
<div style="background:#fafafa;padding:20px;border:1px solid #ddd;border-top:0;border-radius:0 0 8px 8px;">

<p>Dear <strong>{name}</strong> &nbsp;<span style="color:#666;font-size:13px;">({role} — House: {house})</span></p>

<p>This is a kind reminder to attend the <strong>{MEETING['title_en']}</strong>:</p>

<table style="border-collapse:collapse;background:white;border:1px solid #e0e0e0;border-radius:6px;width:100%;margin:12px 0;">
  <tr style="background:#eaf4fb;">
    <td style="padding:10px 16px;font-weight:bold;width:40%;">🗓️ Date &amp; Time</td>
    <td style="padding:10px 16px;"><strong>{MEETING['date_en']} at {MEETING['time_en']}</strong></td>
  </tr>
  <tr>
    <td style="padding:10px 16px;font-weight:bold;">📍 Venue</td>
    <td style="padding:10px 16px;">{MEETING['venue_en']}</td>
  </tr>
</table>

<p>👉 {MEETING['agenda_en']}<br>
<strong>Your presence is important for collective decisions.</strong></p>

<div style="background:#fff8e1;border-left:4px solid #f39c12;padding:10px 16px;margin:16px 0;border-radius:4px;">
  📅 <strong>Calendar invite (.ics) is attached</strong> — click it to block your calendar automatically.<br>
  ⏰ You will receive reminders at: <strong>{reminder_times}</strong>
</div>

<hr style="border:0;border-top:1px solid #ddd;margin:20px 0;">

<!-- TELUGU SECTION -->
<p style="color:#444;"><strong>తెలుగు వెర్షన్</strong></p>
<p style="color:#555;">ప్రియమైన <strong>{name}</strong> గారికి,</p>
<p style="color:#555;">{MEETING['title_te']} కు గుర్తు చేస్తున్నాము:</p>
<table style="border-collapse:collapse;background:white;border:1px solid #e0e0e0;border-radius:6px;width:100%;margin:8px 0;">
  <tr style="background:#f0faf0;">
    <td style="padding:8px 16px;font-weight:bold;width:40%;">🗓️ తేదీ &amp; సమయం</td>
    <td style="padding:8px 16px;"><strong>{MEETING['date_te']} {MEETING['time_te']}</strong></td>
  </tr>
  <tr>
    <td style="padding:8px 16px;font-weight:bold;">📍 స్థలం</td>
    <td style="padding:8px 16px;">{MEETING['venue_te']}</td>
  </tr>
</table>
<p style="color:#555;">👉 {MEETING['agenda_te']}<br>మీ హాజరు చాలా అవసరం.</p>

<hr style="border:0;border-top:1px solid #ddd;margin:20px 0;">

<p style="font-size:12px;color:#999;">
  — {SENDER['org_en']}<br>
  Vampuguda &nbsp;|&nbsp; {SENDER['email']}
</p>

</div>
</body>
</html>"""
    return html


# ════════════════════════════════════════════════════════════
#  MAIN — SEND ALL INVITES
# ════════════════════════════════════════════════════════════

def send_invites():
    sent    = []
    skipped = []
    failed  = []

    # ── Load CSV ──────────────────────────────
    members = []
    with open(CSV_FILE, encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            status = row.get("status", "").strip()
            email  = row.get("email", "").strip()
            if "Active" in status and email:
                members.append(row)
            else:
                skipped.append(f"{row.get('name','?')} | {status or 'No email'}")

    print(f"\n  📋 Active members to email : {len(members)}")
    print(f"  ⏭️  Skipped (Exited / no email) : {len(skipped)}")
    print("-" * 60)

    # ── Connect SMTP ──────────────────────────
    try:
        server = smtplib.SMTP_SSL("smtp.gmail.com", 465)
        server.login(SENDER["email"], SENDER["app_password"])
        print("  🔐 Gmail SMTP — Connected ✅\n")
    except Exception as e:
        print(f"\n  ❌ SMTP Connection Failed: {e}")
        print("  ➡️  Check App Password and internet connection.")
        return

    # ── Send loop ─────────────────────────────
    for i, row in enumerate(members, 1):
        name     = row.get("name", "Member").strip()
        email    = row.get("email", "").strip()
        house    = row.get("house", "").strip()
        is_proxy = str(row.get("is_proxy_email", "False")).strip().lower() == "true"
        role_tag = "Proxy" if is_proxy else "Owner"

        try:
            msg = MIMEMultipart("mixed")
            msg["From"]     = f"{SENDER['name']} <{SENDER['email']}>"
            msg["To"]       = email
            msg["Subject"]  = (
                f"📢 [Reminder] {MEETING['title_en']} — "
                f"{MEETING['date_en']} | {MEETING['time_en']} | SCRWA"
            )
            msg["Reply-To"] = SENDER["email"]

            # HTML body
            msg.attach(MIMEText(build_email_body(name, house, is_proxy), "html", "utf-8"))

            # ICS attachment
            ics_content = build_ics(name, email)
            ics_part = MIMEBase("text", "calendar", method="REQUEST", charset="UTF-8")
            ics_part.set_payload(ics_content.encode("utf-8"))
            encoders.encode_base64(ics_part)
            ics_part.add_header(
                "Content-Disposition", "attachment",
                filename=MEETING["ics_filename"]
            )
            msg.attach(ics_part)

            server.sendmail(SENDER["email"], email, msg.as_string())
            sent.append(f"{name} [{role_tag}] → {email}")
            print(f"  ✅ [{i:02d}/{len(members)}] {name} [{role_tag}] → {email}")
            time.sleep(1.0)

        except Exception as e:
            failed.append(f"{name} → {email} | Error: {e}")
            print(f"  ❌ [{i:02d}] FAILED: {name} — {e}")

    server.quit()

    # ── Summary ───────────────────────────────
    print("\n" + "=" * 60)
    print("  📬  SEND SUMMARY")
    print("=" * 60)
    print(f"  ✅ Emails Sent    : {len(sent)}")
    print(f"  ⏭️  Skipped        : {len(skipped)}")
    print(f"  ❌ Failed         : {len(failed)}")
    print("=" * 60)

    if failed:
        print("\n  Failed deliveries:")
        for f_ in failed:
            print(f"    ❌ {f_}")

    # ── Save log ──────────────────────────────
    with open(LOG_FILE, "w", encoding="utf-8") as log:
        log.write("SCRWA Society Meeting — Email Send Log\n")
        log.write(f"Meeting : {MEETING['title_en']}\n")
        log.write(f"Date    : {MEETING['date_en']} at {MEETING['time_en']}\n")
        log.write(f"Run at  : {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n")
        log.write("=" * 60 + "\n\n")
        log.write(f"SENT ({len(sent)}):\n")
        for s in sent: log.write(f"  ✅ {s}\n")
        log.write(f"\nSKIPPED ({len(skipped)}):\n")
        for s in skipped: log.write(f"  ⏭️  {s}\n")
        if failed:
            log.write(f"\nFAILED ({len(failed)}):\n")
            for f_ in failed: log.write(f"  ❌ {f_}\n")

    print(f"\n  📄 Log saved → {LOG_FILE}\n")


# ════════════════════════════════════════════════════════════
#  ENTRY POINT
# ════════════════════════════════════════════════════════════

if __name__ == "__main__":
    print("=" * 60)
    print("  🚀  SCRWA MEETING INVITE SENDER")
    print(f"  Meeting : {MEETING['title_en']}")
    print(f"  Date    : {MEETING['date_en']}")
    print(f"  Time    : {MEETING['time_en']}")
    print(f"  Venue   : {MEETING['venue_en']}")
    print(f"  Sender  : {SENDER['email']}")
    print("=" * 60)
    send_invites()
