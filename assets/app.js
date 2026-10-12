(function () {
  'use strict';

  var G = window.WSGen;
  var LS_SPEC = 'wsgen.spec';
  var LS_CFG = 'wsgen.config';

  var repoConfig = G.DEFAULT_CONFIG;
  var config = clone(repoConfig);
  var spec = G.emptySpec();
  var result = null;
  var activeTab = 'preview';

  function $(id) { return document.getElementById(id); }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function lsGet(k) { try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : null; } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* 저장 불가 환경 */ } }
  function h(tag, attrs, kids) {
    var el = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      if (k === 'text') el.textContent = attrs[k];
      else if (k === 'html') el.innerHTML = attrs[k];
      else if (k.indexOf('on') === 0) el.addEventListener(k.slice(2), attrs[k]);
      else if (attrs[k] !== false && attrs[k] != null) el.setAttribute(k, attrs[k] === true ? '' : attrs[k]);
    });
    (kids || []).forEach(function (c) { if (c) el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return el;
  }
  function escHtml(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function toast(msg) {
    var t = $('toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toast.tm);
    toast.tm = setTimeout(function () { t.classList.remove('show'); }, 1600);
  }
  function isMd() { return spec.screenType === 'md-tb' || spec.screenType === 'md-lr'; }
  function canEditMaster() { return spec.screenType === 'edit' || spec.screenType === 'grid-form'; }

  /* ---------- 1. 화면 유형 ---------- */

  var THUMBS = {
    search: '<rect class="wf-fill" x="2" y="2" width="156" height="16" rx="3"/><rect class="wf-grid" x="2" y="24" width="156" height="44" rx="3"/><rect class="wf-head" x="3" y="25" width="154" height="8"/>',
    edit: '<rect class="wf-fill" x="2" y="2" width="156" height="16" rx="3"/><rect class="wf-grid" x="2" y="24" width="156" height="44" rx="3"/><rect class="wf-head" x="3" y="25" width="154" height="8"/><rect class="wf-acc" x="40" y="44" width="60" height="7"/>',
    'md-tb': '<rect class="wf-fill" x="2" y="2" width="156" height="12" rx="3"/><rect class="wf-grid" x="2" y="18" width="156" height="23" rx="3"/><rect class="wf-head" x="3" y="19" width="154" height="6"/><rect class="wf-grid" x="2" y="45" width="156" height="23" rx="3"/><rect class="wf-head" x="3" y="46" width="154" height="6"/>',
    'md-lr': '<rect class="wf-fill" x="2" y="2" width="156" height="14" rx="3"/><rect class="wf-grid" x="2" y="20" width="76" height="48" rx="3"/><rect class="wf-head" x="3" y="21" width="74" height="7"/><rect class="wf-grid" x="82" y="20" width="76" height="48" rx="3"/><rect class="wf-head" x="83" y="21" width="74" height="7"/>',
    'grid-form': '<rect class="wf-fill" x="2" y="2" width="156" height="12" rx="3"/><rect class="wf-grid" x="2" y="18" width="156" height="24" rx="3"/><rect class="wf-head" x="3" y="19" width="154" height="6"/><rect class="wf-fill" x="2" y="46" width="156" height="22" rx="3"/><rect class="wf-acc" x="8" y="51" width="40" height="5"/><rect class="wf-acc" x="84" y="51" width="40" height="5"/><rect class="wf-acc" x="8" y="59" width="40" height="5"/>',
    meta: '<rect class="wf-fill" x="2" y="2" width="70" height="66" rx="3"/><rect class="wf-acc" x="8" y="10" width="50" height="5"/><rect class="wf-acc" x="8" y="20" width="40" height="5"/><rect class="wf-acc" x="8" y="30" width="46" height="5"/><rect class="wf-grid" x="80" y="2" width="78" height="66" rx="3"/><rect class="wf-head" x="81" y="3" width="76" height="8"/>'
  };

  function renderTypes() {
    var g = $('typeGrid');
    g.innerHTML = '';
    G.SCREEN_TYPES.forEach(function (t) {
      var b = h('button', { type: 'button', class: 'type-card' + (spec.screenType === t.id ? ' on' : ''), onclick: function () {
        spec.screenType = t.id;
        renderAll();
      } });
      b.innerHTML = '<svg viewBox="0 0 160 70" aria-hidden="true">' + THUMBS[t.id] + '</svg><b>' + t.nm + '</b><span>' + t.desc + '</span>';
      g.appendChild(b);
    });
  }

  /* ---------- 2. 디자인 ---------- */

  function renderDesign() {
    var d = spec.design;
    Array.prototype.forEach.call($('segCols').children, function (b) {
      b.classList.toggle('on', String(d.searchCols) === b.getAttribute('data-v'));
    });
    $('dRowNum').checked = !!d.rowNum;
    $('dExcel').checked = !!d.excel;
    $('dGuide').checked = !!d.guide;
    $('dGuideText').value = d.guideText || '';
    $('guideWrap').hidden = !d.guide;
  }
  function bindDesign() {
    Array.prototype.forEach.call($('segCols').children, function (b) {
      b.addEventListener('click', function () { spec.design.searchCols = Number(b.getAttribute('data-v')); renderDesign(); update(); });
    });
    $('dRowNum').addEventListener('change', function (e) { spec.design.rowNum = e.target.checked; update(); });
    $('dExcel').addEventListener('change', function (e) { spec.design.excel = e.target.checked; update(); });
    $('dGuide').addEventListener('change', function (e) { spec.design.guide = e.target.checked; renderDesign(); update(); });
    $('dGuideText').addEventListener('input', function (e) { spec.design.guideText = e.target.value; update(); });
  }

  /* ---------- 3. 기본 정보 ---------- */

  function infoFields() {
    var t = spec.screenType;
    var f = [
      { k: 'screenId', l: t === 'meta' ? '조회 ID' : '화면 ID (파일명)', ph: 'CLS_SAMPLE_LIST' },
      { k: 'screenNm', l: t === 'meta' ? '조회명' : '화면명', ph: '개설강좌 현황 조회' },
      { k: 'author', l: '작성자' },
      { k: 'systemGcd', l: '시스템구분 (공통코드 보정용)', ph: config.settings.defaultSystemGcd },
      { k: 'db', l: 'DB', type: 'db' },
      { k: 'table', l: isMd() ? '마스터 테이블' : '대상 테이블', ph: '[dbo].[테이블명]' },
      { k: 'spSearch', l: isMd() ? '마스터 조회 SP' : '조회 SP', ph: 'CLS_샘플_현황_조회' }
    ];
    if (canEditMaster()) f.push({ k: 'spSave', l: '저장 SP', ph: 'CLS_샘플_저장' });
    if (isMd()) {
      f.push({ k: 'mdKey', l: '마스터-상세 연결 키 (쉼표 구분)', ph: 'SUBJ_KEY' });
      f.push({ k: 'detailTable', l: '상세 테이블', ph: '[dbo].[상세테이블]' });
      f.push({ k: 'spDetail', l: '상세 조회 SP' });
      f.push({ k: 'spDetailSave', l: '상세 저장 SP (상세 편집 시)' });
    }
    if (t === 'meta') {
      f.push({ k: 'dbSystemGcd', l: 'DB 시스템구분 (0000_DB_SYSTEM_GCD)', ph: '0001' });
      f.push({ k: 'authUserIds', l: '권한 사용자 ID (쉼표, 비우면 전체)' });
      f.push({ k: 'authDeptCds', l: '권한 부서코드 (쉼표, 비우면 전체)' });
    } else {
      f.push({ k: 'masterTitle', l: isMd() ? '마스터 영역 제목' : '결과 영역 제목' });
      if (isMd() || t === 'grid-form') f.push({ k: 'detailTitle', l: '상세 영역 제목' });
    }
    return f;
  }

  function renderInfo() {
    var g = $('infoGrid');
    g.innerHTML = '';
    infoFields().forEach(function (f) {
      var input;
      if (f.type === 'db') {
        input = h('select', { onchange: function (e) { spec.info.db = e.target.value; update(); } });
        var dbs = config.dbs.slice();
        if (spec.info.db && dbs.indexOf(spec.info.db) < 0) dbs.push(spec.info.db);
        dbs.forEach(function (d) { input.appendChild(h('option', { value: d, text: d, selected: spec.info.db === d })); });
      } else {
        input = h('input', { type: 'text', value: spec.info[f.k] || '', placeholder: f.ph || '', oninput: function (e) {
          spec.info[f.k] = e.target.value;
          update();
        } });
      }
      g.appendChild(h('label', { class: 'field' }, [h('span', { class: 'lbl', text: f.l }), input]));
    });
  }

  /* ---------- 공통 표 편집기 ---------- */

  function tableEditor(el, rows, fields, newRow, extraBtns) {
    el.innerHTML = '';
    var wrap = h('div', { class: 'tbl-wrap' });
    var tbl = h('table', { class: 'ed' });
    var thead = h('tr');
    fields.forEach(function (f) { thead.appendChild(h('th', { text: f.l, style: f.w ? 'width:' + f.w : null })); });
    thead.appendChild(h('th', { text: '' }));
    tbl.appendChild(h('thead', null, [thead]));
    var tb = h('tbody');
    rows.forEach(function (r, i) {
      var tr = h('tr');
      fields.forEach(function (f) {
        var td = h('td', { class: f.t === 'check' ? 'c' : null });
        var input;
        if (f.t === 'select') {
          input = h('select', { onchange: function (e) { r[f.k] = e.target.value; if (f.rerender) rerender(); update(); } });
          (typeof f.opts === 'function' ? f.opts(r) : f.opts).forEach(function (o) {
            var v = typeof o === 'string' ? o : o.v;
            var l = typeof o === 'string' ? o : o.l;
            input.appendChild(h('option', { value: v, text: l, selected: (r[f.k] || f.dflt || '') === v }));
          });
        } else if (f.t === 'check') {
          input = h('input', { type: 'checkbox', checked: !!r[f.k], onchange: function (e) { r[f.k] = e.target.checked; update(); } });
        } else {
          input = h('input', {
            type: f.t === 'number' ? 'number' : 'text', value: r[f.k] == null ? '' : r[f.k], placeholder: f.ph || '',
            list: f.t === 'code' ? 'codeList' : null,
            oninput: function (e) { r[f.k] = f.t === 'number' ? (e.target.value === '' ? '' : Number(e.target.value)) : e.target.value; update(); }
          });
        }
        td.appendChild(input);
        tr.appendChild(td);
      });
      var ops = h('td', { class: 'ops' }, [
        h('button', { type: 'button', class: 'icon-btn', title: '위로', text: '▲', onclick: function () { move(i, -1); } }),
        ' ',
        h('button', { type: 'button', class: 'icon-btn', title: '아래로', text: '▼', onclick: function () { move(i, 1); } }),
        ' ',
        h('button', { type: 'button', class: 'icon-btn', title: '삭제', text: '✕', onclick: function () { rows.splice(i, 1); rerender(); update(); } })
      ]);
      tr.appendChild(ops);
      tb.appendChild(tr);
    });
    if (!rows.length) {
      tb.appendChild(h('tr', null, [h('td', { colspan: fields.length + 1, class: 'c', style: 'color:var(--muted);padding:12px', text: '항목이 없습니다.' })]));
    }
    tbl.appendChild(tb);
    wrap.appendChild(tbl);
    el.appendChild(wrap);
    var add = h('div', { class: 'add-row' }, [
      h('button', { type: 'button', class: 'btn sm ghost', text: '+ 행 추가', onclick: function () { rows.push(newRow()); rerender(); update(); } })
    ]);
    (extraBtns || []).forEach(function (b) { add.appendChild(b); });
    el.appendChild(add);

    function move(i, d) {
      var j = i + d;
      if (j < 0 || j >= rows.length) return;
      var t = rows[i]; rows[i] = rows[j]; rows[j] = t;
      rerender(); update();
    }
    function rerender() { tableEditor(el, rows, fields, newRow, extraBtns); }
  }

  /* ---------- 4. 조회조건 ---------- */

  function renderConds() {
    var sessionBtn = h('select', { class: 'btn sm ghost', style: 'width:auto', onchange: function (e) {
      if (!e.target.value) return;
      spec.conds.push({ id: e.target.value, nm: e.target.value.replace('SESSION_', '세션 '), type: 'SESSION' });
      e.target.value = '';
      renderConds(); update();
    } }, [h('option', { value: '', text: '+ 세션 파라미터…' })].concat(G.SESSION_KEYS.map(function (k) { return h('option', { value: k, text: k }); })));
    tableEditor($('condTable'), spec.conds, [
      { k: 'id', l: '파라미터 ID', ph: 'SYEAR' },
      { k: 'nm', l: '표시명', ph: '학년도' },
      { k: 'type', l: '유형', t: 'select', opts: G.COND_TYPES, w: '110px' },
      { k: 'code', l: '공통코드 그룹', t: 'code', ph: 'SELECT·TERM' },
      { k: 'dflt', l: '기본값' },
      { k: 'req', l: '필수', t: 'check', w: '44px' }
    ], function () { return { id: '', nm: '', type: 'TEXT', code: '', req: false }; }, [sessionBtn]);
  }

  /* ---------- 5. 컬럼 ---------- */

  function colFields(editable, meta) {
    var f = [
      { k: 'id', l: meta ? '원본 컬럼' : '컬럼 ID', ph: 'SUBJ_NM' },
      { k: 'nm', l: meta ? '표시명 (별칭)' : '헤더명', ph: '교과목명' }
    ];
    if (!meta) {
      f.push({ k: 'width', l: '폭', t: 'number', w: '70px' });
      f.push({ k: 'align', l: '정렬', t: 'select', opts: [{ v: 'center', l: '가운데' }, { v: 'left', l: '왼쪽' }, { v: 'right', l: '오른쪽' }], w: '84px' });
    }
    if (editable) {
      f.push({ k: 'edit', l: '편집', t: 'select', opts: [
        { v: 'none', l: '읽기' }, { v: 'text', l: '텍스트' }, { v: 'number', l: '숫자' },
        { v: 'select', l: '콤보' }, { v: 'date', l: '날짜' }, { v: 'check', l: '체크' }], w: '84px' });
    }
    if (!meta) f.push({ k: 'code', l: '공통코드', t: 'code' });
    if (editable) {
      f.push({ k: 'req', l: '필수', t: 'check', w: '44px' });
      f.push({ k: 'maxbyte', l: 'maxbyte', t: 'number', w: '76px' });
    }
    if (!meta) {
      f.push({ k: 'key', l: '키', t: 'check', w: '40px' });
      f.push({ k: 'hidden', l: '숨김', t: 'check', w: '44px' });
    }
    return f;
  }

  function renderCols() {
    var meta = spec.screenType === 'meta';
    $('colTitle').textContent = isMd() ? '마스터 컬럼' : (meta ? '결과 컬럼 (별칭 [01_표시명] 로 생성, 최대 40개)' : '결과 컬럼');
    tableEditor($('colTable'), spec.cols, colFields(canEditMaster(), meta), function () {
      return { id: '', nm: '', width: 100, align: 'center', edit: canEditMaster() ? 'text' : 'none' };
    });
    $('dcolWrap').hidden = !isMd();
    if (isMd()) {
      tableEditor($('dcolTable'), spec.dcols, colFields(true, false), function () {
        return { id: '', nm: '', width: 100, align: 'center', edit: 'none' };
      });
    }
  }

  /* ---------- 6. 공통코드 ---------- */

  function renderCodes() {
    var dl = $('codeList');
    dl.innerHTML = '';
    config.codes.forEach(function (c) { dl.appendChild(h('option', { value: c.group, text: c.nm })); });
    tableEditor($('codeTable'), config.codes, [
      { k: 'group', l: '그룹 (시스템구분_코드)', ph: '0001_TERM_GCD' },
      { k: 'nm', l: '이름', ph: '학기' },
      { k: 'etc', l: '조건 SQL 조각 (선택)', ph: "AND CHAR_1_CONTENT = 'Y'" },
      { k: 'note', l: '메모' }
    ], function () { return { group: '', nm: '', etc: '', note: '' }; }, [
      h('button', { type: 'button', class: 'btn sm ghost', text: '설정 JSON 받기', onclick: downloadConfig })
    ]);
  }

  /* ---------- 설정 ---------- */

  var SETTING_FIELDS = [
    { k: 'verified', l: '기존 화면에서 확인함', t: 'check' },
    { k: 'bindUrl', l: 'bindProc URL' },
    { k: 'udcHeadTag', l: 'UDC head 태그 (w2:require 등, 없으면 비움)', t: 'area' },
    { k: 'udcBodyTag', l: '상단 공통버튼 UDC body 태그', t: 'area' },
    { k: 'udcInit', l: 'UDC init 코드 ({GRID} {SEARCH_SP} {EXCEL_YN} 치환)', t: 'area', rows: 6 },
    { k: 'codeLabelCol', l: '공통코드 DataList 라벨 컬럼' },
    { k: 'codeValueCol', l: '공통코드 DataList 값 컬럼' },
    { k: 'alertFn', l: '알림 함수명 (예: alert, common.alert)' },
    { k: 'termCode', l: '학기 공통코드 그룹' },
    { k: 'defaultSystemGcd', l: '기본 시스템구분' }
  ];

  function renderSettings() {
    var g = $('settingsGrid');
    g.innerHTML = '';
    var s = config.settings;
    SETTING_FIELDS.forEach(function (f) {
      var input;
      if (f.t === 'check') {
        g.appendChild(h('label', { class: 'field chk wide' }, [
          h('input', { type: 'checkbox', checked: !!s[f.k], onchange: function (e) { s[f.k] = e.target.checked; saveConfig(); update(); } }),
          f.l
        ]));
        return;
      }
      if (f.t === 'area') {
        input = h('textarea', { rows: f.rows || 2, oninput: function (e) { s[f.k] = e.target.value; saveConfig(); update(); } });
        input.value = s[f.k] || '';
      } else {
        input = h('input', { type: 'text', value: s[f.k] || '', oninput: function (e) { s[f.k] = e.target.value; saveConfig(); update(); } });
      }
      g.appendChild(h('label', { class: 'field' + (f.t === 'area' ? ' wide' : '') }, [h('span', { class: 'lbl', text: f.l }), input]));
    });
    var dbs = h('input', { type: 'text', value: config.dbs.join(', '), oninput: function (e) {
      config.dbs = e.target.value.split(',').map(function (x) { return x.trim(); }).filter(Boolean);
      saveConfig(); renderInfo();
    } });
    g.appendChild(h('label', { class: 'field wide' }, [h('span', { class: 'lbl', text: 'DB 목록 (쉼표 구분)' }), dbs]));
  }

  function saveConfig() { lsSet(LS_CFG, config); }
  function downloadConfig() {
    download('ws-config.json', JSON.stringify(config, null, 2) + '\n');
    toast('config/ws-config.json 에 덮어써서 커밋하면 팀 공용이 됩니다.');
  }

  /* ---------- 출력 ---------- */

  function update() {
    lsSet(LS_SPEC, spec);
    saveConfig();
    result = G.generate(spec, config);
    renderWarnings();
    renderTabs();
    renderOutput();
    var dl = $('codeList');
    if (dl.children.length !== config.codes.length) {
      dl.innerHTML = '';
      config.codes.forEach(function (c) { dl.appendChild(h('option', { value: c.group, text: c.nm })); });
    }
  }

  function renderWarnings() {
    var w = $('warnBox');
    if (!result.warnings.length) { w.innerHTML = ''; return; }
    w.innerHTML = '<b>확인 필요 ' + result.warnings.length + '건</b><ul>' +
      result.warnings.map(function (x) { return '<li>' + escHtml(x) + '</li>'; }).join('') + '</ul>';
  }

  function renderTabs() {
    var tabs = $('outTabs');
    tabs.innerHTML = '';
    var list = [{ id: 'preview', l: '미리보기' }].concat(result.files.map(function (f, i) { return { id: 'f' + i, l: f.label }; }));
    if (!list.some(function (x) { return x.id === activeTab; })) activeTab = 'preview';
    list.forEach(function (t) {
      tabs.appendChild(h('button', { type: 'button', class: activeTab === t.id ? 'on' : null, text: t.l, onclick: function () {
        activeTab = t.id; renderTabs(); renderOutput();
      } }));
    });
  }

  function currentFile() {
    if (activeTab === 'preview') return null;
    return result.files[Number(activeTab.slice(1))];
  }

  function renderOutput() {
    var f = currentFile();
    $('previewPane').hidden = !!f;
    $('codePane').hidden = !f;
    if (f) {
      $('codeName').textContent = f.name;
      $('codeView').textContent = f.content;
    } else {
      renderPreview();
    }
  }

  function download(name, content) {
    var blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }

  /* ---------- 미리보기 (와이어프레임) ---------- */

  function compLabel(c) {
    switch (c.type) {
      case 'SYEAR': return String(new Date().getFullYear());
      case 'SELECT': case 'TERM': case 'YEAR': return (c.req ? '선택' : '전체') + ' ▾';
      case 'DATE': return 'YYYY-MM-DD 📅';
      case 'YM': return 'YYYY-MM 📅';
      default: return '';
    }
  }

  function wfSearch(cells, cols) {
    var html = '<div class="wf-search">';
    for (var i = 0; i < cells.length; i += cols) {
      html += '<div class="wf-row" style="grid-template-columns:repeat(' + cols + ',minmax(0,1fr))">';
      for (var j = 0; j < cols; j++) {
        var cell = cells[i + j];
        if (!cell) { html += '<div class="wf-cell wf-blank"></div>'; continue; }
        html += '<div class="wf-cell"><span class="t' + (cell.req ? ' req' : '') + '">' + escHtml(cell.label) + '</span>' +
          cell.boxes.map(function (b) { return '<span class="c">' + escHtml(b) + '</span>'; }).join('') + '</div>';
      }
      html += '</div>';
    }
    return html + '</div>';
  }

  function wfGrid(title, cols, opt) {
    var visible = cols.filter(function (c) { return !c.hidden; });
    var html = '<div class="wf-sec"><h4><span>' + escHtml(title) + '</span><em>(총 <b>0</b>건)</em>' + (opt.btns ? '<span class="wf-btns"><i>신규</i><i>삭제</i><i class="pri">저장</i></span>' : '<small>' + (opt.edit ? '편집 그리드' : '조회 전용') + '</small>') + '</h4><div class="wf-table"><table><thead><tr>';
    if (opt.rowNum) html += '<th>No</th>';
    if (opt.edit) html += '<th>상태</th>';
    visible.forEach(function (c) { html += '<th style="min-width:' + Math.min(c.width || 80, 220) * 0.6 + 'px">' + escHtml(c.nm || c.id) + '</th>'; });
    html += '</tr></thead><tbody>';
    for (var r = 0; r < 3; r++) {
      html += '<tr>';
      if (opt.rowNum) html += '<td class="no">' + (r + 1) + '</td>';
      if (opt.edit) html += '<td></td>';
      visible.forEach(function (c) {
        var ed = opt.edit && c.edit && c.edit !== 'none';
        html += '<td class="' + (ed ? 'ed' : '') + '" style="text-align:' + (c.align || 'center') + '">' + (c.edit === 'select' ? '▾' : c.edit === 'check' ? '☐' : '') + '</td>';
      });
      html += '</tr>';
    }
    if (!visible.length) html += '<tr><td class="empty">조회된 데이터가 없습니다.</td></tr>';
    return html + '</tbody></table></div></div>';
  }

  function renderPreview() {
    var s = G.normalize(spec, G.mergeConfig(config));
    var t = s.screenType;
    var d = s.design;
    var html = '<div class="wf">';
    var dEdit = s.dcols.some(function (c) { return c.edit !== 'none'; });
    var topEdit = t === 'edit' || t === 'grid-form';
    if (t === 'meta') {
      html += '<div class="wf-meta">공통 데이터 조회 화면(<b>commQueryView</b>)에서 아래처럼 보입니다. 화면 XML은 만들지 않고, <b>조회 SP</b>와 <b>메타 등록값</b>을 생성합니다.</div>';
    } else {
      html += '<div class="wf-page"><div class="wf-crumb">Home › 학사 › … </div><div class="wf-head"><h3>' + escHtml(s.info.screenNm || '화면명') + '</h3>' +
        '<div class="wf-top"><i>조회</i>' + (topEdit ? '<i class="xls">신규</i><i class="xls">삭제</i><i>저장</i>' : '') + (d.excel ? '<i class="xls">엑셀</i>' : '') + '</div></div></div>';
    }
    var cells = G.condCells(s).map(function (cell) {
      return { label: cell.label, req: cell.req, boxes: cell.conds.map(compLabel) };
    });
    var cols = t === 'meta' ? 4 : (Number(d.searchCols) || 4);
    if (cells.length) html += wfSearch(cells, cols);
    if (d.guide && d.guideText) {
      html += d.guideText.split('\n').filter(Boolean).map(function (l) { return '<div class="wf-guide">※ ' + escHtml(l) + '</div>'; }).join('');
    }
    var info = s.info;
    if (t === 'md-tb') {
      html += wfGrid(info.masterTitle || '마스터', s.cols, { rowNum: d.rowNum });
      html += wfGrid(info.detailTitle || '상세', s.dcols, { rowNum: d.rowNum, edit: dEdit, btns: dEdit });
    } else if (t === 'md-lr') {
      html += '<div class="wf-split">' + wfGrid(info.masterTitle || '마스터', s.cols, { rowNum: d.rowNum }) + '<div class="bar" title="드래그하여 영역확장"></div>' +
        wfGrid(info.detailTitle || '상세', s.dcols, { rowNum: d.rowNum, edit: dEdit, btns: dEdit }) + '</div>';
    } else if (t === 'grid-form') {
      html += wfGrid(info.masterTitle || '목록', s.cols, { rowNum: d.rowNum });
      var fcells = s.cols.filter(function (c) { return !c.hidden; }).map(function (c) {
        var box = c.edit === 'select' ? '선택 ▾' : c.edit === 'date' ? 'YYYY-MM-DD 📅' : c.edit === 'check' ? '☐' : c.edit === 'none' ? '(읽기)' : '';
        return { label: c.nm, req: c.req, boxes: [box] };
      });
      html += '<div class="wf-form">' + wfSearch(fcells, 2) + '</div>';
    } else {
      html += wfGrid(info.masterTitle || '조회 결과', s.cols, { rowNum: d.rowNum, edit: t === 'edit' });
    }
    html += '</div>';
    $('previewPane').innerHTML = html;
  }

  /* ---------- 상단 동작 ---------- */

  function loadSpec(o) {
    var base = G.emptySpec();
    spec = {
      screenType: o.screenType || base.screenType,
      design: Object.assign(base.design, o.design || {}),
      info: Object.assign(base.info, o.info || {}),
      conds: o.conds || [],
      cols: o.cols || [],
      dcols: o.dcols || []
    };
    activeTab = 'preview';
    renderAll();
  }

  function renderAll() {
    renderTypes();
    renderDesign();
    renderInfo();
    renderConds();
    renderCols();
    renderCodes();
    update();
  }

  function bindTop() {
    $('exampleSel').addEventListener('change', function (e) {
      var v = e.target.value;
      if (!v) return;
      fetch('specs/examples/' + v + '.json').then(function (r) { return r.json(); }).then(function (o) {
        loadSpec(o);
        toast('예제를 불러왔습니다.');
      }).catch(function () { toast('예제를 불러오지 못했습니다. (로컬 파일로 열면 fetch 가 막힙니다)'); });
      e.target.value = '';
    });
    $('specFile').addEventListener('change', function (e) {
      var file = e.target.files[0];
      if (!file) return;
      var rd = new FileReader();
      rd.onload = function () {
        try { loadSpec(JSON.parse(rd.result)); toast('명세를 불러왔습니다.'); } catch (err) { toast('JSON 형식이 아닙니다.'); }
      };
      rd.readAsText(file, 'utf-8');
      e.target.value = '';
    });
    $('resetBtn').addEventListener('click', function () {
      if (!confirm('입력한 내용을 지우고 새로 시작할까요?')) return;
      loadSpec(G.emptySpec());
    });
    $('settingsBtn').addEventListener('click', function () { renderSettings(); $('settingsDlg').showModal(); });
    $('cfgDownload').addEventListener('click', downloadConfig);
    $('cfgReset').addEventListener('click', function () {
      if (!confirm('이 브라우저의 설정·공통코드를 저장소 기본값으로 되돌릴까요?')) return;
      config = clone(repoConfig);
      saveConfig(); renderSettings(); renderAll();
    });
    $('copyBtn').addEventListener('click', function () {
      var f = currentFile();
      if (!f) return;
      navigator.clipboard.writeText(f.content).then(function () { toast('복사했습니다.'); }, function () { toast('복사에 실패했습니다.'); });
    });
    $('dlBtn').addEventListener('click', function () {
      var f = currentFile();
      if (f) download(f.name, f.content);
    });
    $('dlAllBtn').addEventListener('click', function () {
      result.files.forEach(function (f, i) { setTimeout(function () { download(f.name, f.content); }, i * 250); });
    });
  }

  /* ---------- 시작 ---------- */

  function start(cfgFromRepo) {
    if (cfgFromRepo) repoConfig = G.mergeConfig(cfgFromRepo);
    var saved = lsGet(LS_CFG);
    config = saved ? G.mergeConfig(saved) : clone(repoConfig);
    if (saved && !saved.codes) config.codes = clone(repoConfig.codes);
    bindTop();
    bindDesign();
    var s = lsGet(LS_SPEC);
    if (s) loadSpec(s); else loadSpec(G.emptySpec());
  }

  fetch('config/ws-config.json').then(function (r) { return r.ok ? r.json() : null; })
    .then(start, function () { start(null); });
})();
