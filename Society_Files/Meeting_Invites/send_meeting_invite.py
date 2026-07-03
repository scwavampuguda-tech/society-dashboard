"""
SCRWA Meeting Invite Sender
Adhoc Society Meeting - 14th June 2026, 9:00 AM
Sender: scwa.vampuguda@gmail.com
"""

import smtplib
import csv
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.mime.base import MIMEBase
from email import encoders
from datetime import datetime
import time

# ─────────────────────────────────────────────
# CONFIG
# ─────────────────────────────────────────────
SENDER_EMAIL = "scwa.vampuguda@gmail.com"
APP_PASSWORD  = "ohlt xehv upmb gexi"   # Gmail App Password

CSV_FILE = r"C:\Users\parkundu\Desktop\Society_Files\Meeting_Invites\SCRWA_MailMerge_List.csv"

MEETING_TITLE = "📢 Adhoc Society Meeting – SCRWA"
MEETING_LOC   = "Poleramma Temple, Plot Nos. 121 & 122"

# ─────────────────────────────────────────────
# ICS CALENDAR INVITE (with 5 reminders)
# ─────────────────────────────────────────────
def build_ics(name: str, email: str) -> str:
    uid = f"scrwa-meeting-20260614-{name.replace(' ', '').replace('&','and')}@scrwa"
    ics = f"""BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//SCRWA//Meeting Invite//EN
CALSCALE:GREGORIAN
METHOD:REQUEST
BEGIN:VEVENT
UID:{uid}
SUMMARY:{MEETING_TITLE}
DESCRIPTION:Dear {name}\\nAdhoc Society Meeting - Drainage Works & Society Development.\\nYour presence is important.\\n\\n- SCRWA Committee
LOCATION:{MEETING_LOC}
DTSTART;TZID=Asia/Kolkata:20260614T090000
DTEND;TZID=Asia/Kolkata:20260614T103000
DTSTAMP:20260613T130000Z
ORGANIZER;CN=SCRWA:MAILTO:{SENDER_EMAIL}
ATTENDEE;CN={name};RSVP=TRUE:MAILTO:{email}
STATUS:CONFIRMED
SEQUENCE:0
BEGIN:VALARM
TRIGGER:-PT120M
ACTION:DISPLAY
DESCRIPTION:Reminder - Meeting at 9:00 AM (7:00 AM now)
END:VALARM
BEGIN:VALARM
TRIGGER:-PT60M
ACTION:DISPLAY
DESCRIPTION:Reminder - Meeting at 9:00 AM (8:00 AM now)
END:VALARM
BEGIN:VALARM
TRIGGER:-PT30M
ACTION:DISPLAY
DESCRIPTION:Reminder - Meeting in 30 mins (8:30 AM)
END:VALARM
BEGIN:VALARM
TRIGGER:-PT15M
ACTION:DISPLAY
DESCRIPTION:Reminder - Meeting in 15 mins (8:45 AM)
END:VALARM
BEGIN:VALARM
TRIGGER:PT0M
ACTION:DISPLAY
DESCRIPTION:Meeting Starting NOW - 9:00 AM
END:VALARM
END:VEVENT
END:VCALENDAR"""
    return ics

# ─────────────────────────────────────────────
# EMAIL BODY (English + Telugu)
# ─────────────────────────────────────────────
def build_email_body(name: str, house: str, is_proxy: bool) -> str:
    role = "Proxy Representative" if is_proxy else "Owner"
    html = f"""
<html><body style="font-family:Arial,sans-serif; font-size:14px; color:#222; max-width:600px;">

<p>Dear <strong>{name}</strong> <em>({role} – House No: {house})</em>,</p>

<p>This is a kind reminder to attend the <strong>Adhoc Society Meeting</strong>:</p>

<table style="border-collapse:collapse; background:#f9f9f9; border-radius:8px; padding:8px; margin:10px 0;">
  <tr><td style="padding:8px 16px;">🗓️ <strong>Date &amp; Time</strong></td>
      <td style="padding:8px 16px;"><strong>Sunday, 14th June 2026 at 9:00 AM</strong></td></tr>
  <tr><td style="padding:8px 16px;">📍 <strong>Venue</strong></td>
      <td style="padding:8px 16px;">Poleramma Temple, Plot Nos. 121 &amp; 122</td></tr>
</table>

<p>👉 Focused discussion will be held on <strong>pending issues, including drainage works and society development</strong>.<br>
Your presence is important for collective decisions.</p>

<p style="color:#1a73e8;">📅 <em>A calendar invite (.ics) is attached — please click to accept and block your calendar.<br>
⏰ Reminders will alert you at: 7:00 AM, 8:00 AM, 8:30 AM, 8:45 AM and 9:00 AM.</em></p>

<hr style="border:0; border-top:1px solid #ddd; margin:20px 0;">

<p style="color:#555;"><strong>తెలుగు వెర్షన్</strong></p>
<p style="color:#555;">ప్రియమైన <strong>{name}</strong> గారికి,</p>
<p style="color:#555;">అడ్హాక్ సొసైటీ మీటింగ్ కు గుర్తు చేస్తున్నాము:<br>
🗓️ <strong>జూన్ 14, 2026 (ఆదివారం) ఉదయం 9:00 గంటలకు</strong><br>
📍 పోలేరమ్మ ఆలయం, ప్లాట్ నం. 121 &amp; 122</p>
<p style="color:#555;">👉 డ్రైనేజ్ పనులు మరియు సొసైటీ అభివృద్ధి అంశాలపై సమిష్టి చర్చలు జరుగుతాయి.<br>
మీ హాజరు చాలా అవసరం.</p>

<hr style="border:0; border-top:1px solid #ddd; margin:20px 0;">

<p style="font-size:12px; color:#888;">
— Senior Citizens Residential Welfare Association (SCRWA)<br>
Vampuguda &nbsp;|&nbsp; scwa.vampuguda@gmail.com
</p>

</body></html>
"""
    return html

# ─────────────────────────────────────────────
# MAIN SEND LOOP
# ─────────────────────────────────────────────
def send_invites():
    sent    = []
    skipped = []
    failed  = []

    # Read CSV — Active members only
    members = []
    with open(CSV_FILE, encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            status = row.get("status", "").strip()
            email  = row.get("email", "").strip()
            if "Active" in status and email:
                members.append(row)
            else:
                skipped.append(f"{row.get('name','?')} | {status or 'no email'}")

    print(f"\n✅ Active members to email : {len(members)}")
    print(f"⏭️  Skipped (Exited/Transferred/no email): {len(skipped)}\n")
    print("-" * 55)

    # Connect to Gmail SMTP
    try:
        server = smtplib.SMTP_SSL("smtp.gmail.com", 465)
        server.login(SENDER_EMAIL, APP_PASSWORD)
        print("🔐 Gmail SMTP connected successfully!\n")
    except Exception as e:
        print(f"❌ SMTP connection failed: {e}")
        return

    for i, row in enumerate(members, 1):
        name     = row.get("name", "Member").strip()
        email    = row.get("email", "").strip()
        house    = row.get("house", "").strip()
        is_proxy = str(row.get("is_proxy_email", "False")).strip().lower() == "true"

        try:
            msg = MIMEMultipart("mixed")
            msg["From"]    = f"SCRWA <{SENDER_EMAIL}>"
            msg["To"]      = email
            msg["Subject"] = "📢 [Reminder] Adhoc Society Meeting – Sunday 14th June 2026 | 9:00 AM | SCRWA"
            msg["Reply-To"] = SENDER_EMAIL

            # Attach HTML body
            body_html = build_email_body(name, house, is_proxy)
            msg.attach(MIMEText(body_html, "html", "utf-8"))

            # Attach .ics calendar file
            ics_content = build_ics(name, email)
            ics_part = MIMEBase("text", "calendar", method="REQUEST", charset="UTF-8")
            ics_part.set_payload(ics_content.encode("utf-8"))
            encoders.encode_base64(ics_part)
            ics_part.add_header(
                "Content-Disposition", "attachment",
                filename="SCRWA_AdhocMeeting_14June2026.ics"
            )
            msg.attach(ics_part)

            server.sendmail(SENDER_EMAIL, email, msg.as_string())
            label = "Proxy" if is_proxy else "Owner"
            sent.append(f"  ✅ {name} [{label}] → {email}")
            print(f"✅ [{i:02d}/{len(members)}] {name} → {email}")
            time.sleep(1.0)  # Stay within Gmail rate limits

        except Exception as e:
            failed.append(f"  ❌ {name} → {email} | {e}")
            print(f"❌ Failed [{i}]: {name} — {e}")

    server.quit()

    # ── Final Summary ────────────────────────
    print("\n" + "="*55)
    print("📬  SCRWA MEETING INVITE — SEND SUMMARY")
    print("="*55)
    print(f"  ✅ Emails Sent    : {len(sent)}")
    print(f"  ⏭️  Skipped        : {len(skipped)}")
    print(f"  ❌ Failed         : {len(failed)}")
    print("="*55)

    if failed:
        print("\nFailed deliveries:")
        for f_ in failed:
            print(f_)

    # Save detailed log
    log_path = r"C:\Users\parkundu\Desktop\Society_Files\Meeting_Invites\send_log.txt"
    with open(log_path, "w", encoding="utf-8") as log:
        log.write("SCRWA Adhoc Meeting — Email Send Log\n")
        log.write(f"Run: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n")
        log.write("="*55 + "\n\n")
        log.write(f"SENT ({len(sent)}):\n")
        for s in sent: log.write(s + "\n")
        log.write(f"\nSKIPPED ({len(skipped)}):\n")
        for s in skipped: log.write(f"  ⏭️  {s}\n")
        if failed:
            log.write(f"\nFAILED ({len(failed)}):\n")
            for f_ in failed: log.write(f_ + "\n")

    print(f"\n📄 Full log saved → {log_path}\n")


if __name__ == "__main__":
    print("=" * 55)
    print("🚀  SCRWA MEETING INVITE SENDER")
    print("    Meeting : Adhoc Society Meeting")
    print("    Date    : Sunday, 14th June 2026")
    print("    Time    : 9:00 AM")
    print("    Venue   : Poleramma Temple, Plot 121 & 122")
    print("    Sender  : scwa.vampuguda@gmail.com")
    print("=" * 55)
    send_invites()
