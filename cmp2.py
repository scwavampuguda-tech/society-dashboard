import json
fresh=json.load(open("C:/Users/parkundu/Desktop/Society_SCRWA/live_data_fresh.json"))
old=json.load(open("C:/Users/parkundu/Desktop/Society_SCRWA/live_data.json"))
fk={k for k in fresh if isinstance(fresh[k],dict) and "propertyID" in fresh[k]}
ok={k for k in old if isinstance(old[k],dict) and "propertyID" in old[k]}
print("OLD=%d FRESH=%d" % (len(ok),len(fk)))
print("New:",sorted(fk-ok))
print("Removed:",sorted(ok-fk))
