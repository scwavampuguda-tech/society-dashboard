import sys, re

html = open(r'C:\Users\parkundu\Desktop\Society_SCRWA\Society_Files\HTML_Portals\SCRWA_Standalone_Report.html', encoding='utf-8').read()
lines = html.splitlines()

# ── PDF ground truth ──────────────────────────────────────────────────────────
# Lane pills: (paid_count, partial_count, unpaid_count, nodata_count)  '---'=none
PDF_LANE_PILLS = {
    'Lane 01': ('---','---',1,2),
    'Lane 02': (1,4,7,2),
    'Lane 03': ('---','---',8,5),
    'Lane 04': ('---',3,2,4),
    'Lane 05': ('---',2,3,'---'),
    'Lane 06': ('---',3,5,1),
    'Lane 07': ('---','---',2,'---'),
    'Lane 08': ('---',1,8,1),
    'Lane 09': (2,4,7,2),
    'Lane 10': ('---',1,6,'---'),
    'Lane 11': (8,11,19,7),
    'Lane 12': (2,8,17,11),
    'Lane 13': (5,7,13,5),
    'Lane 14': ('---',2,11,4),
    'Lane 15': ('---','---',7,1),
    'Lane 16': ('---','---',3,2),
}

# PDF summary table: (props, billed, paid, due, paid_ct, part_ct, due_ct, na_ct)
PDF_SUMMARY = {
    'Lane 01': (3,4500,0,4500,'---','---',1,2),
    'Lane 02': (14,49500,16500,33000,1,4,7,2),
    'Lane 03': (13,36000,0,36000,'---','---',8,5),
    'Lane 04': (9,22500,10000,12500,'---',3,2,4),
    'Lane 05': (5,22500,8000,14500,'---',2,3,'---'),
    'Lane 06': (9,36000,4000,32000,'---',3,5,1),
    'Lane 07': (2,9000,0,9000,'---','---',2,'---'),
    'Lane 08': (10,40500,3000,37500,'---',1,8,1),
    'Lane 09': (15,58500,13501,44999,2,4,7,2),
    'Lane 10': (7,31500,1000,30500,'---',1,6,'---'),
    'Lane 11': (45,162000,68500,93500,8,11,19,7),
    'Lane 12': (38,116500,21500,95000,2,8,17,11),
    'Lane 13': (30,108000,33500,74500,5,7,13,5),
    'Lane 14': (17,58500,2000,56500,'---',2,11,4),
    'Lane 15': (8,27000,0,27000,'---','---',7,1),
    'Lane 16': (5,13500,0,13500,'---','---',3,2),
}

issues = []

# ── 1. Check lane header pill counts ────────────────────────────────────────
for i, line in enumerate(lines):
    for lk, (ppd,ppt,ppu,pna) in PDF_LANE_PILLS.items():
        tag = f'&#127968; {lk} &#8212;'
        if tag in line:
            ctx = line + (lines[i+1] if i+1 < len(lines) else '')
            def chk(sym, val, label):
                if val == '---':
                    # should NOT appear
                    if f'{sym}; ' in ctx and label in ctx:
                        issues.append(f'LANE HDR {lk}: {label} should be absent but found')
                else:
                    if f'{sym}; {val} {label}' not in ctx:
                        m = re.search(sym[1:]+r'; (\S+) '+label, ctx)
                        got = m.group(1) if m else 'MISSING'
                        issues.append(f'LANE HDR {lk}: {label} expected={val} got={got}')
            chk('&#10003', ppd, 'Paid')
            chk('&#9670',  ppt, 'Partial')
            chk('&#10005', ppu, 'Unpaid')

# ── 2. Check summary table rows ──────────────────────────────────────────────
def find_summary_rows():
    in_summary = False
    rows = []
    for line in lines:
        if 'Lane-wise Summary' in line: in_summary = True
        if in_summary and 'Lane-wise Detail' in line: break
        if in_summary and '<tr><td>' in line and 'Lane' in line:
            rows.append(line)
    return rows

sum_rows = find_summary_rows()
for row_html in sum_rows:
    tds = re.findall(r'<td[^>]*>(.*?)</td>', row_html)
    if len(tds) < 11: continue
    lane_raw = re.sub(r'<.*?>','', tds[0]).strip()
    lk = None
    for k in PDF_SUMMARY:
        if k.replace(' ','') in lane_raw.replace(' ',''):
            lk = k; break
    if not lk: continue
    pdf = PDF_SUMMARY[lk]
    # tds: [lane, props, billed, paid, due, advance, paid_ct, part_ct, due_ct, exc, na]
    def clean(s): return re.sub(r'&#\d+;|[₹,]','',s).strip()
    try:
        html_props = int(clean(tds[1]))
        html_billed = int(clean(tds[2]).replace('—','0'))
        html_paid   = int(clean(tds[3]).replace('—','0'))
        html_due    = int(clean(tds[4]).replace('—','0'))
        html_pdc = clean(tds[6]).replace('—','---')
        html_ptc = clean(tds[7]).replace('—','---')
        html_puc = clean(tds[8]).replace('—','---')
        html_nac = clean(tds[10]).replace('—','---')
        errs = []
        if html_props != pdf[0]: errs.append(f'props: html={html_props} pdf={pdf[0]}')
        if html_billed != pdf[1]: errs.append(f'billed: html={html_billed} pdf={pdf[1]}')
        if html_paid != pdf[2]: errs.append(f'paid: html={html_paid} pdf={pdf[2]}')
        if html_due != pdf[3]: errs.append(f'due: html={html_due} pdf={pdf[3]}')
        if str(html_pdc) != str(pdf[4]): errs.append(f'paid_ct: html={html_pdc} pdf={pdf[4]}')
        if str(html_ptc) != str(pdf[5]): errs.append(f'part_ct: html={html_ptc} pdf={pdf[5]}')
        if str(html_puc) != str(pdf[6]): errs.append(f'due_ct: html={html_puc} pdf={pdf[6]}')
        if str(html_nac) != str(pdf[7]): errs.append(f'na_ct: html={html_nac} pdf={pdf[7]}')
        if errs:
            for e in errs: issues.append(f'SUMMARY {lk}: {e}')
    except Exception as ex:
        issues.append(f'SUMMARY {lk}: parse error {ex}')

# ── Report ───────────────────────────────────────────────────────────────────
print(f'\n{"="*65}')
print(f'HTML vs PDF RECONCILIATION')
print(f'{"="*65}')
print(f'Issues found: {len(issues)}')
print(f'{"="*65}\n')
for iss in issues:
    print(iss)
if not issues:
    print('PERFECT MATCH — HTML is fully consistent with PDF.')
