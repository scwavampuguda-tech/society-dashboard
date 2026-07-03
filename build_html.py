import json, sys, os

raw = json.load(open(r'C:\Users\parkundu\Desktop\Society_SCRWA\live_data.json', encoding='utf-8'))

LANES = [
    ("Lane 01", "Plot 001 to 003",                    ["118","052","116"]),
    ("Lane 02", "Plot 004 to 013",                    ["106","077","078","101","013","171","230","082","084","035","109","098","108","061"]),
    ("Lane 03", "Plot 014 to 019 and 041 to 047",     ["104","085","086","088","182","126","169","167","176","100","180","178","179"]),
    ("Lane 04", "Plot 020 to 025",                    ["099","215","189","009","010","223","208","220","192"]),
    ("Lane 05", "Plot 027 to 031",                    ["163","011","012","193","170"]),
    ("Lane 06", "Plot 032 to 040",                    ["187","188","174","173","177","221","168","128","127"]),
    ("Lane 07", "Plot 048 to 049",                    ["136","194"]),
    ("Lane 08", "Plot 050 to 058",                    ["051","032","092","158","114","115","024","133","162","184"]),
    ("Lane 09", "Plot 059 to 070",                    ["185","186","134","030","207","057","206","198","199","150","007","212","197","129","130","232"]),
    ("Lane 10", "Plot 071 to 077",                    ["131","132","097","008","159","137","138"]),
    ("Lane 11", "Plot 078 to 107",                    ["033","164","117","190","216","038","039","079","029","042","059","015","183","139","065","066","017","166","165","045","044","096","145","211","146","219","121","122","123","049","225","070","227","068","074","019","001","025","034","080","083","014","105","053","144"]),
    ("Lane 12", "Plot 108 to 133",                    ["062","210","063","064","175","140","071","026","209","028","027","037","229","067","048","069","022","125","120","213","214","020","217","060","157","072","073","161","043","006","021","004","003","119","075","002","218","087","231"]),
    ("Lane 13", "Plot 134 to 157",                    ["055","047","056","005","081","202","224","018","154","124","135","191","036","095","228","093","023","107","031","196","050","089","090","091","040","054","102","160","076","016"]),
    ("Lane 14", "Plot 158 to 174",                    ["094","172","222","058","156","103","141","142","200","181","201","111","110","113","112","155","195"]),
    ("Lane 15", "Plot 175 to 178",                    ["152","226","151","148","046","149","153","147"]),
    ("Lane 16", "Plot 179 to 182",                    ["203","041","204","205","143"]),
]


# ── LANE LABELS for the summary table ────────────────────────────────────────
LANE_LABELS = [
    "Lane 01 (Plot 001-003)",
    "Lane 02 (Plot 004-013)",
    "Lane 03 (Plot 014-019 &amp; Plot 041-047)",
    "Lane 04 (Plot 020-025)",
    "Lane 05 (Plot 027-031)",
    "Lane 06 (Plot 032-040)",
    "Lane 07 (Plot 048-049)",
    "Lane 08 (Plot 050-058)",
    "Lane 09 (Plot 059-070)",
    "Lane 10 (Plot 071-077)",
    "Lane 11 (Plot 078-107)",
    "Lane 12 (Plot 108-133)",
    "Lane 13 (Plot 134-157)",
    "Lane 14 (Plot 158-174)",
    "Lane 15 (Plot 175-178)",
    "Lane 16 (Plot 179-182)",
]

def _pay_status(prop):
    b = sum(i.get('billAmount',0) or 0 for i in prop.get('invoices',[]))
    p = sum(i.get('paidAmount',0)  or 0 for i in prop.get('invoices',[]))
    d = b - p
    if b == 0:   return "nodata"
    elif d <= 0: return "paid"
    elif p > 0:  return "partial"
    else:        return "unpaid"

def _build_summary():
    rows = []
    for li, (lane_name, lane_plots, prop_ids) in enumerate(LANES):
        b_tot = p_tot = 0
        pd_ct = pt_ct = pu_ct = na_ct = 0
        for pid in prop_ids:
            prop = raw.get(pid)
            if not prop:
                continue
            b = sum(i.get('billAmount',0) or 0 for i in prop.get('invoices',[]))
            p = sum(i.get('paidAmount',0)  or 0 for i in prop.get('invoices',[]))
            b_tot += b; p_tot += p
            st = _pay_status(prop)
            pst = prop.get('status','')
            if b == 0 and ('Inactive' in pst or 'Exited' in pst):
                st = 'nodata'
            if   st == 'paid':    pd_ct += 1
            elif st == 'partial': pt_ct += 1
            elif st == 'unpaid':  pu_ct += 1
            else:                 na_ct += 1
        rows.append((
            LANE_LABELS[li],
            len(prop_ids),
            b_tot,
            p_tot,
            b_tot - p_tot,
            pd_ct if pd_ct else "—",
            pt_ct if pt_ct else "—",
            pu_ct if pu_ct else "—",
            "—",
            na_ct if na_ct else "—",
        ))
    return rows

SUMMARY = _build_summary()

def get_amounts(prop):
    b = sum(i.get('billAmount',0) or 0 for i in prop.get('invoices',[]))
    p = sum(i.get('paidAmount',0) or 0 for i in prop.get('invoices',[]))
    d = b - p
    if b == 0:   st = "nodata"
    elif d <= 0: st = "paid"
    elif p > 0:  st = "partial"
    else:        st = "unpaid"
    return int(b), int(p), int(d), st

def ifmt(n):
    if n == 0: return "&#8212;"
    n = int(n); s = str(n)
    if len(s) <= 3:   return f"&#8377;{s}"
    elif len(s) <= 5: return f"&#8377;{s[:-3]},{s[-3:]}"
    elif len(s) <= 7: return f"&#8377;{s[:-5]},{s[-5:-3]},{s[-3:]}"
    else:             return f"&#8377;{s[:-7]},{s[-7:-5]},{s[-5:-3]},{s[-3:]}"

def sbadge(st):
    if "Active"   in st: return '<span class="ba b-act">&#10003; Active</span>'
    if "Inactive" in st: return '<span class="ba b-ina">&#128683; Inactive</span>'
    if "Exited"   in st: return '<span class="ba b-ext">&#129523; Exited</span>'
    if "Transfer" in st: return '<span class="ba b-tra">&#128260; Transferred</span>'
    return f'<span class="ba b-ina">{st}</span>'

def pbadge(ps):
    if ps == "paid":    return '<span class="pp">&#10003; Paid</span>'
    if ps == "partial": return '<span class="pa">&#9670; Partial</span>'
    if ps == "unpaid":  return '<span class="pu">&#10005; Unpaid</span>'
    return '<span class="pn">&#8212;</span>'

OUT = r'C:\Users\parkundu\Desktop\Society_SCRWA\Society_Files\HTML_Portals\SCRWA_Standalone_Report.html'
H = []

# ════════════════════════════════════════════════════════
# HEAD + CSS
# ════════════════════════════════════════════════════════
H.append("""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>SCRWA &#8212; Lane-wise Outstanding Report</title>
<style>
/* ─── Reset ─── */
*{box-sizing:border-box;margin:0;padding:0}

/* ─── Base: single source of truth for body font ─── */
body{
  font-family:'Segoe UI',Arial,sans-serif;
  background:#f0f4f8;
  color:#1a1a2e;
  font-size:13px;
  line-height:1.5
}

/* ─── Header ─── */
.hdr{background:linear-gradient(135deg,#1a1a2e 0%,#16213e 50%,#0f3460 100%);color:#fff;padding:28px 32px 20px;text-align:center}
.hdr h1{font-size:22px;font-weight:700;letter-spacing:1px;margin-bottom:4px}
.hdr .sub{font-size:13px;font-weight:400;opacity:.85}
.hdr .meta{font-size:11px;font-weight:400;opacity:.6;margin-top:6px}

/* ─── KPI stat cards ─── */
.stats{display:flex;gap:16px;padding:20px 32px;background:#fff;border-bottom:1px solid #e2e8f0;flex-wrap:wrap;justify-content:center}
.sc{background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:14px 24px;text-align:center;min-width:140px}
.sc .v{font-size:22px;font-weight:700;line-height:1.2}
.sc .l{font-size:10px;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:.6px;margin-top:3px}

/* ─── Page sections ─── */
.sec{padding:24px 32px}
.sec-t{font-size:15px;font-weight:700;margin-bottom:14px;padding-bottom:8px;border-bottom:2px solid #e2e8f0}

/* ─── Tables: all sizes defined in CSS, zero inline overrides ─── */
table{width:100%;border-collapse:collapse;background:#fff;border-radius:10px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,.07)}
th{background:#1a3c5e;color:#fff;padding:9px 10px;text-align:left;font-size:11px;font-weight:600;letter-spacing:.3px;white-space:nowrap}
td{padding:8px 10px;border-bottom:1px solid #f1f5f9;vertical-align:middle;font-size:12px;font-weight:400}
tr:last-child td{border-bottom:none}
tbody tr:hover td{background:#f8fafc}

/* ─── Lane header rows ─── */
.lh td{background:#e8edf8;color:#1a3a6b;font-size:12px;font-weight:700;padding:9px 10px;border-top:2px solid #1a3c5e;border-bottom:1px solid #b0bdd8}
.lmeta{font-size:10px;font-weight:400;color:#555;margin-left:8px}

/* ─── Grand total ─── */
.gt td{background:#1a3c5e;color:#fff;font-size:12px;font-weight:700;padding:9px 10px}

/* ─── Cell role classes (font only, no layout) ─── */
.c-sno {font-size:11px;color:#94a3b8}
.c-pid {font-size:12px;font-weight:700;color:#1a3a6b}
.c-plot{font-size:11px;font-family:'Courier New',monospace;color:#334155}
.c-name{font-size:12px;color:#1a1a2e}
.c-amt {font-size:11px;font-family:'Courier New',monospace}
.c-dim {font-size:11px;color:#94a3b8}

/* ─── Badges: membership status ─── */
.ba{display:inline-block;padding:2px 7px;border-radius:10px;font-size:10px;font-weight:600;line-height:1.4}
.b-act{background:#dcfce7;color:#16a34a}
.b-ina{background:#fee2e2;color:#dc2626}
.b-ext{background:#fef3c7;color:#d97706}
.b-tra{background:#e0f2fe;color:#0369a1}

/* ─── Payment status labels ─── */
.pp{font-size:11px;font-weight:700;color:#16a34a}
.pa{font-size:11px;font-weight:700;color:#d97706}
.pu{font-size:11px;font-weight:700;color:#dc2626}
.pn{font-size:11px;font-weight:400;color:#94a3b8}

/* ─── Footer ─── */
.ftr{text-align:center;padding:20px;font-size:11px;color:#94a3b8;background:#fff;border-top:1px solid #e2e8f0;margin-top:24px}

/* ─── Print ─── */
@media print{
  body{background:#fff}
  .hdr{background:#1a3c5e!important;-webkit-print-color-adjust:exact;print-color-adjust:exact;padding:14px 20px}
  .stats,.sec{padding:10px 20px}
  .sc .v{font-size:16px}
  th{background:#1a3c5e!important;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  .lh td{background:#e8edf8!important;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  .gt td{background:#1a3c5e!important;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  tr{page-break-inside:avoid}
}
</style>
</head>
<body>

<div class="hdr">
  <h1>&#127963; SCRWA &#8212; Senior Citizens Residential Welfare Association</h1>
  <div class="sub">Lane-wise Outstanding Report &nbsp;|&nbsp; Vampuguda, Hyderabad</div>
  <div class="meta" id="hdr-meta">Regd. No: 2240/2006</div>
</div>
""")

import datetime
as_of      = datetime.datetime.now().strftime("%d %b %Y %I:%M %p")
prop_count = len([k for k in raw if isinstance(raw[k],dict) and "propertyID" in raw[k]])

gt_props   = sum(s[1] for s in SUMMARY)
gt_billed  = sum(s[2] for s in SUMMARY)
gt_paid    = sum(s[3] for s in SUMMARY)
gt_due     = sum(s[4] for s in SUMMARY)
gt_pd      = sum(s[5] if isinstance(s[5],int) else 0 for s in SUMMARY)
gt_pt      = sum(s[6] if isinstance(s[6],int) else 0 for s in SUMMARY)
gt_pu      = sum(s[7] if isinstance(s[7],int) else 0 for s in SUMMARY)
gt_na      = sum(s[9] if isinstance(s[9],int) else 0 for s in SUMMARY)


# Patch header meta line dynamically
H.append(f'<script>document.getElementById("hdr-meta").innerHTML = "Regd. No: 2240/2006 &nbsp;|&nbsp; {prop_count} Properties &nbsp;|&nbsp; Data as of {as_of}";</script>')

H.append(f"""
<div class="stats">
  <div class="sc"><div class="v" style="color:#7c3aed">{gt_props}</div><div class="l">Total Properties</div></div>
  <div class="sc"><div class="v" style="color:#2563eb">{ifmt(gt_billed)}</div><div class="l">Total Billed</div></div>
  <div class="sc"><div class="v" style="color:#16a34a">{ifmt(gt_paid)}</div><div class="l">Total Paid</div></div>
  <div class="sc"><div class="v" style="color:#dc2626">{ifmt(gt_due)}</div><div class="l">Total Outstanding</div></div>
  <div class="sc"><div class="v" style="color:#64748b">&#8377;0</div><div class="l">Advance / Overpaid</div></div>
</div>
<div style="text-align:right;font-size:10px;color:#888;padding:2px 8px 6px;">Data as of {as_of}</div>
""")

# ════════════════════════════════════════════════════════
# SUMMARY TABLE
# ════════════════════════════════════════════════════════
H.append("""<div class="sec">
  <div class="sec-t">&#128203; Lane-wise Summary</div>
  <table>
    <thead><tr>
      <th>Lane</th><th>Props</th><th>Billed</th><th>Paid</th><th>Due</th><th>Advance</th>
      <th>&#10003; Paid</th><th>&#9670; Part</th><th>&#10005; Due</th><th>Exc</th><th>&#8212; N/A</th>
    </tr></thead>
    <tbody>
""")
for row in SUMMARY:
    ln,pr,bi,pa,du,pd,pt,pu,ex,na = row
    H.append(f'<tr><td>{ln}</td><td>{pr}</td>')
    H.append(f'<td class="c-amt">{ifmt(bi)}</td>')
    H.append(f'<td class="c-amt{"" if pa else " c-dim"}">{ifmt(pa)}</td>')
    H.append(f'<td class="c-amt">{ifmt(du)}</td>')
    H.append(f'<td class="c-dim">&#8212;</td>')
    H.append(f'<td>{pd}</td><td>{pt}</td><td>{pu}</td><td>{ex}</td><td>{na}</td></tr>\n')

H.append(f"""    <tr class="gt">
      <td><strong>GRAND TOTAL</strong></td><td><strong>{gt_props}</strong></td>
      <td class="c-amt"><strong>{ifmt(gt_billed)}</strong></td>
      <td class="c-amt"><strong>{ifmt(gt_paid)}</strong></td>
      <td class="c-amt"><strong>{ifmt(gt_due)}</strong></td>
      <td>&#8212;</td>
      <td><strong>{gt_pd}</strong></td><td><strong>{gt_pt}</strong></td><td><strong>{gt_pu}</strong></td><td>&#8212;</td><td><strong>{gt_na}</strong></td>
    </tr>
    </tbody>
  </table>
</div>
""")

# ════════════════════════════════════════════════════════
# DETAIL TABLE
# ════════════════════════════════════════════════════════
H.append("""<div class="sec">
  <div class="sec-t">&#127968; Lane-wise Detail Report</div>
  <table>
    <thead><tr>
      <th style="width:36px">S.No</th>
      <th style="width:56px">Prop ID</th>
      <th style="width:110px">Plot No</th>
      <th>Owner Name</th>
      <th style="width:100px">Status</th>
      <th style="width:82px">Payment</th>
      <th style="width:76px">Billed</th>
      <th style="width:76px">Paid</th>
      <th style="width:76px">Due</th>
      <th style="width:66px">Advance</th>
    </tr></thead>
    <tbody>
""")

sno = 0
for li, (lane_name, lane_plots, prop_ids) in enumerate(LANES):
    s = SUMMARY[li]
    bi, pa, du = s[2], s[3], s[4]
    # SUMMARY tuple: (lane, props, billed, paid, due, paid_ct, partial_ct, unpaid_ct, exc, nodata_ct)
    #                  [0]   [1]    [2]    [3]   [4]    [5]       [6]        [7]       [8]    [9]
    paid_ct    = s[5]
    partial_ct = s[6]
    unpaid_ct  = s[7]
    nodata_ct  = s[9]
    pills = []
    if paid_ct    != "—" and paid_ct:    pills.append(f'&#10003; {paid_ct} Paid')
    if partial_ct != "—" and partial_ct: pills.append(f'&#9670; {partial_ct} Partial')
    if unpaid_ct  != "—" and unpaid_ct:  pills.append(f'&#10005; {unpaid_ct} Unpaid')
    if nodata_ct  != "—" and nodata_ct:  pills.append(f'&#8212; {nodata_ct} No Data')
    pill_str = " &nbsp;&#183;&nbsp; ".join(pills)

    H.append(f'''<tr class="lh"><td colspan="10">
      &#127968; {lane_name} &#8212; {lane_plots}
      <span class="lmeta">{s[1]} props &nbsp;&#183;&nbsp; Billed: {ifmt(bi)} &nbsp;&#183;&nbsp; Paid: {ifmt(pa)} &nbsp;&#183;&nbsp; Outstanding: {ifmt(du)}{"&nbsp;&nbsp;&nbsp;" + pill_str if pill_str else ""}</span>
    </td></tr>\n''')


    for pid in prop_ids:
        prop = raw.get(pid)
        if not prop: continue
        sno += 1
        b, p, d, ps = get_amounts(prop)
        pst = prop.get('status','')
        if b == 0 and ('Inactive' in pst or 'Exited' in pst): ps = 'nodata'

        H.append('<tr>')
        H.append(f'<td class="c-sno">{sno}</td>')
        H.append(f'<td class="c-pid">{pid}</td>')
        H.append(f'<td class="c-plot">{prop.get("plotNo","")}</td>')
        H.append(f'<td class="c-name">{prop.get("name","")}</td>')
        H.append(f'<td>{sbadge(pst)}</td>')
        H.append(f'<td>{pbadge(ps)}</td>')
        if b > 0:
            H.append(f'<td class="c-amt">{ifmt(b)}</td>')
            H.append(f'<td class="c-amt{"" if p else " c-dim"}">{ifmt(p)}</td>')
            H.append(f'<td class="c-amt{"" if d else " c-dim"}">{ifmt(d)}</td>')
        else:
            H.append('<td class="c-dim">&#8212;</td><td class="c-dim">&#8212;</td><td class="c-dim">&#8212;</td>')
        H.append('<td class="c-dim">&#8212;</td>')
        H.append('</tr>\n')

H.append(f"""    <tr class="gt">
      <td colspan="6"><strong>GRAND TOTAL</strong></td>
      <td class="c-amt"><strong>{ifmt(gt_billed)}</strong></td>
      <td class="c-amt"><strong>{ifmt(gt_paid)}</strong></td>
      <td class="c-amt"><strong>{ifmt(gt_due)}</strong></td>
      <td>&#8377;0</td>
    </tr>
    </tbody>
  </table>
</div>
""")

H.append("""
<div class="ftr">SCRWA Vampuguda &nbsp;|&nbsp; scwa.vampuguda@gmail.com &nbsp;|&nbsp; Generated from live Society records &#8212; for internal use only.</div>
</body>
</html>
""")

with open(OUT, 'w', encoding='utf-8') as f:
    f.write("".join(H))

size  = os.path.getsize(OUT)
lines = open(OUT, encoding='utf-8').read().count('\n')
sys.stdout.write(f"SUCCESS | Size: {size:,} bytes | Lines: {lines}\n")
