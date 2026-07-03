PATH = r'C:\Users\parkundu\Desktop\Society_SCRWA\Society_Files\Scripts\SCRWA_Dashboard_v2.html'
f = open(PATH, 'r', encoding='utf-8').read()

# Fix 1: Hide loader div by default (was showing over login screen)
f = f.replace('<div id="loader">', '<div id="loader" style="display:none">')

# Fix 2: Make sure setLoader sets display:flex
f = f.replace(
    "function setLoader(msg) { document.getElementById('loaderMsg').textContent=msg; document.getElementById('loader').style.display='flex'; }",
    "function setLoader(msg) { document.getElementById('loaderMsg').textContent=msg||'Loading...'; document.getElementById('loader').style.display='flex'; }"
)

print('loader hidden:', '<div id="loader" style="display:none">' in f)
print('setLoader ok:', "style.display='flex'" in f)
print('file size:', len(f))

open(PATH, 'w', encoding='utf-8').write(f)
print('Saved.')
