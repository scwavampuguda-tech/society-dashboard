import json

fresh = json.load(open("C:/Users/parkundu/Desktop/Society_SCRWA/live_data_fresh.json"))
old   = json.load(open("C:/Users/parkundu/Desktop/Society_SCRWA/live_data.json"))

fk = {k for k in fresh if isinstance(fresh[k], dict) and "propertyID" in fresh[k]}
ok = {k for k in old   if isinstance(old[k],   dict) and "propertyID" in old[k]}

def tot(d, ks):
    b = p = 0
    for k in ks:
        for i in d[k].get("invoices", []):
            b += i.get("billAmount", 0)
            p += i.get("paidAmount",  0)
    return b, p

ob, op = tot(old,   ok)
fb, fp = tot(fresh, fk)

print("=" * 60)
print("DATA COMPARISON  |  Jun 13 snapshot  vs  Live Jul 1 2026")
print("=" * 60)
print("OLD    props=%-3d  Billed=%8d  Paid=%8d  Due=%d" % (len(ok), ob, op, ob-op))
print("FRESH  props=%-3d  Billed=%8d  Paid=%8d  Due=%d" % (len(fk), fb, fp, fb-fp))
print("DIFF   props=%+d    Billed=%+d  Paid=%+d  Due=%+d" % (len(fk)-len(ok), fb-ob, fp-op, (fb-fp)-(ob-op)))
print()

nw = sorted(fk - ok)
print("NEW properties (%d):" % len(nw))
for pid in nw:
    p2  = fresh[pid]
    b2  = sum(i.get("billAmount", 0) for i in p2.get("invoices", []))
    pa2 = sum(i.get("paidAmount",  0) for i in p2.get("invoices", []))
    print("  + pid=%-4s  plot=%-12s  lane=%-8s  name=%-30s  billed=%d  paid=%d" % (
          pid, p2.get("plotNo","?"), p2.get("laneNo","?"), p2.get("name","?")[:30], b2, pa2))

rm = sorted(ok - fk)
print()
print("REMOVED properties (%d):" % len(rm))
for pid in rm:
    print("  - pid=%-4s  name=%s" % (pid, old[pid].get("name","?")[:40]))

chg = []
for pid in sorted(fk & ok):
    f2 = sum(i.get("paidAmount", 0) for i in fresh[pid].get("invoices", []))
    o2 = sum(i.get("paidAmount", 0) for i in old[pid].get("invoices",   []))
    if f2 != o2:
        chg.append((pid, fresh[pid].get("name","?"), o2, f2, f2-o2))

print()
print("PAYMENT CHANGES since Jun 13 (%d properties):" % len(chg))
for pid, nm, o2, f2, d in chg:
    print("  pid=%-4s  %-35s  old=%6d  new=%6d  diff=%+d" % (pid, nm[:35], o2, f2, d))

print()
print("=" * 60)
