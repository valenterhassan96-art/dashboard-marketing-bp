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
    if (!d.lidos) { d.inscricoes = []; d.lidos = []; } // arquivo da versão antiga: relê tudo do zero (sem duplicar)
    return { arquivo: arquivo, dados: d };
  }
  catch (e) { return { arquivo: arquivo, dados: { inscricoes: [], lidos: [] } }; }
}

/** Lê só os e-mails ainda não lidos (os mais novos vêm primeiro) e acrescenta ao arquivo. */
function atualizar() {
  const atual = ler_(), inscricoes = atual.dados.inscricoes, lidos = {};
  atual.dados.lidos.forEach(function (id) { lidos[id] = true; });
  for (let inicio = 0; ; inicio += 100) {
    const threads = GmailApp.search(BUSCA, inicio, 100);
    if (!threads.length) break;
    let novosNaPagina = 0;
    threads.forEach(function (t) {
      if (lidos[t.getId()]) return;
      lidos[t.getId()] = true; novosNaPagina++;
      t.getMessages().forEach(function (msg) {
        const pedido = (msg.getSubject().match(/Pedido confirmado:\s*(\d+)/) || [])[1];
        if (!pedido) return;
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
          inscricoes.push({ d: data, h: hora, m: MODALIDADES[norm_(cat)] || cat, t: camisa || '—', c: como || 'Não informado', p: pedido, dp: descPct });
        });
      });
    });
    if (threads.length < 100 || !novosNaPagina) break; // página sem novidade: o resto já foi lido
  }
  const conteudo = JSON.stringify({
    atualizado: Utilities.formatDate(new Date(), 'America/Manaus', 'dd/MM HH:mm'),
    inscricoes: inscricoes,
    lidos: Object.keys(lidos),
  });
  if (atual.arquivo) atual.arquivo.setContent(conteudo);
  else DriveApp.createFile(ARQUIVO, conteudo, MimeType.PLAIN_TEXT);
  return inscricoes.length;
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
  const conteudo = JSON.stringify({ atualizado: d.atualizado || '', inscricoes: d.inscricoes || [] });
  return ContentService.createTextOutput(conteudo).setMimeType(ContentService.MimeType.JSON);
}
