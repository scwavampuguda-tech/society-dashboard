import json, sys

d = json.load(open('api_v3_test.json', encoding='utf-8'))
keys = [k for k in d if not k.startswith('_')]

# Member status
statuses = {}
occupancy = {}
total_inv = 0; total_paid = 0; total_bal = 0; paid_inv = 0; unpaid_inv = 0
for k in keys:
    m = d[k]
    st = m.get('status','')
    statuses[st] = statuses.get(st,0)+1
    oc = m.get('occupancyStatus','')
    occupancy[oc] = occupancy.get(oc,0)+1
    for inv in m.get('invoices',[]):
        total_inv += inv.get('billAmount',0)
        total_paid += inv.get('paidAmount',0)
        total_bal += inv.get('balance',0)
        if inv.get('paidAmount',0) >= inv.get('billAmount',0) and inv.get('billAmount',0)>0:
            paid_inv+=1
        elif inv.get('paidAmount',0)==0:
            unpaid_inv+=1

print('statuses:', statuses)
print('occupancy:', occupancy)
print('total_inv:', total_inv, 'paid:', total_paid, 'balance:', total_bal)
print('paid_inv:', paid_inv, 'unpaid_inv:', unpaid_inv)

# Payment sample
for k in keys:
    m = d[k]
    if m.get('payments'):
        print('PAY MEMBER:', m['name'], m['plotNo'])
        print('INV[0]:', m['invoices'][0])
        print('PAY[0]:', m['payments'][0])
        break

# Transactions per month
t = d['_transactions']
months = {}
for tx in t:
    ym = tx.get('yyyymm', tx['date'][:7])
    if ym not in months: months[ym] = {'in':0,'out':0,'count':0}
    months[ym]['count'] += 1
    if tx['flowType']=='in': months[ym]['in'] += tx['amount']
    else: months[ym]['out'] += tx['amount']

for ym in sorted(months):
    m2 = months[ym]
    print(ym, 'in:', m2['in'], 'out:', m2['out'], 'n:', m2['count'])

sys.stdout.flush()
