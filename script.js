/* Une Maestro + Ejecución por 'codigo' y renderiza acordeón Nivel1->Nivel2 con totales */
const $ = sel => document.querySelector(sel);
const mk = (tag, cls) => { const e=document.createElement(tag); if(cls) e.className=cls; return e; };

const normKey = s => String(s||'').trim().toLowerCase();
const pick = (obj, keys) => keys.find(k => obj.hasOwnProperty(k));

const num = v => {
  if (v == null || v === '') return 0;
  if (typeof v === 'number') return v;
  const s = String(v).replace(/[^\d\-,.]/g,'').replace(/\./g,'').replace(',', '.'); // tolerante
  const n = Number(s);
  return isNaN(n) ? 0 : n;
};

const fmtMoney = (n, symbol='$', dec=0) => {
  const nf = new Intl.NumberFormat('es-CO',{minimumFractionDigits:dec, maximumFractionDigits:dec});
  return `${symbol}${nf.format(n||0)}`;
};
const fmtPct = (v, dec=1) => `${Number(v || 0).toFixed(dec)}%`;

async function fetchXlsx(url){
  const res = await fetch(url, { cache: 'no-store' });
  if(!res.ok) throw new Error(`HTTP ${res.status} al descargar: ${url}`);
  const ab = await res.arrayBuffer();
  const wb = XLSX.read(ab, { type: 'array' });
  const first = wb.SheetNames[0];
  const ws = wb.Sheets[first];
  const rows = XLSX.utils.sheet_to_json(ws, { defval: null });
  return rows;
}

/* Intenta mapear nombres de columnas en español con diferentes variantes */
function mapMasterColumns(row){
  const keys = Object.fromEntries(Object.keys(row).map(k => [normKey(k), k]));
  const get = (arr) => {
    for (const name of arr) {
      const key = keys[normKey(name)];
      if (key) return key;
    }
    return null;
  };
  return {
    codigo: get(['codigo','código','cod']),
    nivel1: get(['nivel 1','nivel1','nivel_1']),
    nivel2: get(['nivel 2','nivel2','nivel_2']),
    nombre: get(['nombre','descripcion','descripción','detalle'])
  };
}

function mapDataColumns(row){
  const keys = Object.fromEntries(Object.keys(row).map(k => [normKey(k), k]));
  const get = (arr) => {
    for (const name of arr) {
      const key = keys[normKey(name)];
      if (key) return key;
    }
    return null;
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

function joinAndAggregate(masterRows, dataRows, opts){
  const { calcPct } = opts;
  // Construir índice maestro: codigo -> {nivel1, nivel2, nombre}
  const mCols = mapMasterColumns(masterRows[0] || {});
  if(!mCols.codigo || !mCols.nivel1 || !mCols.nivel2){
    throw new Error('No se encontraron columnas requeridas en el Excel Maestro (mínimo: codigo, Nivel 1, Nivel 2).');
  }
  const master = new Map();
  for(const r of masterRows){
    const codigo = String(r[mCols.codigo]).trim();
    if(!codigo) continue;
    master.set(codigo, {
      nivel1: r[mCols.nivel1] ?? '—',
      nivel2: r[mCols.nivel2] ?? '—',
      nombre: mCols.nombre ? r[mCols.nombre] : null
    });
  }

  // Agregar por Nivel1->Nivel2 con datos de ejecución
  const dCols = mapDataColumns(dataRows[0] || {});
  if(!dCols.codigo) throw new Error('No se encontró la columna "codigo" en el Excel de Ejecución.');

  const tree = new Map(); // nivel1 -> Map(nivel2 -> {ini,act,eje,pen,pctSum,n})
  for(const r of dataRows){
    const cod = String(r[dCols.codigo] ?? '').trim();
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
  const viz = $('#viz'); viz.innerHTML = '';

  if(!tree || !tree.size){
    viz.textContent = 'Sin datos para mostrar.'; return;
  }

  for(const [l1, lvl2] of tree.entries()){
    let tIni=0, tAct=0, tEje=0, tPen=0, tPctSum=0, tN=0;

    const section = mk('div','section');
    const header  = mk('div','header collapsed');
    header.innerHTML = `<span>${l1}</span><span class="chev">▾</span>`;
    const content = mk('div','content hidden');

    // Sub-secciones Nivel 2
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

    // Totales L1
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

async function onLoad(){
  const urlM = $('#xlsxMaster').value.trim();
  const urlD = $('#xlsxData').value.trim();
  const status = $('#status');
  try{
    if(!urlM || !urlD) throw new Error('Debes pegar la URL del Excel Maestro y del Excel de Ejecución.');
    status.textContent = 'Descargando y procesando archivos…';
    const [masterRows, dataRows] = await Promise.all([fetchXlsx(urlM), fetchXlsx(urlD)]);
    status.textContent = `Filas: Maestro=${masterRows.length}, Ejecución=${dataRows.length}. Agrupando…`;
    const tree = joinAndAggregate(masterRows, dataRows, { calcPct: $('#calcPct').checked });
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
  $('#btnLoad').addEventListener('click', onLoad);
});
