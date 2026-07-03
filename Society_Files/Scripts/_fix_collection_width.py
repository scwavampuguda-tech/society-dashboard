"""Fix Collection tab stretching — add max-width inner wrapper + full-bleed dark bg"""
import re

PATH = r'C:\Users\parkundu\Desktop\Society_SCRWA\Society_Files\Scripts\SCRWA_CashFlow_Live.html'
f = open(PATH, 'r', encoding='utf-8').read()

# ── Step 1: Override tab-content for collection to be full-width ─────────────
# Current: .tab-content{display:none;padding:20px;max-width:1400px;margin:0 auto;}
# Add override right after so collection tab can go full-bleed for the dark bg

OLD_TAB = '.tab-content{display:none;padding:20px;max-width:1400px;margin:0 auto;}'
NEW_TAB = (
    '.tab-content{display:none;padding:20px;max-width:1400px;margin:0 auto;}\n'
    '#tab-collection.tab-content{'
    'padding:0;max-width:100%;'
    'background:#0f1923;'
    'min-height:calc(100vh - 110px);'
    '}'
)
f = f.replace(OLD_TAB, NEW_TAB)
print('Step1 - tab override added:', '#tab-collection.tab-content' in f)

# ── Step 2: Remove old duplicate #tab-collection CSS block ───────────────────
# It might have various forms — find and clean it
f = re.sub(
    r'#tab-collection \{[^}]*background[^}]*\}',
    '#tab-collection { color: #e0e8f0; }',
    f
)
print('Step2 - cleaned dup #tab-collection rule')

# ── Step 3: col-inner CSS – ensure it exists ─────────────────────────────────
if '#tab-collection .col-inner' not in f:
    f = f.replace(
        '#tab-collection { color: #e0e8f0; }',
        '#tab-collection { color: #e0e8f0; }\n'
        '#tab-collection .col-inner { max-width:1400px; margin:0 auto; padding:24px 32px; }'
    )
print('Step3 - col-inner CSS present:', '#tab-collection .col-inner' in f)

# ── Step 4: Wrap collection tab HTML content in col-inner ────────────────────
# Find the opening of tab-collection div and add col-inner wrapper
if '<div class="col-inner">' not in f:
    # Insert col-inner right after the tab-collection opening div
    f = f.replace(
        '<div class="tab-content" id="tab-collection">',
        '<div class="tab-content" id="tab-collection"><div class="col-inner">'
    )
    print('Step4 - col-inner open tag inserted:', f.count('<div class="col-inner">'))

    # Close col-inner before the closing tab div
    # The footer is the last element, find its closing </div> which closes tab-collection
    # Pattern: col-footer div + then </div> which closes tab-collection
    f = re.sub(
        r'(<div class="col-footer">.*?</div>)\s*\n(\s*</div>\s*\n\s*<!-- TAB: MONTHLY)',
        r'\1\n  </div><!-- /col-inner -->\n\2',
        f,
        flags=re.DOTALL
    )
    print('Step4 - col-inner close tag inserted:', '</div><!-- /col-inner -->' in f)
else:
    print('Step4 - col-inner already present, skipped')

# ── Verify ───────────────────────────────────────────────────────────────────
print('\nFINAL CHECKS:')
print('  col-inner open tags:', f.count('<div class="col-inner">'))
print('  col-inner CSS:', '#tab-collection .col-inner' in f)
print('  full-bleed override:', '#tab-collection.tab-content' in f)
print('  file size:', len(f), 'bytes')

open(PATH, 'w', encoding='utf-8').write(f)
print('\nFile saved.')
