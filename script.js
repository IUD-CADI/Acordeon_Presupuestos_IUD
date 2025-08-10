/* URLs editables + sumas: Inicial, Definitiva, Recaudo, Acumulado */
const $ = sel => document.querySelector(sel);
const mk = (tag, cls) => { const e=document.createElement(tag); if(cls) e.className=cls; return e; };

const normKey = s => String(s||'')
  .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
  .replace(/[\u00A0\s]+/g,' ')
  .trim().toLowerCase();

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

async function fetchXlsx(url){
  const res = await fetch(url, { cache: 'no-store', mode: 'cors' });
  if(!res.ok) throw new Error(`HTTP ${res.status} al descargar: ${url}`);
  const ab = await res.arrayBuffer();
  const wb = XLSX.read(ab, { type: 'array' });
  const first = wb.SheetNames[0];
  const ws = wb.Sheets[first];
  const rows = XLSX.utils.sheet_to_json(ws, { defval: null });
  if(!rows.length) throw new Error('El archivo no tiene filas');
  return { rows, headers: Object.keys(rows[0]||{}) };
}

function mapMasterColumns(sampleRow){
  const keys = Object.fromEntries(Object.keys(sampleRow).map(k => [normKey(k), k]));
  const get = (arr) => { for (const name of arr){ const key = keys[normKey(name)]; if (key) return key; } return null; };
  return {
    codigo: get(['codigo','código','cod']),
    nivel1: get(['nivel 1','nivel1','nivel_1']),
    nivel2: get(['nivel 2','nivel2','nivel_2'])
  };
}
function mapDataColumns(sampleRow){
  const keys = Object.fromEntries(Object.keys(sampleRow).map(k => [normKey(k), k]));
  const get = (arr) => { for (const name of arr){ const key = keys[normKey(name)]; if (key) return key; } return null; };
  return {
    codigo:  get(['codigo','código','cod']),
    anio:    get(['año','ano','year']),
    mes:     get(['mes','mes2','month']),
    ini:     get(['apropiacion inicial','presupuesto inicial','inicial','ppto inicial','asignado','aprobado']),
    defi:    get(['apropiacion definitiva','presupuesto actual','actual','ppto actual','vigente','definitivo','apropiacion vigente']),
    recaudo: get(['recaudo','recaudado','devengado','ejecutado','ejecucion','ejecución']),
    acum:    get(['acumulado recaudo','recaudo acumulado','acumulado'])
  };
}

function populateFilters(rows, dCols){
  const ySel = $('#fYear'); const mSel = $('#fMonth');
  ySel.innerHTML = '<option value="">Todos</option>';
  mSel.innerHTML = '<option value="">Todos</option>';
  if (!dCols.anio && !dCols.mes) return;

  const years = new Set();
  const months = new Set();
  for (const r of rows){
    if (dCols.anio) years.add(String(r[dCols.anio]));
    if (dCols.mes)  months.add(String(r[dCols.mes]));
  }
  [...years].sort((a,b)=>a.localeCompare(b,'es')).forEach(v=>{
    const opt = mk('option'); opt.value = v; opt.textContent = v; ySel.appendChild(opt);
  });
  [...months].sort((a,b)=>a.localeCompare(b,'es')).forEach(v=>{
    const opt = mk('option'); opt.value = v; opt.textContent = v; mSel.appendChild(opt);
  });

  // Preseleccionar "06-Junio" si existe
  const target = "06-Junio";
  for (const opt of mSel.options){
    if (opt.value === target || opt.value === "06" || opt.value === "6" || /junio/i.test(opt.value)){ 
      mSel.value = opt.value; break; 
    }
  }
}

function applyFilter(rows, dCols){
  const ySel = $('#fYear').value;
  const mSel = $('#fMonth').value;
  return rows.filter(r => {
    const okY = !dCols.anio || !ySel || String(r[dCols.anio]) === ySel;
    const okM = !dCols.mes  || !mSel || String(r[dCols.mes])  === mSel;
    return okY && okM;
  });
}

function diagnostics(headersM, headersD, mCols, dCols, match, totalM, totalD){
  $('#diag').innerHTML = `
    <h3>Diagnóstico</h3>
    <p><strong>Maestro</strong> encabezados: <code>${headersM.join(' | ')}</code></p>
    <p>Mapeo Maestro → codigo=<code>${mCols.codigo||'-'}</code>, nivel1=<code>${mCols.nivel1||'-'}</code>, nivel2=<code>${mCols.nivel2||'-'}</code></p>
    <hr/>
    <p><strong>Ejecución</strong> encabezados: <code>${headersD.join(' | ')}</code></p>
    <p>Mapeo Ejecución → codigo=<code>${dCols.codigo||'-'}</code>, año=<code>${dCols.anio||'-'}</code>, mes=<code>${dCols.mes||'-'}</code>, inicial=<code>${dCols.ini||'-'}</code>, definitiva=<code>${dCols.defi||'-'}</code>, recaudo=<code>${dCols.recaudo||'-'}</code>, acumulado=<code>${dCols.acum||'-'}</code></p>
    <p><strong>Códigos coincidentes</strong>: ${match} / Maestro=${totalM} / Ejecución=${totalD}</p>
  `;
}

function buildTree(masterRows, dataRows, mCols, dCols){
  const master = new Map();
  for(const r of masterRows){
    const codigo = normCodigo(r[mCols.codigo]);
    if(!codigo) continue;
    master.set(codigo, { nivel1: r[mCols.nivel1] ?? '—', nivel2: r[mCols.nivel2] ?? '—' });
  }

  const tree = new Map(); // nivel1 -> Map(nivel2 -> {ini, def, rec, acm})
  for(const r of dataRows){
    const cod = normCodigo(r[dCols.codigo]);
    if(!cod) continue;
    const m = master.get(cod);
    const nivel1 = m?.nivel1 ?? '— (sin maestro)';
    const nivel2 = m?.nivel2 ?? '— (sin maestro)';

    const ini = dCols.ini     ? num(r[dCols.ini])     : 0;
    const def = dCols.defi    ? num(r[dCols.defi])    : 0;
    const rec = dCols.recaudo ? num(r[dCols.recaudo]) : 0;
    const acm = dCols.acum    ? num(r[dCols.acum])    : 0;

    if(!tree.has(nivel1)) tree.set(nivel1, new Map());
    const sub = tree.get(nivel1);
    if(!sub.has(nivel2)) sub.set(nivel2, {ini:0, def:0, rec:0, acm:0});

    const node = sub.get(nivel2);
    node.ini += ini; node.def += def; node.rec += rec; node.acm += acm;
  }
  return tree;
}

function computeTotals(tree){
  let tIni=0, tDef=0, tRec=0, tAcm=0;
  for(const [, lvl2] of tree.entries()){
    for(const [, v] of lvl2.entries()){
      tIni += v.ini; tDef += v.def; tRec += v.rec; tAcm += v.acm;
    }
  }
  return { tIni, tDef, tRec, tAcm };
}

function renderGlobalTotals(totals, symbol, dec){
  const g = $('#global');
  const { tIni, tDef, tRec, tAcm } = totals;
  g.innerHTML = `
    <div class="global">
      <table>
        <thead>
          <tr>
            <th>Total Suma de Apropiación Inicial</th>
            <th>Total Suma de Apropiación Definitiva</th>
            <th>Total Suma de Recaudo</th>
            <th>Total Suma de Acumulado Recaudo</th>
          </tr>
        </thead>
        <tbody>
          <tr class="tot">
            <td>${fmtMoney(tIni, symbol, dec)}</td>
            <td>${fmtMoney(tDef, symbol, dec)}</td>
            <td>${fmtMoney(tRec, symbol, dec)}</td>
            <td>${fmtMoney(tAcm, symbol, dec)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  `;
}

function renderAccordion(tree, symbol, dec){
  const viz = $('#viz'); viz.innerHTML = '';

  if(!tree || !tree.size){
    viz.textContent = 'Sin datos para mostrar.'; return;
  }

  for(const [l1, lvl2] of tree.entries()){
    let tIni=0, tDef=0, tRec=0, tAcm=0;

    const section = mk('div','section');
    const header  = mk('div','header collapsed');
    header.innerHTML = `<span>${l1}</span><span class="chev">▾</span>`;
    const content = mk('div','content hidden');

    for(const [l2, v] of lvl2.entries()){
      tIni += v.ini; tDef += v.def; tRec += v.rec; tAcm += v.acm;

      const subSec = mk('div','section sub');
      const subHeader = mk('div','subheader collapsed');
      subHeader.innerHTML = `<span>${l2}</span><span class="chev">▾</span>`;
      const subContent = mk('div','content hidden');

      const tableL2 = mk('table');
      tableL2.innerHTML = `
        <thead>
          <tr>
            <th>Suma de Apropiación Inicial</th>
            <th>Suma de Apropiación Definitiva</th>
            <th>Suma de Recaudo</th>
            <th>Suma de Acumulado Recaudo</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>${fmtMoney(v.ini, symbol, dec)}</td>
            <td>${fmtMoney(v.def, symbol, dec)}</td>
            <td>${fmtMoney(v.rec, symbol, dec)}</td>
            <td>${fmtMoney(v.acm, symbol, dec)}</td>
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

    const tableL1 = mk('table');
    tableL1.innerHTML = `
      <thead>
        <tr>
          <th>Suma de Apropiación Inicial</th>
          <th>Suma de Apropiación Definitiva</th>
          <th>Suma de Recaudo</th>
          <th>Suma de Acumulado Recaudo</th>
        </tr>
      </thead>
      <tbody>
        <tr class="tot">
          <td>${fmtMoney(tIni, symbol, dec)}</td>
          <td>${fmtMoney(tDef, symbol, dec)}</td>
          <td>${fmtMoney(tRec, symbol, dec)}</td>
          <td>${fmtMoney(tAcm, symbol, dec)}</td>
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

let CACHE = { m:null, d:null, mCols:null, dCols:null };

function getUrls(){
  let master = localStorage.getItem('iud_master_url') || '';
  let data   = localStorage.getItem('iud_data_url') || '';
  // Soporta ?master=...&data=...
  const q = new URLSearchParams(location.search);
  if (q.get('master')) master = q.get('master');
  if (q.get('data'))   data   = q.get('data');
  $('#masterUrl').value = master;
  $('#dataUrl').value = data;
  return { master, data };
}
function saveUrls(){
  const master = $('#masterUrl').value.trim();
  const data   = $('#dataUrl').value.trim();
  localStorage.setItem('iud_master_url', master);
  localStorage.setItem('iud_data_url', data);
  return { master, data };
}

async function loadAll(){
  const status = $('#status');
  try{
    const { master, data } = getUrls();
    if (!master || !data){
      status.textContent = 'Pega las URLs y presiona "Guardar URLs" o "Recargar datos".';
      return;
    }
    status.textContent = 'Descargando maestro…';
    const m = await fetchXlsx(master);
    status.textContent = 'Descargando ejecución…';
    const d = await fetchXlsx(data);

    const mCols = mapMasterColumns(m.rows[0] || {});
    const dCols = mapDataColumns(d.rows[0] || {});

    const mSet = new Set(m.rows.map(r => normCodigo(r[mCols.codigo])));
    const dSet = new Set(d.rows.map(r => normCodigo(r[dCols.codigo])));
    let match = 0; for (const c of dSet) if (c && mSet.has(c)) match++;

    diagnostics(m.headers, d.headers, mCols, dCols, match, mSet.size, dSet.size);
    populateFilters(d.rows, dCols);

    CACHE = { m, d, mCols, dCols };
    status.textContent = 'Listo. Aplica filtros si lo deseas.';

    applyAndRender();
  }catch(err){
    console.error(err);
    $('#status').innerHTML = '<span class="err">Error: ' + err.message + '</span>';
  }
}

function applyAndRender(){
  const { m, d, mCols, dCols } = CACHE;
  if(!m || !d) return;
  const filtered = (d && d.rows) ? (function(rows){
    const ySel = $('#fYear').value;
    const mSel = $('#fMonth').value;
    return rows.filter(r => {
      const okY = !dCols.anio || !ySel || String(r[dCols.anio]) === ySel;
      const okM = !dCols.mes  || !mSel || String(r[dCols.mes])  === mSel;
      return okY && okM;
    });
  })(d.rows) : [];

  const tree = buildTree(m.rows, filtered, mCols, dCols);
  const totals = computeTotals(tree);
  renderGlobalTotals(totals, $('#moneda').value || '$', Math.max(0, Math.min(4, Number($('#decimales').value || 0))));
  renderAccordion(tree, $('#moneda').value || '$', Math.max(0, Math.min(4, Number($('#decimales').value || 0))));
}

document.addEventListener('DOMContentLoaded', ()=>{
  $('#btnSave').addEventListener('click', ()=>{ saveUrls(); loadAll(); });
  $('#btnReload').addEventListener('click', loadAll);
  $('#btnApply').addEventListener('click', applyAndRender);
  // carga inicial si las URLs ya están guardadas
  getUrls();
  loadAll();
});
