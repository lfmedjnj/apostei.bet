// ===== FAROL ENGINE =====
// Loads Theorical DB from XLSX upload, aggregates by period, renders KPI tiles.

const GSHEET_URL = 'https://docs.google.com/spreadsheets/d/18LJBQ2QxigGl67_tdABQ5NXPC3zRS7zwbAFWu7VhSw4/edit?gid=1852662426';

// Set this to your deployed Apps Script web app URL after deploying Code.gs
const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbygfj-b_GpRpMYHDSANOXXSD81iRN4NebA5R9wIxSsvHSbJnthpQA3XvotRY-uzsMEZaA/exec';

const FAROL_STATE = {
  rows: [],          // parsed DB rows
  asOfDate: null,    // current "D-1" date
  period: 'MTD',     // MTD | WTD | Monthly | YTD
  fileName: null
};

// ---------- PARSING ----------
// Maps DB headers (row 1 of Theorical DB sheet) to our internal keys.
const COL_MAP = {
  'Date': 'date',
  'Invest. Aquisição': 'invest',
  'FTD amount': 'ftdAmount',
  'FTD #': 'ftdCount',
  'Total Deposit': 'totalDeposit',
  'DEP M0': 'depM0',
  'M+1': 'mPlus1',
  'M+2': 'mPlus2',
  'M3+': 'm3plus',
  'GGR': 'ggr',
  'Apostas': 'apostas'
};

function normalizeHeader(h) {
  return String(h || '').replace(/\s+/g, ' ').trim();
}

function excelSerialToDate(n) {
  // Excel epoch: 1899-12-30
  return new Date(Math.round((n - 25569) * 86400 * 1000));
}

// Parses date in multiple formats: Date object, Excel serial, ISO, DD.MM.YYYY, DD/MM/YYYY
function parseDate(v) {
  if (v === null || v === undefined || v === '') return null;
  if (v instanceof Date) return isNaN(v.getTime()) ? null : v;
  if (typeof v === 'number') return excelSerialToDate(v);
  const s = String(v).trim();
  // DD.MM.YYYY or DD/MM/YYYY
  const m = s.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);
  if (m) {
    const d = new Date(+m[3], +m[2] - 1, +m[1]);
    return isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

// Parse number that may contain thousand separators ("," or ".") and "-" for empty
function parseNumber(v) {
  if (v === null || v === undefined || v === '') return 0;
  if (typeof v === 'number') return v;
  let s = String(v).trim();
  if (s === '-' || s === '—') return 0;
  // Strip currency symbols
  s = s.replace(/[R$\s]/g, '');
  // If both . and , present: assume , is thousand sep (en) — strip commas
  if (s.includes(',') && s.includes('.')) {
    if (s.lastIndexOf(',') > s.lastIndexOf('.')) {
      s = s.replace(/\./g, '').replace(',', '.');
    } else {
      s = s.replace(/,/g, '');
    }
  } else if (s.includes(',') && !s.includes('.')) {
    // Likely BR decimal "12,5" → 12.5
    if (s.split(',').length === 2 && s.split(',')[1].length <= 2) {
      s = s.replace(',', '.');
    } else {
      s = s.replace(/,/g, '');
    }
  }
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}

function parseDbWorkbook(wb) {
  const sheetName = wb.SheetNames.find((n) => /theorical|theoretical/i.test(n)) || wb.SheetNames[0];
  const sheet = wb.Sheets[sheetName];
  const aoa = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true });
  if (aoa.length < 2) throw new Error('Sheet vazia');

  // Detect format: single-row ("Criteria Date" / "Actuals GGR") vs two-row (group + header)
  const row0 = (aoa[0] || []).map((v) => String(v || ''));
  const singleRow = row0.some((h) => /^(criteria|actuals|bp)\s+/i.test(h));

  const colIdx = { actuals: {}, bp: {}, criteria: {} };
  let dataStart;

  if (singleRow) {
    for (let c = 0; c < row0.length; c++) {
      const m = row0[c].match(/^(criteria|actuals|bp)\s+(.+)$/i);
      if (!m) continue;
      const group = m[1].toLowerCase();
      const name = normalizeHeader(m[2]);
      const key = COL_MAP[name];
      if (key) colIdx[group][key] = c;
    }
    dataStart = 1;
  } else {
    const groupRow = aoa[0] || [];
    const headerRow = aoa[1] || [];
    let currentGroup = '';
    for (let c = 0; c < headerRow.length; c++) {
      if (groupRow[c]) currentGroup = String(groupRow[c]).trim().toLowerCase();
      const h = normalizeHeader(headerRow[c]);
      const key = COL_MAP[h];
      if (!key) continue;
      if (colIdx[currentGroup]) colIdx[currentGroup][key] = c;
    }
    dataStart = 2;
    // DEBUG — remove once column mapping is confirmed
    console.log('[FAROL] sheet headers row0:', JSON.stringify((aoa[0]||[]).slice(0,30)));
    console.log('[FAROL] sheet headers row1:', JSON.stringify((aoa[1]||[]).slice(0,30)));
    console.log('[FAROL] colIdx mapped:', JSON.stringify(colIdx));
  }

  const dateCol = colIdx.criteria.date;
  if (dateCol === undefined) throw new Error('Coluna "Date" não encontrada');

  const rows = [];
  for (let r = dataStart; r < aoa.length; r++) {
    const row = aoa[r] || [];
    const d = parseDate(row[dateCol]);
    if (!d) continue;

    const obj = { date: d };
    for (const [k, c] of Object.entries(colIdx.actuals)) obj[k] = parseNumber(row[c]);
    for (const [k, c] of Object.entries(colIdx.bp)) obj['bp_' + k] = parseNumber(row[c]);
    rows.push(obj);
  }
  rows.sort((a, b) => a.date - b.date);
  return rows;
}

// ---------- DATE / PERIOD HELPERS ----------
const dayMs = 86400 * 1000;
function startOfMonth(d) { return new Date(d.getFullYear(), d.getMonth(), 1); }
function endOfMonth(d) { return new Date(d.getFullYear(), d.getMonth() + 1, 0); }
function startOfWeekMon(d) { // Monday-based
  const day = d.getDay();
  const diff = (day === 0 ? -6 : 1 - day);
  const r = new Date(d); r.setDate(d.getDate() + diff); r.setHours(0, 0, 0, 0); return r;
}
function shiftMonth(d, n) { return new Date(d.getFullYear(), d.getMonth() + n, d.getDate()); }
function startOfYear(d) { return new Date(d.getFullYear(), 0, 1); }
function shiftYear(d, n) { return new Date(d.getFullYear() + n, d.getMonth(), d.getDate()); }
function sameDay(a, b) { return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate(); }

// Returns rows in [from, to] inclusive
function filterRange(rows, from, to) {
  return rows.filter((r) => r.date >= from && r.date <= to);
}

function periodRange(period, asOf) {
  switch (period) {
    case 'MTD':     return { from: startOfMonth(asOf), to: asOf };
    case 'WTD':     return { from: startOfWeekMon(asOf), to: asOf };
    case 'Monthly': return { from: startOfMonth(asOf), to: endOfMonth(asOf) };
    case 'YTD':     return { from: startOfYear(asOf), to: asOf };
  }
}

function periodRangeM1(period, asOf) {
  // Same shape, one period back
  switch (period) {
    case 'MTD':     return { from: startOfMonth(shiftMonth(asOf, -1)), to: shiftMonth(asOf, -1) };
    case 'WTD':     { const a = new Date(asOf); a.setDate(a.getDate() - 7); return { from: startOfWeekMon(a), to: a }; }
    case 'Monthly': { const a = shiftMonth(asOf, -1); return { from: startOfMonth(a), to: endOfMonth(a) }; }
    case 'YTD':     return { from: startOfYear(shiftYear(asOf, -1)), to: shiftYear(asOf, -1) };
  }
}

// ---------- AGGREGATION ----------
const SUM_FIELDS = ['invest', 'ftdAmount', 'ftdCount', 'totalDeposit', 'depM0', 'mPlus1', 'mPlus2', 'm3plus', 'ggr', 'apostas'];

function aggregate(rows, withBp = true) {
  const out = {};
  SUM_FIELDS.forEach((f) => out[f] = 0);
  if (withBp) SUM_FIELDS.forEach((f) => out['bp_' + f] = 0);
  rows.forEach((r) => {
    SUM_FIELDS.forEach((f) => out[f] += (r[f] || 0));
    if (withBp) SUM_FIELDS.forEach((f) => out['bp_' + f] += (r['bp_' + f] || 0));
  });
  return out;
}

// Linear trend: scale current MTD pace to full month
function trendForFullPeriod(currentSum, daysElapsed, daysInPeriod) {
  if (!daysElapsed) return 0;
  return currentSum * (daysInPeriod / daysElapsed);
}

// ---------- TILE DEFINITIONS ----------
function safeDiv(a, b) { return b ? a / b : 0; }

function buildTiles(agg, m1, bp, d1, btg, periodMeta) {
  // periodMeta: { daysElapsed, daysInPeriod }
  const trend = (v) => trendForFullPeriod(v, periodMeta.daysElapsed, periodMeta.daysInPeriod);

  return [
    {
      title: 'Sales',
      hero: true,
      kpis: [
        { name: `${FAROL_STATE.period} R$ GGR`, type: 'brl', atual: agg.ggr,        orcado: agg.bp_ggr, m1: m1.ggr },
        { name: 'Trend R$ GGR',                 type: 'brl', atual: trend(agg.ggr),  orcado: bp.bp_ggr,  m1: m1.ggr },
        { name: 'BP R$ GGR (mês)',              type: 'brl', atual: bp.bp_ggr,       orcado: null,       m1: null   },
        { name: 'Gap / Upside',                 type: 'brl', atual: agg.ggr - agg.bp_ggr, orcado: null,  m1: null   },
        { name: 'BTG R$ GGR',                   type: 'brl', atual: btg.ggr,         orcado: null,       m1: null   }
      ]
    },
    {
      title: "KPI's Aquisição — GROWTH",
      kpis: [
        { name: 'Investimento',       type: 'brl', atual: agg.invest,                          orcado: agg.bp_invest,                            m1: m1.invest,      btg: btg.invest },
        { name: '% GGR/Inv',          type: 'pct', atual: safeDiv(agg.invest, agg.ggr),         orcado: safeDiv(agg.bp_invest, agg.bp_ggr),        m1: safeDiv(m1.invest, m1.ggr) },
        { name: 'ROAS FTD',           type: 'x',   atual: safeDiv(agg.ftdAmount, agg.invest),   orcado: safeDiv(agg.bp_ftdAmount, agg.bp_invest),  m1: safeDiv(m1.ftdAmount, m1.invest) },
        { name: 'ROAS DEP (D0)',      type: 'x',   atual: safeDiv(agg.depM0, agg.invest),       orcado: safeDiv(agg.bp_depM0, agg.bp_invest),      m1: safeDiv(m1.depM0, m1.invest) },
        { name: 'ROAS DEP (D-1)',     type: 'x',   atual: safeDiv(d1.depM0, d1.invest),         orcado: safeDiv(agg.bp_depM0, agg.bp_invest),      m1: safeDiv(m1.depM0, m1.invest) },
        { name: 'Depósitos TT',       type: 'brl', atual: agg.totalDeposit,                     orcado: agg.bp_totalDeposit,                       m1: m1.totalDeposit, btg: btg.totalDeposit },
        { name: 'Turnover (Apostas)', type: 'brl', atual: agg.apostas,                          orcado: agg.bp_apostas,                            m1: m1.apostas }
      ]
    },
    {
      title: 'Funil de Aquisição',
      kpis: [
        { name: 'FTD Amount',  type: 'brl', atual: agg.ftdAmount, orcado: agg.bp_ftdAmount, m1: m1.ftdAmount },
        { name: 'FTD #',       type: 'qty', atual: agg.ftdCount, orcado: agg.bp_ftdCount, m1: m1.ftdCount },
        { name: 'Ticket Médio (FTD)', type: 'brl', atual: safeDiv(agg.ftdAmount, agg.ftdCount), orcado: safeDiv(agg.bp_ftdAmount, agg.bp_ftdCount), m1: safeDiv(m1.ftdAmount, m1.ftdCount) },
        { name: 'CAC',         type: 'brl', atual: safeDiv(agg.invest, agg.ftdCount), orcado: safeDiv(agg.bp_invest, agg.bp_ftdCount), m1: safeDiv(m1.invest, m1.ftdCount) }
      ]
    },
    {
      title: 'Cohort Depósito',
      kpis: [
        { name: 'DEP M0',      type: 'brl', atual: agg.depM0, orcado: agg.bp_depM0, m1: m1.depM0 },
        { name: 'M+1',         type: 'brl', atual: agg.mPlus1, orcado: agg.bp_mPlus1, m1: m1.mPlus1 },
        { name: 'M+2',         type: 'brl', atual: agg.mPlus2, orcado: agg.bp_mPlus2, m1: m1.mPlus2 },
        { name: 'M3+',         type: 'brl', atual: agg.m3plus, orcado: agg.bp_m3plus, m1: m1.m3plus }
      ]
    }
  ];
}

// ---------- RENDER ----------
function renderDynamicFarol() {
  const container = document.getElementById('farol-sections');
  if (!FAROL_STATE.rows.length) {
    container.innerHTML = `<div class="empty-state">
      <h3>Nenhuma base carregada</h3>
      <p class="muted">Faça upload do Theorical DB (XLSX) para ver as KPIs em tempo real.</p>
    </div>`;
    return;
  }

  const asOf = FAROL_STATE.asOfDate;
  const range = periodRange(FAROL_STATE.period, asOf);
  const rangeM1 = periodRangeM1(FAROL_STATE.period, asOf);
  const fullRange = { from: startOfMonth(asOf), to: endOfMonth(asOf) };

  const agg = aggregate(filterRange(FAROL_STATE.rows, range.from, range.to));
  const m1  = aggregate(filterRange(FAROL_STATE.rows, rangeM1.from, rangeM1.to), false);
  const bp  = aggregate(filterRange(FAROL_STATE.rows, fullRange.from, fullRange.to));
  // D-1: same period but up to one day before asOf (for ROAS DEP D-1)
  const d1  = aggregate(filterRange(FAROL_STATE.rows, range.from, new Date(asOf.getTime() - dayMs)));
  // BTG: how much still needed to deliver the BP target
  const btg = { ggr: bp.bp_ggr - agg.ggr, invest: bp.bp_invest - agg.invest, totalDeposit: bp.bp_totalDeposit - agg.totalDeposit };

  const daysElapsed = Math.max(1, Math.round((range.to - range.from) / dayMs) + 1);
  const daysInPeriod = Math.round((fullRange.to - fullRange.from) / dayMs) + 1;

  const sections = buildTiles(agg, m1, bp, d1, btg, { daysElapsed, daysInPeriod });

  // Sales hero (first section)
  const sales    = sections[0];
  const salesGgr = sales.kpis[0]; // MTD GGR
  const trendGgr = sales.kpis[1]; // Trend GGR
  const bpGgr    = sales.kpis[2]; // BP full month GGR
  const gap      = sales.kpis[3]; // Gap vs BP MTD
  const btgGgr   = sales.kpis[4]; // BTG GGR
  const ating = bpGgr.atual ? salesGgr.atual / bpGgr.atual : 0;
  const sign  = gap.atual >= 0 ? '+' : '';

  let html = `
    <div class="sales-hero">
      <div class="hero-main">
        <div class="hero-label">${salesGgr.name}</div>
        <div class="hero-value">${fmtKpi(salesGgr.atual, 'brl')}</div>
        <div class="hero-sub ${gap.atual >= 0 ? 'positive' : 'negative'}">${sign}${fmtKpi(gap.atual, 'brl')} vs BP MTD (${(ating * 100).toFixed(1)}%)</div>
      </div>
      <div class="hero-stat">
        <div class="hero-label">BP GGR (mês)</div>
        <div class="v">${fmtKpi(bpGgr.atual, 'brl')}</div>
      </div>
      <div class="hero-stat">
        <div class="hero-label">BTG R$ GGR</div>
        <div class="v" style="color: var(--${btgGgr.atual <= 0 ? 'positive' : 'negative'})">${fmtKpi(btgGgr.atual, 'brl')}</div>
      </div>
      <div class="hero-stat">
        <div class="hero-label">Trend GGR</div>
        <div class="v">${fmtKpi(trendGgr.atual, 'brl')}</div>
      </div>
    </div>
  `;

  // Other sections as standard tile grids
  for (let i = 1; i < sections.length; i++) {
    const section = sections[i];
    const tiles = section.kpis.map((k) => {
      const at = k.orcado != null && k.orcado !== 0 ? k.atual / k.orcado : null;
      const color = farolColor(at);
      const atTxt = at !== null ? (at * 100).toFixed(1) + '%' : '—';
      const btgRow = k.btg != null
        ? `<div class="meta"><span>BTG <b>${fmtKpi(k.btg, k.type)}</b></span></div>`
        : '';
      return `
        <div class="farol-tile ${color}">
          <div class="name">${k.name}</div>
          <div class="atual">${fmtKpi(k.atual, k.type)}</div>
          <div class="meta">
            <span>Orçado <b>${fmtKpi(k.orcado, k.type)}</b></span>
            <span>M-1 <b>${fmtKpi(k.m1, k.type)}</b></span>
          </div>
          ${btgRow}
          <div class="ating"><span class="dot"></span>${atTxt} atingimento</div>
        </div>
      `;
    }).join('');
    html += `
      <div class="farol-section">
        <div class="farol-section-header"><h3>${section.title}</h3></div>
        <div class="farol-grid">${tiles}</div>
      </div>
    `;
  }

  container.innerHTML = html;
}

// ---------- LOAD PIPELINE ----------
function setStatus(msg, cls) {
  const el = document.getElementById('upload-status');
  el.textContent = msg;
  el.className = 'upload-status' + (cls ? ' ' + cls : '');
}

function applyRows(rows, sourceLabel) {
  if (!rows.length) throw new Error('Nenhuma linha encontrada');
  FAROL_STATE.rows = rows;
  FAROL_STATE.fileName = sourceLabel;
  let lastActual = rows[rows.length - 1].date;
  for (let i = rows.length - 1; i >= 0; i--) {
    if (rows[i].invest > 0 || rows[i].ggr > 0 || rows[i].totalDeposit > 0) {
      lastActual = rows[i].date; break;
    }
  }
  FAROL_STATE.asOfDate = lastActual;

  const lastDate = rows[rows.length - 1].date;
  const dateInput = document.getElementById('as-of-date');
  dateInput.disabled = false;
  dateInput.value = lastActual.toISOString().slice(0, 10);
  dateInput.min = rows[0].date.toISOString().slice(0, 10);
  dateInput.max = lastDate.toISOString().slice(0, 10);

  setStatus(`✓ ${sourceLabel} — ${rows.length} linhas (${rows[0].date.toLocaleDateString('pt-BR')} → ${lastDate.toLocaleDateString('pt-BR')})`, 'loaded');
  renderDynamicFarol();
}

function handleFile(file) {
  setStatus(`Lendo ${file.name}...`);
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const data = new Uint8Array(e.target.result);
      const wb = XLSX.read(data, { type: 'array', cellDates: true });
      applyRows(parseDbWorkbook(wb), file.name);
    } catch (err) {
      setStatus(`Erro: ${err.message}`, 'error');
      console.error(err);
    }
  };
  reader.readAsArrayBuffer(file);
}

function parseGSheetUrl(url) {
  const idMatch = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
  const id = idMatch ? idMatch[1] : url.trim();
  const gidMatch = url.match(/[?&#]gid=(\d+)/);
  const gid = gidMatch ? gidMatch[1] : '0';
  return { id, gid };
}

async function loadGSheet(url) {
  const { id, gid } = parseGSheetUrl(url);
  if (!id) throw new Error('URL inválida');
  setStatus('Carregando Google Sheets...');

  // Try multiple endpoints in order of preference, with CORS proxy as last resort
  const direct = [
    `https://docs.google.com/spreadsheets/d/${id}/gviz/tq?tqx=out:csv&gid=${gid}`,
    `https://docs.google.com/spreadsheets/d/${id}/export?format=csv&gid=${gid}`
  ];
  const proxied = direct.map((u) => `https://corsproxy.io/?${encodeURIComponent(u)}`);
  const endpoints = [...direct, ...proxied];

  let csvText = null;
  let lastErr = null;
  let allForbidden = true;
  for (const csvUrl of endpoints) {
    try {
      // omit credentials so Google treats this as anonymous (avoids 403 on public sheets from file://)
      const resp = await fetch(csvUrl, { credentials: 'omit' });
      if (!resp.ok) {
        if (resp.status !== 401 && resp.status !== 403) allForbidden = false;
        lastErr = new Error(`HTTP ${resp.status}`); continue;
      }
      allForbidden = false;
      csvText = await resp.text();
      if (csvText && csvText.length > 50) break;
    } catch (e) {
      allForbidden = false;
      lastErr = e;
    }
  }
  if (!csvText) {
    if (allForbidden) throw new Error('Sheet privado — habilite "Anyone with the link" em Compartilhar');
    throw lastErr || new Error('Falha ao buscar a sheet');
  }

  const wb = XLSX.read(csvText, { type: 'string', raw: false });
  applyRows(parseDbWorkbook(wb), 'Google Sheets');
}

// Loads CSV via Apps Script web app (no CORS, no auth) — preferred path
async function loadFromAppsScript() {
  if (!APPS_SCRIPT_URL) throw new Error('APPS_SCRIPT_URL não configurado');
  setStatus('Carregando Google Sheets...');
  const resp = await fetch(APPS_SCRIPT_URL);
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  const csvText = await resp.text();
  if (!csvText || csvText.startsWith('ERROR:')) throw new Error(csvText || 'Resposta vazia');
  const wb = XLSX.read(csvText, { type: 'string', raw: false });
  applyRows(parseDbWorkbook(wb), 'Google Sheets (live)');
}

// Loads the CSV synced by GitHub Actions from the same origin (zero CORS)
async function loadFromRepo() {
  setStatus('Sincronizando dados...');
  try {
    const resp = await fetch('./data/db.csv?ts=' + Date.now());
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const csvText = await resp.text();
    const wb = XLSX.read(csvText, { type: 'string', raw: false });
    applyRows(parseDbWorkbook(wb), 'Google Sheets (auto-sync)');
  } catch (err) {
    setStatus(`Erro: ${err.message}`, 'error');
    console.error(err);
  }
}

// Main load — uses Apps Script if configured, otherwise falls back to repo CSV
async function loadData() {
  try {
    if (APPS_SCRIPT_URL) {
      await loadFromAppsScript();
    } else {
      await loadFromRepo();
    }
  } catch (err) {
    setStatus(`Erro: ${err.message}`, 'error');
    console.error(err);
  }
}

function initFarol() {
  const dateInput = document.getElementById('as-of-date');

  document.querySelectorAll('#period-pills .pill').forEach((p) => {
    p.addEventListener('click', () => {
      document.querySelectorAll('#period-pills .pill').forEach((x) => x.classList.remove('active'));
      p.classList.add('active');
      FAROL_STATE.period = p.dataset.period;
      renderDynamicFarol();
    });
  });

  dateInput.addEventListener('change', (e) => {
    if (e.target.value) {
      FAROL_STATE.asOfDate = new Date(e.target.value + 'T00:00:00');
      renderDynamicFarol();
    }
  });

  const refreshBtn = document.getElementById('refresh-btn');
  if (refreshBtn) refreshBtn.addEventListener('click', loadData);

  // Auto-load on first Tab 2 open
  let autoLoaded = false;
  const tab2Btn = document.querySelector('[data-tab="tab2"]');
  if (tab2Btn) {
    tab2Btn.addEventListener('click', () => {
      if (autoLoaded || FAROL_STATE.rows.length) return;
      autoLoaded = true;
      loadData();
    });
  }

  // Auto-refresh every 5 minutes
  setInterval(() => {
    if (FAROL_STATE.rows.length) loadData();
  }, 5 * 60 * 1000);
}

document.addEventListener('DOMContentLoaded', initFarol);
