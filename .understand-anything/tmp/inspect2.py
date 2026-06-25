import json
from collections import Counter
data = json.load(open(r'C:/Users/VVV/Desktop/SaaS/.understand-anything/tmp/arch-input.json', 'r', encoding='utf-8'))
print('TYPES', dict(Counter(n['type'] for n in data['fileNodes'])))
print('--- nodes NOT under frontend/ backend/ or Design app ---')
for n in data['fileNodes']:
    p = (n.get('filePath') or n['id']).replace('\\', '/')
    if not (p.startswith('frontend/') or p.startswith('backend/') or p.startswith('Design Front End UI_UX/')):
        print(n['type'], '::', n['id'], '::', (n.get('filePath') or '-'))
print('--- backend tables/schema/config/document/pipeline or odd dirs ---')
for n in data['fileNodes']:
    p = (n.get('filePath') or n['id']).replace('\\', '/')
    if p.startswith('backend/'):
        low = p.lower()
        if (not any(s in low for s in ['/routes/', '/services/', '/middleware/', '/workers/', '/queues/', '/config/'])) or n['type'] in ('table', 'schema', 'config', 'document', 'pipeline'):
            print(n['type'], '::', n['id'], '::', p)
