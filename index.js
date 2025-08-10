/* global dscc */
(function(){
  const sel = (q, el=document) => el.querySelector(q);
  const mk = (tag, cls) => { const e=document.createElement(tag); if(cls) e.className=cls; return e; };

  const num = v => {
    if (v == null) return 0;
    if (typeof v === 'number') return v;
    const s = String(v).replace(/[^\d\-,.]/g,'').replace(/\./g,'').replace(',', '.'); 
    const n = Number(s);
    return isNaN(n) ? 0 : n;
  };

  const fmtMoney = (n, symbol='$', dec=0) => {
    const nf = new Intl.NumberFormat(undefined,{minimumFractionDigits:dec, maximumFractionDigits:dec});
    return `${symbol}${nf.format(n)}`;
  };
  const fmtPct = (v, dec=1) => `${Number(v || 0).toFixed(dec)}%`;

  const build = (payload) => {
    const container = sel('#viz') || document.body.appendChild(Object.assign(document.createElement('div'),{id:'viz'}));
    container.innerHTML = '';

    const styles = payload.style || {};
    const hdr = styles.colorHeader || '#0e3a63';
    const sub = styles.colorSub    || '#174f86';
    const symbol = styles.moneda   || '$';
    const dec = Number(styles.decimales ?? 0);

    document.documentElement.style.setProperty('--hdr', hdr);
    document.documentElement.style.setProperty('--sub', sub);

    const rows = (payload.tables && payload.tables.DEFAULT) ? payload.tables.DEFAULT : [];

    const tree = {};
    rows.forEach(r => {
      const l1 = r['nivel1'] ?? '—';
      const l2 = r['nivel2'] ?? '—';
      if(!tree[l1]) tree[l1] = {};
      if(!tree[l1][l2]) tree[l1][l2] = { 
        presupuesto_inicial: 0, presupuesto_actual: 0, ejecucion: 0, pendiente: 0, porcentaje: 0, count:0
      };
      const node = tree[l1][l2];
      node.presupuesto_inicial += num(r['presupuesto_inicial']);
      node.presupuesto_actual  += num(r['presupuesto_actual']);
      node.ejecucion           += num(r['ejecucion']);
      node.pendiente           += num(r['pendiente']);
      node.porcentaje          += num(r['porcentaje']); 
      node.count++;
    });

    Object.keys(tree).forEach((l1) => {
      let tIni=0, tAct=0, tEje=0, tPen=0, tPct=0, tCount=0;
      Object.values(tree[l1]).forEach(v=>{
        tIni+=v.presupuesto_inicial; tAct+=v.presupuesto_actual; tEje+=v.ejecucion; tPen+=v.pendiente; tPct+=v.porcentaje; tCount+=v.count;
      });
      const pctL1 = tCount ? (tPct / tCount) : 0;

      const section = mk('div','section');
      const header  = mk('div','header'); header.textContent = l1;
      const content = mk('div','content hidden');

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
      content.appendChild(tableL1);

      Object.keys(tree[l1]).forEach((l2) => {
        const v = tree[l1][l2];
        const subSec = mk('div','section sub');
        const subHeader = mk('div','subheader'); subHeader.textContent = l2;
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
              <td>${fmtMoney(v.presupuesto_inicial, symbol, dec)}</td>
              <td>${fmtMoney(v.presupuesto_actual,  symbol, dec)}</td>
              <td>${fmtMoney(v.ejecucion,           symbol, dec)}</td>
              <td>${fmtMoney(v.pendiente,           symbol, dec)}</td>
              <td>${fmtPct(v.count ? v.porcentaje / v.count : 0, 1)}</td>
            </tr>
          </tbody>
        `;
        subContent.appendChild(tableL2);

        subHeader.addEventListener('click', ()=> subContent.classList.toggle('hidden'));
        subSec.appendChild(subHeader);
        subSec.appendChild(subContent);
        content.appendChild(subSec);
      });

      header.addEventListener('click', ()=> content.classList.toggle('hidden'));
      section.appendChild(header);
      section.appendChild(content);
      container.appendChild(section);
    });

    if (!rows.length){
      const empty = mk('div'); empty.textContent = 'Sin datos para mostrar.';
      empty.style.padding='8px'; container.appendChild(empty);
    }
  };

  dscc.subscribeToData(build, { transform: dscc.tableTransform });
})();
