#!/usr/bin/env python3
"""Convertit l'export Notion « La Poste - PSTNG » (fichiers JSON bruts des bases)
en fichier d'import WacMan au format wacman-account-v1.

Usage : python3 tools/notion_to_wacman.py <dossier_export_notion> <fichier_sortie.json>
"""
import json, re, sys, os

src, out = sys.argv[1], sys.argv[2]
load = lambda n: json.load(open(os.path.join(src, n)))['results']

def pid(url):
    m = re.search(r'([0-9a-f]{32})', url or '')
    return m.group(1) if m else None

def rel(v):
    if not v: return []
    if isinstance(v, list): return v
    try: return json.loads(v)
    except Exception: return []

CARD_TITLES = {}

def txt(v):
    if not v: return ''
    s = v.replace('<br>', '\n')
    s = re.sub(r'<span[^>]*>(.*?)</span>', r'\1', s)
    def mention(m):
        t = CARD_TITLES.get(pid(m.group(1)))
        return f'« {t} »' if t else ''
    s = re.sub(r'<mention-page url="([^"]+)"\s*/>', mention, s)
    s = re.sub(r'<[^>]+>', '', s)
    return s.strip()

# ------------------------------------------------------------------ options
options = []
def opt(key, kind, label, emoji='', color='slate', meta=None):
    options.append({'key': key, 'kind': kind, 'label': label, 'emoji': emoji, 'color': color, 'order': len([o for o in options if o['kind']==kind])+1, 'meta': meta or {}})
opt('st-todo','CARD_STATUS','À faire','', 'slate')
opt('st-doing','CARD_STATUS','En cours','', 'blue')
opt('st-standby','CARD_STATUS','Standby','', 'amber')
opt('st-done','CARD_STATUS','Terminé','', 'teal', {'done': True})
opt('al-vig','ALERT_LEVEL','Vigilance','🟡','amber')
opt('al-alert','ALERT_LEVEL','Alerte','🔴','red')
opt('hl-adv','HIGHLIGHT_TYPE','Avancée','✅','teal')
opt('hl-jalon','HIGHLIGHT_TYPE','Jalon atteint','🏁','blue')
opt('hl-dec','HIGHLIGHT_TYPE','Décision','⚖️','violet')
opt('hl-diff','HIGHLIGHT_TYPE','Difficulté','⚠️','red')
opt('ss-nom','STREAM_STATUS','Avancement nominal','🟢','teal')
opt('ss-pre','STREAM_STATUS','Attente prérequis LP','🟠','ocre')
opt('ss-alert','STREAM_STATUS','Alerte','🔴','red')
opt('th-build','TOPIC_THEME','Build','', 'blue')
opt('th-run','TOPIC_THEME','Run','', 'teal')
opt('th-com','TOPIC_THEME','Commercial','', 'ocre')
opt('na-alert','TOPIC_NATURE','Alerte','🔴','red')
opt('na-arb','TOPIC_NATURE','Arbitrage','⚖️','violet')
opt('na-info','TOPIC_NATURE','Information','ℹ️','blue')
opt('rt-risk','RISK_TYPE','Risque','', 'red')
opt('rt-arb','RISK_TYPE','Arbitrage','', 'violet')
opt('rs-open','RISK_STATUS','Ouvert','', 'amber')
opt('rs-arb','RISK_STATUS','Arbitré','', 'blue')
opt('rs-closed','RISK_STATUS','Clos','', 'teal', {'closed': True})
opt('rc-high','RISK_CRITICALITY','Haute','', 'red')
opt('rc-mid','RISK_CRITICALITY','Moyenne','', 'amber')
opt('rc-low','RISK_CRITICALITY','Basse','', 'slate')

STATUS = {'À faire':'st-todo','En cours':'st-doing','Standby':'st-standby','Terminé':'st-done'}
ALERT = {'🟡 Vigilance':'al-vig','🔴 Alerte':'al-alert'}
HLT = {'✅ Avancée':'hl-adv','🏁 Jalon atteint':'hl-jalon','⚖️ Décision':'hl-dec','⚠️ Difficulté':'hl-diff'}
SST = {'🟢 Avancement nominal':'ss-nom','🟠 Attente prérequis LP':'ss-pre','🔴 Alerte':'ss-alert'}
THEME = {'Build':'th-build','Run':'th-run','Commercial':'th-com'}
NATURE = {'🔴 Alerte':'na-alert','⚖️ Arbitrage':'na-arb','ℹ️ Information':'na-info'}
RTYPE = {'Risque':'rt-risk','Arbitrage':'rt-arb'}
RSTAT = {'Ouvert':'rs-open','Arbitré':'rs-arb','Clos':'rs-closed'}
RCRIT = {'Haute':'rc-high','Moyenne':'rc-mid','Basse':'rc-low'}

# ------------------------------------------------------------------ streams
EMOJI = {'Déploiement':'🚚','Technico-fonctionnel':'🛰️','Exploitation':'🛠️','Outillage Data & référentiel':'🗄️','Finance et TEM':'💶','Mainteneurs Postaux':'👷','Sécurité':'🔒','Gouvernance':'🏛️','Logistique':'📦','Transverse':'🌐'}
FLAGS = {  # inKanban, inStatusTemplate, inDirectory
 'Déploiement':(True,True,True),'Technico-fonctionnel':(True,True,True),'Exploitation':(True,True,True),
 'Outillage Data & référentiel':(True,True,True),'Sécurité':(True,True,True),'Finance et TEM':(True,False,True),
 'Logistique':(True,False,True),'Mainteneurs Postaux':(False,True,False),'Gouvernance':(False,True,True),'Transverse':(False,False,False)}
streams = []
skey = {}
for r in load('streams.json'):
    n = r['Stream']; k = 'str-' + re.sub(r'[^a-z]+','-', n.lower()).strip('-')
    skey[n] = k
    f = FLAGS[n]
    streams.append({'key':k,'name':n,'emoji':EMOJI[n],'leader':r.get('Leader Wifirst',''),'prescriber':(r.get('Prescripteur La Poste') or '').replace('  ',' '),
                    'order': int(r.get('Ordre') or 0),'active':True,'inKanban':f[0],'inStatusTemplate':f[1],'inDirectory':f[2]})
skey['Transverse']='str-transverse'
streams.append({'key':'str-transverse','name':'Transverse','emoji':EMOJI['Transverse'],'leader':'','prescriber':'','order':10,'active':True,'inKanban':False,'inStatusTemplate':False,'inDirectory':False})
streams.sort(key=lambda s:(s['order'], s['name']))

# ------------------------------------------------------------------ sprints
sprints=[]; spkey={}
STATE={'▶️ En cours':'CURRENT','⏳ À venir':'UPCOMING','✅ Terminé':'DONE'}
for r in sorted(load('sprints.json'), key=lambda r:r['date:Dates:start']):
    k='sp-'+r['Sprint'].split()[-1]; spkey[pid(r['url'])]=k
    sprints.append({'key':k,'name':r['Sprint'],'startDate':r['date:Dates:start'],'endDate':r.get('date:Dates:end'),'state':STATE[r['État']],
                    'objective':r.get('Objectif',''),'clientMilestone':r.get('Échéance La Poste',''),'order':int(r['Sprint'].split()[-1])})

# ------------------------------------------------------------------ contacts
contacts=[
 {'key':'ct-florent','name':'Florent Jolivet','email':'florent.jolivet-ext@wifirst.fr','company':'Wifirst','role':'Directeur de projet'},
 {'key':'ct-thibaut','name':'Thibaut Bayen','email':'','company':'Wifirst','role':''},
 {'key':'ct-hassan','name':'Hassan Zahid','email':'hassan.zahid-ext@wifirst.fr','company':'Wifirst','role':''},
 {'key':'ct-matthieu','name':'Matthieu Roca','email':'','company':'Wifirst','role':''},
 {'key':'ct-hugo','name':'Hugo Xoual','email':'','company':'Wifirst','role':''},
 {'key':'ct-robin','name':'Robin Colin','email':'robin.colin@wifirst.fr','company':'Wifirst','role':''},
 {'key':'ct-sebastien','name':'Sébastien Farce','email':'','company':'Wifirst','role':''},
]
USER={'user://3e6d872b-594c-81f6-8280-0002ce2cdbca':'ct-florent','user://1e3d872b-594c-819d-a913-0002cf309134':'ct-thibaut',
 'user://3e7d872b-594c-811b-af34-00025e3a073b':'ct-hassan','user://da8a3469-6f31-4ee4-9de0-98efd42d7e21':'ct-matthieu',
 'user://30ad872b-594c-81bb-a84e-000251f4b926':'ct-hugo','user://3e9d872b-594c-81ca-acf1-0002511d4bca':'ct-robin',
 'user://21bd872b-594c-81f0-a5c6-000251e8acab':'ct-sebastien'}
def owner(v):
    l = rel(v) if v and v.startswith('[') else ([v] if v else [])
    return USER.get(l[0]) if l else None

# ------------------------------------------------------------------ cards
livs = load('livrables.json')
for r in livs: CARD_TITLES[pid(r['url'])] = r.get('Livrable','')
cards=[]; cref={}
skipped=[]
for r in sorted(livs, key=lambda r:int(r['Réf.'])):
    if not r.get('Livrable','').strip():
        skipped.append(r['Réf.']); continue
    ref=int(r['Réf.']); cref[pid(r['url'])]=ref
    sp = rel(r.get('Sprint'))
    cards.append({'ref':ref,'title':r['Livrable'].strip(),'emoji':'','description':txt(r.get('Description')),'progressNote':txt(r.get("Point d'avancement")),
        'nextSteps':txt(r.get('Prochaines étapes')),'alertsNote':txt(r.get('Alertes / arbitrages')),'dueDate':r.get('date:Échéance:start'),
        'stream':skey.get(r.get('Stream')),'sprint':spkey.get(pid(sp[0])) if sp else None,'status':STATUS.get(r.get('Statut')),
        'alertLevel':ALERT.get(r.get('Vigilance / Alerte')),'owner':owner(r.get('Porteur')),'position':ref,'updatedAt':r.get('Mis à jour'),'contentUpdatedAt':r.get('Mis à jour')})

# ------------------------------------------------------------------ meeting types
meetingTypes=[
 {'key':'mt-pw','name':'Program weekly','emoji':'📰','frequency':'Hebdo, 1h (lundi 14h-15h)','order':1,'blocks':['HIGHLIGHTS'],
  'description':"Revue des livrables du sprint, alertes, refinement du backlog suivant. Direction de projet et stream leaders. Les faits marquants de chaque séance restent visibles, de la plus récente à la plus ancienne.",
  'guide':"**Faits marquants** : avant chaque Program weekly, bouton « Nouvelle séance ». Choisir la date de la séance, puis saisir les faits marquants (titre, picto, stream, type, détail).\n**Repartir du Program weekly précédent** : bouton « À partir de la précédente » : les faits marquants (titre, stream, type, détail) sont recopiés à la nouvelle date, puis on ne modifie que ce qui a changé.\n**Historique** : les séances sont listées de la plus récente à la plus ancienne.",
  'settings':{}},
 {'key':'mt-coproj','name':'COPROJ LP','emoji':'📊','frequency':'Hebdo, 30 min','order':2,'blocks':['STREAM_STATUS'],
  'description':"Statut des streams présenté à chaque COPROJ La Poste (comité projet Build avec le directeur de projet La Poste).",
  'guide':"**Préparer un COPROJ LP** : bouton « Nouvelle séance ». La séance s'ouvre avec le tableau des streams déjà listés et vides : compléter pour chaque stream le Statut COPROJ LP, l'Avancement et les Alertes & prérequis LP.\n**Repartir du COPROJ LP précédent** : bouton « À partir de la précédente » : statut, avancement et alertes & prérequis LP sont recopiés pour chaque stream, puis on ne modifie que ce qui a changé.\n**Ajouter ou retirer un stream** : « Ajouter une ligne » dans la séance, ou supprimer la ligne. Les streams créés d'office se règlent dans Paramètres > Streams (« ligne de séance »).",
  'settings':{'statusLabel':'Statut COPROJ LP','progressLabel':'Avancement','alertsLabel':'Alertes & prérequis LP'}},
 {'key':'mt-sc','name':'Strategic Committee','emoji':'🎯','frequency':'Hebdo pendant le build, puis plus espacé','order':3,'blocks':['TOPICS'],
  'description':"**Strategic Committee Compte La Poste** : vision macro du programme, alertes et arbitrages au niveau management. Hebdomadaire pendant le build, puis plus espacé.\nOn n'y porte que des sujets qui apportent une remontée d'information importante, une alerte ou une demande d'arbitrage. Chaque sujet relève du **Build**, du **Run** (à partir de janvier 2027) ou du **Commercial**.",
  'guide':"**Préparer un comité** : bouton « Nouvelle séance » et choisir la date du comité.\n**Repartir du comité précédent** : bouton « À partir de la précédente » : les sujets (picto, ordre, thématique, nature, description, arbitrage demandé) sont recopiés sans les lignes « Décision : … » du comité précédent.\n**Ajouter un sujet** : « Ajouter un sujet » dans la séance. Renseigner Sujet, picto, Thématique (Build, Run, Commercial), Nature (🔴 Alerte, ⚖️ Arbitrage, ℹ️ Information), Description et Arbitrage ou décision demandée. L'ordre de passage se règle par glisser-déposer.\n**En séance** : saisir les décisions dans la colonne « Arbitrage ou décision demandée » (ligne « Décision : … »).\n**Historique** : les comités sont listés du plus récent au plus ancien.",
  'settings':{'decisionLabel':'Arbitrage ou décision demandée'}},
]

# ------------------------------------------------------------------ governance (tables de la page Notion)
governance=[]
for i,(n,p,pa,f,su) in enumerate([
 ('Strategic Committee Compte La Poste','Vision macro du compte, alertes et arbitrages au niveau management : build, run, suivi commercial.','Direction de projet, management Wifirst','Hebdo pendant le build, puis plus espacé','Onglet Strategic Committee'),
 ('Program weekly PST NG','Revue des livrables du sprint, alertes, refinement du backlog suivant.','Direction de projet et stream leaders','Hebdo, 1h','Kanban'),
 ('Stream weekly','Revue des livrables et du backlog du stream, alertes, revue des supports.','Direction de projet, stream leader, contributeurs','Hebdo, 1h','Kanban et backlog'),
 ('Préparation interne atelier','Revue des supports avant présentation à La Poste.','Porteur du livrable, stream leader, direction de projet','Selon besoin','Livrable en revue')]):
    governance.append({'scope':'INTERNAL','name':n,'purpose':p,'participants':pa,'frequency':f,'support':su,'order':i+1})
for i,(n,p,pa,f,su) in enumerate([
 ('Comité Strat Wifirst / La Poste','Revue contractuelle et roadmap commune, arbitrage du top management.','Direction de projet, top management Wifirst et La Poste','Trimestriel, à initialiser','Wifirst'),
 ('Comité de pilotage Build',"Arbitrage des points bloqués, planning, risques, suivi de l'avancement.",'Direction de projet, management Wifirst et La Poste','Mensuel, à initialiser','Wifirst'),
 ('Comité projet Build','Avancement des streams, alertes et blocages des deux côtés.','Direction de projet, directeur de projet La Poste','Hebdo, 30 min','Wifirst'),
 ('Fenêtre de coordination','Ordre du jour fixé par La Poste, sujets multi-opérateurs.','Direction de projet, stream leaders ou contributeurs','Hebdo, 1h','La Poste'),
 ('Comité de suivi Stream','Suivi des livrables, du backlog et des actions, planification des ateliers.','Stream leaders Wifirst et La Poste, contributeurs si besoin','Hebdo, 30 min à 1h','Conjoint'),
 ('Ateliers thématiques','Produire un livrable ou trancher un sujet, sur un ordre du jour défini.','Stream leader et contributeurs, direction de projet en option','Selon besoin',"Selon l'atelier")]):
    governance.append({'scope':'JOINT','name':n,'purpose':p,'participants':pa,'frequency':f,'support':su,'order':i+1})

# ------------------------------------------------------------------ meetings
meetings=[]
FM_ICON={'3e6ef0373f418152b9c4eae0a63434aa':'🔒','3e6ef0373f41815ea141f8414c6c7ff0':'🚀','3e6ef0373f4181f6af07cc864d76a1c2':'📶'}
FM_ORDER={'Pilote Lot 3 Fast Track':1,'Mise en place du SOC':2,'Processus Pilote Lot 3':3,'Mise en concurrence 150 box 4G':2,'Processus Lot 3':3}
pw = {pid(r['url']): r['date:Date:start'] for r in load('program_weekly.json')}
fms = load('faits.json')
for mid, date in sorted(pw.items(), key=lambda x:x[1]):
    hs=[]
    for r in fms:
        if pid(rel(r['Program weekly'])[0]) != mid: continue
        hs.append({'title':r['Fait marquant'].strip(),'emoji':FM_ICON.get(pid(r['url']),''),'detail':txt(r.get('Détail')),'stream':skey.get(r.get('Stream')),
                   'type':HLT.get(r.get('Type')),'author':'ct-florent','order':FM_ORDER.get(r['Fait marquant'].strip(),9)})
    hs.sort(key=lambda h:h['order'])
    meetings.append({'type':'mt-pw','date':date,'notes':'','highlights':hs,'statuses':[],'topics':[]})

cp = {pid(r['url']): r.get('date:Date:start') for r in load('coproj.json')}
sts = load('statuts.json')
for mid, date in sorted([x for x in cp.items() if x[1]], key=lambda x:x[1]):
    rows=[]
    for r in sts:
        if pid(rel(r['COPROJ LP'])[0]) != mid: continue
        if not r.get('Stream') and not r.get('Avancement') and not r.get('Alertes & prérequis LP'): continue
        rows.append({'stream':skey.get(r.get('Stream')),'statuses':[SST[x] for x in rel(r.get('Statut COPROJ LP'))],'progress':txt(r.get('Avancement')),
                     'alerts':txt(r.get('Alertes & prérequis LP')),'order':int(r.get('Ordre') or 0)})
    rows.sort(key=lambda x:x['order'])
    meetings.append({'type':'mt-coproj','date':date,'notes':'','highlights':[],'statuses':rows,'topics':[]})

sc = {pid(r['url']): r['date:Date:start'] for r in load('sc.json')}
subs = load('sujets.json')
for mid, date in sorted(sc.items(), key=lambda x:x[1]):
    ts=[]
    for r in subs:
        if pid(rel(r['Strategic Committee'])[0]) != mid: continue
        ts.append({'title':r['Sujet'].strip(),'emoji':r.get('icon',''),'theme':THEME.get(r.get('Thématique')),'nature':NATURE.get(r.get('Nature')),
                   'description':txt(r.get('Description')),'decisionRequest':txt(r.get('Arbitrage ou décision demandée')),'order':int(r.get('Ordre') or 99)})
    ts.sort(key=lambda t:t['order'])
    meetings.append({'type':'mt-sc','date':date,'notes':'','highlights':[],'statuses':[],'topics':ts})

# ------------------------------------------------------------------ risks
risks=[]; missing=[]
for r in load('risques.json'):
    links=[]
    for u in rel(r.get('Livrables liés')):
        if pid(u) in cref: links.append(cref[pid(u)])
        else: missing.append((r['Sujet'], u))
    risks.append({'title':r['Sujet'],'type':RTYPE.get(r.get('Type')),'status':RSTAT.get(r.get('Statut')),'criticality':RCRIT.get(r.get('Criticité')),
                  'stream':skey.get(r.get('Stream')),'description':txt(r.get('Description')),'mitigation':txt(r.get('Décision / mitigation')),
                  'instance':r.get('Instance',''),'dueDate':r.get('date:Échéance:start'),'openedAt':(r.get('Ouvert le') or '')[:10] or None,
                  'owner':owner(r.get('Porteur')),'cards':links})

settings = {
 'intro': "**Program weekly du build PST-NG** : onglet **Kanban** pour les faits marquants, les cartes en vigilance ou en alerte et le kanban du sprint en cours ; onglet **Séances** pour le Program weekly, le COPROJ LP et le Strategic Committee ; onglet **Gouvernance** pour la comitologie, les streams et interlocuteurs et les sprints.",
 'kanbanGuide': "**Créer un livrable** : bouton « Nouvelle carte » du kanban. En tête de carte : Statut, Stream, Porteur, Sprint. Dans le corps : Description, Point d'avancement, Prochaines étapes, Vigilance / Alerte, Alertes / arbitrages, Échéance. Avancement (%), mise à jour et Réf. sont dans le volet « Détails ».\n**Vigilance / Alerte** : renseigner le champ sur la carte (🟡 Vigilance ou 🔴 Alerte) et détailler dans Alertes / arbitrages ; sans vigilance ni alerte, les actions vont dans Prochaines étapes. La carte remonte dans le bloc « Cartes en vigilance ou en alerte » jusqu'à ce qu'elle soit terminée.\n**Déplacer des cartes** : glisser-déposer d'une colonne à l'autre (ou d'un couloir de stream à l'autre), ou changer le statut dans la carte.\n**Changer de sprint** : onglet Gouvernance, tableau Sprints, bouton « Basculer au sprint suivant » : le sprint clos passe à Terminé, le suivant à En cours, et les cartes non terminées suivent.",
 'governanceIntro': "Deux étages : ce que nous pilotons en interne, et ce que nous partageons avec La Poste.\n**Ce qui change** : des noms anglais en interne pour ne plus confondre avec la comitologie La Poste, un Program weekly resserré sur la direction de projet et les stream leaders, des contributeurs conviés au Stream weekly.",
 'governanceInternalTitle': 'Comitologie interne Wifirst',
 'governanceJointTitle': 'Comitologie conjointe avec La Poste',
 'governanceInternalSupportLabel': 'Support',
 'governanceJointSupportLabel': 'Piloté par',
 'sprintMethodology': "Le build est découpé en sprints qui se terminent sur une échéance La Poste. Chaque sprint porte au maximum cinq à dix livrables par stream, et ce sont ces livrables qui sont suivis en Program weekly. Chaque stream leader tient leur statut à jour pour le Program weekly, et son backlog en autonomie.",
 'labels': {'leader':'Leader Wifirst','prescriber':'Prescripteur La Poste'},
}

data = {'format':'wacman-account-v1',
 'account':{'slug':'la-poste-pstng','name':'La Poste - PSTNG','clientName':'La Poste','clientShortName':'LP','emoji':'📫',
            'description':'Build PST-NG pour La Poste (Lots 2 et 3).','modules':{'program':True,'finance':True,'provisioning':True},'settings':settings},
 'options':options,'streams':streams,'sprints':sprints,'contacts':contacts,'meetingTypes':meetingTypes,'governance':governance,
 'cards':cards,'meetings':meetings,'risks':risks}
json.dump(data, open(out,'w'), ensure_ascii=False, indent=1)
print(f"cartes={len(cards)} (ignorées, sans titre : {skipped}) séances={len(meetings)} faits={sum(len(m['highlights']) for m in meetings)} "
      f"statuts={sum(len(m['statuses']) for m in meetings)} sujets={sum(len(m['topics']) for m in meetings)} risques={len(risks)} liens risque-carte manquants={missing}")
