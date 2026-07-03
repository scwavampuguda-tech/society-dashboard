"""Fix Collection tab stretching — proper full-bleed dark bg + constrained inner content"""
PATH = r'C:\Users\parkundu\Desktop\Society_SCRWA\Society_Files\Scripts\SCRWA_CashFlow_Live.html'
f = open(PATH, 'r', encoding='utf-8').read()

# ── Fix 1: Body needs dark bg when collection tab is active ─────────────────
# Instead of fighting with tab-content constraints, use a simpler approach:
# Keep tab-content max-width:1400px but make the collection tab overflow its
# container by using negative margins + full-width padding trick

# Remove the previous override attempt
f = f.replace(
    '#tab-collection.tab-content{padding:0;max-width:100%;background:#0f1923;min-height:calc(100vh - 110px);}',
    ''
)

# ── Fix 2: Proper CSS for #tab-collection ───────────────────────────────────
OLD_COL_CSS = '#tab-collection { color: #e0e8f0; }\n#tab-collection .col-inner {\n  max-width: 1400px;\n  margin: 0 auto;\n  padding: 24px 32px;\n}'

NEW_COL_CSS = '''/* Collection tab — full-bleed dark bg, constrained inner */
#tab-collection {
  color: #e0e8f0;
  /* Break out of tab-content max-width to go full bleed */
  margin-left: calc(-50vw + 50%);
  margin-right: calc(-50vw + 50%);
  width: 100vw;
  background: #0f1923;
  min-height: calc(100vh - 110px);
  padding: 0;
}
#tab-collection .col-inner {
  max-width: 1360px;
  margin: 0 auto;
  padding: 24px 32px;
}
.col-chart-box {
  overflow: hidden;
  min-width: 0;
}
.col-chart-box canvas {
  display: block;
  max-width: 100%;
}'''

f = f.replace(OLD_COL_CSS, NEW_COL_CSS)

# ── Fix 3: Also fix tab-content itself — remove padding so no offset ─────────
# tab-content padding:20px causes the negative margin trick to misalign
# Solution: give tab-collection padding:0 at tab-content level too
OLD_TC = '.tab-content{display:none;padding:20px;max-width:1400px;margin:0 auto;}'
NEW_TC = '.tab-content{display:none;padding:20px;max-width:1400px;margin:0 auto;}\n#tab-collection.tab-content{padding:0;}'

f = f.replace(OLD_TC, NEW_TC)

# ── Verify ───────────────────────────────────────────────────────────────────
print('Checks:')
print('  full-bleed margin trick:', 'calc(-50vw + 50%)' in f)
print('  col-inner max-width:', '1360px' in f)
print('  overflow hidden on chart-box:', 'overflow: hidden' in f)
print('  tab-content override:', '#tab-collection.tab-content{padding:0;}' in f)
print('  file size:', len(f), 'bytes')

open(PATH, 'w', encoding='utf-8').write(f)
print('Saved.')
