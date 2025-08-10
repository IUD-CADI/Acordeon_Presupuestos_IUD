/* Diagnóstico: muestra mapping de columnas, matches entre códigos y acordeón */
const MASTER_URL = "https://iud-cadi.github.io/Acordeon_Presupuestos_IUD/Datos_maestros_presupuesto.xlsx";
const DATA_URL   = "https://iud-cadi.github.io/Acordeon_Presupuestos_IUD/EJECUCION_PRESUPUESTAL_INGRESO.xlsx";

const $ = sel => document.querySelector(sel);
const mk = (tag, cls) => { const e=document.createElement(tag); if(cls) e.className=cls; return e; };
const normKey = s => String(s||'').trim().toLowerCase();

/* Normaliza 'codigo' para evitar problemas de número vs texto, comas, .0, espacios */
function normCodigo(v){
  if (v == null) return '';
  let s = String(v).trim();
  // Si viene como 1234.0 lo pasamos a 1234
  if (/^\d+\.0+$/.test(s)) s = s.replace(/\.0+$/, '');
  // Quitamos separadores extraños
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

async function fetchXlsx(url){
  const res = await fetch(url, { cache: 'no-store', mode: 'cors' });
  if(!res.ok) throw new Error(`No se pudo descargar (HTTP ${res.status}) -> ${url}`);
  const ab = await res.arrayBuffer();
  const wb = XLSX.read(ab, { type: 'array' });
  const first = wb.SheetNames[0];
  const ws = wb.Sheets[first];
  const rows = XLSX.utils.sheet_to_json(ws, { defval: null });
  if(!rows.length) throw new Error('El archivo no tiene filas (¿hoja vacía?)');
  return rows;
}

function mapMasterColumns(row){
  const keys = Object.fromEntries(Object.keys(row).map(k => [normKey(k), k]));
  const get = (...arrs) => {
    for (const arr of arrs) for (const name of arr) {
      const key = keys[normKey(name)];
      if (key) return key;
    } return null;
  };
  return {
    codigo: get(['codigo','código','cod']),
    nivel1: get(['nivel 1','nivel1','nivel_1','nivel uno']),
    nivel2: get(['nivel 2','nivel2','nivel_2','nivel dos']),
    nombre: get(['nombre','descripcion','descripción','detalle'])
  };
}

function mapDataColumns(row){
  const keys = Object.fromEntries(Object.keys(row).map(k => [normKey(k), k]));
  const get = (...arrs) => {
    for (const arr of arrs) for (const name of arr) {
      const key = keys[normKey(name)];
      if (key) return key;
    } return null;
  };
  return {
    codigo: get(['codigo','código','cod']),
    inicial: get(['presupuesto inicial','inicial','ppto inicial']),
    actual:  get(['presupuesto actual','actual','ppto actual']),
    ejec:    get(['ejecución','ejecucion']),
    pend:    get(['pendiente por recaudar','pendiente','pend']),
    pct:     get(['% de ejecución','% ejec','porcentaje','porcentaje de ejecución'])
  };
}

function diagnostics(masterRows, dataRows, mCols, dCols){
  const diag = $('#diag');
  const mKeys = Object.keys(masterRows[0] || {});
  const dKeys = Object.keys(dataRows[0] || {});

  // Conjuntos de códigos
  const mSet = new Set(masterRows.map(r => normCodigo(r[mCols.codigo])));
  const dSet = new Set(dataRows.map(r => normCodigo(r[dCols.codigo])));
  let matches = 0;
  for(const c of dSet) if (c && mSet.has(c)) matches++;

  const sampleUnmatched = [];
  for(const c of dSet) {
    if (c && !mSet.has(c)) { sampleUnmatched.push(c); if (sampleUnmatched.length>=10) break; }
  }

  diag.innerHTML = `
    <h3>Diagnóstico</h3>
    <table>
      <thead><tr><th>Archivo</th><th>Columnas detectadas</th></tr></thead>
      <tbody>
        <tr><td>Maestro</td><td>${mKeys.join(', ') || '(sin cabeceras)'}</td></tr>
        <tr><td>Ejecución</td><td>${dKeys.join(', ') || '(sin cabeceras)'}</td></tr>
      </tbody>
    </table>
    <p><strong>Mapeo Maestro:</strong> codigo=<code>${mCols.codigo||'-'}</code>, nivel1=<code>${mCols.nivel1||'-'}</code>, nivel2=<code>${mCols.nivel2||'-'}</code>, nombre=<code>${mCols.nombre||'-'}</code></p>
    <p><strong>Mapeo Ejecución:</strong> codigo=<code>${dCols.codigo||'-'}</code>, inicial=<code>${dCols.inicial||'-'}</code>, actual=<code>${dCols.actual||'-'}</code>, ejec=<code>${dCols.ejec||'-'}</code>, pend=<code>${dCols.pend||'-'}</code>, pct=<code>${dCols.pct||'-'}</code></p>
    <p><strong>Códigos</strong> Maestro=${mSet.size}, Ejecución=${dSet.size}, <strong>Coincidencias</strong>=${matches}</p>
    ${sampleUnmatched.length ? `<p>Ejemplos de códigos en Ejecución que no existen en Maestro: <code>${sampleUnmatched.join(', ')}</code></p>` : ''}
  `;
}

function joinAndAggregate(masterRows, dataRows, opts){
  const { calcPct } = opts;
  const mCols = mapMasterColumns(masterRows[0] || {});
  if(!mCols.codigo || !mCols.nivel1 || !mCols.nivel2){
    throw new Error('Maestro: faltan columnas requeridas (min: codigo, Nivel 1, Nivel 2).');
  }
  const master = new Map();
  for(const r of masterRows){
    const codigo = normCodigo(r[mCols.codigo]);
    if(!codigo) continue;
    master.set(codigo, {
      nivel1: r[mCols.nivel1] ?? '—',
      nivel2: r[mCols.nivel2] ?? '—',
      nombre: mCols.nombre ? r[mCols.nombre] : null
    });
  }

  const dCols = mapDataColumns(dataRows[0] || {});
  if(!dCols.codigo) throw new Error('Ejecución: falta columna "codigo".');

  diagnostics(masterRows, dataRows, mCols, dCols);

  const tree = new Map(); // nivel1 -> Map(nivel2 -> {ini,act,eje,pen,pctSum,n})
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
    if (calcPct) {
      pct = act ? (eje/act)*100 : 0;
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
  const status = document.querySelector('#status');
  try{
    status.textContent = 'Descargando archivos…';
    const [masterRows, dataRows] = await Promise.all([fetchXlsx(MASTER_URL), fetchXlsx(DATA_URL)]);
    status.textContent = `Filas: Maestro=${masterRows.length}, Ejecución=${dataRows.length}. Analizando columnas…`;
    const tree = joinAndAggregate(masterRows, dataRows, { calcPct: document.querySelector('#calcPct').checked });
    renderAccordion(tree, {
      symbol: document.querySelector('#moneda').value || '$',
      dec: Math.max(0, Math.min(4, Number(document.querySelector('#decimales').value || 0)))
    });
    status.textContent = 'Listo.';
  }catch(err){
    console.error(err);
    status.innerHTML = '<span class="err">Error: ' + err.message + '</span>';
  }
}

document.addEventListener('DOMContentLoaded', ()=>{
  document.querySelector('#btnReload').addEventListener('click', loadAll);
  loadAll();
});
