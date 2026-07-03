import json  
fresh=json.load(open(r"C:\Users\parkundu\Desktop\Society_SCRWA\live_data_fresh.json"))  
old=json.load(open(r"C:\Users\parkundu\Desktop\Society_SCRWA\live_data.json"))  
def t(d):  
 b=p=0  
 for v in d.values():  
  for i in v.get("invoices",[]): b+=i.get("billAmount",0);p+=i.get("paidAmount",0)  
 return b,p 
