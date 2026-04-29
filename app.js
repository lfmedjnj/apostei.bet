// ===== UTILITIES =====
const fmtBRL = (v) => {
  if (Math.abs(v) >= 1e9) return 'R$ ' + (v / 1e9).toFixed(2) + 'B';
  if (Math.abs(v) >= 1e6) return 'R$ ' + (v / 1e6).toFixed(1) + 'M';
  if (Math.abs(v) >= 1e3) return 'R$ ' + (v / 1e3).toFixed(0) + 'K';
  return 'R$ ' + Math.round(v).toLocaleString('pt-BR');
};
const fmtPct = (v) => (v * 100).toFixed(1) + '%';
const fmtX = (v) => v.toFixed(2) + 'x';

// ===== COHORT MODEL =====
// For each acquisition month t, depositsM0 = invest[t] * roasDepM0.
// That cohort then contributes:
//   M+0: depositsM0
//   M+1: depositsM0 * retM0M1
//   M+2: depositsM0 * retM0M1 * retM1M2
//   M+k (k>=3): previous month * retM3plus
// Total deposits in calendar month m = sum across all cohorts of their contribution.
// GGR[m] = totalDeposits[m] * ggrPct.
function runModel({ retM0M1, retM1M2, retM3plus, ggrPct, roasDepM0, invest }) {
  const N = invest.length;
  const deposits = new Array(N).fill(0);

  for (let t = 0; t < N; t++) {
    const dep0 = invest[t] * roasDepM0;
    let contrib = dep0;
    for (let k = 0; t + k < N; k++) {
      if (k === 0) contrib = dep0;
      else if (k === 1) contrib = dep0 * retM0M1;
      else if (k === 2) contrib = dep0 * retM0M1 * retM1M2;
      else contrib = contrib * retM3plus;
      deposits[t + k] += contrib;
    }
  }

  const ggr = deposits.map((d) => d * ggrPct);
  return { deposits, ggr };
}

// ===== STATE =====
const state = {
  scenario: { ...BASELINE },
  selectedMonth: 0
};

// ===== RENDER: BASELINE KPIs (per selected month) =====
function renderBaseline(monthIdx = 0) {
  document.getElementById('b-inv').textContent = fmtBRL(BASELINE.invest[monthIdx]);
  document.getElementById('b-r1').textContent = fmtPct(BASELINE.retM0M1Monthly[monthIdx]);
  document.getElementById('b-r2').textContent = fmtPct(BASELINE.retM1M2Monthly[monthIdx]);
  document.getElementById('b-r3').textContent = fmtPct(BASELINE.retM3plusMonthly[monthIdx]);
  document.getElementById('b-ggr').textContent = fmtPct(BASELINE.ggrPctMonthly[monthIdx]);
  document.getElementById('b-roas').textContent = fmtX(BASELINE.roasDepM0Monthly[monthIdx]);
  document.getElementById('month-tag').textContent = 'M' + monthIdx;
}

// ===== RENDER: MONTH SELECT =====
function renderMonthSelect() {
  const sel = document.getElementById('month-select');
  sel.innerHTML = MONTH_LABELS.map((m, i) => `<option value="${i}">${m}</option>`).join('');
  sel.value = state.selectedMonth;
  sel.addEventListener('change', (e) => {
    state.selectedMonth = parseInt(e.target.value, 10);
    renderBaseline(state.selectedMonth);
    document.getElementById('s-inv').value = fmtThousands(BASELINE.invest[state.selectedMonth]);
    renderRolling();
    update();
  });
}

// ===== ROLLING TABLE =====
const fmtNum = (v) => Math.round(v).toLocaleString('en-US');

function rollingMonths() {
  const start = state.selectedMonth;
  return [start, start + 1, start + 2].filter((i) => i < MONTH_LABELS.length);
}

function renderRollingHeaders() {
  const months = rollingMonths();
  const headers = ['roll-h1', 'roll-h2', 'roll-h3'];
  headers.forEach((id, i) => {
    const el = document.getElementById(id);
    el.textContent = months[i] !== undefined ? `M${months[i]}` : '—';
  });
  const tag = months.length === 3
    ? `M${months[0]} → M${months[2]}`
    : `M${months[0]}${months[months.length - 1] !== months[0] ? ' → M' + months[months.length - 1] : ''}`;
  document.getElementById('rolling-tag').textContent = tag;
}

function renderRollingBaseline() {
  const months = rollingMonths();
  const cells = ['b-m1', 'b-m2', 'b-m3'];
  let total = 0;
  cells.forEach((id, i) => {
    const m = months[i];
    const el = document.getElementById(id);
    if (m === undefined) { el.textContent = '—'; return; }
    const v = BASELINE.ggrActual[m];
    el.textContent = fmtNum(v);
    total += v;
  });
  document.getElementById('b-total').textContent = fmtNum(total);
}

// Cached model output at default lever values — used to translate scenario deltas onto BP baseline
let MODEL_AT_DEFAULT = null;
function ensureDefaultModel() {
  if (!MODEL_AT_DEFAULT) {
    MODEL_AT_DEFAULT = runModel({
      retM0M1: BASELINE.retM0M1,
      retM1M2: BASELINE.retM1M2,
      retM3plus: BASELINE.retM3plus,
      ggrPct: BASELINE.ggrPct,
      roasDepM0: BASELINE.roasDepM0,
      invest: BASELINE.invest
    });
  }
}

function recalcRolling() {
  ensureDefaultModel();
  const months = rollingMonths();
  const scenario = readScenarioInputs();
  const scen = runModel(scenario);
  const eIds = ['e-m1', 'e-m2', 'e-m3'];
  const dIds = ['d-m1', 'd-m2', 'd-m3'];
  let eTotal = 0;
  let bTotal = 0;
  eIds.forEach((id, i) => {
    const m = months[i];
    const eEl = document.getElementById(id);
    const dEl = document.getElementById(dIds[i]);
    if (m === undefined) { eEl.textContent = '—'; dEl.textContent = '—'; dEl.className = ''; return; }
    // Latest Estimate = BP baseline + scenario shift from default
    const bVal = BASELINE.ggrActual[m];
    const shift = scen.ggr[m] - MODEL_AT_DEFAULT.ggr[m];
    const eVal = bVal + shift;
    eEl.textContent = fmtNum(eVal);
    const delta = eVal - bVal;
    dEl.textContent = (delta >= 0 ? '+' : '') + fmtNum(delta);
    dEl.className = delta > 0 ? 'positive' : delta < 0 ? 'negative' : '';
    eTotal += eVal;
    bTotal += bVal;
  });
  document.getElementById('e-total').textContent = fmtNum(eTotal);
  const dTotal = eTotal - bTotal;
  const dTotalEl = document.getElementById('d-total');
  dTotalEl.textContent = (dTotal >= 0 ? '+' : '') + fmtNum(dTotal);
  dTotalEl.className = 'total-col ' + (dTotal > 0 ? 'positive' : dTotal < 0 ? 'negative' : '');
}

function renderRolling() {
  renderRollingHeaders();
  renderRollingBaseline();
  recalcRolling();
}

// ===== RENDER: SCENARIO INPUTS =====
const fmtThousands = (v) => Math.round(v).toLocaleString('pt-BR');
const parseThousands = (s) => parseFloat(String(s).replace(/\./g, '').replace(/,/g, '.')) || 0;

function setScenarioInputs(values) {
  document.getElementById('s-inv').value = fmtThousands(BASELINE.invest[state.selectedMonth]);
  document.getElementById('s-r1').value = (values.retM0M1 * 100).toFixed(1);
  document.getElementById('s-r2').value = (values.retM1M2 * 100).toFixed(1);
  document.getElementById('s-r3').value = (values.retM3plus * 100).toFixed(1);
  document.getElementById('s-ggr').value = (values.ggrPct * 100).toFixed(1);
  document.getElementById('s-roas').value = values.roasDepM0.toFixed(2);
}

function readScenarioInputs() {
  // Investment override applies only to the selected month
  const invOverride = parseThousands(document.getElementById('s-inv').value);
  const invest = BASELINE.invest.slice();
  if (invOverride > 0) invest[state.selectedMonth] = invOverride;
  return {
    retM0M1: parseFloat(document.getElementById('s-r1').value) / 100 || 0,
    retM1M2: parseFloat(document.getElementById('s-r2').value) / 100 || 0,
    retM3plus: parseFloat(document.getElementById('s-r3').value) / 100 || 0,
    ggrPct: parseFloat(document.getElementById('s-ggr').value) / 100 || 0,
    roasDepM0: parseFloat(document.getElementById('s-roas').value) || 0,
    invest
  };
}

// ===== CHARTS =====
const chartDefaults = {
  color: '#888',
  grid: { color: '#1f1f1f' },
  font: { family: '-apple-system, BlinkMacSystemFont, Segoe UI, sans-serif' }
};
Chart.defaults.color = chartDefaults.color;
Chart.defaults.font.family = chartDefaults.font.family;
Chart.defaults.borderColor = chartDefaults.grid.color;

let trendChart;

function makeTrendChart(baseGGR, scenGGR) {
  const ctx = document.getElementById('trendChart').getContext('2d');
  trendChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: MONTH_LABELS,
      datasets: [
        {
          label: 'Baseline',
          data: baseGGR,
          borderColor: '#888',
          borderWidth: 1.5,
          borderDash: [4, 4],
          pointRadius: 0,
          tension: 0.3
        },
        {
          label: 'Cenário',
          data: scenGGR,
          borderColor: '#fff',
          borderWidth: 2,
          pointRadius: 0,
          tension: 0.3,
          fill: true,
          backgroundColor: 'rgba(255,255,255,0.06)'
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: true, position: 'bottom', labels: { boxWidth: 8, boxHeight: 8 } },
        tooltip: { callbacks: { label: (c) => c.dataset.label + ': ' + fmtBRL(c.parsed.y) } }
      },
      scales: {
        x: { grid: { display: false }, ticks: { font: { size: 10 } } },
        y: { grid: { color: '#1f1f1f' }, ticks: { callback: (v) => fmtBRL(v), font: { size: 10 } } }
      }
    }
  });
}

// ===== UPDATE =====
function update() {
  ensureDefaultModel();
  const scenario = readScenarioInputs();
  state.scenario = scenario;

  const scen = runModel(scenario);
  // Calibrate scenario onto BP baseline: estimate = baseline + (scenario - default)
  const scenCalibrated = scen.ggr.map((v, i) => BASELINE.ggrActual[i] + (v - MODEL_AT_DEFAULT.ggr[i]));

  const m = state.selectedMonth;
  const ggrBaseM = BASELINE.ggrActual[m] || 0;
  const ggrScenM = scenCalibrated[m] || 0;
  const delta = ggrScenM - ggrBaseM;
  const deltaPct = ggrBaseM ? delta / ggrBaseM : 0;
  const ggrAccUntil = scenCalibrated.slice(0, m + 1).reduce((a, b) => a + b, 0);

  document.getElementById('ggr-base-label').textContent = `GGR M${m} — Baseline`;
  document.getElementById('ggr-scen-label').textContent = `GGR M${m} — Cenário`;
  document.getElementById('ggr-acc-label').textContent = `Acumulado até M${m}`;

  document.getElementById('ggr-base').textContent = fmtBRL(ggrBaseM);
  document.getElementById('ggr-scen').textContent = fmtBRL(ggrScenM);
  const deltaEl = document.getElementById('ggr-delta');
  const sign = delta >= 0 ? '+' : '';
  deltaEl.textContent = sign + fmtBRL(delta) + ' (' + sign + (deltaPct * 100).toFixed(1) + '%)';
  deltaEl.className = 'trend-value ' + (delta >= 0 ? 'positive' : 'negative');
  document.getElementById('ggr-acc').textContent = fmtBRL(ggrAccUntil);

  if (trendChart) {
    trendChart.data.datasets[0].data = BASELINE.ggrActual;
    trendChart.data.datasets[1].data = scenCalibrated;
    trendChart.update('none');
  }
}

// ===== TABS =====
document.querySelectorAll('.tab').forEach((btn) => {
  btn.addEventListener('click', () => {
    if (btn.disabled) return;
    document.querySelectorAll('.tab').forEach((t) => t.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach((p) => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(btn.dataset.tab).classList.add('active');
  });
});

// ===== INIT =====
function init() {
  renderBaseline(0);
  renderMonthSelect();
  setScenarioInputs(BASELINE);
  renderRolling();

  // Live currency formatting for invest input
  const invEl = document.getElementById('s-inv');
  invEl.addEventListener('input', () => {
    const raw = invEl.value.replace(/\D/g, '');
    invEl.value = raw ? Number(raw).toLocaleString('pt-BR') : '';
    update();
    recalcRolling();
  });

  ['s-r1', 's-r2', 's-r3', 's-ggr', 's-roas'].forEach((id) => {
    document.getElementById(id).addEventListener('input', () => { update(); recalcRolling(); });
  });

  document.getElementById('reset-btn').addEventListener('click', () => {
    setScenarioInputs(BASELINE);
    update();
    recalcRolling();
  });

  const base = runModel({ ...BASELINE, invest: BASELINE.invest });
  makeTrendChart(base.ggr, base.ggr);

  update();
}

document.addEventListener('DOMContentLoaded', init);
