"""
Replaces the Collection tab HTML + JS inside SCRWA_CashFlow_Live.html
with the dark-themed design matching SCRWA_Collection_Dashboard.html
"""
import re

PATH = r'C:\Users\parkundu\Desktop\Society_SCRWA\Society_Files\Scripts\SCRWA_CashFlow_Live.html'
content = open(PATH, 'r', encoding='utf-8').read()

# ── 1. Inject dark-theme CSS for collection tab ──────────────────────────────
COL_CSS = """
/* ── COLLECTION DARK THEME ───────────────────────────────────────── */
#tab-collection {
  background: #0f1923;
  min-height: calc(100vh - 110px);
  padding: 24px 32px;
  color: #e0e8f0;
}
.col-header {
  display:flex; align-items:center; justify-content:space-between;
  padding-bottom: 18px; border-bottom: 2px solid #1e5799; margin-bottom: 20px;
}
.col-header h2 { font-size:18px; font-weight:700; color:#fff; }
.col-header .col-meta { font-size:12px; color:#7fb3d3; text-align:right; }
.col-header .col-meta b { color:#4fc3f7; }

.col-kpi-row { display:grid; grid-template-columns:repeat(4,1fr); gap:16px; margin-bottom:24px; }
.col-kpi {
  background: linear-gradient(145deg,#1a2e42,#152536);
  border: 1px solid #1e4060; border-radius:12px; padding:20px 22px;
  position:relative; overflow:hidden;
}
.col-kpi::before {
  content:''; position:absolute; top:0; left:0; right:0;
  height:3px; border-radius:12px 12px 0 0;
}
.col-kpi.ck-blue::before   { background:linear-gradient(90deg,#1565c0,#4fc3f7); }
.col-kpi.ck-green::before  { background:linear-gradient(90deg,#2e7d32,#66bb6a); }
.col-kpi.ck-red::before    { background:linear-gradient(90deg,#c62828,#ef5350); }
.col-kpi.ck-amber::before  { background:linear-gradient(90deg,#e65100,#ffa726); }
.col-kpi-label { font-size:11px; color:#7fb3d3; text-transform:uppercase; letter-spacing:1px; margin-bottom:8px; }
.col-kpi-value { font-size:26px; font-weight:700; }
.col-kpi.ck-blue  .col-kpi-value { color:#4fc3f7; }
.col-kpi.ck-green .col-kpi-value { color:#66bb6a; }
.col-kpi.ck-red   .col-kpi-value { color:#ef5350; }
.col-kpi.ck-amber .col-kpi-value { color:#ffa726; }
.col-kpi-sub { font-size:11px; color:#5a8aaa; margin-top:4px; }

.col-section-title {
  font-size:13px; font-weight:600; color:#4fc3f7;
  text-transform:uppercase; letter-spacing:1px;
  margin-bottom:14px; padding-bottom:6px;
  border-bottom:1px solid #1e4060;
}
.col-charts-row { display:grid; grid-template-columns:2fr 1fr; gap:20px; margin-bottom:24px; }
@media(max-width:860px){ .col-charts-row { grid-template-columns:1fr; } }
.col-chart-box {
  background:#152536; border:1px solid #1e4060; border-radius:12px; padding:20px;
}
.col-chart-box h3 { font-size:11px; color:#7fb3d3; margin-bottom:14px; text-transform:uppercase; letter-spacing:.8px; }

.col-filters {
  display:flex; gap:10px; flex-wrap:wrap;
  background:#152536; border:1px solid #1e4060; border-radius:10px;
  padding:14px 18px; margin-bottom:16px; align-items:center;
}
.col-filters label { font-size:11px; color:#7fb3d3; margin-right:4px; }
.col-filters input, .col-filters select {
  background:#0f1923; border:1px solid #1e4060; border-radius:6px;
  color:#e0e8f0; font-size:12px; padding:6px 10px; outline:none;
}
.col-filters input:focus, .col-filters select:focus { border-color:#4fc3f7; }
.col-filters input { flex:1; min-width:180px; }

.col-table-wrap { background:#152536; border:1px solid #1e4060; border-radius:12px; overflow:hidden; margin-bottom:16px; }
.col-table-wrap table { width:100%; border-collapse:collapse; font-size:12px; }
.col-table-wrap thead th {
  background:#1a3a5c; color:#4fc3f7; padding:11px 14px;
  text-align:center; font-size:10px; text-transform:uppercase;
  letter-spacing:.8px; border-bottom:2px solid #1e5799; white-space:nowrap;
}
.col-table-wrap thead th.left { text-align:left; }
.col-table-wrap tbody tr { border-bottom:1px solid #1a2e42; }
.col-table-wrap tbody tr:hover { background:#1a3550; }
.col-table-wrap tbody td { padding:10px 14px; text-align:center; color:#c8dcea; }
.col-table-wrap tbody td.left { text-align:left; }
.col-bar-wrap { background:#0f1923; border-radius:20px; height:7px; width:100px; margin:0 auto; }
.col-bar-fill { height:7px; border-radius:20px; }
.col-badge { display:inline-block; padding:2px 10px; border-radius:20px; font-size:10px; font-weight:600; }
.col-badge.good   { background:#1b5e20; color:#66bb6a; }
.col-badge.fair   { background:#e65100; color:#ffa726; }
.col-badge.low    { background:#7f1d1d; color:#ef5350; }
.col-total-row { background:#1a3a5c !important; border-top:2px solid #4fc3f7 !important; }

.col-pagination { display:flex; align-items:center; gap:6px; padding:0 4px 4px; flex-wrap:wrap; }
.col-pagination span { font-size:11px; color:#5a8aaa; }
.col-pagination button {
  padding:4px 10px; background:#152536; border:1px solid #1e4060;
  border-radius:5px; color:#c8dcea; cursor:pointer; font-size:11px;
}
.col-pagination button:hover, .col-pagination button.active {
  background:#1565c0; color:#fff; border-color:#1565c0;
}

.col-footer { text-align:center; padding:12px; font-size:11px; color:#2d5a7a; border-top:1px solid #1a2e42; margin-top:8px; }
/* ──────────────────────────────────────────────────────────────────── */
"""

# Insert CSS before closing </style>
content = content.replace('</style>', COL_CSS + '\n</style>', 1)

# ── 2. Replace the Collection tab HTML block ─────────────────────────────────
NEW_COL_HTML = """  <!-- TAB: COLLECTION -->
  <div class="tab-content" id="tab-collection">

    <!-- Dark header -->
    <div class="col-header">
      <div>
        <h2>🏘️ SCRWA — Monthly Collection Dashboard</h2>
        <div style="font-size:12px;color:#5a8aaa;margin-top:4px;">Reddy Colony · Vampuguda Society</div>
      </div>
      <div class="col-meta" id="col-meta-right"></div>
    </div>

    <!-- KPI cards -->
    <div class="col-kpi-row" id="col-kpis-dark"></div>

    <!-- Charts -->
    <div class="col-section-title">📈 Monthly Trend</div>
    <div class="col-charts-row">
      <div class="col-chart-box">
        <h3>Billed vs Collected vs Pending — Monthly</h3>
        <canvas id="colBarChart" height="220"></canvas>
      </div>
      <div class="col-chart-box">
        <h3>Collection Rate % — by Month</h3>
        <canvas id="colLineChart" height="220"></canvas>
      </div>
    </div>

    <!-- Filters -->
    <div class="col-section-title">📋 Month-wise Breakdown</div>
    <div class="col-filters">
      <label>FY</label>
      <select id="colFyFilter" onchange="renderColDark()">
        <option value="">All Years</option>
      </select>
      <label>Period</label>
      <select id="colPeriodFilter" onchange="renderColDark()">
        <option value="">All Months</option>
      </select>
      <input type="text" id="colSearchDark" placeholder="🔍  Search member, plot, lane..." oninput="renderColDark()">
      <select id="colPayFilter" onchange="renderColDark()">
        <option value="">All Status</option>
        <option value="Paid">✅ Paid</option>
        <option value="Unpaid">❌ Unpaid</option>
        <option value="Partial">⚠️ Partial</option>
      </select>
    </div>

    <!-- Month-wise summary table -->
    <div class="col-table-wrap">
      <table>
        <thead>
          <tr>
            <th class="left">Month</th>
            <th>Billed (₹)</th>
            <th>Collected (₹)</th>
            <th>Pending (₹)</th>
            <th>Invoices</th>
            <th>Paid</th>
            <th>Unpaid</th>
            <th>Collection %</th>
            <th>Progress</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody id="colMonthBody"></tbody>
      </table>
    </div>

    <!-- Member-level detail table -->
    <div class="col-section-title" style="margin-top:8px">👤 Member Invoice Detail</div>
    <div class="col-table-wrap">
      <table>
        <thead>
          <tr>
            <th>#</th>
            <th class="left">Plot</th>
            <th class="left">Member Name</th>
            <th>Lane</th>
            <th>Period</th>
            <th>Billed</th>
            <th>Paid</th>
            <th>Balance</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody id="colDetailBody"></tbody>
      </table>
    </div>
    <div class="col-pagination" id="colDetailPag"></div>

    <div class="col-footer">SCRWA — Reddy Colony, Vampuguda &nbsp;|&nbsp; Live data from Google Sheets</div>
  </div>"""

# Replace old collection tab
old_pattern = r'  <!-- TAB: COLLECTION -->.*?(?=  <!-- TAB: MONTHLY)'
content = re.sub(old_pattern, NEW_COL_HTML + '\n\n  ', content, flags=re.DOTALL)

# ── 3. Replace old Collection JS with new dark JS ────────────────────────────
OLD_JS_PATTERN = r'// ={3,}\n// COLLECTION TAB\n// ={3,}.*?(?=// ={3,}\n// MONTHLY TAB)'
NEW_COL_JS = r"""// ============================================================
// COLLECTION TAB — DARK THEME
// ============================================================
function initCollection(){
  const members=Object.keys(G.data).filter(k=>!k.startsWith('_')).map(k=>G.data[k]);

  // FY filter
  const fys=new Set(); const periods=new Set();
  members.forEach(m=>{
    m.invoices?.forEach(inv=>{
      if(inv.fyYear) fys.add(inv.fyYear);
      if(inv.period) periods.add(inv.period);
    });
  });
  const fySel=document.getElementById('colFyFilter');
  [...fys].sort().forEach(f=>{ const o=document.createElement('option'); o.value=f; o.textContent='FY '+f; fySel.appendChild(o); });
  const perSel=document.getElementById('colPeriodFilter');
  [...periods].sort().forEach(p=>{ const o=document.createElement('option'); o.value=p; o.textContent=p; perSel.appendChild(o); });

  renderColDark();
}

function getColRows(){
  const members=Object.keys(G.data).filter(k=>!k.startsWith('_')).map(k=>G.data[k]);
  const search=(document.getElementById('colSearchDark').value||'').toLowerCase();
  const filterFy=document.getElementById('colFyFilter').value||'';
  const filterPeriod=document.getElementById('colPeriodFilter').value||'';
  const filterPay=document.getElementById('colPayFilter').value||'';

  const rows=[];
  members.forEach(m=>{
    const invList=(m.invoices||[]).filter(inv=>{
      if(filterFy && inv.fyYear!==filterFy) return false;
      if(filterPeriod && inv.period!==filterPeriod) return false;
      return true;
    });
    invList.forEach(inv=>{
      let ps='';
      if((inv.paidAmount||0)>=(inv.billAmount||0) && (inv.billAmount||0)>0) ps='Paid';
      else if(!(inv.paidAmount||0)) ps='Unpaid';
      else ps='Partial';
      if(filterPay && ps!==filterPay) return;
      if(search){
        const hay=[m.name,m.plotNo,m.laneNo,inv.period,m.status,m.occupancyStatus].join(' ').toLowerCase();
        if(!hay.includes(search)) return;
      }
      rows.push({m,inv,ps});
    });
  });
  return rows;
}

function renderColDark(){
  const rows=getColRows();
  const filt_fy=document.getElementById('colFyFilter').value||'';
  const filt_per=document.getElementById('colPeriodFilter').value||'';

  // Build month-wise summary from member invoices matching filters
  const monthMap={};
  const members=Object.keys(G.data).filter(k=>!k.startsWith('_')).map(k=>G.data[k]);
  members.forEach(m=>{
    (m.invoices||[]).forEach(inv=>{
      if(filt_fy && inv.fyYear!==filt_fy) return;
      if(filt_per && inv.period!==filt_per) return;
      const per=inv.period||'Unknown';
      if(!monthMap[per]) monthMap[per]={billed:0,collected:0,pending:0,total:0,paid:0,unpaid:0,partial:0};
      monthMap[per].billed+=(inv.billAmount||0);
      monthMap[per].collected+=(inv.paidAmount||0);
      monthMap[per].pending+=(inv.balance||0);
      monthMap[per].total++;
      const pv=inv.paidAmount||0; const bv=inv.billAmount||0;
      if(pv>=bv && bv>0) monthMap[per].paid++;
      else if(!pv) monthMap[per].unpaid++;
      else monthMap[per].partial++;
    });
  });

  // Sort periods chronologically
  const periodOrder=(p)=>{
    const months=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const [mon,yr]=p.split(' ');
    return (yr||'0000')+'_'+String(months.indexOf(mon)).padStart(2,'0');
  };
  const sortedPeriods=Object.keys(monthMap).sort((a,b)=>periodOrder(a).localeCompare(periodOrder(b)));

  const totalBilled=sortedPeriods.reduce((a,p)=>a+monthMap[p].billed,0);
  const totalCollected=sortedPeriods.reduce((a,p)=>a+monthMap[p].collected,0);
  const totalPending=sortedPeriods.reduce((a,p)=>a+monthMap[p].pending,0);
  const totalInvCount=sortedPeriods.reduce((a,p)=>a+monthMap[p].total,0);
  const totalPaidCount=sortedPeriods.reduce((a,p)=>a+monthMap[p].paid,0);
  const totalUnpaidCount=sortedPeriods.reduce((a,p)=>a+monthMap[p].unpaid,0);
  const overallPct=totalBilled>0?(totalCollected/totalBilled*100).toFixed(1):0;
  const activeMems=members.filter(m=>m.status&&m.status.includes('Active')).length;
  const periodLabel=sortedPeriods.length===1?sortedPeriods[0]:sortedPeriods.length+' months';

  // Meta right
  document.getElementById('col-meta-right').innerHTML=`
    <div>Generated: <b>${new Date().toLocaleString('en-IN',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'})}</b></div>
    <div style="margin-top:4px">Period: <b>${periodLabel}</b> &nbsp;|&nbsp; Active: <b>${activeMems} members</b></div>
  `;

  // KPIs
  const avgMonthly=sortedPeriods.length>0?Math.round(totalCollected/sortedPeriods.length):0;
  document.getElementById('col-kpis-dark').innerHTML=`
    <div class="col-kpi ck-blue">
      <div class="col-kpi-label">💰 Total Billed</div>
      <div class="col-kpi-value">${fmt(totalBilled)}</div>
      <div class="col-kpi-sub">${totalInvCount} invoices · ${sortedPeriods.length} months</div>
    </div>
    <div class="col-kpi ck-green">
      <div class="col-kpi-label">✅ Total Collected</div>
      <div class="col-kpi-value">${fmt(totalCollected)}</div>
      <div class="col-kpi-sub">${totalPaidCount} paid invoices · ${overallPct}%</div>
    </div>
    <div class="col-kpi ck-red">
      <div class="col-kpi-label">⚠️ Total Pending</div>
      <div class="col-kpi-value">${fmt(totalPending)}</div>
      <div class="col-kpi-sub">${totalUnpaidCount} unpaid invoices · ${(100-parseFloat(overallPct)).toFixed(1)}%</div>
    </div>
    <div class="col-kpi ck-amber">
      <div class="col-kpi-label">📊 Avg Monthly Collection</div>
      <div class="col-kpi-value">${fmt(avgMonthly)}</div>
      <div class="col-kpi-sub">Avg rate: ${overallPct}% overall</div>
    </div>
  `;

  // Month summary table
  const mb=document.getElementById('colMonthBody');
  mb.innerHTML=sortedPeriods.map(p=>{
    const v=monthMap[p];
    const pct=v.billed>0?(v.collected/v.billed*100).toFixed(1):0;
    const pctN=parseFloat(pct);
    const badgeCls=pctN>=60?'good':pctN>=30?'fair':'low';
    const badgeLbl=pctN>=60?'🟢 Good':pctN>=30?'🟡 Fair':'🔴 Low';
    const barColor=pctN>=60?'#2e7d32':pctN>=30?'#e65100':'#c62828';
    const barW=Math.min(100,Math.round(pctN));
    return `<tr>
      <td class="left" style="font-weight:600;color:#fff">📅 ${p}</td>
      <td>${fmt(v.billed)}</td>
      <td style="color:#66bb6a;font-weight:600">${fmt(v.collected)}</td>
      <td style="color:#ef5350;font-weight:600">${fmt(v.pending)}</td>
      <td>${v.total}</td>
      <td style="color:#66bb6a">${v.paid}</td>
      <td style="color:#ef5350">${v.unpaid}</td>
      <td style="font-weight:700;color:${barColor}">${pct}%</td>
      <td><div class="col-bar-wrap"><div class="col-bar-fill" style="width:${barW}%;background:${barColor}"></div></div></td>
      <td><span class="col-badge ${badgeCls}">${badgeLbl}</span></td>
    </tr>`;
  }).join('') + (sortedPeriods.length>1 ? `<tr class="col-total-row">
    <td class="left" style="color:#4fc3f7;font-weight:700">📊 TOTAL (${sortedPeriods.length}M)</td>
    <td style="color:#4fc3f7;font-weight:700">${fmt(totalBilled)}</td>
    <td style="color:#66bb6a;font-weight:700">${fmt(totalCollected)}</td>
    <td style="color:#ef5350;font-weight:700">${fmt(totalPending)}</td>
    <td style="color:#4fc3f7;font-weight:700">${totalInvCount}</td>
    <td style="color:#66bb6a;font-weight:700">${totalPaidCount}</td>
    <td style="color:#ef5350;font-weight:700">${totalUnpaidCount}</td>
    <td style="color:#ffa726;font-weight:700">${overallPct}%</td>
    <td><div class="col-bar-wrap"><div class="col-bar-fill" style="width:${Math.min(100,Math.round(parseFloat(overallPct)))}%;background:#ffa726"></div></div></td>
    <td><span class="col-badge ${parseFloat(overallPct)>=60?'good':parseFloat(overallPct)>=30?'fair':'low'}">${parseFloat(overallPct)>=60?'⚡ Strong':parseFloat(overallPct)>=30?'⚠️ Fair':'🔴 Needs Work'}</span></td>
  </tr>` : '');

  // Detail table (paginated)
  const PS=G.PAGE_SIZE; const page=G.colPage;
  const totalPages=Math.ceil(rows.length/PS)||1;
  const slice=rows.slice((page-1)*PS,page*PS);

  document.getElementById('colDetailBody').innerHTML=slice.map((r,i)=>{
    const {m,inv,ps}=r;
    const badgeCls=ps==='Paid'?'good':ps==='Unpaid'?'low':'fair';
    const badgeLbl=ps==='Paid'?'✅ Paid':ps==='Unpaid'?'❌ Unpaid':'⚠️ Partial';
    return `<tr>
      <td style="color:#5a8aaa">${(page-1)*PS+i+1}</td>
      <td class="left" style="font-weight:600;color:#fff">${m.plotNo||'—'}</td>
      <td class="left">${m.name}</td>
      <td>${m.laneNo?'Lane '+m.laneNo:'—'}</td>
      <td style="color:#4fc3f7">${inv.period}</td>
      <td>${fmt(inv.billAmount)}</td>
      <td style="color:#66bb6a;font-weight:600">${fmt(inv.paidAmount)}</td>
      <td style="color:${(inv.balance||0)>0?'#ef5350':'#66bb6a'};font-weight:600">${fmt(inv.balance)}</td>
      <td><span class="col-badge ${badgeCls}">${badgeLbl}</span></td>
    </tr>`;
  }).join('');

  // Pagination
  const pag=document.getElementById('colDetailPag');
  if(totalPages<=1){ pag.innerHTML=`<span>${rows.length} records</span>`; }
  else {
    let html=`<span>${rows.length} records | Page ${page}/${totalPages}</span>`;
    if(page>1) html+=`<button onclick="G.colPage=${page-1};renderColDark()">◀</button>`;
    const s2=Math.max(1,page-2),e2=Math.min(totalPages,page+2);
    for(let p2=s2;p2<=e2;p2++) html+=`<button class="${p2===page?'active':''}" onclick="G.colPage=${p2};renderColDark()">${p2}</button>`;
    if(page<totalPages) html+=`<button onclick="G.colPage=${page+1};renderColDark()">▶</button>`;
    pag.innerHTML=html;
  }

  // Draw charts
  setTimeout(()=>{ drawColBar(sortedPeriods,monthMap); drawColLine(sortedPeriods,monthMap); },80);
}

// ── Collection Bar Chart ───────────────────────────────────────────
function drawColBar(periods, monthMap){
  const c=document.getElementById('colBarChart'); if(!c) return;
  const ctx=c.getContext('2d');
  const W=c.parentElement.clientWidth-0; const H=220;
  c.width=W; c.height=H;
  ctx.clearRect(0,0,W,H);
  if(!periods.length) return;

  const billed=periods.map(p=>monthMap[p].billed);
  const collected=periods.map(p=>monthMap[p].collected);
  const pending=periods.map(p=>monthMap[p].pending);
  const maxVal=Math.max(...billed,1);

  const pad={l:52,r:16,t:16,b:36};
  const chartW=W-pad.l-pad.r; const chartH=H-pad.t-pad.b;
  const barGroup=chartW/periods.length;
  const bw=Math.max(6,barGroup*0.22);

  // Grid
  for(let i=0;i<=4;i++){
    const y=pad.t+chartH-(i/4)*chartH;
    ctx.strokeStyle='#1e4060'; ctx.lineWidth=0.5;
    ctx.beginPath(); ctx.moveTo(pad.l,y); ctx.lineTo(W-pad.r,y); ctx.stroke();
    ctx.fillStyle='#5a8aaa'; ctx.font='9px Segoe UI'; ctx.textAlign='right';
    ctx.fillText('₹'+(maxVal*i/4/1000).toFixed(0)+'k', pad.l-4, y+3);
  }

  periods.forEach((p,i)=>{
    const x=pad.l+i*barGroup+barGroup/2;
    const base=pad.t+chartH;
    ctx.fillStyle='#1565c0'; const hB=(billed[i]/maxVal)*chartH;
    ctx.fillRect(x-bw*1.6,base-hB,bw,hB);
    ctx.fillStyle='#2e7d32'; const hC=(collected[i]/maxVal)*chartH;
    ctx.fillRect(x-bw*0.5,base-hC,bw,hC);
    ctx.fillStyle='#c62828'; const hP=(pending[i]/maxVal)*chartH;
    ctx.fillRect(x+bw*0.6,base-hP,bw,hP);
    ctx.fillStyle='#7fb3d3'; ctx.font='9px Segoe UI'; ctx.textAlign='center';
    const lbl=p.split(' ')[0];
    ctx.fillText(lbl, x, H-4);
  });

  // Legend
  [['#1565c0','Billed'],['#2e7d32','Collected'],['#c62828','Pending']].forEach(([col,lbl],i)=>{
    ctx.fillStyle=col; ctx.fillRect(pad.l+i*90,3,12,8);
    ctx.fillStyle='#7fb3d3'; ctx.font='10px Segoe UI'; ctx.textAlign='left';
    ctx.fillText(lbl,pad.l+i*90+15,11);
  });
}

// ── Collection Line Chart ──────────────────────────────────────────
function drawColLine(periods, monthMap){
  const c=document.getElementById('colLineChart'); if(!c) return;
  const ctx=c.getContext('2d');
  const W=c.parentElement.clientWidth-0; const H=220;
  c.width=W; c.height=H;
  ctx.clearRect(0,0,W,H);
  if(!periods.length) return;

  const pcts=periods.map(p=>monthMap[p].billed>0?parseFloat((monthMap[p].collected/monthMap[p].billed*100).toFixed(1)):0);
  const maxPct=Math.max(100,Math.max(...pcts)*1.2)||100;

  const pad={l:40,r:14,t:18,b:32};
  const chartW=W-pad.l-pad.r; const chartH=H-pad.t-pad.b;

  // Grid
  for(let i=0;i<=4;i++){
    const y=pad.t+chartH-(i/4)*chartH;
    ctx.strokeStyle='#1e4060'; ctx.lineWidth=0.5;
    ctx.beginPath(); ctx.moveTo(pad.l,y); ctx.lineTo(W-pad.r,y); ctx.stroke();
    ctx.fillStyle='#5a8aaa'; ctx.font='9px Segoe UI'; ctx.textAlign='right';
    ctx.fillText((maxPct/4*i).toFixed(0)+'%',pad.l-4,y+3);
  }

  const pts=pcts.map((pv,i)=>({
    x:pad.l+(periods.length>1?i/(periods.length-1)*chartW:chartW/2),
    y:pad.t+chartH-(pv/maxPct)*chartH
  }));

  // Area fill
  if(pts.length>1){
    ctx.beginPath(); ctx.moveTo(pts[0].x,pad.t+chartH);
    pts.forEach(pt=>ctx.lineTo(pt.x,pt.y));
    ctx.lineTo(pts[pts.length-1].x,pad.t+chartH); ctx.closePath();
    const grad=ctx.createLinearGradient(0,pad.t,0,pad.t+chartH);
    grad.addColorStop(0,'rgba(79,195,247,0.25)'); grad.addColorStop(1,'rgba(79,195,247,0.02)');
    ctx.fillStyle=grad; ctx.fill();
    // Line
    ctx.beginPath(); ctx.strokeStyle='#4fc3f7'; ctx.lineWidth=2.5;
    pts.forEach((pt,i)=>i===0?ctx.moveTo(pt.x,pt.y):ctx.lineTo(pt.x,pt.y));
    ctx.stroke();
  }

  // Dots
  pts.forEach((pt,i)=>{
    ctx.beginPath(); ctx.arc(pt.x,pt.y,4,0,Math.PI*2);
    ctx.fillStyle='#4fc3f7'; ctx.fill();
    ctx.strokeStyle='#0f1923'; ctx.lineWidth=1.5; ctx.stroke();
    ctx.fillStyle='#e0e8f0'; ctx.font='bold 9px Segoe UI'; ctx.textAlign='center';
    ctx.fillText(pcts[i]+'%',pt.x,pt.y-8);
    ctx.fillStyle='#7fb3d3'; ctx.font='9px Segoe UI';
    ctx.fillText(periods[i].split(' ')[0],pt.x,H-4);
  });
}

"""

content = re.sub(OLD_JS_PATTERN, NEW_COL_JS, content, flags=re.DOTALL)

open(PATH,'w',encoding='utf-8').write(content)
print('Done. File size:', len(content), 'bytes')
print('Has col-kpis-dark:', 'col-kpis-dark' in content)
print('Has drawColBar:', 'drawColBar' in content)
print('Has drawColLine:', 'drawColLine' in content)
print('Has colMonthBody:', 'colMonthBody' in content)
