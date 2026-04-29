// FAROL data — extracted from FAROL_Controle_v6_FINAL_bkp.xlsx (sheet "FAROL (MODELO)")
// Format per KPI: { name, atual, orcado, m1, type, spec }
// type: 'brl' | 'pct' | 'x' | 'qty'

const FAROL = [
  {
    title: "KPI's Aquisição — GROWTH",
    subtitle: 'Google + Meta + TikTok',
    kpis: [
      { name: 'Investimento',         atual: 1000000, orcado: 1000000, m1: 800000,  type: 'brl' },
      { name: '% do GGR M-1',         atual: 0.35,    orcado: 0.35,    m1: 0.32,    type: 'pct' },
      { name: 'ROAS FTD',             atual: 0.22,    orcado: 0.30,    m1: 0.28,    type: 'x'   },
      { name: 'ROAS DEP (D0)',        atual: 0.60,    orcado: null,    m1: 0.55,    type: 'x'   },
      { name: 'ROAS DEP (D+1)',       atual: 0.80,    orcado: null,    m1: 0.78,    type: 'x'   },
      { name: '% FTD Amount Growth',  atual: 0.50,    orcado: null,    m1: 0.38,    type: 'pct' },
      { name: '% Deposit M0 Growth',  atual: 0.56,    orcado: null,    m1: 0.55,    type: 'pct' }
    ]
  },
  {
    title: 'SAFRA ATUAL (M0) — GROWTH',
    kpis: [
      { name: 'Depósito (M0)',     atual: 1250000, orcado: 1250000, m1: 945000, type: 'brl' },
      { name: 'ROAS DEP (M0)',     atual: 1.25,    orcado: 1.30,    m1: 1.45,   type: 'x'   },
      { name: 'ROAS TURN. (M0)',   atual: 8,       orcado: null,    m1: 7.5,    type: 'x'   },
      { name: 'ROAS GGR (M0)',     atual: 0.22,    orcado: 0.20,    m1: 0.24,   type: 'x'   }
    ]
  },
  {
    title: 'SAFRA ATUAL (M0) — TOTAL DA MARCA',
    kpis: [
      { name: 'Depósito TT (M0)',  atual: 2500000, orcado: 2500000, m1: 1500000, type: 'brl' },
      { name: 'ROAS DEP TT (M0)',  atual: 1.99,    orcado: 1.90,    m1: 1.85,    type: 'x'   }
    ]
  },
  {
    title: 'SAFRAS ANTIGAS — TOTAL DA MARCA',
    kpis: [
      { name: 'Retenção M0 → M1',  atual: 0.61, orcado: 0.80,  m1: 0.66,  type: 'pct' },
      { name: 'Retenção M1 → M2',  atual: 0.75, orcado: 0.75,  m1: 0.72,  type: 'pct' },
      { name: 'Retenção M3+',      atual: 0.89, orcado: 0.935, m1: 0.882, type: 'pct' }
    ]
  },
  {
    title: "KPI's TOTAL DA MARCA — DESPESAS DE MKT",
    subtitle: 'FS + Bonificação + Mensageria',
    kpis: [
      { name: 'R$ Depósito',        atual: 510953648, orcado: 510953648, m1: 485000000, type: 'brl' },
      { name: 'R$ GGR',             atual: 140000000, orcado: 145000000, m1: 125000000, type: 'brl' },
      { name: '% GGR / Depósito',   atual: 0.184,     orcado: null,      m1: 0.202,     type: 'pct' },
      { name: 'Qtd FreeSpins',      atual: 9500000,   orcado: 10000000,  m1: 7800000,   type: 'qty' },
      { name: 'R$ GGR FreeSpins',   atual: 8000000,   orcado: 11000000,  m1: 7500000,   type: 'brl' },
      { name: 'Add Cost FreeSpin',  atual: 0.01566,   orcado: 0.02,      m1: 0.01546,   type: 'pct' },
      { name: 'R$ Bonificação',     atual: 12000000,  orcado: 11000000,  m1: 7500000,   type: 'brl' },
      { name: '% Bonificação/Dep',  atual: 0.02349,   orcado: 0.028,     m1: 0.02349,   type: 'pct' }
    ]
  },
  {
    title: 'DEPÓSITO — % CLUSTER (TOTAL DA MARCA)',
    kpis: [
      { name: 'NOVO',               atual: 0.12,    orcado: null,    m1: 0.16,    type: 'pct' },
      { name: '% Orgânico (NOVO)',  atual: 0.12,    orcado: 0.15,    m1: 0.14,    type: 'pct' },
      { name: 'R$ AFF (NOVO)',      atual: 4500000, orcado: 6000000, m1: 7500000, type: 'brl' },
      { name: 'RECORRENTE',         atual: 0.85,    orcado: null,    m1: 0.805,   type: 'pct' },
      { name: '% REATIVADO',        atual: 0.03,    orcado: 0.035,   m1: 0.035,   type: 'pct' }
    ]
  }
];
