import re
from collections import Counter

with open(r'C:\Users\parkundu\Desktop\Society_SCRWA\Society_Files\HTML_Portals\SCRWA_Standalone_Report.html', encoding='utf-8') as f:
    content = f.read()

sizes   = re.findall(r'font-size:\s*[\d.]+\w+', content)
weights = re.findall(r'font-weight:\s*\w+', content)
families= re.findall(r'font-family:[^;}"]+', content)

print('=== FONT SIZES ===')
for s,c in Counter(sizes).most_common():
    print(f'  {s:<30} x{c}')

print('\n=== FONT WEIGHTS ===')
for s,c in Counter(weights).most_common():
    print(f'  {s:<30} x{c}')

print('\n=== FONT FAMILIES ===')
for f in set(families):
    print(f'  {f.strip()}')
