"""
Admin users are also members — they should see:
1. Full Admin Dashboard (all society data)
2. Their own Member dues/payment section at the bottom
"""
PATH = r'C:\Users\parkundu\Desktop\Society_SCRWA\Society_Files\HTML_Portals\SCRWA_Dashboard_v2.html'
f = open(PATH, 'r', encoding='utf-8').read()

# ── Fix 1: afterLoad() — also find memberData for admins ─────────────────────
OLD_AFTERLOAD = '''function afterLoad() {
  // Find member record for logged-in user
  if(!G.isAdmin) {
    const members = Object.keys(G.data).filter(k=>!k.startsWith('_')).map(k=>G.data[k]);
    G.memberData = members.find(m =>
      (m.email||'').toLowerCase()===G.user ||
      (m.proxyEmail||'').toLowerCase()===G.user
    ) || null;
  }
  // Timestamp
  const ts = G.data._summary?.generatedAt || G.data._meta?.generatedAt || '';
  if(ts) {
    document.getElementById('footerTs').textContent = 'Data as of: '+ts;
  }
  // Render
  if(G.isAdmin) renderAdminDash();
  else          renderMemberDash();
}'''

NEW_AFTERLOAD = '''function afterLoad() {
  // Always find member record for logged-in user (admins are members too)
  const members = Object.keys(G.data).filter(k=>!k.startsWith('_')).map(k=>G.data[k]);
  G.memberData = members.find(m =>
    (m.email||'').toLowerCase()===G.user ||
    (m.proxyEmail||'').toLowerCase()===G.user
  ) || null;

  // Timestamp
  const ts = G.data._summary?.generatedAt || G.data._meta?.generatedAt || '';
  if(ts) {
    document.getElementById('footerTs').textContent = 'Data as of: '+ts;
  }
  // Render
  if(G.isAdmin) renderAdminDash();
  else          renderMemberDash();
}'''

f = f.replace(OLD_AFTERLOAD, NEW_AFTERLOAD)
print('Fix1 afterLoad:', 'Always find member record' in f)

# ── Fix 2: At end of renderAdminDash(), append admin's own dues section ───────
OLD_ADMIN_END = "  setTimeout(()=>{ drawAdminBar(sortedMonths, monthMap); drawAdminDonut(); }, 100);\n}"

NEW_ADMIN_END = """  setTimeout(()=>{ drawAdminBar(sortedMonths, monthMap); drawAdminDonut(); }, 100);

  // ── Admin's own member section ──────────────────────────────────────────────
  appendAdminMemberSection();
}

function appendAdminMemberSection() {
  const m = G.memberData;
  if(!m) return; // admin not found as member — skip

  const invoices = m.invoices || [];
  const myBilled  = invoices.reduce((a,inv)=>a+(inv.billAmount||0),0);
  const myPaid    = invoices.reduce((a,inv)=>a+(inv.paidAmount||0),0);
  const myPending = invoices.reduce((a,inv)=>a+(inv.balance||0),0);
  const myUnpaid  = invoices.filter(inv=>(inv.balance||0)>0);
  const myPaidInv = invoices.filter(inv=>(inv.paidAmount||0)>0)
                            .sort((a,b)=>(b.lastPaidDate||'').localeCompare(a.lastPaidDate||''))
                            .slice(0,12);

  const alertHtml = myPending > 0
    ? `<div class="alert warn">⚠️ You have <b>${fmt(myPending)}</b> pending dues across <b>${myUnpaid.length}</b> invoice(s).</div>`
    : `<div class="alert good">✅ Your dues are all cleared!</div>`;

  const section = document.createElement('div');
  section.innerHTML = `
    <div class="sec-title" style="margin-top:8px">🏠 My Account — ${m.name}</div>
    ${alertHtml}

    <!-- Identity -->
    <div class="dues-header">
      <div>
        <div class="member-name">🏠 ${m.name}</div>
        <div class="member-plot">Plot: <b>${m.plotNo||'—'}</b> &nbsp;·&nbsp; Lane: <b>${m.laneNo?'Lane '+m.laneNo:'—'}</b> &nbsp;·&nbsp; House: <b>${m.house||'—'}</b></div>
        <div style="font-size:12px;color:#5a8aaa;margin-top:4px;">Occupancy: ${m.occupancyStatus||'—'} &nbsp;·&nbsp;
          Status: <span style="color:${(m.status||'').includes('Active')?'#66bb6a':'#ef5350'}">${m.status||'—'}</span>
        </div>
      </div>
      <div class="dues-amount">
        <div class="big">${fmt(myPending)}</div>
        <div class="lbl">My Pending</div>
      </div>
    </div>

    <!-- My KPIs -->
    <div class="kpi-row cols3">
      <div class="kpi blue">
        <div class="kpi-label">My Total Billed</div>
        <div class="kpi-value">${fmt(myBilled)}</div>
        <div class="kpi-sub">${invoices.length} invoices</div>
      </div>
      <div class="kpi green">
        <div class="kpi-label">My Total Paid</div>
        <div class="kpi-value">${fmt(myPaid)}</div>
        <div class="kpi-sub">${invoices.filter(i=>(i.paidAmount||0)>0).length} paid</div>
      </div>
      <div class="kpi red">
        <div class="kpi-label">My Pending</div>
        <div class="kpi-value">${fmt(myPending)}</div>
        <div class="kpi-sub">${myUnpaid.length} unpaid invoices</div>
      </div>
    </div>

    <!-- My pending invoices -->
    ${myUnpaid.length > 0 ? `
    <div class="card">
      <h4>⚠️ My Pending Dues</h4>
      <div class="tbl-wrap"><table>
        <thead><tr>
          <th>Period</th><th>FY</th>
          <th class="rc">Billed</th><th class="rc">Paid</th>
          <th class="rc">Balance</th><th class="cc">Status</th>
        </tr></thead>
        <tbody>
          ${myUnpaid.map(inv=>`<tr>
            <td style="font-weight:600;color:#fff">${inv.period||'—'}</td>
            <td style="color:#7fb3d3">${inv.fyYear||'—'}</td>
            <td class="rc">${fmt(inv.billAmount)}</td>
            <td class="rc" style="color:#66bb6a">${fmt(inv.paidAmount)}</td>
            <td class="rc" style="color:#ef5350;font-weight:700">${fmt(inv.balance)}</td>
            <td class="cc"><span class="badge ${(inv.paidAmount||0)>0?'partial':'unpaid'}">${(inv.paidAmount||0)>0?'⚠️ Partial':'❌ Unpaid'}</span></td>
          </tr>`).join('')}
        </tbody>
      </table></div>
    </div>` : ''}

    <!-- My payment history -->
    ${myPaidInv.length > 0 ? `
    <div class="card">
      <h4>✅ My Payment History</h4>
      <div class="tbl-wrap"><table>
        <thead><tr>
          <th>Period</th><th>FY</th>
          <th class="rc">Billed</th><th class="rc">Paid</th>
          <th class="cc">Status</th>
        </tr></thead>
        <tbody>
          ${myPaidInv.map(inv=>`<tr>
            <td style="font-weight:600;color:#fff">${inv.period||'—'}</td>
            <td style="color:#7fb3d3">${inv.fyYear||'—'}</td>
            <td class="rc">${fmt(inv.billAmount)}</td>
            <td class="rc" style="color:#66bb6a;font-weight:600">${fmt(inv.paidAmount)}</td>
            <td class="cc"><span class="badge ${(inv.balance||0)<=0?'paid':'partial'}">${(inv.balance||0)<=0?'✅ Paid':'⚠️ Partial'}</span></td>
          </tr>`).join('')}
        </tbody>
      </table></div>
    </div>` : ''}
  `;

  document.getElementById('mainContent').appendChild(section);
}"""

f = f.replace(OLD_ADMIN_END, NEW_ADMIN_END)
print('Fix2 admin member section:', 'appendAdminMemberSection' in f)

print('File size:', len(f))
open(PATH, 'w', encoding='utf-8').write(f)
print('Saved.')
