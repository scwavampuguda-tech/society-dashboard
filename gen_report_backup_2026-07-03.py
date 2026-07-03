import os

OUT = r'C:\Users\parkundu\Desktop\Society_SCRWA\Society_Files\HTML_Portals\SCRWA_Standalone_Report.html'

LANES_JS = """
const LANES = [
  { name:'Lane 01', plots:'Plot 001-003',            pids:['118','052','116'] },
  { name:'Lane 02', plots:'Plot 004-013',            pids:['106','077','078','101','013','171','230','082','084','035','109','098','108','061'] },
  { name:'Lane 03', plots:'Plot 014-019 & 041-047',  pids:['104','085','086','088','182','126','169','167','176','100','180','178','179'] },
  { name:'Lane 04', plots:'Plot 020-025',            pids:['099','215','189','009','010','223','208','220','192'] },
  { name:'Lane 05', plots:'Plot 027-031',            pids:['163','011','012','193','170'] },
  { name:'Lane 06', plots:'Plot 032-040',            pids:['187','188','174','173','177','221','168','128','127'] },
  { name:'Lane 07', plots:'Plot 048-049',            pids:['136','194'] },
  { name:'Lane 08', plots:'Plot 050-058',            pids:['051','032','092','158','114','115','024','133','162','184'] },
  { name:'Lane 09', plots:'Plot 059-070',            pids:['185','186','134','030','207','057','206','198','199','150','007','212','197','129','130','232'] },
  { name:'Lane 10', plots:'Plot 071-077',            pids:['131','132','097','008','159','137','138'] },
  { name:'Lane 11', plots:'Plot 078-107',            pids:['033','164','117','190','216','038','039','079','029','042','059','015','183','139','065','066','017','166','165','045','044','096','145','211','146','219','121','122','123','049','225','070','227','068','074','019','001','025','034','080','083','014','105','053','144'] },
  { name:'Lane 12', plots:'Plot 108-133',            pids:['062','210','063','064','175','140','071','026','209','028','027','037','229','067','048','069','022','125','120','213','214','020','217','060','157','072','073','161','043','006','021','004','003','119','075','002','218','087','231'] },
  { name:'Lane 13', plots:'Plot 134-157',            pids:['055','047','056','005','081','202','224','018','154','124','135','191','036','095','228','093','023','107','031','196','050','089','090','091','040','054','102','160','076','016'] },
  { name:'Lane 14', plots:'Plot 158-174',            pids:['094','172','222','058','156','103','141','142','200','181','201','111','110','113','112','155','195'] },
  { name:'Lane 15', plots:'Plot 175-178',            pids:['152','226','151','148','046','149','153','147'] },
  { name:'Lane 16', plots:'Plot 179-182',            pids:['203','041','204','205','143'] },
];
"""

CSS = """
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Segoe UI',Arial,sans-serif;background:#f0f4f8;color:#1a1a2e;font-size:13px;line-height:1.5}
.loading-overlay{position:fixed;inset:0;background:rgba(255,255,255,.93);display:flex;align-items:center;justify-content:center;z-index:1000}
.loading-content{text-align:center}
.spinner{width:56px;height:56px;border:5px solid #e2e8f0;border-top:5px solid #1a3c5e;border-radius:50%;animation:spin 1s linear infinite;margin:0 auto 16px}
@keyframes spin{to{transform:rotate(360deg)}}
.hdr{background:linear-gradient(135deg,#1a1a2e 0%,#16213e 50%,#0f3460 100%);color:#fff;padding:24px 32px 18px;text-align:center}
.hdr h1{font-size:22px;font-weight:700;letter-spacing:.8px;margin-bottom:4px}
.hdr .sub{font-size:13px;opacity:.85}
.hdr .meta{font-size:11px;opacity:.6;margin-top:6px}
.live-pill{display:inline-block;padding:4px 14px;border-radius:20px;font-size:11px;font-weight:600;margin-top:10px}
.live-pill.loading{background:#ffc107;color:#000}
.live-pill.live{background:#28a745;color:#fff;animation:pulse 2s infinite}
.live-pill.error{background:#dc3545;color:#fff}
.live-pill.cached{background:#f59e0b;color:#fff}
.live-pill.live{background:#16a34a;color:#fff}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.7}}
.stats{display:flex;gap:0;padding:0;background:#fff;border-bottom:2px solid #e2e8f0}
.sc{flex:1;background:#f8fafc;border-right:1px solid #e2e8f0;padding:16px 10px;text-align:center}
.sc .v{font-size:24px;font-weight:700;line-height:1.2}
.sc:last-child{border-right:none}
.sc .l{font-size:10px;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:.6px;margin-top:3px}
/* ── Search toolbar ──────────────────────────────────────── */
.search-bar{position:sticky;top:0;z-index:100;background:#fff;border-bottom:1px solid #e2e8f0;padding:10px 32px;display:flex;align-items:center;gap:12px;box-shadow:0 2px 8px rgba(0,0,0,.06)}
.search-wrap{position:relative;flex:1;max-width:480px}
.search-wrap input{width:100%;padding:9px 36px 9px 38px;border:1.5px solid #cbd5e1;border-radius:22px;font-size:13px;color:#1a1a2e;background:#f8fafc;outline:none;transition:border-color .2s,box-shadow .2s}
.search-wrap input:focus{border-color:#1a3c5e;box-shadow:0 0 0 3px rgba(26,60,94,.1);background:#fff}
.search-icon{position:absolute;left:12px;top:50%;transform:translateY(-50%);color:#94a3b8;font-size:15px;pointer-events:none}
.search-clear{position:absolute;right:10px;top:50%;transform:translateY(-50%);background:none;border:none;color:#94a3b8;font-size:16px;cursor:pointer;padding:2px 4px;line-height:1;display:none}
.search-clear:hover{color:#475569}
.search-count{font-size:11px;color:#64748b;white-space:nowrap;min-width:120px}
.search-count .sc-match{font-weight:700;color:#1a3c5e}
.search-count .sc-none{font-weight:700;color:#dc2626}
.search-hint{font-size:11px;color:#94a3b8;white-space:nowrap}
/* ── No-results row ──────────────────────────────────────── */
.no-results td{text-align:center;padding:18px;color:#94a3b8;font-style:italic}
/* highlight match */
mark{background:#fef08a;color:#1a1a2e;border-radius:2px;padding:0 1px}
/* ── Floating action buttons ─────────────────────────────── */
.fab{position:fixed;right:28px;padding:12px 22px;border:none;border-radius:28px;font-size:13px;font-weight:600;cursor:pointer;transition:transform .2s,box-shadow .2s;z-index:200}
.fab:hover{transform:translateY(-2px)}
.refresh-btn{bottom:28px;background:linear-gradient(135deg,#1a3c5e,#0f3460);color:#fff;box-shadow:0 4px 18px rgba(26,60,94,.4)}
.refresh-btn:hover{box-shadow:0 7px 22px rgba(26,60,94,.5)}
.print-btn{bottom:80px;background:linear-gradient(135deg,#6b2737,#8b1a1a);color:#fff;box-shadow:0 4px 18px rgba(107,39,55,.4)}
.print-btn:hover{box-shadow:0 7px 22px rgba(107,39,55,.5)}
.print-btn:disabled{background:#aaa;cursor:not-allowed;box-shadow:none;transform:none}
/* ── Section / table ─────────────────────────────────────── */
.sec{padding:22px 32px}
.sec-t{font-size:15px;font-weight:700;margin-bottom:14px;padding-bottom:8px;border-bottom:2px solid #e2e8f0}
table{width:100%;border-collapse:collapse;background:#fff;border-radius:10px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,.07)}
th{background:#1a3c5e;color:#fff;padding:9px 10px;text-align:left;font-size:12px;font-weight:600;letter-spacing:.3px;white-space:nowrap}
td{padding:4px 8px;border-bottom:1px solid #f1f5f9;vertical-align:middle;font-size:12px;font-family:'Segoe UI',Arial,sans-serif;border-right:1px solid #eef2f7}
td:last-child{border-right:none}
th:last-child{border-right:none}
tr:last-child td{border-bottom:none}
tbody tr:hover td{background:#f8fafc}
.lh td{background:#e8edf8;color:#1a3a6b;font-size:12px;font-weight:700;padding:9px 10px;border-top:2px solid #1a3c5e;border-bottom:1px solid #b0bdd8}
.lmeta{font-size:10px;font-weight:400;color:#555;margin-left:8px}
.gt td{background:#1a3c5e;color:#fff;font-size:12px;font-weight:700;padding:9px 10px}
.ftr{text-align:center;padding:20px;font-size:11px;color:#94a3b8;background:#fff;border-top:1px solid #e2e8f0;margin-top:24px}
/* ── Cell role classes (colour/weight only — size set by td) */
.c-sno{color:#94a3b8}
.c-pid{font-weight:700;color:#1a3a6b}
.c-plot{color:#334155}
.c-name{color:#1a1a2e;white-space:nowrap;max-width:160px;overflow:hidden;text-overflow:ellipsis}
.c-amt{}
.c-dim{color:#94a3b8}
.ba{display:inline-block;padding:2px 7px;border-radius:10px;font-size:10px;font-weight:600;line-height:1.4}
.b-act{background:#dcfce7;color:#16a34a}
.b-ina{background:#fee2e2;color:#dc2626}
.b-ext{background:#fef3c7;color:#d97706}
.b-tra{background:#e0f2fe;color:#0369a1}
.pp{font-size:12px;font-weight:700;color:#16a34a}
.pa{font-size:12px;font-weight:700;color:#d97706}
.pu{font-size:12px;font-weight:700;color:#dc2626}
.pn{font-size:12px;color:#94a3b8}
/* ── Print header (hidden on screen) ────────────────────── */
.print-hdr{display:none}
/* ── Print media ─────────────────────────────────────────── */

/* ── Action Buttons ───────────────────────── */
.act-btns{display:flex;gap:3px;align-items:center;justify-content:flex-start}
/* G/W/S fixed-slot action buttons */
.c-act-wrap{width:86px;padding:3px 4px;vertical-align:middle;white-space:nowrap}
.c-act-wrap .btn-mail,.c-act-wrap .btn-wa,.c-act-wrap .btn-sms,.c-act-wrap .act-slot{
  display:inline-flex;align-items:center;justify-content:center;
  width:24px;height:24px;border-radius:5px;font-size:11px;font-weight:800;
  text-decoration:none;cursor:pointer;transition:opacity .15s;line-height:1;
  font-family:"Segoe UI",Arial,sans-serif;letter-spacing:0;margin-right:3px;vertical-align:middle}
.c-act-wrap .btn-mail:hover,.c-act-wrap .btn-wa:hover,.c-act-wrap .btn-sms:hover{opacity:.75}
.act-slot{background:transparent;pointer-events:none}
.btn-mail{background:#ea4335;color:#fff}
.btn-wa  {background:#25d366;color:#fff}
.btn-sms {background:#007aff;color:#fff}
.btn-na  {color:#94a3b8;font-size:11px}
.c-act   {width:80px;text-align:left}
.c-due   {color:#dc2626!important;font-weight:600}


/* ── Admin Login ──────────────────────────────────────── */
.login-overlay{position:fixed;inset:0;background:linear-gradient(135deg,#1a1a2e 0%,#0f3460 100%);
  display:flex;align-items:center;justify-content:center;z-index:2000}
.login-box{background:#fff;border-radius:16px;padding:36px 40px;text-align:center;
  box-shadow:0 20px 60px rgba(0,0,0,.4);min-width:320px}
.login-box h2{color:#1a3c5e;font-size:20px;margin-bottom:4px}
.login-box p{color:#64748b;font-size:12px;margin-bottom:24px}
.login-box input{width:100%;padding:10px 14px;border:1.5px solid #cbd5e1;border-radius:8px;
  font-size:13px;margin-bottom:12px;outline:none;box-sizing:border-box}
.login-box input:focus{border-color:#1a3c5e;box-shadow:0 0 0 3px rgba(26,60,94,.1)}
.login-btn{width:100%;padding:11px;background:linear-gradient(135deg,#1a3c5e,#0f3460);
  color:#fff;border:none;border-radius:8px;font-size:14px;font-weight:700;cursor:pointer;margin-top:4px}
.login-btn:hover{opacity:.9}
.login-err{color:#dc2626;font-size:12px;margin-top:8px;display:none}
.admin-badge{display:inline-block;background:#1a3c5e;color:#fff;padding:3px 12px;
  border-radius:20px;font-size:11px;font-weight:600;margin-left:10px;vertical-align:middle}


.btn-slot{display:inline-block;width:22px;height:22px}
.c-btn-cell{width:26px;text-align:center;padding:3px 1px;vertical-align:middle}
.c-btn-slot{width:26px;text-align:center;padding:3px 1px}
.c-btn-slot{width:26px;text-align:center;padding:4px 2px;color:#e2e8f0}
.c-email{max-width:130px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:11px;color:#475569}

@media print{
  body,td,th{font-family:"Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji","Segoe UI",Arial,sans-serif}
  .act-btns,.btn-mail,.btn-wa,.btn-sms{display:none!important}

  @page{size:A4 landscape;margin:12mm 10mm}
  body{background:#fff;font-size:11px}
  .fab,.loading-overlay,.stats,.ftr,.search-bar{display:none!important}
  .hdr{background:#1a3c5e!important;-webkit-print-color-adjust:exact;print-color-adjust:exact;padding:12px 16px 10px}
  .hdr h1{font-size:16px}
  .hdr .sub,.hdr .meta,.live-pill{font-size:10px}
  .print-hdr{display:block;background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;padding:8px 14px;margin:8px 32px;font-size:10px;color:#334155}
  th,.gt td{background:#1a3c5e!important;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  .lh td{background:#e8edf8!important;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  .b-act{background:#dcfce7!important;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  .b-ina{background:#fee2e2!important;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  .b-ext{background:#fef3c7!important;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  .b-tra{background:#e0f2fe!important;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  tr{page-break-inside:avoid}
  .sec{padding:8px 14px}
  .sec-t{font-size:12px;margin-bottom:8px}
  table{box-shadow:none;border:1px solid #ddd}
  th{padding:6px 7px;font-size:10px}
  td{padding:5px 7px;font-size:10px}
}
"""

JS_UTILS = r"""
const API_URL = 'https://script.google.com/macros/s/AKfycbxu3LztxQc6diOzq3oWr0MvLG9qnnjh3sJTpr2o-zH_Z9yXMRKiKLByH_fHs4z8y1RczQ/exec?action=getData';
let _dataLoaded = false;
let _lastTs     = '';

function ifmt(n) {
  n = Math.round(n);
  if (n === 0) return '\u2014';
  const s = String(n);
  if (s.length <= 3) return '\u20b9' + s;
  if (s.length <= 5) return '\u20b9' + s.slice(0,-3) + ',' + s.slice(-3);
  if (s.length <= 7) return '\u20b9' + s.slice(0,-5) + ',' + s.slice(-5,-3) + ',' + s.slice(-3);
  return '\u20b9' + s.slice(0,-7) + ',' + s.slice(-7,-5) + ',' + s.slice(-5,-3) + ',' + s.slice(-3);
}

function getAmounts(prop) {
  let b = 0, p = 0;
  (prop.invoices || []).forEach(inv => { b += (inv.billAmount||0); p += (inv.paidAmount||0); });
  b = Math.round(b); p = Math.round(p);
  const d = b - p;
  let st;
  if (b === 0)     st = 'nodata';
  else if (d <= 0) st = 'paid';
  else if (p > 0)  st = 'partial';
  else             st = 'unpaid';
  const pst = prop.status || '';
  if (b === 0 && (pst.includes('Inactive') || pst.includes('Exited'))) st = 'nodata';
  return { b, p, d, st };
}

function sbadge(st) {
  if (st.includes('Active') && !st.includes('Inactive')) return '<span class="ba b-act">✅ Active</span>';
  if (st.includes('Inactive')) return '<span class="ba b-ina">🚫 Inactive</span>';
  if (st.includes('Exited'))   return '<span class="ba b-ext">💳 Exited</span>';
  if (st.includes('Transfer')) return '<span class="ba b-tra">🔄 Transferred</span>';
  return '<span class="ba">' + st + '</span>';
}

function pbadge(ps) {
  if (ps === 'paid')    return '<span class="pp">✅ Paid</span>';
  if (ps === 'partial') return '<span class="pa">🔶 Partial</span>';
  if (ps === 'unpaid')  return '<span class="pu">❌ Unpaid</span>';
  return '<span class="pn">—</span>';
}

function fmtTs(d) {
  return d.toLocaleString('en-IN', {
    day:'2-digit', month:'short', year:'numeric',
    hour:'2-digit', minute:'2-digit', hour12:true
  });
}

function printReport() {
  if (!_dataLoaded) {
    alert('Data is still loading. Please wait before printing.');
    return;
  }
  // Clear search so full report prints
  clearSearch();
  const dateStr = new Date().toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'}).replace(/ /g,'_');
  document.title = 'SCRWA_Outstanding_Report_' + dateStr;
  document.getElementById('print-info').textContent =
    'Printed on: ' + fmtTs(new Date()) + '   |   Data as of: ' + _lastTs +
    '   |   For internal use only \u2014 SCRWA Vampuguda';
  window.print();
  setTimeout(() => { document.title = 'SCRWA \u2014 Lane-wise Outstanding Report'; }, 1000);
}

// ── Search ────────────────────────────────────────────────
let _searchTimer = null;

function onSearchInput() {
  clearTimeout(_searchTimer);
  _searchTimer = setTimeout(applySearch, 150);
  const q = document.getElementById('searchBox').value;
  document.getElementById('searchClear').style.display = q ? 'block' : 'none';
}

function clearSearch() {
  document.getElementById('searchBox').value = '';
  document.getElementById('searchClear').style.display = 'none';
  applySearch();
}

function highlight(text, q) {
  if (!q) return text;
  const esc = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return text.replace(new RegExp('(' + esc + ')', 'gi'), '<mark>$1</mark>');
}

function applySearch() {
  const raw = document.getElementById('searchBox').value.trim().toLowerCase();
  const tbody = document.getElementById('detailBody');
  const rows  = tbody.querySelectorAll('tr');
  const countEl = document.getElementById('searchCount');

  if (!raw) {
    // show everything
    rows.forEach(r => r.style.display = '');
    countEl.innerHTML = '<span class="sc-match">Showing all properties</span>';
    return;
  }

  let matched = 0;
  let laneHdr = null;
  let laneHits = 0;

  rows.forEach(row => {
    // Lane header row
    if (row.classList.contains('lh')) {
      // Commit previous lane header visibility
      if (laneHdr) laneHdr.style.display = laneHits > 0 ? '' : 'none';
      laneHdr = row;
      laneHits = 0;
      return;
    }
    // Grand total row — always visible
    if (row.classList.contains('gt')) {
      if (laneHdr) laneHdr.style.display = laneHits > 0 ? '' : 'none';
      laneHdr = null;
      row.style.display = '';
      return;
    }
    // Property row — check cells: pid[1], plotNo[2], name[3]
    const cells = row.querySelectorAll('td');
    if (cells.length < 4) { row.style.display = 'none'; return; }
    const pid    = (cells[1].textContent || '').toLowerCase();
    const plotNo = (cells[2].textContent || '').toLowerCase();
    const name   = (cells[3].textContent || '').toLowerCase();
    const lane   = laneHdr ? laneHdr.textContent.toLowerCase() : '';

    if (pid.includes(raw) || plotNo.includes(raw) || name.includes(raw) || lane.includes(raw)) {
      row.style.display = '';
      // Apply highlight to name and plot cells
      cells[2].innerHTML = highlight(cells[2].textContent, raw);
      cells[3].innerHTML = highlight(cells[3].textContent, raw);
      matched++;
      laneHits++;
    } else {
      row.style.display = 'none';
    }
  });

  // Handle last lane header
  if (laneHdr) laneHdr.style.display = laneHits > 0 ? '' : 'none';

  // Update counter
  if (matched === 0) {
    countEl.innerHTML = '<span class="sc-none">No properties found</span>';
  } else {
    countEl.innerHTML = '<span class="sc-match">' + matched + '</span> propert' + (matched === 1 ? 'y' : 'ies') + ' found';
  }
}
"""

JS_LOAD = r"""
async function showError(msg) {
  const overlay = document.getElementById('loadingOverlay');
  if (overlay) overlay.style.display = 'none';
  const pill = document.getElementById('livePill');
  if (pill) { pill.className = 'live-pill error'; pill.textContent = '❌ Error'; }
  const body = document.body;
  const div = document.createElement('div');
  div.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:#fff;border:2px solid #dc2626;border-radius:12px;padding:24px 32px;text-align:center;z-index:9999;box-shadow:0 8px 32px rgba(0,0,0,.2)';
  div.innerHTML = '<div style="font-size:32px">❌</div><h3 style="color:#dc2626;margin:8px 0">Failed to load data</h3><p style="color:#64748b;font-size:13px">' + msg + '</p><button onclick="this.parentNode.remove();loadData()" style="margin-top:12px;padding:8px 20px;background:#1a3c5e;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:13px">\ud83d\udd04 Retry</button>';
  body.appendChild(div);
}

function loadData() {
  const overlay  = document.getElementById('loadingOverlay');
  const livePill = document.getElementById('livePill');
  if (overlay)  overlay.style.display = 'flex';
  if (livePill) { livePill.className = 'live-pill loading'; livePill.textContent = '⏳ Loading\u2026'; }

  // 8-second timeout for live fetch
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);

  fetch(API_URL, { signal: controller.signal })
    .then(r => { clearTimeout(timer); if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
    .then(data => {
      if (overlay)  overlay.style.display = 'none';
      if (livePill) {
        livePill.className = 'live-pill live';
        livePill.textContent = '🟢 Live Data';
      }
      renderReport(data);
    })
    .catch(() => {
      clearTimeout(timer);
      // Fall back to local cache
      fetch('live_data.json')
        .then(r => { if (!r.ok) throw new Error('Cache HTTP ' + r.status); return r.json(); })
        .then(data => {
          if (overlay) overlay.style.display = 'none';
          if (livePill) {
            livePill.className = 'live-pill cached';
            livePill.innerHTML = '🟡 Cached &nbsp;<button onclick="loadLive()" '
              + 'style="background:#fff;color:#1a3c5e;border:1px solid #1a3c5e;border-radius:4px;'
              + 'padding:1px 8px;font-size:10px;font-weight:700;cursor:pointer;margin-left:4px">'
              + '🔄 Load Live</button>';
          }
          renderReport(data);
        })
        .catch(cacheErr => {
          if (overlay) overlay.style.display = 'none';
          if (livePill) { livePill.className = 'live-pill error'; livePill.textContent = '🔴 Error'; }
          showError('Both live and cache failed: ' + cacheErr.message);
        });
    });
}

function loadLive() {
  // Force live reload — opens API in new tab if fetch blocked, else retries
  const overlay  = document.getElementById('loadingOverlay');
  const livePill = document.getElementById('livePill');
  if (overlay)  overlay.style.display = 'flex';
  if (livePill) { livePill.className = 'live-pill loading'; livePill.textContent = '⏳ Fetching live\u2026'; }

  fetch(API_URL)
    .then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
    .then(data => {
      if (overlay)  overlay.style.display = 'none';
      if (livePill) { livePill.className = 'live-pill live'; livePill.textContent = '🟢 Live Data'; }
      renderReport(data);
    })
    .catch(() => {
      if (overlay) overlay.style.display = 'none';
      if (livePill) {
        livePill.className = 'live-pill error';
        livePill.innerHTML = '🔴 Live failed &nbsp;<button onclick="loadLive()" '
          + 'style="background:#fff;color:#dc2626;border:1px solid #dc2626;border-radius:4px;'
          + 'padding:1px 8px;font-size:10px;font-weight:700;cursor:pointer;margin-left:4px">'
          + '🔄 Retry</button>';
      }
    });
}
"""

JS_RENDER = r"""
function rbadge(prop, pid, due) {
  const isProxy = prop.isProxy === 'Yes';
  const email   = prop.email   || (isProxy ? prop.proxyEmail  : '');
  const phone   = prop.mobile  || (isProxy ? prop.proxyMobile : '');
  const name    = prop.name    || '';
  const plotNo  = prop.plotNo  || '';
  const laneNo  = prop.laneNo  || '';
  const proxy   = isProxy && prop.representedBy ? prop.representedBy : '';
  const months  = due > 0 ? Math.round(due / 500) : 0;
  const asOn    = new Date().toLocaleDateString('en-IN',{day:'2-digit',month:'long',year:'numeric'});

  // G slot
  let gBtn = '<span class="btn-slot"></span>';
  if (due > 0 && email) {
    const subj = encodeURIComponent(
      'Maintenance Due Reminder \u2014 ' + name + ' | Property ' + pid +
      (months > 1 ? ' (' + months + ' months)' : ' (1 month)')
    );
    const detailBlock =
      'Property ID   :  ' + pid + '\n' +
      'Plot No       :  ' + plotNo + '\n' +
      'Lane          :  ' + laneNo + '\n' +
      'Contribution  :  \u20b9' + due.toLocaleString('en-IN') +
      ' (' + (months > 1 ? months + ' months' : '1 month') + ' pending)\n' +
      'As On         :  ' + asOn +
      (proxy ? '\nProxy / Rep   :  ' + proxy + ' (Proxy)' : '');
    const body = encodeURIComponent(
      'Dear ' + name + ',\n\n' +
      'Hope this message finds you well.\n\n' +
      'This is a gentle reminder from the Management Committee of\n' +
      'Senior Citizen Residential Welfare Association (SCRWA), Vampuguda, Hyderabad.\n\n' +
      '\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\n' +
      detailBlock + '\n' +
      '\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\n\n' +
      'We kindly request you to clear this balance at your earliest convenience.\n\n' +
      'View your full statement on the Society Portal:\n' +
      'https://scwavampuguda-tech.github.io/society-dashboard/Society_Portal.html\n\n' +
      'mailto:scwa.vampuguda@gmail.com\n\n' +
      'Warm regards,\nManagement Committee\n' +
      'Senior Citizen Residential Welfare Association (SCRWA)\nRegd. No: 2240/2006'
    );
    const toField = email + (proxy && prop.proxyEmail ? ',' + prop.proxyEmail : '');
    gBtn = '<a class="btn-mail" href="https://mail.google.com/mail/u/0/?view=cm&fs=1&to=' +
      encodeURIComponent(toField) + '&su=' + subj + '&body=' + body +
      '" target="_blank" title="Gmail \u2014 ' + email + '">G</a>';
  }

  // W slot
  let wBtn = '<span class="btn-slot"></span>';
  if (due > 0 && phone) {
    const waPhone = phone.replace(/[^0-9]/g, '');
    const waMsg = encodeURIComponent(
      'Dear ' + name + ', this is a gentle reminder from SCRWA for maintenance' +
      ' due of \u20b9' + due.toLocaleString('en-IN') +
      '. Please clear at your earliest convenience. \u2014 SCRWA Management'
    );
    wBtn = '<a class="btn-wa" href="https://wa.me/' + waPhone + '?text=' + waMsg +
      '" target="_blank" title="WhatsApp \u2014 ' + phone + '">W</a>';
  }

  // S slot
  let sBtn = '<span class="btn-slot"></span>';
  if (due > 0 && phone) {
    const smsPhone = phone.replace(/[^0-9+]/g, '');
    sBtn = '<a class="btn-sms" href="sms:' + smsPhone +
      '" title="SMS \u2014 ' + phone + '">S</a>';
  }

  return '<div class="act-btns">' + gBtn + wBtn + sBtn + '</div>';
}


function fmtName(raw) {
  if (!raw) return '';
  // Split on ' & ' or ' / '
  const sep = raw.includes(' & ') ? ' & ' : (raw.includes(' / ') ? ' / ' : null);
  if (!sep) return raw;
  const parts = raw.split(sep);
  if (parts.length < 2) return raw;
  return parts[0].trim() + ' <span style="color:#94a3b8;font-size:11px">& …</span>';
}

function renderReport(raw) {
  let gtProps=0, gtBilled=0, gtPaid=0, gtDue=0;
  let gtPd=0, gtPt=0, gtPu=0, gtNa=0;
  const summaryRows = [];

  LANES.forEach(lane => {
    let bTot=0, pTot=0, pdCt=0, ptCt=0, puCt=0, naCt=0;
    lane.pids.forEach(pid => {
      const prop = raw[pid]; if (!prop) return;
      const { b, p, st } = getAmounts(prop);
      bTot += b; pTot += p;
      if      (st === 'paid')    pdCt++;
      else if (st === 'partial') ptCt++;
      else if (st === 'unpaid')  puCt++;
      else                       naCt++;
    });
    const due = bTot - pTot;
    summaryRows.push({ lane, bTot, pTot, due, pdCt, ptCt, puCt, naCt });
    gtProps  += lane.pids.length;
    gtBilled += bTot; gtPaid += pTot; gtDue += due;
    gtPd += pdCt; gtPt += ptCt; gtPu += puCt; gtNa += naCt;
  });

  // KPI bar
  document.getElementById('st-props').textContent  = gtProps;
  document.getElementById('st-billed').textContent = ifmt(gtBilled);
  document.getElementById('st-paid').textContent   = ifmt(gtPaid);
  document.getElementById('st-due').textContent    = ifmt(gtDue);

  // Summary table
  let sumHTML = '';
  summaryRows.forEach(r => {
    sumHTML += `<tr>
      <td style="text-align:left">🏠 ${r.lane.name} (${r.lane.plots})</td>
      <td style="text-align:center">${r.lane.pids.length}</td>
      <td class="c-amt" style="text-align:right">${ifmt(r.bTot)}</td>
      <td class="c-amt${r.pTot ? '' : ' c-dim'}" style="text-align:right">${ifmt(r.pTot)}</td>
      <td class="c-amt c-due" style="text-align:right">${ifmt(r.due)}</td>
      <td class="c-dim" style="text-align:right">—</td>
      <td style="text-align:center;color:#16a34a;font-weight:600">${r.pdCt || '<span class=\"c-dim\">—</span>'}</td>
      <td style="text-align:center;color:#d97706;font-weight:600">${r.ptCt || '<span class=\"c-dim\">—</span>'}</td>
      <td style="text-align:center;color:#dc2626;font-weight:600">${r.puCt || '<span class=\"c-dim\">—</span>'}</td>
      <td style="text-align:center;color:#94a3b8">${r.naCt || '<span class=\"c-dim\">—</span>'}</td>
    </tr>`;
  });
  sumHTML += `<tr class="gt">
    <td style="text-align:left"><strong>GRAND TOTAL</strong></td>
    <td style="text-align:center"><strong>${gtProps}</strong></td>
    <td class="c-amt" style="text-align:right"><strong>${ifmt(gtBilled)}</strong></td>
    <td class="c-amt" style="text-align:right"><strong>${ifmt(gtPaid)}</strong></td>
    <td class="c-amt c-due" style="text-align:right"><strong>${ifmt(gtDue)}</strong></td>
    <td class="c-dim" style="text-align:right">—</td>
    <td style="text-align:center;color:#16a34a"><strong>${gtPd}</strong></td>
    <td style="text-align:center;color:#d97706"><strong>${gtPt}</strong></td>
    <td style="text-align:center;color:#dc2626"><strong>${gtPu}</strong></td>
    <td style="text-align:center;color:#94a3b8"><strong>${gtNa}</strong></td>
  </tr>`;
  document.getElementById('summaryBody').innerHTML = sumHTML;

  // Detail table
  let detHTML = '';
  let sno = 0;
  summaryRows.forEach(r => {
    const pills = [];
    if (r.pdCt) pills.push('\u2713 ' + r.pdCt + ' Paid');
    if (r.ptCt) pills.push('\u25c6 ' + r.ptCt + ' Partial');
    if (r.puCt) pills.push('\u2717 ' + r.puCt + ' Unpaid');
    if (r.naCt) pills.push('\u2014 ' + r.naCt + ' No Data');
    const pillStr = pills.join(' \u00a0\u00b7\u00a0 ');
    const metaStr = r.lane.pids.length + ' props \u00a0\u00b7\u00a0 Billed: ' + ifmt(r.bTot)
                  + ' \u00a0\u00b7\u00a0 Paid: ' + ifmt(r.pTot)
                  + ' \u00a0\u00b7\u00a0 Outstanding: ' + ifmt(r.due)
                  + (pillStr ? '\u00a0\u00a0\u00a0' + pillStr : '');
    detHTML += `<tr class="lh" data-lane="${r.lane.name}"><td colspan="12">
      \u{1F3E0} ${r.lane.name} \u2014 ${r.lane.plots}
      <span class="lmeta">${metaStr}</span>
    </td></tr>`;

    r.lane.pids.forEach(pid => {
      const prop = raw[pid]; if (!prop) return;
      sno++;
      const { b, p, d, st } = getAmounts(prop);
      const pst = prop.status || '';
      const amtCols = b > 0
        ? `<td class="c-amt" style="text-align:right">${ifmt(b)}</td>
           <td class="c-amt${p ? '' : ' c-dim'}" style="text-align:right">${ifmt(p)}</td>
           <td class="c-amt c-due${d ? '' : ' c-dim'}" style="text-align:right">${ifmt(d)}</td>
           <td class="c-dim" style="text-align:right">—</td>`
        : `<td class="c-dim">—</td><td class="c-dim">—</td><td class="c-amt c-due c-dim">—</td><td class="c-dim">—</td>`;
      detHTML += `<tr data-pid="${pid}" data-lane="${r.lane.name}">
        <td class="c-sno">${sno}</td>
        <td class="c-pid">${pid}</td>
        <td class="c-plot">${prop.plotNo || ''}</td>
        <td class="c-name">${fmtName(prop.name)}</td>
        <td class="c-email">${prop.email ? '<span title="'+prop.email+'">'+prop.email.split('@')[0]+'<span style="color:#94a3b8">@'+prop.email.split('@')[1]+'</span></span>' : '<span class="c-dim">—</span>'}</td>
        <td>${sbadge(pst)}</td>
        <td>${pbadge(st)}</td>
        ${amtCols}
        ${(()=>{
        const isProxy2 = prop.isProxy === 'Yes';
        const em = prop.email || (isProxy2 ? prop.proxyEmail : '');
        const ph = prop.mobile || (isProxy2 ? prop.proxyMobile : '');
        const months2 = d > 0 ? Math.round(d/500) : 0;
        const asOn2 = new Date().toLocaleDateString('en-IN',{day:'2-digit',month:'long',year:'numeric'});
        const proxy2 = (isProxy2 && prop.representedBy) ? prop.representedBy : '';
        (()=>{
        const isProxy2 = prop.isProxy === 'Yes';
        const em = prop.email || (isProxy2 ? prop.proxyEmail : '');
        const ph = prop.mobile || (isProxy2 ? prop.proxyMobile : '');
        const months2 = d > 0 ? Math.round(d/500) : 0;
        const asOn2 = new Date().toLocaleDateString('en-IN',{day:'2-digit',month:'long',year:'numeric'});
        const proxy2 = (isProxy2 && prop.representedBy) ? prop.representedBy : '';

        // Fixed slot — always render 3 spans/anchors regardless of availability
        let gBtn = '<span class="act-slot"></span>';
        let wBtn = '<span class="act-slot"></span>';
        let sBtn = '<span class="act-slot"></span>';

        if (d > 0 && em) {
          const subj2 = encodeURIComponent('Maintenance Due Reminder \u2014 '+prop.name+' | Property '+pid+(months2>1?' ('+months2+' months)':' (1 month)'));
          const det2 = 'Property ID   :  '+pid+'\nPlot No       :  '+(prop.plotNo||'')+'\nLane          :  '+(prop.laneNo||'')+'\nContribution  :  \u20b9'+d.toLocaleString('en-IN')+' ('+(months2>1?months2+' months':'1 month')+' pending)\nAs On         :  '+asOn2+(proxy2?'\nProxy / Rep   :  '+proxy2+' (Proxy)':'');
          const bod2 = encodeURIComponent('Dear '+prop.name+',\n\nHope this message finds you well.\n\nThis is a gentle reminder from the Management Committee of\nSenior Citizen Residential Welfare Association (SCRWA), Vampuguda, Hyderabad.\n\n\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\n'+det2+'\n\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\n\nWe kindly request you to clear this balance at your earliest convenience.\n\nView your full statement on the Society Portal:\nhttps://scwavampuguda-tech.github.io/society-dashboard/Society_Portal.html\n\nmailto:scwa.vampuguda@gmail.com\n\nWarm regards,\nManagement Committee\nSenior Citizen Residential Welfare Association (SCRWA)\nRegd. No: 2240/2006');
          const to2 = em+(proxy2&&prop.proxyEmail?','+prop.proxyEmail:'');
          gBtn = '<a class="btn-mail" href="https://mail.google.com/mail/u/0/?view=cm&fs=1&to='+encodeURIComponent(to2)+'&su='+subj2+'&body='+bod2+'" target="_blank" title="Gmail \u2014 '+em+'">G</a>';
        }
        if (d > 0 && ph) {
          const wp2 = ph.replace(/[^0-9]/g,'');
          const wm2 = encodeURIComponent('Dear '+prop.name+', this is a gentle reminder from SCRWA for maintenance due of \u20b9'+d.toLocaleString('en-IN')+'. Please clear at your earliest convenience. \u2014 SCRWA Management');
          wBtn = '<a class="btn-wa" href="https://wa.me/'+wp2+'?text='+wm2+'" target="_blank" title="WhatsApp \u2014 '+ph+'">W</a>';
          sBtn = '<a class="btn-sms" href="sms:'+ph.replace(/[^0-9+]/g,'')+'" title="SMS \u2014 '+ph+'">S</a>';
        }
        return '<td class="c-act-wrap">'+gBtn+wBtn+sBtn+'</td>';
      })()}
      </tr>`;
    });
  });

  detHTML += `<tr class="gt">
    <td colspan="7"><strong>GRAND TOTAL</strong></td>
    <td class="c-amt" style="text-align:right"><strong>${ifmt(gtBilled)}</strong></td>
    <td class="c-amt" style="text-align:right"><strong>${ifmt(gtPaid)}</strong></td>
    <td class="c-amt c-due" style="text-align:right"><strong>${ifmt(gtDue)}</strong></td>
    <td class="c-dim">—</td>
    <td class="c-dim">—</td>
  </tr>`;
  document.getElementById('detailBody').innerHTML = detHTML;
  _dataLoaded = true;
  document.getElementById('printBtn').disabled = false;
}


// ── Admin Auth ────────────────────────────────────────
const ADMINS = {
  'parthok@gmail.com'       : 'Partho',
  'bilsaibaba@gmail.com'    : 'Saibaba',
  'premikakatta1@gmail.com' : 'Premika'
};

function doLogin() {
  const raw   = document.getElementById('adminEmail').value || '';
  const email = raw.trim().toLowerCase();
  const err   = document.getElementById('loginErr');

  if (!email) {
    err.textContent = '\u26a0\ufe0f Please enter your email address.';
    err.style.display = 'block';
    setTimeout(() => { err.style.display = 'none'; }, 3000);
    return;
  }
  if (ADMINS[email]) {
    document.getElementById('loginOverlay').style.display = 'none';
    const meta = document.getElementById('hdr-meta');
    if (meta) meta.innerHTML += '<span class="admin-badge">&#128100; ' + ADMINS[email] + '</span>';
    loadData();
  } else {
    err.textContent = '\u274c Email not recognised. Access restricted to authorised admins only.';
    err.style.display = 'block';
    document.getElementById('adminEmail').select();
    setTimeout(() => { err.style.display = 'none'; }, 3000);
  }
}
// ── End Admin Auth ────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  const e = document.getElementById('adminEmail');
  if (e) e.focus();
});
"""

HTML = f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>SCRWA \u2014 Lane-wise Outstanding Report</title>
<style>{CSS}</style>
</head>
<body>


<!-- Admin Login Overlay -->
<div class="login-overlay" id="loginOverlay">
  <div class="login-box">
    <div style="font-size:48px;margin-bottom:8px">&#127968;</div>
    <h2>SCRWA Admin Portal</h2>
    <p>Senior Citizen Residential Welfare Association<br>Vampuguda, Hyderabad</p>
    <input type="text" id="adminEmail" placeholder="Enter your email address"
           autocomplete="off" onkeydown="if(event.key==='Enter')doLogin()">
    <button class="login-btn" onclick="doLogin()">&#128272; Enter Portal</button>
    <div class="login-err" id="loginErr">&#10060; Email not recognised. Access restricted to authorised admins only.</div>
  </div>
</div>

<!-- Loading Overlay -->
<div class="loading-overlay" id="loadingOverlay">
  <div class="loading-content">
    <div class="spinner"></div>
    <h3 style="color:#1a3c5e;margin-bottom:8px">Loading Report\u2026</h3>
    <p style="color:#64748b;font-size:12px">Fetching from Google Sheets</p>
  </div>
</div>

<!-- Header -->
<div class="hdr">
  <h1>&#127963; SCRWA \u2014 Senior Citizens Residential Welfare Association</h1>
  <div class="sub">Lane-wise Outstanding Report &nbsp;|&nbsp; Vampuguda, Hyderabad</div>
  <div class="meta" id="hdr-meta">Regd. No: 2240/2006</div>
  <div><span class="live-pill loading" id="livePill">⏳ Loading data\u2026</span></div>
</div>

<!-- Print-only info bar -->
<div class="print-hdr" id="print-info"></div>

<!-- KPI Stats -->
<div class="stats">
  <div class="sc"><div class="v" id="st-props"  style="color:#7c3aed">--</div><div class="l">Total Properties</div></div>
  <div class="sc"><div class="v" id="st-billed" style="color:#2563eb">--</div><div class="l">Total Billed</div></div>
  <div class="sc"><div class="v" id="st-paid"   style="color:#16a34a">--</div><div class="l">Total Paid</div></div>
  <div class="sc"><div class="v" id="st-due"    style="color:#dc2626">--</div><div class="l">Total Outstanding</div></div>
</div>

<!-- Search Toolbar -->
<div class="search-bar">
  <div class="search-wrap">
    <span class="search-icon">&#128269;</span>
    <input type="text" id="searchBox" placeholder="Search by name, plot number, prop ID, or lane\u2026"
           oninput="onSearchInput()" onkeydown="if(event.key==='Escape')clearSearch()">
    <button class="search-clear" id="searchClear" onclick="clearSearch()" title="Clear search">&#10005;</button>
  </div>
  <div class="search-count" id="searchCount">
    <span class="sc-match">Showing all properties</span>
  </div>
  
</div>

<!-- Summary Section -->
<div class="sec">
  <div class="sec-t">&#128203; Lane-wise Summary</div>
  <table>
    <thead><tr>
      <th style="text-align:left">🏠 Lane</th>
      <th style="text-align:center">Props</th>
      <th style="text-align:right">💳 Billed</th>
      <th style="text-align:right">✅ Paid</th>
      <th style="text-align:right">💰 Due</th>
      <th style="text-align:right">🔁 Advance</th>
      <th style="text-align:center">✅ Paid</th>
      <th style="text-align:center">🔶 Part</th>
      <th style="text-align:center">❌ Unpaid</th>
      <th style="text-align:center">— N/A</th>
    </tr></thead>
    <tbody id="summaryBody"><tr><td colspan="11" style="text-align:center;padding:20px;color:#94a3b8">Loading\u2026</td></tr></tbody>
  </table>
</div>

<!-- Detail Section -->
<div class="sec">
  <div class="sec-t">&#127968; Lane-wise Detail Report</div>
  <table>
    <thead><tr>
      <th style="width:36px">#</th>
      <th style="width:56px">Prop ID</th>
      <th style="width:110px">Plot No</th>
      <th style="width:160px;white-space:nowrap">Owner Name</th>
      <th style="width:130px">Email</th>
      <th style="width:100px">Status</th>
      <th style="width:82px">Payment</th>
      <th style="width:76px;text-align:right">Billed</th>
      <th style="width:76px;text-align:right">Paid</th>
      <th style="width:76px;text-align:right">Due</th>
      <th style="width:66px;text-align:right">Advance</th>
      <th style="width:86px;text-align:center">Actions</th>
    </tr></thead>
    <tbody id="detailBody"><tr><td colspan="10" style="text-align:center;padding:20px;color:#94a3b8">Loading\u2026</td></tr></tbody>
  </table>
</div>

<div class="ftr">
  SCRWA Vampuguda &nbsp;|&nbsp; scwa.vampuguda@gmail.com &nbsp;|&nbsp;
  Data fetched live from Google Sheets &mdash; for internal use only.
</div>

<!-- Floating Action Buttons -->
<button class="fab print-btn"   id="printBtn"   onclick="printReport()" disabled>&#128248; Print / Save PDF</button>
<button class="fab refresh-btn" id="refreshBtn" onclick="loadData()">&#128260; Refresh Data</button>

<script>
{LANES_JS}
{JS_UTILS}
{JS_LOAD}
{JS_RENDER}
</script>
</body>
</html>"""

with open(OUT, 'w', encoding='utf-8') as f:
    f.write(HTML)

sz = os.path.getsize(OUT)
ln = HTML.count('\n')
print(f"SUCCESS | {sz:,} bytes | {ln} lines | {OUT}")
