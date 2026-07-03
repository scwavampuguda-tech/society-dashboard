"""
Full reconciliation: PDF data (hardcoded ground truth) vs live_data.json
Checks every property: name, plot, status, billed, paid, due, payStatus
"""
import json, sys

raw = json.load(open(r'C:\Users\parkundu\Desktop\Society_SCRWA\live_data.json', encoding='utf-8'))

def get_amounts(prop):
    b = sum(i.get('billAmount',0) or 0 for i in prop.get('invoices',[]))
    p = sum(i.get('paidAmount',0) or 0 for i in prop.get('invoices',[]))
    d = b - p
    if b==0:    st="nodata"
    elif d<=0:  st="paid"
    elif p>0:   st="partial"
    else:       st="unpaid"
    return int(b),int(p),int(d),st

# PDF ground truth: (sno, propID, plotNo, ownerName, memberStatus, payStatus, billed, paid, due)
# memberStatus: A=Active, I=Inactive, E=Exited, T=Transferred
# payStatus:    paid, partial, unpaid, nodata
PDF = [
  # Lane 01
  (1,"118","001","Annaram Swetha Reddy","A","unpaid",4500,0,4500),
  (2,"052","002","Godugulla Nikhil & Kuthadi Rajeshwari","I","nodata",0,0,0),
  (3,"116","003","Kurimilla Sanjeeva Goud","I","nodata",0,0,0),
  # Lane 02
  (4,"106","004","Gundarpu Indira","I","nodata",0,0,0),
  (5,"077","006/E/P","Kolisetty Guna Siva Tejaswi","A","unpaid",4500,0,4500),
  (6,"078","006/W/P","V. Padmakala","I","nodata",0,0,0),
  (7,"101","007/E/P","Bonthakarla Hemanth Kumar & Bonthakarla Hima Sai Durga","A","unpaid",4500,0,4500),
  (8,"013","007/W/P","Bhogra Karthik & Bhogra Swarupa","A","unpaid",4500,0,4500),
  (9,"171","008","D. Jaya Lakshmi","A","unpaid",4500,0,4500),
  (10,"230","009/N/P","Busipati Mohan Rao & Pennaperuru Sunitha Kiranmaye","I","unpaid",1500,0,1500),
  (11,"082","009/N/P","Tanniru Srinivas Rao","E","unpaid",3000,0,3000),
  (12,"084","009/S/P","Vemuri Ravi Kumar & Vemuri Murali Krishna","A","unpaid",4500,0,4500),
  (13,"035","010","Darapolla Ramulu & Darapolla Sai Leela","A","partial",4500,1000,3500),
  (14,"109","010/1","K. Adithya Viswanath","A","partial",4500,4000,500),
  (15,"098","011/N/P  011/S/P","T. Kishore Kumar","A","paid",4500,4500,0),
  (16,"108","012/S/P","Virula Karuna Sagar & Rep by claiment B. Chiranjan Reddy","A","partial",4500,4000,500),
  (17,"061","013/A  013/B","Usha Rani & Niharika Singh","A","partial",4500,3000,1500),
  # Lane 03
  (18,"104","014","Kommidi Yadaiah","A","unpaid",4500,0,4500),
  (19,"085","015/W/P  016/E/P","Thota Lavanya","A","unpaid",4500,0,4500),
  (20,"086","016/W/P","Chindam Venkatesh","A","unpaid",4500,0,4500),
  (21,"088","017/E/P","Bodigey Krishna","A","unpaid",4500,0,4500),
  (22,"182","017/W/P","Chindam Shiva Kumar","A","unpaid",4500,0,4500),
  (23,"126","041","Gandam Narasimha Rao","A","unpaid",4500,0,4500),
  (24,"169","042","Venu Vijay C. D.","I","nodata",0,0,0),
  (25,"167","043","Raveen Kumar Odnam","I","nodata",0,0,0),
  (26,"176","044","Smt. G. Anasuya","I","nodata",0,0,0),
  (27,"100","044/P","Mediconda Buchaiah","I","nodata",0,0,0),
  (28,"180","045","Bandi Ramu","I","nodata",0,0,0),
  (29,"178","046","Govindaswamy Jayavarman","A","unpaid",4500,0,4500),
  (30,"179","047","S. Umamaheshwari","A","unpaid",4500,0,4500),
  # Lane 04
  (31,"099","020/P","Onteddu Pandu & Onteddu Vara Laksmi","A","unpaid",4500,0,4500),
  (32,"215","020/P/W","Dhanalakshmi","A","unpaid",4500,0,4500),
  (33,"189","021","Dusari Arun Kumar","I","nodata",0,0,0),
  (34,"009","022","Dhanagiri Swetha Reddy","A","partial",4500,4000,500),
  (35,"010","023","Dhanagiri Swetha Reddy","A","partial",4500,4000,500),
  (36,"223","024","Kurakula Govardhan","A","partial",4500,2000,2500),
  (37,"208","024/N/P","Dusari Arun Kumar","I","nodata",0,0,0),
  (38,"220","024/S/P","Dusari Thilak Goud","I","nodata",0,0,0),
  (39,"192","025","Dusari Thilak Goud","I","nodata",0,0,0),
  # Lane 05
  (40,"163","027","Kaira Laxmi","A","unpaid",4500,0,4500),
  (41,"011","028","Dhanagiri Swetha Reddy","A","partial",4500,4000,500),
  (42,"012","029","Dhanagiri Swetha Reddy","A","partial",4500,4000,500),
  (43,"193","030","D Janardhan Reddy & Akula Shravan Kumar, Cheekoti Venkate","A","unpaid",4500,0,4500),
  (44,"170","031","Sardar Ekvinder Singh","A","unpaid",4500,0,4500),
  # Lane 06
  (45,"187","032","Saraswathi","A","partial",4500,1500,3000),
  (46,"188","033","Saraswathi","A","partial",4500,1500,3000),
  (47,"174","034","N. Yougender","A","unpaid",4500,0,4500),
  (48,"173","035","N. Yougender","A","unpaid",4500,0,4500),
  (49,"177","036","Smt. S. Padmini","A","unpaid",4500,0,4500),
  (50,"221","037","Thotakura Vijaya Sekhar","A","partial",4500,1000,3500),
  (51,"168","038","Mogulla Ella Reddy","I","nodata",0,0,0),
  (52,"128","040/P/E","D. Kumar","A","unpaid",4500,0,4500),
  (53,"127","040/P/W","M. Durga Reddy","A","unpaid",4500,0,4500),
  # Lane 07
  (54,"136","048","Jyothi Setty","A","unpaid",4500,0,4500),
  (55,"194","049/P  050/P","Kamagani Srinivas Goud","A","unpaid",4500,0,4500),
  # Lane 08
  (56,"051","050/P","Virupakshi Balusu","A","partial",4500,3000,1500),
  (57,"032","051","Ponnam Bhikshapathi Goud & Ellavva, Devaraju & Kishan","A","unpaid",4500,0,4500),
  (58,"092","052/P","Kumari Penujuri Sarvani","I","nodata",0,0,0),
  (59,"158","053/P","Pali Appa Rao","A","unpaid",4500,0,4500),
  (60,"114","054/E/P","Suthari Pavan Kumar","A","unpaid",4500,0,4500),
  (61,"115","054/W/P","Suthari Pavan Kumar","A","unpaid",4500,0,4500),
  (62,"024","055","Prathap Nitin Singh & Dubey Shasshankaa","A","unpaid",4500,0,4500),
  (63,"133","056","Sangam Yadagiri","A","unpaid",4500,0,4500),
  (64,"162","057","A. Malathi & A. Jyothi","A","unpaid",4500,0,4500),
  (65,"184","058","Rapole Mahesh","A","unpaid",4500,0,4500),
  # Lane 09
  (66,"185","059","Rapole Sai Kaushik","A","unpaid",4500,0,4500),
  (67,"186","060","Rapole Mahesh","A","unpaid",4500,0,4500),
  (68,"134","061","Sangam Yadagiri","A","unpaid",4500,0,4500),
  (69,"030","062","Gudapati Madhu Kumar & Gudapati Surekha","A","partial",4500,1501,2999),
  (70,"207","063/P","Uppala Omkar","E","nodata",0,0,0),
  (71,"057","063/P","Badha Bhojaiah Karthik","A","partial",4500,1500,3000),
  (72,"206","063/P  64","T. Naveen Kumar","A","unpaid",4500,0,4500),
  (73,"198","065/E/P","Tiruchirapally Hemanth Kumar & Gokul Vimala","A","paid",4500,4500,0),
  (74,"199","065/W/P","Kurakula Raju","A","partial",4500,1000,3500),
  (75,"150","066","Anantha Sunitha","A","paid",4500,4500,0),
  (76,"007","067","Lamba Rajasekhar Yadav & Lamba Sirisha","A","partial",4500,500,4000),
  (77,"212","068/EP","Sadiya Kausar","I","nodata",0,0,0),
  (78,"197","068/WP","Kurakula Ashok & Mattam Ravathi","A","unpaid",4500,0,4500),
  (79,"129","069","A. Jyothi","A","unpaid",4500,0,4500),
  (80,"130","070","A. Jyothi","A","unpaid",4500,0,4500),
  # Lane 10
  (81,"131","071","A. Jyothi","A","unpaid",4500,0,4500),
  (82,"132","072","A. Jyothi","A","unpaid",4500,0,4500),
  (83,"097","073","Yellupula Savitha & Kurapati Daniel","A","unpaid",4500,0,4500),
  (84,"008","074","Lamba Rajasekhar Yadav & Lamba Sirisha","A","unpaid",4500,0,4500),
  (85,"159","075","A. Arun Kumar","A","partial",4500,1000,3500),
  (86,"137","076","Kommidi Rishika Reddy","A","unpaid",4500,0,4500),
  (87,"138","077","Kommidi Rishika Reddy","A","unpaid",4500,0,4500),
  # Lane 11
  (88,"033","078","Kattula Vishnu Jyothi","A","unpaid",4500,0,4500),
  (89,"164","079","Sunitha Awasthi","I","nodata",0,0,0),
  (90,"117","080","Kaku Ravi","A","unpaid",4500,0,4500),
  (91,"190","081","Sudagani Sai Siva Rama Krishna & Suodgani Sanjana","E","nodata",0,0,0),
  (92,"216","081","Regulapati Supriya","A","partial",4500,3000,1500),
  (93,"038","082/N/P","Kanakatla Pandu Mudhiraj","A","unpaid",4500,0,4500),
  (94,"039","082/S/P","Parusa Tirupati Raj","A","unpaid",4500,0,4500),
  (95,"079","083","Bommagani Shyam & Bommagani Sunitha","A","partial",4500,4000,500),
  (96,"029","084/N/P","Madhasu Sri Laxmi","A","unpaid",4500,0,4500),
  (97,"042","084/S/P","Nagaraja Sai Krishna Kopparthi","A","unpaid",4500,0,4500),
  (98,"059","085/N/P","Bachu Narsimha","A","partial",4500,4000,500),
  (99,"015","085/S/P","Niladri Banerjee","A","paid",4500,4500,0),
  (100,"183","086/N/P","Lachoria Dinesh Kumar & Lachoria Raj Kumar","I","nodata",0,0,0),
  (101,"139","086/S/P","M S Prabhakar & M S Jhansi Lakshmi, M S Neha Priynaka","A","unpaid",4500,0,4500),
  (102,"065","087/N/P","Pampari Ravinder & Pampari Buchi Ramulu","A","partial",4500,500,4000),
  (103,"066","087/S/P","Pampari Buchi Ramulu & Pampari Ravinder","A","unpaid",4500,0,4500),
  (104,"017","088","Parusa Tirupati Raj","A","partial",4500,2000,2500),
  (105,"166","089","Vangala Lalitha & Vangala Venkata Narsimha Raju","A","unpaid",4500,0,4500),
  (106,"165","089/P/N","Vangala Ram Mohan","A","unpaid",4500,0,4500),
  (107,"045","090 (005-B/NP)","Natakarani Subba Rao","A","unpaid",4500,0,4500),
  (108,"044","090 (005-B/SP)","Mandapuram Vinay Reddy","A","partial",4500,3500,1000),
  (109,"096","091","Puthuri Lakshmi Tulasi","A","partial",4500,500,4000),
  (110,"145","092","Y. Bhaskar Reddy","E","nodata",0,0,0),
  (111,"211","092","Mandapuram Vinay Reddy","A","partial",4500,4000,500),
  (112,"146","094/S/P","Pothamsetty Soma Sekhar","E","nodata",0,0,0),
  (113,"219","094/S/P","Dondapati Govindamma & C. Chandrakala","I","nodata",0,0,0),
  (114,"121","095","A. M. Lakshmi","A","paid",4500,4500,0),
  (115,"122","096","A. M. Lakshmi","A","paid",4500,4500,0),
  (116,"123","097/N/P","Kondu Vijaya Prakash","A","partial",4500,3500,1000),
  (117,"049","097/S/P","Lakshmi Narayana Kondu","A","paid",4500,4500,0),
  (118,"225","098/N/P","Inthiyaz Khan Abdul","A","unpaid",2000,0,2000),
  (119,"070","098/N/P","Puvena Sree Ramulu","E","unpaid",2500,0,2500),
  (120,"227","098/S/P","Rampelli Bharat","A","unpaid",2500,0,2500),
  (121,"068","098/S/P","Puvena Sree Ramulu","E","unpaid",2000,0,2000),
  (122,"074","099","Earva Padma","A","partial",4500,4000,500),
  (123,"019","100","Vijaya Lakshmi Kopparthi & Seetha Rama Rao Kopparthi","A","unpaid",4500,0,4500),
  (124,"001","101","Anima Kundu","A","paid",4500,4500,0),
  (125,"025","102","V. Veera Venkata Ramana","I","nodata",0,0,0),
  (126,"034","103","Ranjith Kumar","A","unpaid",4500,0,4500),
  (127,"080","104","Yasur Srisha","A","unpaid",4500,0,4500),
  (128,"083","105/N/P","Pavan Kumar & Praveen Kumar","A","partial",4500,3500,1000),
  (129,"014","105/S/P","Atanu Majumder","A","paid",4500,4500,0),
  (130,"105","106/P","Katikala Anand Kumar","A","unpaid",4500,0,4500),
  (131,"053","106/P  107/P","Kethari Ramanjaneyulu","A","paid",4500,4500,0),
  (132,"144","107/P","Burra Premika & Burra Venkatesh","A","paid",4500,4500,0),
  # Lane 12
  (133,"062","108","Gunda Raghudath & Gunda Naga Sruthi Nakshathrika","A","paid",4500,4500,0),
  (134,"210","109/N/P","Bommena Suresh Yadav & Bommena Sahithi Yadav","A","unpaid",4500,0,4500),
  (135,"063","109/N/P","Pabbala Ramesh & Ch. Praveen","E","nodata",0,0,0),
  (136,"064","109/S/P","Krishnaveni Chevula","A","unpaid",4500,0,4500),
  (137,"175","110","Kollipara Prasanna","I","nodata",0,0,0),
  (138,"140","112","V. Aruna Devi","A","unpaid",4500,0,4500),
  (139,"071","113","Gundarpu Indira","A","unpaid",4500,0,4500),
  (140,"026","114/S/P","Vuppalapati Veera Venkata Ramana","I","nodata",0,0,0),
  (141,"209","115/N/P","Avusineni Venkata Ramana & Avisineni Aruna","A","unpaid",4500,0,4500),
  (142,"028","115/N/P","Pabbala Ramesh & Chindam Sattaiah","E","nodata",0,0,0),
  (143,"027","115/S/P  114/N/P","Peddinti Deepak Bhargava & Parasaram Sai Monika","A","paid",4500,4500,0),
  (144,"037","116","Earva Varalaxmi","A","unpaid",4500,0,4500),
  (145,"229","117","Vuppala Prashanth Kumar & Vuppala Nagambika","A","unpaid",500,0,500),
  (146,"067","117/NP","Sudagani Sai Siva Rama Krishna","E","partial",4000,500,3500),
  (147,"048","117/S/P","Sudagani Sanjana","E","unpaid",4000,0,4000),
  (148,"069","117/S/P","Puvena Sree Ramulu","E","nodata",0,0,0),
  (149,"022","118","Kondu Srilatha","A","partial",4500,4000,500),
  (150,"125","119","Sanjay Kudrimoti","A","unpaid",4500,0,4500),
  (151,"120","120","Kondamuri Sarvarayudu","A","unpaid",4500,0,4500),
  (152,"213","121","Temple-1","I","nodata",0,0,0),
  (153,"214","122","Temple-2","I","nodata",0,0,0),
  (154,"020","123","Puli Prithvi","A","unpaid",4500,0,4500),
  (155,"217","124","Itikela Rani","A","unpaid",4500,0,4500),
  (156,"060","124","K.V.S. Vara Prasad","E","nodata",0,0,0),
  (157,"157","125","Yerraboina Kalyan Krishna","A","unpaid",4500,0,4500),
  (158,"072","126/N/P","Alivala Janardan","A","partial",4500,500,4000),
  (159,"073","126/S/P","A. Anitha","I","nodata",0,0,0),
  (160,"161","127/N/P","Uppala Omkar & Vangapally Bhanu Chander","A","unpaid",4500,0,4500),
  (161,"043","127/S/P","Pullannagari Narender Reddy","A","unpaid",4500,0,4500),
  (162,"006","128/N/P","Gummadidala Naveen & Gummadidala Bhavani","A","partial",4500,500,4000),
  (163,"021","128/S/P","Pedapudi Seshacharyulu","A","unpaid",4500,0,4500),
  (164,"004","129/N/P","Rallakathva Sashi Rekha","A","partial",4500,1000,3500),
  (165,"003","129/S/P","Sheri Naresh & Sheri Swapna","A","partial",4500,1500,3000),
  (166,"119","130/N/P","Suthari Santosh Kumar","I","nodata",0,0,0),
  (167,"075","130/S/P  131/N/P","Satyanarayana Chivukula","A","partial",4500,500,4000),
  (168,"002","131/P","Phani Kumar Chivukula","A","partial",4500,4000,500),
  (169,"218","132","A. Varalakshmi","I","nodata",0,0,0),
  (170,"087","133","Madamanchi Gangadhar & Ravi Satya Narayana","A","unpaid",4500,0,4500),
  # Lane 13
  (171,"055","134/N/P","M. Gopinath","A","unpaid",4500,0,4500),
  (172,"047","134/S/P","Kadavakollu Anish Chaitanya","A","unpaid",4500,0,4500),
  (173,"056","134/S/P","Tanneru Satyavathi","E","nodata",0,0,0),
  (174,"005","135/N/P","Ajay Kumar Kinnera","A","partial",4500,1500,3000),
  (175,"081","135/S/P","Yagateela Sailaja","A","partial",4500,1000,3500),
  (176,"202","136","M. Sambaiah","E","unpaid",3000,0,3000),
  (177,"224","136","Shobhnam Vijaya Laxmi","A","unpaid",1500,0,1500),
  (178,"018","137","Potaraboina Rajasekhar & Potaraboina Lalitha","A","partial",4500,1000,3500),
  (179,"154","138","Bobbepalli V Revathi","A","partial",4500,500,4000),
  (180,"124","139","Ulligadda Vijay Kumar","A","partial",4500,3000,1500),
  (181,"135","140","Sudagani Shiva Rama Krishna & Thanda Sanjana","E","nodata",0,0,0),
  (182,"191","140","Venkatesh Nadagana","A","partial",4500,3500,1000),
  (183,"036","141/N/P  142/S/P","Ravi V S S B Rao & Ravi Kumari","A","unpaid",4500,0,4500),
  (184,"095","141/S/P","Hitesh Chandwani","A","unpaid",4500,0,4500),
  (185,"228","142/N/P","Kethari Harika Rani & Kethari Adarsh","I","nodata",0,0,0),
  (186,"093","142/N/P","Mattam Venugopal Yadav","I","nodata",0,0,0),
  (187,"023","143","Sumalatha Sattiraju","A","paid",4500,4500,0),
  (188,"107","144","Yamarthi Sudharani","A","unpaid",4500,0,4500),
  (189,"031","145","E. Vijaya Pal Reddy","A","unpaid",4500,0,4500),
  (190,"196","147","Rajashekar Yadav Lamba Yelliah","A","partial",4500,500,4000),
  (191,"050","148","Kotigari Sumalatha","A","unpaid",4500,0,4500),
  (192,"089","149","Ashvini Pavan","A","paid",4500,4500,0),
  (193,"090","150","Ashvini Pavan","A","paid",4500,4500,0),
  (194,"091","151","Ashvini Pavan","A","paid",4500,4500,0),
  (195,"040","152","Junnuthula Karuna","A","paid",4500,4500,0),
  (196,"054","153","Late Gurram Narsimha","A","unpaid",4500,0,4500),
  (197,"102","154","Garnepudi Sarath Chandra","A","unpaid",4500,0,4500),
  (198,"160","155","Garnepudi Siddhartha","A","unpaid",4500,0,4500),
  (199,"076","156","Syed Ghouse Mohinuddin Shadab","I","nodata",0,0,0),
  (200,"016","157","Macharla Srikanth","A","unpaid",4500,0,4500),
  # Lane 14
  (201,"094","158 159","Suthari Vijaya Laxmi","A","unpaid",4500,0,4500),
  (202,"172","160","Ammannagari Srinivas","A","unpaid",4500,0,4500),
  (203,"222","161/NP","Thota Venu Madhavi","I","nodata",0,0,0),
  (204,"058","161/S/P","Guduri Jyothi","I","nodata",0,0,0),
  (205,"156","162","Yamarthi Sudharani","A","unpaid",4500,0,4500),
  (206,"103","163","Tanneru Bhargavi","A","unpaid",4500,0,4500),
  (207,"141","164","Racha Prem Kumar","A","partial",4500,1000,3500),
  (208,"142","165","Racha Leelavathi","A","partial",4500,1000,3500),
  (209,"200","166","M. B. Anupama","A","unpaid",4500,0,4500),
  (210,"181","167","M. B. Aruna","A","unpaid",4500,0,4500),
  (211,"201","168","M. B. Appa","A","unpaid",4500,0,4500),
  (212,"111","170/P","Raavi Yadagiri Reddy","A","unpaid",4500,0,4500),
  (213,"110","171","Donthiri Prabhakar Reddy","A","unpaid",4500,0,4500),
  (214,"113","171/P","Sirimilla Arun Kumar","I","nodata",0,0,0),
  (215,"112","171/P  170/P","Sirimilla Arun Kumar","I","nodata",0,0,0),
  (216,"155","172","Narshimulu Vemula","A","unpaid",4500,0,4500),
  (217,"195","173","Tanneru Sathyavathi","A","unpaid",4500,0,4500),
  # Lane 15
  (218,"152","177/A/E/P","Syed Abbas Ali Razvi","T","unpaid",2000,0,2000),
  (219,"226","177/A/E/P","Dundigalla Bala Krishna","A","unpaid",2500,0,2500),
  (220,"151","177/A/W/P  178/A/E/P","Syeda Maleka Fatima","A","unpaid",4500,0,4500),
  (221,"148","177/E/P","Ambati Saritha","E","nodata",0,0,0),
  (222,"046","177/E/P","Husna Tabassum","A","unpaid",4500,0,4500),
  (223,"149","177/W/P  178/E/P","Pothamsetti Bhagya Lakshmi","A","unpaid",4500,0,4500),
  (224,"153","178/A/W/P","M. Rajani","A","unpaid",4500,0,4500),
  (225,"147","178/W/P","Pothamsetti Bhagya Lakshmi","A","unpaid",4500,0,4500),
  # Lane 16
  (226,"203","179 Part","Sri M. Shantha","A","unpaid",4500,0,4500),
  (227,"041","179/P","M Suvarna","A","unpaid",4500,0,4500),
  (228,"204","179PART 180PART","Salendri Madhavi Alias Lakshmi","I","nodata",0,0,0),
  (229,"205","179PART 180PART","Gowli Vijaya Lakshmi & Salendri Madhavi","I","nodata",0,0,0),
  (230,"143","180/E/P","Mekala Sai baba","A","unpaid",4500,0,4500),
]

STATUS_MAP = {"A":"Active","I":"Inactive","E":"Exited","T":"Transferred"}

issues = []
for row in PDF:
    sno,pid,plot,name,mst,pst,pb,pp,pd = row
    prop = raw.get(pid)
    if not prop:
        issues.append(f"S{sno} ID={pid}: NOT FOUND in live_data.json")
        continue
    lb,lp,ld,lst = get_amounts(prop)
    errs = []
    # amounts
    if lb != pb: errs.append(f"billed: live={lb} pdf={pb}")
    if lp != pp: errs.append(f"paid:   live={lp} pdf={pp}")
    if ld != pd: errs.append(f"due:    live={ld} pdf={pd}")
    if lst != pst: errs.append(f"payStatus: live={lst} pdf={pst}")
    # member status
    live_st = prop.get('status','')
    ok_status = STATUS_MAP[mst] in live_st
    if not ok_status: errs.append(f"memberStatus: live='{live_st}' pdf={STATUS_MAP[mst]}")
    if errs:
        issues.append(f"S{sno:03d} ID={pid} ({name[:30]}): " + " | ".join(errs))

print(f"\n{'='*70}")
print(f"RECONCILIATION REPORT — PDF vs live_data.json")
print(f"{'='*70}")
print(f"Total rows checked: {len(PDF)}")
print(f"Issues found: {len(issues)}")
print(f"{'='*70}\n")
for i in issues:
    print(i)
if not issues:
    print("ALL ROWS MATCH PERFECTLY.")
