"""Gera bprun/dados.js (apenas números agregados, sem dados pessoais) a partir
do relatório de Inscritos exportado da Ticket Sports.

Uso:  python3 bprun/scripts/gerar_dados.py Inscritos_87490_XXXX.csv
"""
import csv, json, sys, os, unicodedata, collections as C
from datetime import date, datetime

def norm(s):
    return unicodedata.normalize('NFD', (s or '').strip().lower()).encode('ascii', 'ignore').decode()

def main(path):
    rows = list(csv.DictReader(open(path, encoding='utf-8-sig'), delimiter=';'))
    rows = [r for r in rows if norm(r.get('Status do pedido')) == 'pago']
    mod_label = {
        'corrida 5km - publico geral': '5 km',
        'corrida 10km - publico geral': '10 km',
        'corrida 5km pcd - geral': '5 km PCD',
        'corrida 5km pcd - cadeirante': '5 km PCD Cadeirante',
        'corrida 5km pcd - visual': '5 km PCD Visual',
    }
    origem_map = {'app ticket sports': 'App Ticket Sports', 'novo-site': 'Site Ticket Sports', 'ticketsports': 'Site Ticket Sports',
                  'ig': 'Instagram', 'instagram': 'Instagram', 'fb': 'Facebook', 'emkt': 'E-mail marketing',
                  'emailrc': 'E-mail marketing', 'emailrc2': 'E-mail marketing'}
    hoje = date.today()
    out = []
    for r in rows:
        d = datetime.strptime(r['Data do pedido'], '%d/%m/%Y').date()
        try:
            n = datetime.strptime(r['Data de nascimento'], '%d/%m/%Y').date()
            idade = d.year - n.year - ((d.month, d.day) < (n.month, n.day))
        except ValueError:
            idade = None
        camisa = (r.get('CAMISETA AZUL  5K') or '').strip() or (r.get('CAMISETA VERMELHA  10K') or '').strip()
        cidade = norm(r.get('Cidade'))
        cupom = (r.get('Titulo cupom') or '').strip().upper()
        out.append({
            'd': d.isoformat(),
            'h': int((r.get('Hora do pedido') or '0').split(':')[0] or 0),
            'm': mod_label.get(norm(r['Modalidade']), r['Modalidade'].strip()),
            's': (r.get('Sexo') or '').strip().upper() or '—',
            'i': idade,
            'o': origem_map.get(norm(r.get('Origem do Pedido')), 'Outros'),
            'c': (r.get('Como_ficou_sabendo') or '').strip() or 'Não informado',
            'k': cupom or 'Sem cupom',
            't': camisa.replace('Camiseta tradicional curta', 'Tradicional').replace('Baby look curta', 'Baby look') or '—',
            'l': 'Manaus' if cidade.startswith('mana') and 'manacapuru' not in cidade else 'Outras cidades',
        })
    # cada registro é uma inscrição anônima: nenhum nome, documento, contato ou endereço sai daqui
    dest = os.path.join(os.path.dirname(__file__), '..', 'dados.js')
    with open(dest, 'w', encoding='utf-8') as f:
        f.write('// Gerado por scripts/gerar_dados.py - apenas dados agregados/anônimos\n')
        f.write('window.BPRUN = ' + json.dumps({'gerado': datetime.now().strftime('%d/%m/%Y %H:%M'),
                                                'fonte': os.path.basename(path), 'inscricoes': out},
                                               ensure_ascii=False, separators=(',', ':')) + ';\n')
    print(f'{len(out)} inscrições -> {os.path.normpath(dest)}')

if __name__ == '__main__':
    main(sys.argv[1])
