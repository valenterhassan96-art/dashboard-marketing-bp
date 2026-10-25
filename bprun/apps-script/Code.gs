/**
 * BP RUN — leitor das confirmações de pedido da Ticket Sports no Gmail.
 *
 * A cada 1 minuto, procura no Gmail os e-mails "Pedido confirmado: ... - BP RUN 2026",
 * extrai só dados anônimos (data/hora do pagamento, modalidade, camiseta,
 * "como ficou sabendo", % de desconto e o número do pedido) e guarda num arquivo do seu Drive.
 * O painel (bprun-2026.web.app) lê esse resultado pelo endereço do app da web.
 * Nenhum nome, CPF, e-mail ou telefone sai daqui.
 *
 * Instalação: cole este arquivo em script.google.com, rode `instalar` uma vez e
 * publique como App da Web (Executar como: eu · Quem pode acessar: qualquer pessoa).
 */

const BUSCA = 'from:naoresponda@ticketsports.com.br subject:("Pedido confirmado" "BP RUN 2026")';
const ARQUIVO = 'bprun-confirmacoes-email.json';

const MODALIDADES = {
  'corrida 5km - publico geral': '5 km',
  'corrida 10km - publico geral': '10 km',
  'corrida 5km pcd - geral': '5 km PCD',
  'corrida 5km pcd - cadeirante': '5 km PCD Cadeirante',
  'corrida 5km pcd - visual': '5 km PCD Visual',
};

function norm_(s) {
  return String(s || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function texto_(s) {
  return String(s || '').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
}

function ler_() {
  const arquivos = DriveApp.getFilesByName(ARQUIVO);
  if (!arquivos.hasNext()) return { arquivo: null, dados: { inscricoes: [], lidos: [] } };
  const arquivo = arquivos.next();
  try {
    const d = JSON.parse(arquivo.getBlob().getDataAsString());
    // arquivo de versão antiga (sem controle de e-mails lidos/repetidos): relê tudo do zero, sem duplicar
    if (!d.lidos || (d.inscricoes.length && !d.inscricoes[0]._m)) { d.inscricoes = []; d.lidos = []; }
    return { arquivo: arquivo, dados: d };
  }
  catch (e) { return { arquivo: arquivo, dados: { inscricoes: [], lidos: [] } }; }
}

/** Lê só os e-mails ainda não lidos (os mais novos vêm primeiro) e acrescenta ao arquivo. */
function atualizar() {
  const atual = ler_(), lidos = {}, pedidos = {};
  atual.dados.lidos.forEach(function (id) { lidos[id] = true; });
  // um pedido só entra uma vez, mesmo que a Ticket Sports mande o e-mail repetido
  const inscricoes = [];
  atual.dados.inscricoes.forEach(function (r) {
    if (pedidos[r.p] && pedidos[r.p] !== r._m) return;
    pedidos[r.p] = r._m || 'x'; inscricoes.push(r);
  });
  for (let inicio = 0; ; inicio += 100) {
    const threads = GmailApp.search(BUSCA, inicio, 100);
    if (!threads.length) break;
    let novosNaPagina = 0;
    threads.forEach(function (t) {
      if (lidos[t.getId()]) return;
      lidos[t.getId()] = true; novosNaPagina++;
      t.getMessages().forEach(function (msg) {
        const pedido = (msg.getSubject().match(/Pedido confirmado:\s*(\d+)/) || [])[1];
        if (!pedido || pedidos[pedido]) return; // e-mail repetido do mesmo pedido
        pedidos[pedido] = msg.getId();
        const html = msg.getBody();
        const pg = html.match(/Data e hora do pagamento:\s*<\/b>\s*(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):/);
        const data = pg ? pg[3] + '-' + pg[2] + '-' + pg[1] : Utilities.formatDate(msg.getDate(), 'America/Manaus', 'yyyy-MM-dd');
        const hora = pg ? Number(pg[4]) : Number(Utilities.formatDate(msg.getDate(), 'America/Manaus', 'H'));
        // o e-mail não traz o nome do cupom, só o valor do desconto: guardamos o % para identificar o cupom
        const reais = function (re) { const m = html.match(re); return m ? Number(m[1].replace(/\./g, '').replace(',', '.')) : 0; };
        const desconto = reais(/Desconto:\s*R\$\s*([\d.,]+)/), total = reais(/Total:\s*R\$\s*([\d.,]+)/);
        const descPct = desconto && (desconto + total) ? Math.round(desconto / (desconto + total) * 100) : 0;
        // um pedido pode ter mais de um inscrito: cada bloco começa em "Nome do inscrito"
        html.split(/Nome do inscrito/).slice(1).forEach(function (bloco) {
          const cat = texto_((bloco.match(/<b>Categoria<\/b><\/td>\s*<td[^>]*>([^<]+)</) || [])[1]);
          if (!cat) return;
          const camisa = texto_((bloco.match(/<b>CAMISETA[^<]*<\/b><\/p>\s*<p>([^<]+)</) || [])[1])
            .replace('Camiseta tradicional curta', 'Tradicional').replace('Baby look curta', 'Baby look');
          const como = texto_((bloco.match(/Como ficou sabendo[^<]*<\/b><\/p>\s*<p>([^<]+)</) || [])[1])
            .replace('ticketsports.com.br', 'ticketsportscombr');
          inscricoes.push({ d: data, h: hora, m: MODALIDADES[norm_(cat)] || cat, t: camisa || '—', c: como || 'Não informado', p: pedido, dp: descPct, _m: msg.getId() });
        });
      });
    });
    if (threads.length < 100 || !novosNaPagina) break; // página sem novidade: o resto já foi lido
  }
  let pdv = atual.dados.pdv || [];
  try { pdv = lerPdv_(); } catch (e) { Logger.log('Falha ao ler a planilha do PDV: ' + e); }
  let colab = atual.dados.colab || [];
  try { colab = lerColab_(); } catch (e) { Logger.log('Falha ao ler a planilha dos colaboradores: ' + e); }
  const conteudo = JSON.stringify({
    atualizado: Utilities.formatDate(new Date(), 'America/Manaus', 'dd/MM HH:mm'),
    inscricoes: inscricoes,
    pdv: pdv,
    colab: colab,
    lidos: Object.keys(lidos),
  });
  if (atual.arquivo) atual.arquivo.setContent(conteudo);
  else DriveApp.createFile(ARQUIVO, conteudo, MimeType.PLAIN_TEXT);
  return inscricoes.length;
}

/**
 * Vendas no PDV: lê a planilha de respostas do formulário "VENDA KITS BP RUN".
 * Sai só o que é anônimo (data/hora, modalidade, sexo, idade, camiseta e código do vendedor).
 * O CPF é usado apenas para descartar respostas repetidas e vira um código embaralhado.
 */
const PLANILHA_PDV = '1MUp6CYfNs9xlbUp7GDctFXbx4rG5kqb_ABM7KV8um_k';

function lerPdv_() {
  const aba = SpreadsheetApp.openById(PLANILHA_PDV).getSheets()[0];
  const linhas = aba.getDataRange().getValues();
  const cab = linhas.shift().map(function (h) { return norm_(h); });
  const col = function (trecho) { return cab.findIndex(function (h) { return h.indexOf(trecho) >= 0; }); };
  const cData = col('carimbo'), cVend = col('vendedor'), cCpf = col('cpf'), cNasc = col('nascimento'),
        cSexo = col('sexo'), cCamisa = col('camisa'), cMod = col('modalidade');
  const vistos = {}, out = [];
  linhas.forEach(function (l) {
    const quando = l[cData];
    if (!(quando instanceof Date)) return;
    const cpf = String(l[cCpf] || '').replace(/\D/g, '');
    const chave = cpf || String(quando.getTime());
    if (vistos[chave]) return; // resposta repetida da mesma pessoa
    vistos[chave] = true;
    const id = Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, 'bprun-pdv-' + chave)).slice(0, 12);
    const nasc = l[cNasc] instanceof Date ? l[cNasc] : null;
    let idade = nasc ? quando.getFullYear() - nasc.getFullYear() - (quando < new Date(quando.getFullYear(), nasc.getMonth(), nasc.getDate()) ? 1 : 0) : null;
    if (idade != null && (idade < 5 || idade > 100)) idade = null; // data de nascimento digitada errada
    const mod = norm_(l[cMod]).replace(/\s/g, '');
    const camisaTxt = String(l[cCamisa] || '').trim(), baby = /baby/i.test(camisaTxt);
    const tam = camisaTxt.replace(/baby\s*look/i, '').trim().toUpperCase();
    out.push({
      d: Utilities.formatDate(quando, 'America/Manaus', 'yyyy-MM-dd'),
      h: Number(Utilities.formatDate(quando, 'America/Manaus', 'H')),
      m: mod.indexOf('10') === 0 ? '10 km' : '5 km',
      s: /^f/i.test(String(l[cSexo])) ? 'F' : /^m/i.test(String(l[cSexo])) ? 'M' : null,
      i: idade,
      t: tam ? (baby ? 'Baby look - ' : 'Tradicional - ') + tam : '—',
      // só códigos numéricos (quando digitaram um nome no lugar do código, não publicamos)
      v: /^\d{1,10}$/.test(String(l[cVend] || '').trim()) ? String(l[cVend]).trim().replace(/^0+(?=\d)/, '') : 'sem código',
      p: 'PDV-' + id,
    });
  });
  return out;
}

/**
 * Colaboradores: formulário "Inscrição Colaboradores - BP RUN". Conta só os com pagamento confirmado
 * ("Sim"), multiplica pela "Quantidade de Kit's" e sai anônimo (data, percurso, idade, camiseta).
 */
const PLANILHA_COLAB = '16oVwXjStilIOCeiAhpIknm-zUPprI6FV2zcbfGXnoTU';

function lerColab_() {
  const linhas = SpreadsheetApp.openById(PLANILHA_COLAB).getSheets()[0].getDataRange().getValues();
  const cab = linhas.shift().map(function (h) { return norm_(h); });
  const col = function (trecho) { return cab.findIndex(function (h) { return h.indexOf(trecho) >= 0; }); };
  const cData = col('carimbo'), cCpf = col('cpf'), cQtd = col('quantidade'), cPag = col('pagamento'),
        cCamisa = col('camisa'), cPerc = col('percurso'), cNasc = col('nascimento');
  const vistos = {}, out = [];
  linhas.forEach(function (l) {
    if (!/^s/i.test(String(l[cPag] || '').trim())) return; // pagamento não confirmado
    // data: aceita data do Google ou texto dd/mm/aaaa; ano digitado errado (ex.: 2023) vira 2026
    let quando = l[cData];
    if (!(quando instanceof Date)) {
      const m = String(quando || '').match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
      quando = m ? new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]), 12) : null;
    }
    if (!quando) return;
    if (quando.getFullYear() !== 2026) quando = new Date(2026, quando.getMonth(), quando.getDate(), quando.getHours());
    const cpf = String(l[cCpf] || '').replace(/\D/g, '');
    const chave = cpf || String(quando.getTime()) + out.length;
    if (vistos[chave]) return;
    vistos[chave] = true;
    const id = Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, 'bprun-col-' + chave)).slice(0, 12);
    const nasc = l[cNasc] instanceof Date ? l[cNasc] : null;
    let idade = nasc ? quando.getFullYear() - nasc.getFullYear() : null;
    if (idade != null && (idade < 5 || idade > 100)) idade = null;
    const camisaTxt = String(l[cCamisa] || '').trim(), baby = /baby/i.test(camisaTxt);
    const tam = camisaTxt.replace(/[-\s]*baby\s*look/i, '').trim().toUpperCase();
    const qtd = Math.max(1, Math.min(10, parseInt(l[cQtd], 10) || 1));
    for (let k = 0; k < qtd; k++) {
      out.push({
        d: Utilities.formatDate(quando, 'America/Manaus', 'yyyy-MM-dd'),
        h: Number(Utilities.formatDate(quando, 'America/Manaus', 'H')),
        m: /10/.test(String(l[cPerc])) ? '10 km' : '5 km',
        i: k ? null : idade,
        t: tam ? (baby ? 'Baby look - ' : 'Tradicional - ') + tam : '—',
        p: 'COL-' + id + (k ? '-' + k : ''),
      });
    }
  });
  return out;
}

/** Rode uma vez: autoriza o acesso, faz a primeira leitura e agenda a cada 1 minuto. */
function instalar() {
  ScriptApp.getProjectTriggers().forEach(function (t) { ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('atualizar').timeBased().everyMinutes(1).create();
  Logger.log('Inscrições encontradas nos e-mails: ' + atualizar());
}

/** Endereço público que o painel lê (só dados anônimos). Responde na hora com a última leitura. */
function doGet() {
  const d = ler_().dados;
  const conteudo = JSON.stringify({ atualizado: d.atualizado || '', inscricoes: (d.inscricoes || []).map(function (r) { const c = Object.assign({}, r); delete c._m; return c; }), pdv: d.pdv || [], colab: d.colab || [] });
  return ContentService.createTextOutput(conteudo).setMimeType(ContentService.MimeType.JSON);
}
