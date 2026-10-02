# Dashboard de Marketing — Bom Preço

Dashboard de marketing integrado da rede Bom Preço: fluxo de clientes, faturamento por
canal, campanhas de mídia paga, Google Analytics, indicadores e brand equity.

Porte standalone do design `Dashboard Marketing.dc.html`, exportado do
[Claude Design](https://claude.ai/design). O arquivo original dependia de um runtime
proprietário (`support.js`, tags `x-dc`/`sc-for`/`sc-if`) que não roda fora do ambiente
Claude — esta versão reproduz o mesmo visual em HTML/CSS/JS puro, publicável em qualquer
hospedagem estática (GitHub Pages, Netlify, Vercel).

## Estrutura

```
index.html         → o dashboard inteiro (sem dependências de build)
dados-modelo.csv   → modelo da planilha de dados
modelo-bprun.csv   → exemplo FICTÍCIO do relatório de inscritos da Ticket Sports (aba BP RUN)
README.md
```

Únicas dependências externas: fonte Inter (Google Fonts) e ícones Lucide (unpkg), ambos
via CDN.

## Abas

| Aba | Conteúdo |
|-----|----------|
| Home | Clientes/mês, faturamento, canais digitais, YoY 2026×2025, movimento dos últimos 3 meses |
| Visão Geral | Faturamento consolidado, notas, ticket médio, evolução Jan–Jul, filtro por canal e por mês |
| Campanhas | Orçamento de agosto, Meta Ads e Google Ads (ordenável por investimento, conversões, CTR, CPA) |
| Google Analytics | Sessões, conversão, origem de tráfego, dispositivos, páginas mais vistas |
| Indicadores | Comparativos do mês, alertas de criativo, sugestões de realocação de verba |
| Comentários & Mercado | Pareceres da equipe (salvos no navegador) + assistente de IA |
| Brand Equity | Awareness, NPS, sentimento, comparativo com concorrência |
| BP RUN | Kits vendidos na Ticket Sports por data, modalidade, tipo de kit, sexo e camiseta (importa o relatório de inscritos) |

### Origem dos dados

- **Reais** (da planilha `ANALITICS BOM PREÇO - MARKETING.xlsx`): faturamento, notas,
  ticket médio e crescimento de **Loja, Site, Call Center e iFood** (Jan–Jul/2026 +
  comparativo 2025), visitas ao site e conversão.
- **Ilustrativos** (sinalizados na própria interface): campanhas de Meta/Google, detalhes
  do Google Analytics (origem de tráfego, dispositivos, páginas) e Brand Equity. Ficam
  como estrutura pronta até a integração com as fontes reais.

Julho/2026 é parcial: dados até 22/07, e até 15/07 para o Call Center. Comparativos
parciais aparecem marcados com `*`.

## Atualizando os dados

### Opção A — manual

Edite o objeto `DATA` no topo do `<script>` em `index.html` e faça commit.

### Opção B — Google Sheets (atualização automática)

Liga o dashboard a uma planilha: a equipe atualiza a planilha e o dashboard reflete
sozinho, sem mexer em código e sem servidor.

1. Crie uma Google Sheet no formato de `dados-modelo.csv` (basta importar esse arquivo).
2. **Arquivo → Compartilhar → Publicar na web → escolha a aba → formato CSV → Publicar.**
3. Copie a URL gerada e cole em `CONFIG.SHEET_CSV_URL` no `index.html`:

```js
const CONFIG = {
  SHEET_CSV_URL: 'https://docs.google.com/spreadsheets/d/e/XXXX/pub?gid=0&single=true&output=csv',
  REFRESH_MS: 60000,
  CHAT_ENDPOINT: '',
};
```

Com isso o dashboard busca os dados ao carregar e **revalida a cada 60 segundos**
(`REFRESH_MS`). Se a planilha estiver fora do ar, ele cai de volta nos dados embutidos —
a página nunca quebra.

#### Formato da planilha

Formato longo: uma linha por série, sete colunas de meses (Jan a Jul).

```
serie,jan,fev,mar,abr,mai,jun,jul
loja.fat,15158040,13623023,...
```

Séries reconhecidas:

| Grupo | Métricas |
|-------|----------|
| `loja` | `fat2025`, `fat`, `crescMes`, `notas`, `ticket` |
| `site` | `fat`, `crescMes`, `notas`, `ticket`, `visitas`, `conversao` |
| `callcenter` | `fat`, `crescMes`, `notas`, `ticket` |
| `ifood` | `fat`, `crescMes`, `notas`, `ticket` |

Regras:
- Célula vazia = sem dado (aparece como `—`).
- `crescMes` e `conversao` são **frações**: `0.0276` = +2,76%; `0.0181` = 1,81%.
- Números aceitos em pt-BR (`1.234,56`) ou padrão (`1234.56`).
- A linha extra `atualizacao,22/07/2026` controla a data no cabeçalho.

> Sobre "tempo real": o dashboard usa *polling* — relê a planilha a cada minuto. Para um
> dashboard de marketing isso é indistinguível de tempo real. Se um dia precisar de
> atualização instantânea (push via WebSocket), o caminho é trocar a planilha por
> Supabase ou Firebase, mantendo o resto igual.

## Assistente de IA

O chat da aba "Comentários & Mercado" usava `window.claude.complete`, que só existe dentro
do Claude. Em produção ele fica inativo e exibe um aviso, a menos que você defina
`CONFIG.CHAT_ENDPOINT` apontando para um endpoint próprio (ex.: uma função serverless que
chama a API da Anthropic e devolve `{ answer: "..." }`).

A chave da API **nunca** deve ficar neste arquivo — ele é público. Ela vive no servidor
da função.

## Publicando no GitHub Pages

Com o repositório criado e o código enviado:

**Settings → Pages → Source: Deploy from a branch → Branch: `main` / `root` → Save.**

O site fica disponível em `https://<usuario>.github.io/<repositorio>/` em alguns minutos.

## Rodando localmente

Abrir o `index.html` direto no navegador funciona. Se for usar a Google Sheet, prefira um
servidor local para evitar bloqueio de CORS:

```bash
python -m http.server 8000
```

## Notas técnicas

- Estado em memória + `render()` completo a cada interação; sem framework nem build.
- Os pareceres da aba "Comentários" ficam no `localStorage` do navegador — são por
  dispositivo, não compartilhados entre a equipe. Para torná-los compartilhados é preciso
  um backend (Supabase resolve bem).
- Todo texto vindo de dados passa por escape de HTML antes de ir para a tela.

## BP RUN (Ticket Sports)

A Ticket Sports não tem API pública, e as vendas só aparecem no painel do organizador (que exige login). Por isso a aba **BP RUN** lê o relatório exportado:

1. Painel do organizador → evento BP RUN → **Relatórios → Inscritos** → exportar (salve como CSV se vier em Excel).
2. Na aba BP RUN, clique em **Importar relatório**. Os dados ficam salvos só no navegador de quem importou.
3. Para atualizar sozinho para todo mundo: cole o relatório numa Google Sheet, publique como CSV e coloque a URL em `CONFIG.BPRUN_CSV_URL`.

Colunas reconhecidas pelo nome (a ordem não importa; separador `;` ou `,`): data da inscrição, modalidade/distância/categoria (**obrigatórias**), tipo de kit, valor pago, status, sexo, camiseta. Linhas canceladas, estornadas ou pendentes são ignoradas.
