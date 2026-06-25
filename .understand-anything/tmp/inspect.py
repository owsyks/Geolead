import json

d = json.load(open('tour-input.json', encoding='utf-8'))
nodes = {n['id']: n for n in d['nodes']}

def show(pred, label):
    print('===', label, '===')
    for n in d['nodes']:
        if pred(n):
            print(n['id'])
    print()

show(lambda n: n['type'] == 'schema', 'SCHEMA')
show(lambda n: n['type'] == 'document', 'DOCUMENTS')
show(lambda n: n['type'] in ('table', 'config', 'service') and 'Design Front End' not in n['id'], 'TABLE/CONFIG/SERVICE')
