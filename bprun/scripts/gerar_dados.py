"""Gera bprun/dados.js (apenas números agregados, sem dados pessoais) a partir
do relatório de Inscritos exportado da Ticket Sports.

Uso:  python3 bprun/scripts/gerar_dados.py Inscritos_87490_XXXX.csv
"""
import csv, json, sys, os, re, unicodedata, collections as C
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
    # nome do cupom: cupons de parceiro repetem o mesmo código (ex.: título "10" = códigos RADARDASCORRIDAS10
    # e ERIVELTONPASSOS) -> mostra o código; lotes de códigos individuais (PCD150) -> mostra o título
    usos = C.defaultdict(list)
    for r in rows:
        tit = (r.get('Titulo cupom') or '').strip().upper()
        if tit: usos[tit].append((r.get('Codigo cupom') or '').strip().upper())
    individual = {t for t, cods in usos.items() if len(cods) > 1 and len(set(cods)) == len(cods)}
    def nome_cupom(r):
        tit = (r.get('Titulo cupom') or '').strip().upper()
        if not tit: return 'Sem cupom'
        cod = (r.get('Codigo cupom') or '').strip().upper()
        return tit if tit in individual or not cod else cod
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
        out.append({
            'd': d.isoformat(),
            'h': int((r.get('Hora do pedido') or '0').split(':')[0] or 0),
            'm': mod_label.get(norm(r['Modalidade']), r['Modalidade'].strip()),
            's': (r.get('Sexo') or '').strip().upper() or '—',
            'i': idade,
            'o': origem_map.get(norm(r.get('Origem do Pedido')), 'Outros'),
            'c': (r.get('Como_ficou_sabendo') or '').strip() or 'Não informado',
            'k': nome_cupom(r),
            't': camisa.replace('Camiseta tradicional curta', 'Tradicional').replace('Baby look curta', 'Baby look') or '—',
            'p': (r.get('N do Pedido') or '').strip(),
            'l': 'Manaus' if cidade.startswith('mana') and 'manacapuru' not in cidade else 'Outras cidades',
        })
    # cada registro é uma inscrição anônima: nenhum nome, documento, contato ou endereço sai daqui
    m = re.search(r'_(\d{2})(\d{2})(\d{4})_(\d{2})(\d{2})\d{2}', os.path.basename(path))
    gerado = f'{m[1]}/{m[2]}/{m[3]} {m[4]}:{m[5]}' if m else datetime.now().strftime('%d/%m/%Y %H:%M')
    dest = os.path.join(os.path.dirname(__file__), '..', 'dados.js')
    with open(dest, 'w', encoding='utf-8') as f:
        f.write('// Gerado por scripts/gerar_dados.py - apenas dados agregados/anônimos\n')
        f.write('window.BPRUN = ' + json.dumps({'gerado': gerado,
                                                'fonte': os.path.basename(path), 'inscricoes': out},
                                               ensure_ascii=False, separators=(',', ':')) + ';\n')
    print(f'{len(out)} inscrições -> {os.path.normpath(dest)}')

if __name__ == '__main__':
    main(sys.argv[1])
