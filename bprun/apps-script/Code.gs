/**
 * BP RUN — leitor das confirmações de pedido da Ticket Sports no Gmail.
 *
 * A cada 15 minutos, procura no Gmail os e-mails "Pedido confirmado: ... - BP RUN 2026",
 * extrai só dados anônimos (data/hora do pagamento, modalidade, camiseta,
 * "como ficou sabendo" e o número do pedido) e guarda num arquivo do seu Drive.
 * O painel (bprun-2026.web.app) lê esse resultado pelo endereço do app da web.
 * Nenhum nome, CPF, e-mail ou telefone sai daqui.
 *
 * Instalação: cole este arquivo em script.google.com, rode `instalar` uma vez e
 * publique como App da Web (Executar como: eu · Quem pode acessar: qualquer pessoa).
 */

const BUSCA = 'from:naoresponda@ticketsports.com.br subject:("Pedido confirmado" "BP RUN 2026")';
const ARQUIVO = 'bprun-confirmacoes-email.json';
const PAINEL = 'https://bprun-2026.web.app';
// Canal de avisos no app ntfy (quem assina recebe uma notificação a cada 100 inscritos).
const CANAL_AVISOS = 'bprun2026-bompreco-alertas';

const MODALIDADES = {
  'corrida 5km - publico geral': '5 km',
  'corrida 10km - publico geral': '10 km',
  'corrida 5km pcd - geral': '5 km PCD',
  'corrida 5km pcd - cadeirante': '5 km PCD Cadeirante',
  'corrida 5km pcd - visual': '5 km PCD Visual',
};

function norm_(s) {
  return String(s || '').trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

function texto_(s) {
  return String(s || '').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
}

/** Lê os e-mails e regrava o arquivo com todas as inscrições encontradas. */
function atualizar() {
  const inscricoes = [];
  for (let inicio = 0; ; inicio += 100) {
    const threads = GmailApp.search(BUSCA, inicio, 100);
    if (!threads.length) break;
    threads.forEach(function (t) {
      t.getMessages().forEach(function (msg) {
        const pedido = (msg.getSubject().match(/Pedido confirmado:\s*(\d+)/) || [])[1];
        if (!pedido) return;
        const html = msg.getBody();
        const pg = html.match(/Data e hora do pagamento:\s*<\/b>\s*(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):/);
        const data = pg ? pg[3] + '-' + pg[2] + '-' + pg[1] : Utilities.formatDate(msg.getDate(), 'America/Manaus', 'yyyy-MM-dd');
        const hora = pg ? Number(pg[4]) : Number(Utilities.formatDate(msg.getDate(), 'America/Manaus', 'H'));
        // um pedido pode ter mais de um inscrito: cada bloco começa em "Nome do inscrito"
        html.split(/Nome do inscrito/).slice(1).forEach(function (bloco) {
          const cat = texto_((bloco.match(/<b>Categoria<\/b><\/td>\s*<td[^>]*>([^<]+)</) || [])[1]);
          if (!cat) return;
          const camisa = texto_((bloco.match(/<b>CAMISETA[^<]*<\/b><\/p>\s*<p>([^<]+)</) || [])[1])
            .replace('Camiseta tradicional curta', 'Tradicional').replace('Baby look curta', 'Baby look');
          const como = texto_((bloco.match(/Como ficou sabendo[^<]*<\/b><\/p>\s*<p>([^<]+)</) || [])[1])
            .replace('ticketsports.com.br', 'ticketsportscombr');
          inscricoes.push({ d: data, h: hora, m: MODALIDADES[norm_(cat)] || cat, t: camisa || '—', c: como || 'Não informado', p: pedido });
        });
      });
    });
    if (threads.length < 100) break;
  }
  const conteudo = JSON.stringify({
    atualizado: Utilities.formatDate(new Date(), 'America/Manaus', 'dd/MM HH:mm'),
    inscricoes: inscricoes,
  });
  const arquivos = DriveApp.getFilesByName(ARQUIVO);
  if (arquivos.hasNext()) arquivos.next().setContent(conteudo);
  else DriveApp.createFile(ARQUIVO, conteudo, MimeType.PLAIN_TEXT);
  avisarMarco_(inscricoes);
  return inscricoes.length;
}

/** Total = último relatório publicado no painel + pedidos novos vistos nos e-mails. */
function totalAtual_(inscricoes) {
  const js = UrlFetchApp.fetch(PAINEL + '/dados.js', { muteHttpExceptions: true }).getContentText();
  const base = JSON.parse(js.slice(js.indexOf('{'), js.lastIndexOf('}') + 1)).inscricoes;
  const vistos = {};
  base.forEach(function (r) { if (r.p) vistos[r.p] = true; });
  return base.length + inscricoes.filter(function (r) { return !vistos[r.p]; }).length;
}

/** Manda notificação quando o total passa de um novo múltiplo de 100. */
function avisarMarco_(inscricoes) {
  let total;
  try { total = totalAtual_(inscricoes); } catch (e) { Logger.log('Não consegui ler o painel: ' + e); return; }
  const props = PropertiesService.getScriptProperties();
  const marco = Math.floor(total / 100) * 100;
  const ultimo = Number(props.getProperty('ultimoMarco') || 0);
  if (!ultimo) { props.setProperty('ultimoMarco', String(marco)); return; } // 1ª execução: só registra
  if (marco <= ultimo) return;
  const n = total.toLocaleString('pt-BR');
  UrlFetchApp.fetch('https://ntfy.sh/' + CANAL_AVISOS, {
    method: 'post',
    payload: 'Total acumulado: ' + n + ' kits vendidos. Toque para abrir o painel.',
    headers: { Title: 'BP RUN 2026: ' + marco.toLocaleString('pt-BR') + ' inscritos!', Tags: 'runner,tada', Click: PAINEL },
    muteHttpExceptions: true,
  });
  props.setProperty('ultimoMarco', String(marco));
}

/** Rode uma vez: autoriza o acesso, faz a primeira leitura e agenda a cada 15 minutos. */
function instalar() {
  ScriptApp.getProjectTriggers().forEach(function (t) { ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('atualizar').timeBased().everyMinutes(15).create();
  Logger.log('Inscrições encontradas nos e-mails: ' + atualizar());
}

/** Endereço público que o painel lê (só dados anônimos). */
function doGet() {
  const arquivos = DriveApp.getFilesByName(ARQUIVO);
  const conteudo = arquivos.hasNext() ? arquivos.next().getBlob().getDataAsString() : '{"inscricoes":[]}';
  return ContentService.createTextOutput(conteudo).setMimeType(ContentService.MimeType.JSON);
}
