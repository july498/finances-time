require('dotenv').config();
const express = require('express');
const fetch   = require('node-fetch');
const path    = require('path');

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(__dirname));

// ── Yahoo Finance proxy ─────────────────────────────────────────
app.get('/api/quote/:ticker', async (req, res) => {
  const ticker = req.params.ticker.toUpperCase();

  if (!ticker.endsWith('.SA')) {
    return res.status(400).json({ error: 'Apenas ações brasileiras (.SA)' });
  }

  try {
    const [chartRes, fundRes] = await Promise.allSettled([
      fetch(
        `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1d&range=1d`,
        { headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: 8000 }
      ),
      fetch(
        `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${ticker}?modules=summaryDetail,financialData,defaultKeyStatistics,price`,
        { headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: 8000 }
      )
    ]);

    const chart = chartRes.status === 'fulfilled' && chartRes.value.ok
      ? await chartRes.value.json() : null;

    const fund  = fundRes.status  === 'fulfilled' && fundRes.value.ok
      ? await fundRes.value.json() : null;

    if (!chart && !fund) {
      return res.status(404).json({ error: `Ticker ${ticker} não encontrado na B3` });
    }

    // Extract
    const i = extractIndicators(ticker, chart, fund?.quoteSummary?.result?.[0] || null);

    if (!i.price) {
      return res.status(404).json({ error: `${ticker} sem dados de preço. Verifique o código.` });
    }

    res.json(i);

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao buscar dados do Yahoo Finance' });
  }
});

// ── Claude AI analysis ──────────────────────────────────────────
app.post('/api/analyze', async (req, res) => {
  const { ticker, indicators, strategy } = req.body;
  if (!ticker || !indicators) return res.status(400).json({ error: 'Dados inválidos' });

  const STRATEGY_DESC = {
    all:        'todos os grandes investidores (Graham, Barsi, Buffett, Lynch, Dalio, Munger, Greenblatt, Marks)',
    graham:     'Benjamin Graham — Valor Intrínseco, Margem de Segurança ≥30%, 7 Testes Defensivos',
    barsi:      'Luiz Barsi — Previdência Privada, Dividend Yield crescente ≥6%, empresas sólidas da B3',
    buffett:    'Warren Buffett — Fosso Competitivo (Moat), ROE alto consistente, vantagem durável',
    lynch:      'Peter Lynch — GARP, PEG Ratio abaixo de 1, negócio compreensível',
    dalio:      'Ray Dalio — All-Weather, macro, proteção contra inflação e deflação',
    munger:     'Charlie Munger — Qualidade a preço justo, Circle of Competence',
    greenblatt: 'Joel Greenblatt — Magic Formula: ROC alto + EV/EBIT baixo',
    marks:      'Howard Marks — Gestão de Risco, ciclos de mercado',
    templeton:  'John Templeton — Contrarian, comprar no pânico, máximo pessimismo',
    wood:       'Cathie Wood — Inovação disruptiva, crescimento exponencial',
  };

  const fmt    = v => (v !== null && v !== undefined && !isNaN(v)) ? Number(v).toFixed(2) : 'N/D';
  const fmtBig = v => {
    if (!v) return 'N/D';
    if (v >= 1e12) return (v/1e12).toFixed(1)+'T';
    if (v >= 1e9)  return (v/1e9).toFixed(1)+'B';
    if (v >= 1e6)  return (v/1e6).toFixed(1)+'M';
    return Number(v).toFixed(0);
  };

  const ind = indicators;
  const prompt = `Analise a ação brasileira ${ticker} (${ind.name}) listada na B3. Aplique a estratégia de: ${STRATEGY_DESC[strategy] || STRATEGY_DESC.all}.

DADOS REAIS YAHOO FINANCE — ${ind.ts}:
Preço: R$ ${fmt(ind.price)} | Variação dia: ${fmt(ind.changePct)}%
52s: Máx R$ ${fmt(ind.high52)} / Mín R$ ${fmt(ind.low52)}
Market Cap: ${fmtBig(ind.marketCap)} | Setor: ${ind.sector||'N/D'}
P/L: ${fmt(ind.pe)} | P/VPA: ${fmt(ind.pb)} | EPS: ${fmt(ind.eps)}
ROE: ${fmt(ind.roe)}% | ROA: ${fmt(ind.roa)}% | Dívi/PL: ${fmt(ind.debtToEquity)}
DY: ${fmt(ind.dividendYield)}% | EBITDA: ${fmtBig(ind.ebitda)}
Mg.Bruta: ${fmt(ind.grossMargin)}% | Mg.Op: ${fmt(ind.operatingMargin)}%
Cresc.Receita: ${fmt(ind.revenueGrowth)}% | Cresc.Lucro: ${fmt(ind.earningsGrowth)}%
Current Ratio: ${fmt(ind.currentRatio)} | Beta: ${fmt(ind.beta)}
Preço-alvo analistas: R$ ${fmt(ind.targetPrice)}

Responda SOMENTE com JSON válido (sem markdown):
{
  "resumo": "3-4 frases sobre a empresa e cenário atual",
  "analise_estrategia": "4-5 frases aplicando especificamente os critérios da estratégia",
  "pontos_positivos": ["ponto 1","ponto 2","ponto 3","ponto 4"],
  "pontos_atencao": ["risco 1","risco 2","risco 3"],
  "veredicto": "COMPRAR|AGUARDAR|VENDER",
  "justificativa_veredicto": "uma frase direta",
  "score_graham": 0-100,
  "score_barsi": 0-100,
  "score_buffett": 0-100,
  "score_geral": 0-100,
  "preco_intrinseco_estimado": numero_ou_null,
  "margem_seguranca": numero_percentual_ou_null,
  "criterios_aplicados": ["critério 1","critério 2","critério 3"]
}`;

  try {
    const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1500,
        messages: [{ role: 'user', content: prompt }]
      }),
      timeout: 30000
    });

    const data = await aiRes.json();
    const text = data.content?.[0]?.text || '{}';
    const match = text.match(/\{[\s\S]*\}/);
    const analysis = match ? JSON.parse(match[0]) : { veredicto: 'AGUARDAR', score_geral: 50 };
    res.json(analysis);

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao chamar Claude AI' });
  }
});

// ── Chat ────────────────────────────────────────────────────────
app.post('/api/chat', async (req, res) => {
  const { messages } = req.body;
  if (!messages) return res.status(400).json({ error: 'Mensagens inválidas' });

  try {
    const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 900,
        system: 'Você é especialista em ações brasileiras da B3. Conhece Graham, Barsi, Buffett, Lynch, Dalio, Munger, Greenblatt, Marks. Foca APENAS em empresas brasileiras. Responda em PT-BR, de forma concisa e educacional.',
        messages: messages.slice(-12)
      }),
      timeout: 20000
    });

    const data = await aiRes.json();
    res.json({ reply: data.content?.[0]?.text || 'Erro ao processar.' });

  } catch (err) {
    res.status(500).json({ error: 'Erro ao chamar IA' });
  }
});

// ── Helpers ─────────────────────────────────────────────────────
function extractIndicators(ticker, chartData, fund) {
  const i = {
    ticker, price: null, change: null, changePct: null,
    pe: null, pb: null, roe: null, roa: null, debtToEquity: null,
    dividendYield: null, ebitda: null, revenueGrowth: null, earningsGrowth: null,
    currentRatio: null, grossMargin: null, operatingMargin: null,
    marketCap: null, beta: null, eps: null, targetPrice: null,
    high52: null, low52: null, currency: 'BRL',
    name: ticker, sector: null, industry: null,
    ts: new Date().toLocaleString('pt-BR')
  };

  try {
    const c = chartData?.chart?.result?.[0];
    if (c) {
      const m = c.meta;
      i.price     = m.regularMarketPrice;
      i.change    = m.regularMarketPrice - m.chartPreviousClose;
      i.changePct = (i.change / m.chartPreviousClose) * 100;
      i.high52    = m.fiftyTwoWeekHigh;
      i.low52     = m.fiftyTwoWeekLow;
      i.currency  = m.currency || 'BRL';
      i.name      = m.longName || m.shortName || ticker;
    }

    if (fund) {
      const sd = fund.summaryDetail          || {};
      const fd = fund.financialData          || {};
      const ks = fund.defaultKeyStatistics   || {};
      const pr = fund.price                  || {};

      i.pe              = sd.trailingPE?.raw    || ks.trailingPE?.raw;
      i.pb              = ks.priceToBook?.raw;
      i.roe             = fd.returnOnEquity?.raw  ? fd.returnOnEquity.raw  * 100 : null;
      i.roa             = fd.returnOnAssets?.raw  ? fd.returnOnAssets.raw  * 100 : null;
      i.debtToEquity    = fd.debtToEquity?.raw;
      i.dividendYield   = sd.dividendYield?.raw   ? sd.dividendYield.raw   * 100 : null;
      i.ebitda          = fd.ebitda?.raw;
      i.revenueGrowth   = fd.revenueGrowth?.raw   ? fd.revenueGrowth.raw   * 100 : null;
      i.earningsGrowth  = fd.earningsGrowth?.raw  ? fd.earningsGrowth.raw  * 100 : null;
      i.currentRatio    = fd.currentRatio?.raw;
      i.grossMargin     = fd.grossMargins?.raw    ? fd.grossMargins.raw    * 100 : null;
      i.operatingMargin = fd.operatingMargins?.raw? fd.operatingMargins.raw* 100 : null;
      i.marketCap       = pr.marketCap?.raw || sd.marketCap?.raw;
      i.beta            = sd.beta?.raw || ks.beta?.raw;
      i.eps             = ks.trailingEps?.raw;
      i.targetPrice     = fd.targetMeanPrice?.raw;
      i.sector          = pr.sector   || null;
      i.industry        = pr.industry || null;
      i.name            = pr.longName || pr.shortName || i.name;
    }
  } catch (e) { console.warn('extractIndicators:', e.message); }

  return i;
}

// ── Fallback SPA ────────────────────────────────────────────────
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.listen(PORT, () => console.log(`\n🚀 Finance Time rodando em http://localhost:${PORT}\n`));
