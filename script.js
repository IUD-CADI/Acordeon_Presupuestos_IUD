/* Smart + Fix IUD: deacentúa, mapea Apropiación*, Recaudo, Por Ejecutar, % Ejecutado */
const MASTER_URL = "https://iud-cadi.github.io/Acordeon_Presupuestos_IUD/Datos_maestros_presupuesto.xlsx";
const DATA_URL   = "https://iud-cadi.github.io/Acordeon_Presupuestos_IUD/EJECUCION_PRESUPUESTAL_INGRESO.xlsx";
const DATA_FALLB = "https://iud-cadi.github.io/Acordeon_Presupuestos_IUD/EJECUCION_PRESUPUESTAL_INGRESO_tablero%20(1).xlsx";

const $ = sel => document.querySelector(sel);
const mk = (tag, cls) => { const e=document.createElement(tag); if(cls) e.className=cls; return e; };

// Normaliza: minúsculas + sin tildes
const normKey = s => String(s||'').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');

function normCodigo(v){
  if (v == null) return '';
  let s = String(v).trim();
  if (/^\d+\.0+$/.test(s)) s = s.replace(/\.0+$/, '');
  s = s.replace(/\s+/g,'');
  return s;
}
const num = v => {
  if (v == null || v === '') return 0;
  if (typeof v === 'number') return v;
  const s = String(v).replace(/[^\d\-,.]/g,'').replace(/\./g,'').replace(',', '.'); 
  const n = Number(s);
  return isNaN(n) ? 0 : n;
};
const fmtMoney = (n, symbol='$', dec=0) => {
  const nf = new Intl.NumberFormat('es-CO',{minimumFractionDigits:dec, maximumFractionDigits:dec});
  return `${symbol}${nf.format(n||0)}`;
};
const fmtPct = (v, dec=1) => `${Number(v || 0).toFixed(dec)}%`;

async function fetchXlsx(urls){
  let lastErr;
  for (const url of (Array.isArray(urls)? urls : [urls])){
    try {
      const res = await fetch(url, { cache: 'no-store', mode: 'cors' });
      if(!res.ok) throw new Error(`HTTP ${res.status}`);
      const ab = await res.arrayBuffer();
      const wb = XLSX.read(ab, { type: 'array' });
      const first = wb.SheetNames[0];
      const ws = wb.Sheets[first];
      const rows = XLSX.utils.sheet_to_json(ws, { defval: null });
      if(!rows.length) throw new Error('El archivo no tiene filas');
      return { rows, urlUsed: url, headers: Object.keys(rows[0]||{}) };
    } catch(e){ lastErr = e; }
  }
  throw lastErr || new Error('No se pudo descargar ningún URL');
}

function mapMasterColumns(sampleRow){
  const keys = Object.fromEntries(Object.keys(sampleRow).map(k => [normKey(k), k]));
  const get = (arr) => { for (const name of arr){ const key = keys[normKey(name)]; if (key) return key; } return null; };
  return {
    codigo: get(['codigo','código','cod']),
    nivel1: get(['nivel 1','nivel1','nivel_1']),
    nivel2: get(['nivel 2','nivel2','nivel_2']),
    nombre: get(['nombre de la cuenta','nombre'])
  };
}

function mapDataColumns(sampleRow){
  const keys = Object.fromEntries(Object.keys(sampleRow).map(k => [normKey(k), k]));
  const get = (arr) => { for (const name of arr){ const key = keys[normKey(name)]; if (key) return key; } return null; };
  return {
    codigo: get(['codigo','código','cod']),

    // FIX: términos usados por IUD
    inicial: get([
      'apropiacion inicial','presupuesto inicial','inicial','ppto inicial','asignado','aprobado'
    ]),
    actual: get([
      'apropiacion definitiva','presupuesto actual','actual','ppto actual','vigente','definitivo','apropiacion vigente'
    ]),
    ejec: get([
      'recaudo','recaudado','devengado','ejecutado','ejecucion','ejecución'
    ]),
    pend: get([
      'por ejecutar','pendiente por recaudar','pendiente','saldo por recaudar','por recaudar','saldo'
    ]),
    pct: get([
      '% ejecutado','% de ejecucion','% de ejecución','porcentaje','porcentaje de ejecucion','avance %','% avance'
    ])
  };
}

function diagnostics(headersM, headersD, mCols, dCols, matches){
  const diag = $('#diag');
  diag.innerHTML = `
    <h3>Diagnóstico</h3>
    <p><strong>Maestro</strong> encabezados: <code>${headersM.join(' | ')}</code></p>
    <p>Mapeo Maestro → codigo=<code>${mCols.codigo||'-'}</code>, nivel1=<code>${mCols.nivel1||'-'}</code>, nivel2=<code>${mCols.nivel2||'-'}</code></p>
    <hr/>
    <p><strong>Ejecución</strong> encabezados: <code>${headersD.join(' | ')}</code></p>
    <p>Mapeo Ejecución → codigo=<code>${dCols.codigo||'-'}</code>, inicial=<code>${dCols.inicial||'-'}</code>, actual=<code>${dCols.actual||'-'}</code>, ejec=<code>${dCols.ejec||'-'}</code>, pend=<code>${dCols.pend||'-'}</code>, pct=<code>${dCols.pct||'-'}</code></p>
    <hr/>
    <p><strong>Códigos coincidentes</strong>: ${matches}</p>
  `;
}

function buildTree(masterRows, dataRows, opts, mCols, dCols){
  const { calcPct } = opts;
  const master = new Map();
  for(const r of masterRows){
    const codigo = normCodigo(r[mCols.codigo]);
    if(!codigo) continue;
    master.set(codigo, {
      nivel1: r[mCols.nivel1] ?? '—',
      nivel2: r[mCols.nivel2] ?? '—'
    });
  }

  const tree = new Map();
  for(const r of dataRows){
    const cod = normCodigo(r[dCols.codigo]);
    if(!cod) continue;
    const m = master.get(cod);
    const nivel1 = m?.nivel1 ?? '— (sin maestro)';
    const nivel2 = m?.nivel2 ?? '— (sin maestro)';

    const ini = dCols.inicial ? num(r[dCols.inicial]) : 0;
    const act = dCols.actual  ? num(r[dCols.actual])  : 0;
    const eje = dCols.ejec    ? num(r[dCols.ejec])    : 0;
    const pen = dCols.pend    ? num(r[dCols.pend])    : 0;
    let pct = 0;
    if (calcPct && act) {
      pct = (eje/act)*100;
    } else if (dCols.pct) {
      pct = num(r[dCols.pct]);
    }

    if(!tree.has(nivel1)) tree.set(nivel1, new Map());
    const sub = tree.get(nivel1);
    if(!sub.has(nivel2)) sub.set(nivel2, {ini:0, act:0, eje:0, pen:0, pctSum:0, n:0});

    const node = sub.get(nivel2);
    node.ini += ini; node.act += act; node.eje += eje; node.pen += pen;
    node.pctSum += pct; node.n += 1;
  }
  return tree;
}

function renderAccordion(tree, opts){
  const { symbol, dec } = opts;
  const viz = document.querySelector('#viz'); viz.innerHTML = '';

  if(!tree || !tree.size){
    viz.textContent = 'Sin datos para mostrar.'; return;
  }

  for(const [l1, lvl2] of tree.entries()){
    let tIni=0, tAct=0, tEje=0, tPen=0, tPctSum=0, tN=0;

    const section = mk('div','section');
    const header  = mk('div','header collapsed');
    header.innerHTML = `<span>${l1}</span><span class="chev">▾</span>`;
    const content = mk('div','content hidden');

    for(const [l2, v] of lvl2.entries()){
      tIni += v.ini; tAct += v.act; tEje += v.eje; tPen += v.pen; tPctSum += (v.n ? v.pctSum : 0); tN += v.n;

      const subSec = mk('div','section sub');
      const subHeader = mk('div','subheader collapsed');
      subHeader.innerHTML = `<span>${l2}</span><span class="chev">▾</span>`;
      const subContent = mk('div','content hidden');

      const tableL2 = mk('table');
      tableL2.innerHTML = `
        <thead>
          <tr>
            <th>Presupuesto Inicial</th>
            <th>Presupuesto Actual</th>
            <th>Ejecución</th>
            <th>Pendiente por Recaudar</th>
            <th>% de Ejecución</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>${fmtMoney(v.ini, symbol, dec)}</td>
            <td>${fmtMoney(v.act, symbol, dec)}</td>
            <td>${fmtMoney(v.eje, symbol, dec)}</td>
            <td>${fmtMoney(v.pen, symbol, dec)}</td>
            <td>${fmtPct(v.n ? (v.pctSum / v.n) : 0, 1)}</td>
          </tr>
        </tbody>
      `;
      subContent.appendChild(tableL2);

      subHeader.addEventListener('click', ()=>{
        subContent.classList.toggle('hidden');
        subHeader.classList.toggle('collapsed');
      });

      subSec.appendChild(subHeader);
      subSec.appendChild(subContent);
      content.appendChild(subSec);
    }

    const pctL1 = tN ? (tPctSum / tN) : 0;
    const tableL1 = mk('table');
    tableL1.innerHTML = `
      <thead>
        <tr>
          <th>Presupuesto Inicial</th>
          <th>Presupuesto Actual</th>
          <th>Ejecución</th>
          <th>Pendiente por Recaudar</th>
          <th>% de Ejecución</th>
        </tr>
      </thead>
      <tbody>
        <tr class="tot">
          <td>${fmtMoney(tIni, symbol, dec)}</td>
          <td>${fmtMoney(tAct, symbol, dec)}</td>
          <td>${fmtMoney(tEje, symbol, dec)}</td>
          <td>${fmtMoney(tPen, symbol, dec)}</td>
          <td>${fmtPct(pctL1, 1)}</td>
        </tr>
      </tbody>
    `;
    content.prepend(tableL1);

    header.addEventListener('click', ()=>{
      content.classList.toggle('hidden');
      header.classList.toggle('collapsed');
    });

    section.appendChild(header);
    section.appendChild(content);
    viz.appendChild(section);
  }
}

async function loadAll(){
  const status = $('#status');
  try{
    status.textContent = 'Descargando maestro…';
    const m = await fetchXlsx(MASTER_URL);
    status.textContent = 'Descargando ejecución…';
    const d = await fetchXlsx([DATA_URL, DATA_FALLB]);

    const mCols = mapMasterColumns(m.rows[0] || {});
    const dCols = mapDataColumns(d.rows[0] || {});

    // Diagnóstico rápido
    const mSet = new Set(m.rows.map(r => normCodigo(r[mCols.codigo])));
    const dSet = new Set(d.rows.map(r => normCodigo(r[dCols.codigo])));
    let match = 0; for (const c of dSet) if (c && mSet.has(c)) match++;

    diagnostics(m.headers, d.headers, mCols, dCols, match);

    if(!mCols.codigo || !mCols.nivel1 || !mCols.nivel2){
      throw new Error('Maestro: faltan columnas (codigo, Nivel 1, Nivel 2).');
    }
    if(!dCols.codigo){
      throw new Error('Ejecución: falta columna "codigo".');
    }

    const tree = buildTree(m.rows, d.rows, { calcPct: $('#calcPct').checked }, mCols, dCols);
    renderAccordion(tree, {
      symbol: $('#moneda').value || '$',
      dec: Math.max(0, Math.min(4, Number($('#decimales').value || 0)))
    });
    status.textContent = 'Listo.';
  }catch(err){
    console.error(err);
    status.innerHTML = '<span class="err">Error: ' + err.message + '</span>';
  }
}

document.addEventListener('DOMContentLoaded', ()=>{
  $('#btnReload').addEventListener('click', loadAll);
  loadAll();
});
