/*
 * WebSquare 화면 생성기
 * 명세(spec) + 설정(config) → 화면 XML / 조회·저장 SP / 메타 등록값 / 에이전트 요청문
 * 브라우저(window.WSGen)와 Node(require) 양쪽에서 사용한다.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.WSGen = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var SCREEN_TYPES = [
    { id: 'search',    nm: '조회형',              desc: '검색조건 + 조회 전용 그리드' },
    { id: 'edit',      nm: '그리드 편집형',        desc: '조회 + 신규/삭제/저장 (그리드 직접 편집)' },
    { id: 'md-tb',     nm: '마스터-디테일 (상하)', desc: '마스터 선택 시 아래 상세 그리드 조회' },
    { id: 'md-lr',     nm: '마스터-디테일 (좌우)', desc: '왼쪽 마스터, 오른쪽 상세 그리드' },
    { id: 'grid-form', nm: '목록 + 상세 폼',       desc: '목록 선택 시 아래 입력 폼에서 편집' },
    { id: 'meta',      nm: '공통 데이터 조회 등록', desc: '메타 조회용 SP + 관리 화면 등록값 (화면 개발 없음)' }
  ];

  var COND_TYPES = ['TEXT', 'NUMBER', 'SELECT', 'DATE', 'YM', 'SYEAR', 'TERM', 'YEAR', 'SESSION'];
  var EDIT_TYPES = ['none', 'text', 'number', 'select', 'date', 'check'];
  var SESSION_KEYS = [
    'SESSION_USER_ID', 'SESSION_USER_IP', 'SESSION_SYSTEM_GCD', 'SESSION_MENU_CD',
    'SESSION_USER_DEPT_CD', 'SESSION_SEARCH_SCOPE_GCD', 'SESSION_AUTH_CD'
  ];

  var DEFAULT_CONFIG = {
    settings: {
      verified: false,
      bindUrl: '/core/function/bindProc',
      udcHeadTag: '',
      udcBodyTag: '<w2:udc_top_auth_btn id="udc_top_auth_btn" style=""></w2:udc_top_auth_btn>',
      udcInit: 'udc_top_auth_btn.init({\n    "_grid" : {GRID},\n    "callSpNm" : "{SEARCH_SP}",\n    "_excelDownUseYn" : "{EXCEL_YN}"\n});',
      codeLabelCol: 'COMMON_DETAIL_CD_KOR_NM',
      codeValueCol: 'COMMON_DETAIL_CD',
      alertFn: 'alert',
      termCode: '0001_TERM_GCD',
      defaultSystemGcd: '0001'
    },
    dbs: ['SYS', 'LECTURE', 'HAKJUKLOG', 'GRADE'],
    codes: [
      { group: '0001_TERM_GCD', nm: '학기', etc: '', note: '0012 = 1학기 계열 마지막, 0022 = 2학기 계열 마지막' },
      { group: '0000_DB_SYSTEM_GCD', nm: 'DB 시스템구분', etc: '', note: '0001 SESDB, 0002 ORGDB' }
    ]
  };

  function emptySpec() {
    return {
      screenType: 'search',
      design: { searchCols: 4, guide: false, guideText: '', excel: true, rowNum: true, buttons: { search: true, new: false, del: false, save: false } },
      info: {
        screenId: '', screenNm: '', author: '', systemGcd: '', db: 'LECTURE', table: '',
        spSearch: '', spSave: '', spDetail: '', spDetailSave: '', detailTable: '', mdKey: '',
        masterTitle: '조회 결과', detailTitle: '상세'
      },
      conds: [],
      cols: [],
      dcols: []
    };
  }

  /* ---------- 공통 유틸 ---------- */

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function jsStr(s) {
    return '"' + String(s == null ? '' : s).replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
  }
  function sqlStr(s) {
    return "N'" + String(s == null ? '' : s).replace(/'/g, "''") + "'";
  }
  function pad(s, n) {
    s = String(s);
    while (s.length < n) s += ' ';
    return s;
  }
  function two(n) { return n < 10 ? '0' + n : String(n); }
  function indent(text, n) {
    var p = new Array(n + 1).join(' ');
    return text.split('\n').map(function (l) { return l ? p + l : l; }).join('\n');
  }
  function isSession(c) { return c.type === 'SESSION' || /^SESSION_/.test(c.id || ''); }
  function hasEdit(cols) { return cols.some(function (c) { return c.edit && c.edit !== 'none'; }); }

  function mergeConfig(cfg) {
    cfg = cfg || {};
    var s = {}, k;
    for (k in DEFAULT_CONFIG.settings) s[k] = DEFAULT_CONFIG.settings[k];
    if (cfg.settings) for (k in cfg.settings) s[k] = cfg.settings[k];
    return { settings: s, dbs: cfg.dbs || DEFAULT_CONFIG.dbs, codes: cfg.codes || DEFAULT_CONFIG.codes };
  }

  function normalize(spec, cfg) {
    var e = emptySpec(), k;
    spec = spec || {};
    var out = { screenType: spec.screenType || e.screenType, design: {}, info: {}, conds: [], cols: [], dcols: [] };
    for (k in e.design) out.design[k] = spec.design && spec.design[k] !== undefined ? spec.design[k] : e.design[k];
    out.design.buttons = {};
    for (k in e.design.buttons) out.design.buttons[k] = spec.design && spec.design.buttons && spec.design.buttons[k] !== undefined ? spec.design.buttons[k] : e.design.buttons[k];
    for (k in e.info) out.info[k] = spec.info && spec.info[k] !== undefined ? spec.info[k] : e.info[k];
    if (!out.info.systemGcd) out.info.systemGcd = cfg.settings.defaultSystemGcd;
    out.conds = (spec.conds || []).filter(function (c) { return c && c.id; }).map(function (c) {
      var t = /^SESSION_/.test(c.id) ? 'SESSION' : (c.type || 'TEXT');
      var code = c.code || '';
      if (t === 'TERM' && !code) code = cfg.settings.termCode;
      return { id: c.id, nm: c.nm || c.id, type: t, code: fixCode(code, out.info.systemGcd), req: !!c.req, dflt: c.dflt || '' };
    });
    function mapCol(c) {
      return {
        id: c.id, nm: c.nm || c.id, width: Number(c.width) || autoWidth(c.nm || c.id), align: c.align || 'center',
        edit: c.edit || 'none', code: fixCode(c.code || '', out.info.systemGcd), req: !!c.req,
        maxbyte: Number(c.maxbyte) || 0, key: !!c.key, sqlType: c.sqlType || '', hidden: !!c.hidden
      };
    }
    out.cols = (spec.cols || []).filter(function (c) { return c && c.id; }).map(mapCol);
    out.dcols = (spec.dcols || []).filter(function (c) { return c && c.id; }).map(mapCol);
    if (out.screenType === 'search' || out.screenType === 'meta') out.cols.forEach(function (c) { c.edit = 'none'; });
    if (out.screenType === 'md-tb' || out.screenType === 'md-lr') out.cols.forEach(function (c) { c.edit = 'none'; });
    return out;
  }

  /* 공통코드 그룹은 시스템구분 포함 형식으로 보정 */
  function fixCode(code, systemGcd) {
    if (!code) return '';
    if (/^\d{4}_/.test(code)) return code;
    return (systemGcd || '0001') + '_' + code;
  }
  function autoWidth(nm) {
    var len = String(nm || '').length;
    return Math.max(70, Math.min(260, len * 14 + 30));
  }
  function codeInfo(cfg, group) {
    for (var i = 0; i < cfg.codes.length; i++) if (cfg.codes[i].group === group) return cfg.codes[i];
    return null;
  }
  function codeDlt(cfg, group) {
    var ci = codeInfo(cfg, group);
    return 'dlt_' + group + (ci && ci.etc ? '_f' : '');
  }

  /* ---------- 검증 ---------- */

  function validate(spec, cfg) {
    var w = [];
    var t = spec.screenType;
    var info = spec.info;
    if (!cfg.settings.verified && t !== 'meta') {
      w.push('설정의 사내 템플릿(상단버튼 UDC 태그·init, 공통코드 컬럼명)이 기본값입니다. 기존 업무 화면에서 확인한 값으로 바꾸세요.');
    }
    if (!info.screenId) w.push('화면 ID가 비어 있습니다.');
    if (!info.spSearch) w.push('조회 SP 이름이 비어 있습니다.');
    if (!spec.cols.length) w.push('결과 컬럼이 없습니다.');
    var ids = {};
    spec.conds.forEach(function (c, i) {
      if (ids[c.id]) w.push('조회조건 ID 중복: ' + c.id);
      ids[c.id] = 1;
      if ((c.type === 'SELECT' || c.type === 'TERM') && !c.code) w.push('조회조건 ' + c.id + ': 공통코드 그룹이 없습니다.');
      if (c.code && !codeInfo(cfg, c.code)) w.push('공통코드 ' + c.code + ' 가 공통코드 목록에 없습니다. (오타 확인 또는 목록에 등록)');
      if (c.type === 'SESSION' && SESSION_KEYS.indexOf(c.id) < 0) w.push('세션 파라미터 ' + c.id + ' 는 확인된 세션 키가 아닙니다.');
    });
    function chkCols(cols, label) {
      var seen = {};
      cols.forEach(function (c) {
        if (seen[c.id]) w.push(label + ' 컬럼 ID 중복: ' + c.id);
        seen[c.id] = 1;
        if (c.edit === 'select' && !c.code) w.push(label + ' 컬럼 ' + c.id + ': 콤보 편집인데 공통코드 그룹이 없습니다.');
        if (c.code && !codeInfo(cfg, c.code)) w.push('공통코드 ' + c.code + ' 가 공통코드 목록에 없습니다.');
        if (t === 'meta' && /\./.test(c.nm)) w.push('결과 별칭에 마침표가 있으면 bindProc 응답이 중첩 객체로 깨집니다: ' + c.nm);
      });
    }
    chkCols(spec.cols, t === 'md-tb' || t === 'md-lr' ? '마스터' : '결과');
    if (t === 'md-tb' || t === 'md-lr') {
      chkCols(spec.dcols, '상세');
      if (!spec.dcols.length) w.push('상세 컬럼이 없습니다.');
      if (!info.mdKey) w.push('마스터-상세 연결 키 컬럼이 비어 있습니다.');
      if (!info.spDetail) w.push('상세 조회 SP 이름이 비어 있습니다.');
      if (hasEdit(spec.dcols) && !info.spDetailSave) w.push('상세 그리드에 편집 컬럼이 있는데 상세 저장 SP 이름이 비어 있습니다.');
    }
    if ((t === 'edit' || t === 'grid-form')) {
      if (!info.spSave) w.push('저장 SP 이름이 비어 있습니다.');
      if (!spec.cols.some(function (c) { return c.key; })) w.push('저장 대상 키 컬럼(key)이 지정되지 않았습니다.');
    }
    if (t === 'edit' || t === 'grid-form' || (( t === 'md-tb' || t === 'md-lr') && hasEdit(spec.dcols))) {
      w.push('저장 SP의 감사 컬럼(INSERT_ID/IP/DT, UPDATE_ID/IP/DT)과 JSON_DATA 전달 방식은 사내 표준 저장 패턴과 대조해 맞추세요.');
    }
    if (t !== 'meta' && !info.table) w.push('대상 테이블이 비어 있어 SP에 [dbo].[테이블명] 으로 들어갑니다.');
    if (t === 'meta' && spec.cols.length > 40) w.push('공통 데이터 조회 결과 컬럼은 C01~C40 슬롯까지만 표시됩니다.');
    return w;
  }

  /* ---------- 화면 XML ---------- */

  function condCells(spec) {
    var cells = [];
    var conds = spec.conds.filter(function (c) { return !isSession(c); });
    for (var i = 0; i < conds.length; i++) {
      var c = conds[i];
      var next = conds[i + 1];
      if (c.type === 'SYEAR' && next && next.type === 'TERM') {
        cells.push({ label: c.nm + '/' + next.nm, req: c.req || next.req, conds: [c, next] });
        i++;
      } else {
        cells.push({ label: c.nm, req: c.req, conds: [c] });
      }
    }
    return cells;
  }

  function compId(c) {
    switch (c.type) {
      case 'SELECT': case 'TERM': case 'YEAR': return 'sbx_' + c.id;
      case 'DATE': case 'YM': return 'ica_' + c.id;
      case 'SYEAR': return 'spn_' + c.id;
      default: return 'ibx_' + c.id;
    }
  }

  function condComp(c, half) {
    var id = compId(c);
    var ref = 'data:dma_search.' + c.id;
    var st = half ? ' style="width:50%;"' : ' style=""';
    switch (c.type) {
      case 'NUMBER':
        return '<xf:input id="' + id + '" class="form-control" ref="' + ref + '" dataType="number" allowChar="0-9"' + st + '></xf:input>';
      case 'SELECT': case 'TERM': case 'YEAR':
        return '<xf:select1 id="' + id + '" class="form-control" ref="' + ref + '" appearance="minimal" chooseOption="true" chooseOptionLabel="' + (c.req ? '선택' : '전체') + '" displayMode="label" direction="auto" submenuSize="auto"' + st + '>\n' +
          '    <xf:choices></xf:choices>\n' +
          '</xf:select1>';
      case 'DATE':
        return '<w2:inputCalendar id="' + id + '" class="form-control" ref="' + ref + '" calendarValueType="yearMonthDate" footerDiv="false" focusOnDateSelect="false" renderDiv="true"' + st + '></w2:inputCalendar>';
      case 'YM':
        return '<w2:inputCalendar id="' + id + '" class="form-control" ref="' + ref + '" calendarValueType="yearMonth" footerDiv="false" focusOnDateSelect="false" renderDiv="true"' + st + '></w2:inputCalendar>';
      case 'SYEAR':
        return '<w2:spinner id="' + id + '" ref="' + ref + '" skin="type1" buttonSize="30" min="1996" max="2100"' + st + '></w2:spinner>';
      default:
        return '<xf:input id="' + id + '" class="form-control" ref="' + ref + '"' + st + '></xf:input>';
    }
  }

  function tableBox(cells, cols) {
    var rows = [];
    for (var i = 0; i < cells.length; i += cols) rows.push(cells.slice(i, i + cols));
    var out = [];
    out.push('<xf:group class="b-table-box flex-col-' + cols + '">');
    rows.forEach(function (row) {
      out.push('    <xf:group class="b-row-box">');
      var used = 0;
      row.forEach(function (cell) {
        var merge = cell.merge && cols > 2 ? ' merge-2' : '';
        used += merge ? 2 : 1;
        out.push('        <xf:group class="b-row-item' + merge + '">');
        out.push('            <xf:group class="b-title-box">');
        out.push('                <w2:textbox' + (cell.req ? ' class="req"' : '') + ' label="' + esc(cell.label) + '" tagname="label"></w2:textbox>');
        out.push('            </xf:group>');
        out.push('            <xf:group class="b-con-box">');
        cell.comps.forEach(function (x) { out.push(indent(x, 16)); });
        out.push('            </xf:group>');
        out.push('        </xf:group>');
      });
      for (; used < cols; used++) out.push('        <xf:group class="b-row-item b-blank"></xf:group>');
      out.push('    </xf:group>');
    });
    out.push('</xf:group>');
    return out.join('\n');
  }

  function searchBox(spec) {
    var cells = condCells(spec).map(function (cell) {
      return {
        label: cell.label, req: cell.req,
        comps: cell.conds.map(function (c) { return condComp(c, cell.conds.length > 1); })
      };
    });
    if (!cells.length) return '';
    return '<xf:group class="search-box">\n' + indent(tableBox(cells, Number(spec.design.searchCols) || 4), 4) + '\n</xf:group>';
  }

  function formComp(c) {
    var id = 'frm_' + c.id;
    var ref = 'data:dlt_01.' + c.id;
    var ro = c.edit === 'none' ? ' readOnly="true"' : '';
    switch (c.edit) {
      case 'number':
        return '<xf:input id="' + id + '" class="form-control" ref="' + ref + '" dataType="number" allowChar="0-9"' + (c.maxbyte ? ' maxByteLength="' + c.maxbyte + '"' : '') + ' style=""></xf:input>';
      case 'select':
        return '<xf:select1 id="' + id + '" class="form-control" ref="' + ref + '" appearance="minimal" chooseOption="true" chooseOptionLabel="선택" displayMode="label" direction="auto" submenuSize="auto" style="">\n' +
          '    <xf:choices></xf:choices>\n' +
          '</xf:select1>';
      case 'date':
        return '<w2:inputCalendar id="' + id + '" class="form-control" ref="' + ref + '" calendarValueType="yearMonthDate" footerDiv="false" focusOnDateSelect="false" renderDiv="true" style=""></w2:inputCalendar>';
      case 'check':
        return '<xf:select id="' + id + '" ref="' + ref + '" appearance="full" cols="" rows="" selectedindex="-1" style="">\n' +
          '    <xf:choices>\n' +
          '        <xf:item>\n' +
          '            <xf:label><![CDATA[]]></xf:label>\n' +
          '            <xf:value><![CDATA[Y]]></xf:value>\n' +
          '        </xf:item>\n' +
          '    </xf:choices>\n' +
          '</xf:select>';
      default:
        return '<xf:input id="' + id + '" class="form-control" ref="' + ref + '"' + ro + (c.maxbyte ? ' maxByteLength="' + c.maxbyte + '"' : '') + ' style=""></xf:input>';
    }
  }

  function formBox(spec) {
    var cells = spec.cols.filter(function (c) { return !c.hidden; }).map(function (c) {
      return { label: c.nm, req: c.req, comps: [formComp(c)] };
    });
    return tableBox(cells, Number(spec.design.searchCols) || 4);
  }

  function gridXml(gid, dlt, cols, opt) {
    var edit = hasEdit(cols);
    var out = [];
    out.push('<w2:gridView id="' + gid + '" dataList="data:' + dlt + '" class="full-height" style="" autoFit="none" scrollByColumn="false"' +
      ' rowNumVisible="' + (opt.rowNum ? 'true' : 'false') + '" rowStatusVisible="' + (edit ? 'true' : 'false') + '" groupbyZone="false"' +
      ' readOnly="' + (edit ? 'false' : 'true') + '" focusMode="' + (edit ? 'cell' : 'row') + '" fixedColumnWithHidden="true">');
    out.push('    <w2:header id="' + gid + '_header" style="">');
    out.push('        <w2:row id="' + gid + '_hrow" style="">');
    cols.forEach(function (c) {
      out.push('            <w2:column id="h_' + c.id + '" value="' + esc(c.nm) + '" width="' + c.width + '" inputType="text" displayMode="label" blockSelect="false"' + (c.hidden ? ' hidden="true"' : '') + '></w2:column>');
    });
    out.push('        </w2:row>');
    out.push('    </w2:header>');
    out.push('    <w2:gBody id="' + gid + '_body" style="">');
    out.push('        <w2:row id="' + gid + '_brow" style="">');
    cols.forEach(function (c) {
      var a = ' width="' + c.width + '" textAlign="' + c.align + '" displayMode="label" blockSelect="false"' + (c.hidden ? ' hidden="true"' : '');
      var ro = c.edit === 'none' ? ' readOnly="true"' : '';
      var mb = c.maxbyte && (c.edit === 'text' || c.edit === 'number') ? ' maxByteLength="' + c.maxbyte + '"' : '';
      switch (c.edit) {
        case 'number':
          out.push('            <w2:column id="' + c.id + '" inputType="text" dataType="number" displayFormat="#,##0" allowChar="0-9"' + a + mb + '></w2:column>');
          break;
        case 'select':
          out.push('            <w2:column id="' + c.id + '" inputType="select"' + a + '>');
          out.push('                <w2:choices></w2:choices>');
          out.push('            </w2:column>');
          break;
        case 'date':
          out.push('            <w2:column id="' + c.id + '" inputType="calendar" calendarValueType="yearMonthDate"' + a + '></w2:column>');
          break;
        case 'check':
          out.push('            <w2:column id="' + c.id + '" inputType="checkbox" trueValue="Y" falseValue="N"' + a + '></w2:column>');
          break;
        default:
          out.push('            <w2:column id="' + c.id + '" inputType="text"' + a + ro + mb + '></w2:column>');
      }
    });
    out.push('        </w2:row>');
    out.push('    </w2:gBody>');
    out.push('</w2:gridView>');
    return out.join('\n');
  }

  /* sec sec-2 : 실제 화면 DOM 기준 (sec-header > header-gr > title-box, sec-body > gr) */
  function section(title, body, style) {
    return '<xf:group class="sec sec-2"' + (style ? ' style="' + style + '"' : '') + '>\n' +
      '    <xf:group class="sec-header">\n' +
      '        <xf:group class="header-gr">\n' +
      '            <xf:group class="title-box">\n' +
      '                <w2:textbox class="sec-title" label="' + esc(title) + '" tagname="h3"></w2:textbox>\n' +
      '            </xf:group>\n' +
      '        </xf:group>\n' +
      '        <xf:group class="btn-box"></xf:group>\n' +
      '    </xf:group>\n' +
      '    <xf:group class="sec-body">\n' +
      '        <xf:group class="gr">\n' +
      indent(body, 12) + '\n' +
      '        </xf:group>\n' +
      '    </xf:group>\n' +
      '</xf:group>';
  }

  function dataCollection(spec) {
    var out = [];
    var t = spec.screenType;
    out.push('<w2:dataCollection baseNode="map">');
    var scr = spec.conds.filter(function (c) { return !isSession(c); });
    out.push('    <w2:dataMap baseNode="map" id="dma_search">');
    out.push('        <w2:keyInfo>');
    scr.forEach(function (c) {
      out.push('            <w2:key id="' + c.id + '" name="' + esc(c.nm) + '" dataType="text"></w2:key>');
    });
    out.push('        </w2:keyInfo>');
    out.push('    </w2:dataMap>');
    function dl(id, cols) {
      out.push('    <w2:dataList baseNode="list" repeatNode="map" id="' + id + '" saveRemovedData="true">');
      out.push('        <w2:columnInfo>');
      cols.forEach(function (c) {
        out.push('            <w2:column id="' + c.id + '" name="' + esc(c.nm) + '" dataType="' + (c.edit === 'number' ? 'number' : 'text') + '"></w2:column>');
      });
      out.push('        </w2:columnInfo>');
      out.push('    </w2:dataList>');
    }
    dl('dlt_01', spec.cols);
    if (t === 'md-tb' || t === 'md-lr') dl('dlt_02', spec.dcols);
    if (spec.conds.some(function (c) { return c.type === 'YEAR'; })) {
      out.push('    <w2:dataList baseNode="list" repeatNode="map" id="dlt_YEAR_LIST" saveRemovedData="true">');
      out.push('        <w2:columnInfo>');
      out.push('            <w2:column id="CD" name="코드" dataType="text"></w2:column>');
      out.push('            <w2:column id="NM" name="명칭" dataType="text"></w2:column>');
      out.push('        </w2:columnInfo>');
      out.push('    </w2:dataList>');
    }
    out.push('</w2:dataCollection>');
    return out.join('\n');
  }

  /* ---------- 화면 스크립트 (ES5) ---------- */

  function fn(name, desc, body) {
    return '/**** ' + name + ' : ' + desc + ' ****/\n' +
      'scwin.' + name + ' = function(' + (fn.args[name] || '') + ') {\n' + (body ? indent(body, 4) + '\n' : '') + '};';
  }
  fn.args = { fn_saveCallback: 'bool', fn_detailSaveCallback: 'bool' };

  function ajax(o, s) {
    var lines = [];
    lines.push('common.ajax_request({');
    lines.push('    data   : ' + o.data + ',');
    if (o.target) lines.push('    target : ' + o.target + ',');
    lines.push("    url    : '" + s.bindUrl + "',");
    lines.push('    bind   : { db : ' + jsStr(o.db) + ', proc : ' + jsStr(o.proc) + ', params : [' + o.params.map(jsStr).join(', ') + '] },');
    lines.push('    success: function(data, responseData) {' + (o.success ? '\n' + indent(o.success, 8) + '\n    ' : ' ') + '}');
    lines.push('});');
    return lines.join('\n');
  }

  function buildScript(spec, cfg) {
    var s = cfg.settings;
    var t = spec.screenType;
    var info = spec.info;
    var isMd = t === 'md-tb' || t === 'md-lr';
    var editMaster = t === 'edit' || t === 'grid-form';
    var editDetail = isMd && hasEdit(spec.dcols);
    var A = s.alertFn || 'alert';
    var parts = [];

    /* 공통코드 수집 */
    var codes = [];
    function addCode(g) { if (g && codes.indexOf(g) < 0) codes.push(g); }
    spec.conds.forEach(function (c) { if (c.type === 'SELECT' || c.type === 'TERM') addCode(c.code); });
    spec.cols.forEach(function (c) { if (c.edit === 'select' || (c.code && t === 'grid-form')) addCode(c.code); });
    spec.dcols.forEach(function (c) { if (c.edit === 'select') addCode(c.code); });

    var lv = jsStr(s.codeLabelCol) + ', ' + jsStr(s.codeValueCol);

    /* onpageload */
    var load = [];
    var gridMain = isMd && editDetail ? 'grd_02' : 'grd_01';
    load.push(s.udcInit
      .replace(/\{GRID\}/g, gridMain)
      .replace(/\{SEARCH_SP\}/g, isMd && editDetail ? info.spDetail : info.spSearch)
      .replace(/\{EXCEL_YN\}/g, spec.design.excel ? 'Y' : 'N'));
    if (codes.length) load.push('scwin.fn_initCode();');
    load.push('scwin.fn_initCond();');
    if (t === 'search') load.push('common.conditionChgReset(dma_search, [dlt_01], null, []);');
    if (isMd && !editDetail) load.push('common.conditionChgReset(dma_search, [dlt_01, dlt_02], null, []);');
    if (isMd) load.push('common.masterDetail(grd_01, dlt_01, grd_02, ' + jsStr(info.mdKey.split(',')[0].trim()) + ', scwin.fn_searchDetail);');
    parts.push('/**** onpageload : 화면 초기화 ****/\nscwin.onpageload = function() {\n' + indent(load.join('\n'), 4) + '\n};');

    /* 공통코드 */
    if (codes.length) {
      var b = [];
      codes.forEach(function (g) {
        var ci = codeInfo(cfg, g);
        if (ci && ci.etc) b.push('common.getCodeByEtcParam(' + jsStr(g) + ', ' + jsStr(ci.etc) + ');');
        else b.push('common.getCode(' + jsStr(g) + ');');
      });
      spec.conds.forEach(function (c) {
        if (c.type === 'SELECT' || c.type === 'TERM') b.push(compId(c) + '.setNodeSet(' + jsStr('data:' + codeDlt(cfg, c.code)) + ', ' + lv + ');');
      });
      spec.cols.forEach(function (c) {
        if (t === 'grid-form' && c.edit === 'select') b.push('frm_' + c.id + '.setNodeSet(' + jsStr('data:' + codeDlt(cfg, c.code)) + ', ' + lv + ');');
        if (t !== 'grid-form' && c.edit === 'select') b.push('grd_01.setColumnNodeSet(' + jsStr(c.id) + ', ' + jsStr('data:' + codeDlt(cfg, c.code)) + ', ' + lv + ');');
        if (t === 'grid-form' && c.code) b.push('grd_01.setColumnNodeSet(' + jsStr(c.id) + ', ' + jsStr('data:' + codeDlt(cfg, c.code)) + ', ' + lv + ');');
      });
      spec.dcols.forEach(function (c) {
        if (c.edit === 'select') b.push('grd_02.setColumnNodeSet(' + jsStr(c.id) + ', ' + jsStr('data:' + codeDlt(cfg, c.code)) + ', ' + lv + ');');
      });
      parts.push(fn('fn_initCode', '공통코드 설정', b.join('\n')));
    }

    /* 조회조건 기본값 */
    var ib = [];
    var sy = spec.conds.filter(function (c) { return c.type === 'SYEAR'; })[0];
    var tm = spec.conds.filter(function (c) { return c.type === 'TERM'; })[0];
    if (sy || tm) {
      ib.push('common.getSyearTermGcd(scwin.frameMenuData.SYSTEM_GCD, scwin.frameMenuData.MENU_CD, ' +
        (sy ? compId(sy) : 'null') + ', ' + (tm ? compId(tm) : 'null') + ');');
    }
    var yr = spec.conds.filter(function (c) { return c.type === 'YEAR'; });
    if (yr.length) {
      ib.push('var year = new Date().getFullYear();');
      ib.push('var list = [];');
      ib.push('for (var i = 0; i < 10; i++) {');
      ib.push('    list.push({ CD : String(year - i), NM : String(year - i) });');
      ib.push('}');
      ib.push('dlt_YEAR_LIST.setJSON(list);');
      yr.forEach(function (c) {
        ib.push(compId(c) + '.setNodeSet("data:dlt_YEAR_LIST", "NM", "CD");');
        ib.push('dma_search.set(' + jsStr(c.id) + ', String(year));');
      });
    }
    spec.conds.forEach(function (c) {
      if (c.dflt && !isSession(c)) ib.push('dma_search.set(' + jsStr(c.id) + ', ' + jsStr(c.dflt) + ');');
    });
    parts.push(fn('fn_initCond', '조회조건 기본값', ib.join('\n')));

    /* 조회조건 필수 검사 */
    var reqs = spec.conds.filter(function (c) { return c.req && !isSession(c); });
    if (reqs.length) {
      var vb = [];
      reqs.forEach(function (c) {
        vb.push('if (dma_search.get(' + jsStr(c.id) + ') === "") {');
        vb.push('    ' + A + '(' + jsStr(c.nm + '을(를) 입력하세요.') + ');');
        vb.push('    ' + compId(c) + '.focus();');
        vb.push('    return false;');
        vb.push('}');
      });
      vb.push('return true;');
      parts.push(fn('fn_validateSearch', '조회조건 필수 검사', vb.join('\n')));
    }

    /* 조회 */
    var params = spec.conds.map(function (c) { return c.id; });
    var succ = [];
    if (isMd) {
      succ.push('dlt_02.removeAll();');
      succ.push('if (dlt_01.getRowCount() > 0) {');
      succ.push('    grd_01.setFocusedCell(0, 0, false);');
      succ.push('    scwin.fn_searchDetail();');
      succ.push('}');
    } else if (t === 'grid-form') {
      succ.push('if (dlt_01.getRowCount() > 0) {');
      succ.push('    grd_01.setFocusedCell(0, 0, false);');
      succ.push('}');
    }
    var sb = [];
    if (reqs.length) sb.push('if (!scwin.fn_validateSearch()) return;');
    sb.push(ajax({ data: 'dma_search.getJSON()', target: 'dlt_01', db: info.db, proc: info.spSearch, params: params, success: succ.join('\n') }, s));
    parts.push(fn('fn_commSearch', '조회', sb.join('\n')));

    if (isMd) {
      var keys = info.mdKey.split(',').map(function (k) { return k.trim(); }).filter(Boolean);
      var dparams = keys.slice();
      spec.conds.forEach(function (c) { if (isSession(c)) dparams.push(c.id); });
      var db2 = [];
      db2.push('var row = dlt_01.getRowPosition();');
      db2.push('if (row < 0) {');
      db2.push('    dlt_02.removeAll();');
      db2.push('    return;');
      db2.push('}');
      db2.push(ajax({
        data: '{ ' + keys.map(function (k) { return k + ' : dlt_01.getCellData(row, ' + jsStr(k) + ')'; }).join(', ') + ' }',
        target: 'dlt_02', db: info.db, proc: info.spDetail, params: dparams
      }, s));
      parts.push(fn('fn_searchDetail', '상세 조회', db2.join('\n')));
    }

    /* 신규/삭제/저장 */
    var editGrid = editMaster ? 'grd_01' : (editDetail ? 'grd_02' : '');
    var editDlt = editMaster ? 'dlt_01' : (editDetail ? 'dlt_02' : '');
    var editCols = editMaster ? spec.cols : (editDetail ? spec.dcols : []);
    if (editGrid) {
      var first = editCols.filter(function (c) { return c.edit !== 'none' && !c.hidden; })[0];
      var nb = [];
      if (editDetail) {
        nb.push('var mrow = dlt_01.getRowPosition();');
        nb.push('if (mrow < 0) {');
        nb.push('    ' + A + '("마스터를 먼저 선택하세요.");');
        nb.push('    return;');
        nb.push('}');
      }
      nb.push('var idx = ' + editDlt + '.insertRow();');
      if (editDetail) {
        info.mdKey.split(',').map(function (k) { return k.trim(); }).filter(Boolean).forEach(function (k) {
          nb.push(editDlt + '.setCellData(idx, ' + jsStr(k) + ', dlt_01.getCellData(mrow, ' + jsStr(k) + '));');
        });
      }
      nb.push(editGrid + '.setFocusedCell(idx, ' + jsStr(first ? first.id : editCols[0] ? editCols[0].id : '') + ', ' + (t === 'grid-form' ? 'false' : 'true') + ');');
      parts.push(fn('fn_commNew', '신규', nb.join('\n')));

      var delb = [];
      delb.push('var idx = ' + editGrid + '.getFocusedRowIndex();');
      delb.push('if (idx < 0) {');
      delb.push('    ' + A + '("삭제할 행을 선택하세요.");');
      delb.push('    return;');
      delb.push('}');
      delb.push('if (' + editDlt + '.getRowStatus(idx) === "C") {');
      delb.push('    ' + editDlt + '.removeRow(idx);');
      delb.push('} else {');
      delb.push('    ' + editDlt + '.deleteRow(idx);');
      delb.push('}');
      parts.push(fn('fn_commDelete', '삭제', delb.join('\n')));

      var checkInfo = editCols.filter(function (c) { return c.req || c.maxbyte; }).map(function (c) {
        var o = '{ id : ' + jsStr(c.id);
        if (c.req) o += ', mandatory : true';
        if (c.maxbyte) o += ', maxbyte : ' + c.maxbyte;
        return o + ' }';
      });
      var svb = [];
      if (checkInfo.length) {
        svb.push('var checkInfo = [');
        svb.push(checkInfo.map(function (x) { return '    ' + x; }).join(',\n'));
        svb.push('];');
        svb.push('if (!common.validateGridView(' + editGrid + ', checkInfo)) return;');
      }
      svb.push('if (' + editDlt + '.getModifiedIndex().length === 0) {');
      svb.push('    ' + A + '("변경된 내용이 없습니다.");');
      svb.push('    return;');
      svb.push('}');
      svb.push('common.confirm("저장하시겠습니까?", "fn_saveCallback");');
      parts.push(fn('fn_commSave', '저장', svb.join('\n')));

      var cb = [];
      cb.push('if (!bool) return;');
      cb.push('var idxs = ' + editDlt + '.getModifiedIndex();');
      cb.push('var rows = [];');
      cb.push('for (var i = 0; i < idxs.length; i++) {');
      cb.push('    var row = ' + editDlt + '.getRowJSON(idxs[i]);');
      cb.push('    row.ROW_STATUS = ' + editDlt + '.getRowStatus(idxs[i]);');
      cb.push('    rows.push(row);');
      cb.push('}');
      cb.push(ajax({
        data: '{ JSON_DATA : JSON.stringify(rows) }',
        db: info.db, proc: editMaster ? info.spSave : info.spDetailSave,
        params: ['JSON_DATA', 'SESSION_USER_ID', 'SESSION_USER_IP'],
        success: A + '(data.O_CNT + "건 저장되었습니다.");\n' + (editMaster ? 'scwin.fn_commSearch();' : 'scwin.fn_searchDetail();')
      }, s));
      parts.push(fn('fn_saveCallback', '저장 실행', cb.join('\n')));
    } else {
      parts.push(fn('fn_commNew', '신규', ''));
      parts.push(fn('fn_commDelete', '삭제', ''));
      parts.push(fn('fn_commSave', '저장', ''));
    }

    return parts.join('\n\n');
  }

  function buildXml(spec, cfg) {
    var s = cfg.settings;
    var t = spec.screenType;
    var info = spec.info;
    var body = [];
    var sbx = searchBox(spec);
    if (sbx) body.push(sbx);
    if (spec.design.guide && spec.design.guideText) {
      body.push('<xf:group class="label-box" style="margin-top:8px;">\n' +
        '    <w2:textbox class="info-txt02 mb-0" style="white-space:pre-line;" label="' +
        esc(spec.design.guideText.replace(/\r/g, '')).replace(/\n/g, '&#10;') + '" tagname="p"></w2:textbox>\n' +
        '</xf:group>');
    }
    var g1 = gridXml('grd_01', 'dlt_01', spec.cols, spec.design);
    if (t === 'md-tb') {
      body.push(section(info.masterTitle || '마스터', g1));
      body.push(section(info.detailTitle || '상세', gridXml('grd_02', 'dlt_02', spec.dcols, spec.design)));
    } else if (t === 'md-lr') {
      body.push('<xf:group class="resizer-wrap">\n' +
        '    <xf:group class="resizer-left" style="width:50%;">\n' +
        indent(section(info.masterTitle || '마스터', g1, 'width:100%;'), 8) + '\n' +
        '    </xf:group>\n' +
        '    <xf:group class="resizer-right">\n' +
        indent(section(info.detailTitle || '상세', gridXml('grd_02', 'dlt_02', spec.dcols, spec.design), 'width:100%;'), 8) + '\n' +
        '    </xf:group>\n' +
        '</xf:group>');
    } else if (t === 'grid-form') {
      var gridOnly = spec.cols.map(function (c) { var o = {}, k; for (k in c) o[k] = c[k]; o.edit = 'none'; return o; });
      body.push(section(info.masterTitle || '목록', gridXml('grd_01', 'dlt_01', gridOnly, spec.design)));
      body.push(section(info.detailTitle || '상세 정보', formBox(spec)));
    } else {
      body.push(section(info.masterTitle || '조회 결과', g1));
    }
    var page = '<xf:group class="content">\n' +
      '    <xf:group class="sec sec-1">\n' +
      '        <xf:group class="sec-header for-main">\n' +
      indent(s.udcBodyTag, 12) + '\n' +
      '        </xf:group>\n' +
      '        <xf:group class="sec-body">\n' +
      indent(body.join('\n'), 12) + '\n' +
      '        </xf:group>\n' +
      '    </xf:group>\n' +
      '</xf:group>';

    var x = [];
    x.push('<?xml version="1.0" encoding="UTF-8"?>');
    x.push('<html xmlns="http://www.w3.org/1999/xhtml" xmlns:ev="http://www.w3.org/2001/xml-events" xmlns:w2="http://www.inswave.com/websquare" xmlns:xf="http://www.w3.org/2002/xforms">');
    x.push('<head>');
    x.push('    <w2:type>DEFAULT</w2:type>');
    x.push('    <w2:buildDate/>');
    if (s.udcHeadTag) x.push(indent(s.udcHeadTag, 4));
    x.push('    <xf:model>');
    x.push(indent(dataCollection(spec), 8));
    x.push('        <w2:workflowCollection></w2:workflowCollection>');
    x.push('    </xf:model>');
    x.push('    <script type="text/javascript" lazy="false"><![CDATA[');
    x.push('/*');
    x.push(' * 화면ID : ' + (info.screenId || ''));
    x.push(' * 화면명 : ' + (info.screenNm || ''));
    x.push(' * 작성자 : ' + (info.author || ''));
    x.push(' */');
    x.push(buildScript(spec, cfg));
    x.push(']]></script>');
    x.push('</head>');
    x.push('<body ev:onpageload="scwin.onpageload">');
    x.push(indent(page, 4));
    x.push('</body>');
    x.push('</html>');
    return x.join('\n') + '\n';
  }

  /* ---------- SP ---------- */

  function paramLen(c) {
    switch (c.type) {
      case 'SYEAR': case 'YEAR': return 'NVARCHAR(4)';
      case 'TERM': return 'NVARCHAR(4)';
      case 'DATE': return 'NVARCHAR(8)';
      case 'YM': return 'NVARCHAR(6)';
      case 'SESSION': return c.id === 'SESSION_USER_IP' ? 'NVARCHAR(50)' : 'NVARCHAR(20)';
      default: return 'NVARCHAR(100)';
    }
  }
  function sampleVal(c) {
    switch (c.type) {
      case 'SYEAR': case 'YEAR': return String(new Date().getFullYear());
      case 'TERM': return '0010';
      case 'DATE': return '20260101';
      case 'YM': return '202601';
      default: return '';
    }
  }
  function colType(c) {
    if (c.sqlType) return c.sqlType;
    if (c.edit === 'number') return 'DECIMAL(18, 2)';
    return 'NVARCHAR(' + (c.maxbyte || 100) + ')';
  }

  function spHeader(name, desc, params) {
    var h = [];
    h.push('/*');
    h.push(' PROCEDURE명 : ' + name);
    h.push(' 설명        : ' + desc);
    h.push(' 변수        : ' + (params.length ? params.map(function (p) { return '@' + p.id + ' ' + p.nm; }).join(', ') : '없음'));
    h.push(' 사용예      : EXEC [dbo].[' + name + '] ' + params.map(function (p) { return sqlStr(p.sample || ''); }).join(', '));
    h.push('*/');
    return h.join('\n');
  }

  function searchSp(spec, opt) {
    var info = spec.info;
    var name = opt.name;
    var conds = opt.conds;
    var cols = opt.cols;
    var meta = opt.meta;
    var w = Math.max.apply(null, conds.map(function (c) { return c.id.length + 1; }).concat([10]));
    var p = conds.map(function (c) { return { id: c.id, nm: c.nm, sample: c.type === 'SESSION' ? 'SESSION값' : sampleVal(c) }; });
    var o = [];
    o.push(spHeader(name, opt.desc, p));
    o.push('CREATE OR ALTER PROCEDURE [dbo].[' + name + ']');
    o.push(conds.map(function (c) { return '    ' + pad('@' + c.id, w) + ' ' + paramLen(c); }).join(',\n'));
    o.push('AS');
    o.push('BEGIN');
    o.push('    SET NOCOUNT ON;');
    o.push('');
    o.push('    SELECT');
    var cw = Math.max.apply(null, cols.map(function (c) { return c.id.length + 2; }).concat([8]));
    cols.forEach(function (c, i) {
      var alias = meta ? '[' + two(i + 1) + '_' + String(c.nm).replace(/\./g, '') + ']' : c.id;
      o.push('        ' + (i === 0 ? ' ' : ',') + pad('A.' + c.id, cw) + ' AS ' + alias);
    });
    o.push('    FROM ' + (opt.table ? opt.table : '[dbo].[테이블명]') + ' A');
    var where = [];
    conds.forEach(function (c) {
      if (c.type === 'SESSION') return;
      if (opt.keyMode) { where.push('A.' + c.id + ' = @' + c.id); return; }
      if (c.req) where.push('A.' + c.id + ' = @' + c.id);
      else if (c.type === 'TEXT') where.push("(ISNULL(@" + c.id + ", '') = '' OR A." + c.id + " LIKE '%' + @" + c.id + " + '%')");
      else if (c.type === 'NUMBER') where.push("(ISNULL(@" + c.id + ", '') = '' OR A." + c.id + ' = TRY_CAST(@' + c.id + ' AS INT))');
      else where.push("(ISNULL(@" + c.id + ", '') = '' OR A." + c.id + ' = @' + c.id + ')');
    });
    if (where.length) {
      o.push('    WHERE ' + where[0]);
      for (var i = 1; i < where.length; i++) o.push('      AND ' + where[i]);
    }
    var keyCols = cols.filter(function (c) { return c.key; });
    o.push('    ORDER BY ' + (keyCols.length ? keyCols : cols.slice(0, 1)).map(function (c) { return 'A.' + c.id; }).join(', ') + ';');
    o.push('END');
    o.push('GO');
    return o.join('\n') + '\n';
  }

  function saveSp(name, desc, table, cols) {
    var keys = cols.filter(function (c) { return c.key; });
    var nonKeys = cols.filter(function (c) { return !c.key && c.edit !== 'none'; });
    var all = keys.concat(nonKeys);
    var w = Math.max.apply(null, all.map(function (c) { return c.id.length; }).concat([10]));
    var tb = table || '[dbo].[테이블명]';
    var p = [
      { id: 'JSON_DATA', nm: '변경 행 JSON', sample: '[{"ROW_STATUS":"C"}]' },
      { id: 'SESSION_USER_ID', nm: '사용자ID', sample: 'SESSION값' },
      { id: 'SESSION_USER_IP', nm: '사용자IP', sample: 'SESSION값' }
    ];
    var on = keys.map(function (c) { return 'T.' + c.id + ' = R.' + c.id; }).join(' AND ') || '1 = 0';
    var o = [];
    o.push(spHeader(name, desc, p));
    o.push('CREATE OR ALTER PROCEDURE [dbo].[' + name + ']');
    o.push('    @JSON_DATA        NVARCHAR(MAX),');
    o.push('    @SESSION_USER_ID  NVARCHAR(20),');
    o.push('    @SESSION_USER_IP  NVARCHAR(50)');
    o.push('AS');
    o.push('BEGIN');
    o.push('    SET NOCOUNT ON;');
    o.push('    SET XACT_ABORT ON;');
    o.push('');
    o.push('    DECLARE @O_CNT INT = 0;');
    o.push('');
    o.push('    SELECT *');
    o.push('      INTO #ROWS');
    o.push('      FROM OPENJSON(@JSON_DATA)');
    o.push('      WITH (');
    o.push('           ' + pad('ROW_STATUS', w) + ' NVARCHAR(1)  \'$.ROW_STATUS\'');
    all.forEach(function (c) {
      o.push('          ,' + pad(c.id, w) + ' ' + pad(colType(c), 12) + ' \'$.' + c.id + '\'');
    });
    o.push('      );');
    o.push('');
    var reqs = all.filter(function (c) { return c.req; });
    if (reqs.length) {
      o.push("    IF EXISTS (SELECT 1 FROM #ROWS WHERE ROW_STATUS IN ('C', 'U') AND (" +
        reqs.map(function (c) { return "ISNULL(CAST(" + c.id + " AS NVARCHAR(4000)), '') = ''"; }).join(' OR ') + '))');
      o.push("        THROW 50001, N'필수 항목이 비어 있습니다.', 1;");
      o.push('');
    }
    o.push('    BEGIN TRAN;');
    o.push('');
    o.push('    DELETE T');
    o.push('      FROM ' + tb + ' T');
    o.push('     INNER JOIN #ROWS R ON ' + on);
    o.push("     WHERE R.ROW_STATUS = 'D';");
    o.push('    SET @O_CNT += @@ROWCOUNT;');
    o.push('');
    if (nonKeys.length) {
      o.push('    UPDATE T');
      o.push('       SET ' + nonKeys.map(function (c, i) { return (i ? '          ,' : '') + pad('T.' + c.id, w + 2) + ' = R.' + c.id; }).join('\n'));
      o.push('          ,' + pad('T.UPDATE_ID', w + 2) + ' = @SESSION_USER_ID');
      o.push('          ,' + pad('T.UPDATE_IP', w + 2) + ' = @SESSION_USER_IP');
      o.push('          ,' + pad('T.UPDATE_DT', w + 2) + ' = GETDATE()');
      o.push('      FROM ' + tb + ' T');
      o.push('     INNER JOIN #ROWS R ON ' + on);
      o.push("     WHERE R.ROW_STATUS = 'U';");
      o.push('    SET @O_CNT += @@ROWCOUNT;');
      o.push('');
    }
    o.push('    INSERT INTO ' + tb + ' (');
    o.push('           ' + all.map(function (c) { return c.id; }).join(', '));
    o.push('          ,INSERT_ID, INSERT_IP, INSERT_DT');
    o.push('    )');
    o.push('    SELECT ' + all.map(function (c) { return 'R.' + c.id; }).join(', '));
    o.push('          ,@SESSION_USER_ID, @SESSION_USER_IP, GETDATE()');
    o.push('      FROM #ROWS R');
    o.push("     WHERE R.ROW_STATUS = 'C';");
    o.push('    SET @O_CNT += @@ROWCOUNT;');
    o.push('');
    o.push('    COMMIT TRAN;');
    o.push('');
    o.push('    SELECT @O_CNT AS O_CNT;');
    o.push('END');
    o.push('GO');
    return o.join('\n') + '\n';
  }

  /* ---------- 메타 등록값 ---------- */

  function metaDoc(spec, cfg) {
    var info = spec.info;
    var o = [];
    o.push('# 공통 데이터 조회 메타 등록값 — ' + (info.screenNm || info.spSearch));
    o.push('');
    o.push('관리 화면(`CommonDataMng.xml`, /common/commonmng/meta/commquerymng)에서 아래 값으로 등록한다.');
    o.push('저장 SP가 대상 DB에서 SP 존재를 검증하므로, SP를 먼저 생성한 뒤 등록한다.');
    o.push('');
    o.push('## 마스터 (SYS_COMMON_DATA_SEARCH_INFO)');
    o.push('');
    o.push('| 항목 | 값 |');
    o.push('|---|---|');
    o.push('| ID | ' + (info.screenId || '') + ' |');
    o.push('| NM | ' + (info.screenNm || '') + ' |');
    o.push('| DB_SYSTEM_GCD | ' + (info.dbSystemGcd || '0001') + ' |');
    o.push('| DB_NM | ' + info.db + ' |');
    o.push('| PROC_NM | ' + info.spSearch + ' |');
    o.push('| USE_YN | Y |');
    o.push('| AUTH_USER_IDS | ' + (info.authUserIds || '(비우면 전체)') + ' |');
    o.push('| AUTH_DEPT_CDS | ' + (info.authDeptCds || '(비우면 전체)') + ' |');
    o.push('| GUIDE_MSG | ' + (spec.design.guide ? spec.design.guideText.replace(/\n/g, ' / ') : '') + ' |');
    o.push('');
    o.push('## 조회조건 (SYS_COMMON_DATA_SEARCH_PARAM) — 순번 = SP 파라미터 선언 순서');
    o.push('');
    o.push('| SORT_ORD | PARAM_ID | PARAM_NM | PARAM_TYPE | COMBO_GROUP_CD | MANDATORY_YN |');
    o.push('|---|---|---|---|---|---|');
    spec.conds.forEach(function (c, i) {
      o.push('| ' + (i + 1) + ' | ' + c.id + ' | ' + c.nm + ' | ' + (c.type === 'SESSION' ? 'TEXT' : c.type) + ' | ' + (c.code || '') + ' | ' + (c.req ? 'Y' : 'N') + ' |');
    });
    o.push('');
    o.push('## 결과 컬럼');
    o.push('');
    spec.cols.forEach(function (c, i) { o.push('- `[' + two(i + 1) + '_' + String(c.nm).replace(/\./g, '') + ']` ← ' + c.id); });
    o.push('');
    o.push('개인정보가 포함되면 SP 안에서 세션값(`SESSION_USER_DEPT_CD` 등)으로 한 번 더 제한할 것. 화면 권한은 bindProc 직접 호출을 막지 못한다.');
    return o.join('\n') + '\n';
  }

  /* ---------- 에이전트 요청문 ---------- */

  function agentPrompt(spec, warnings) {
    var t = spec.screenType;
    var tn = SCREEN_TYPES.filter(function (x) { return x.id === t; })[0];
    var o = [];
    o.push('websquare-dev 에이전트로 아래 명세의 ' + (t === 'meta' ? '공통 데이터 조회' : '화면') + '을 만들어줘.');
    o.push('');
    o.push('- 화면 유형: ' + (tn ? tn.nm : t));
    o.push('- 화면: ' + (spec.info.screenId || '') + ' / ' + (spec.info.screenNm || ''));
    o.push('- DB: ' + spec.info.db + ', 조회 SP: ' + spec.info.spSearch + (spec.info.spSave ? ', 저장 SP: ' + spec.info.spSave : ''));
    o.push('- 명세를 `specs/' + (spec.info.screenId || 'screen') + '.json` 으로 저장하고 `node tools/gen.js` 로 초안을 만든 뒤, 실제 테이블·사내 패턴에 맞게 다듬고 `node tools/check.js` 로 검사할 것.');
    if (warnings.length) {
      o.push('');
      o.push('확인이 필요한 항목:');
      warnings.forEach(function (x) { o.push('- ' + x); });
    }
    o.push('');
    o.push('```json');
    o.push(JSON.stringify(spec, null, 2));
    o.push('```');
    return o.join('\n') + '\n';
  }

  /* ---------- 진입점 ---------- */

  function generate(rawSpec, rawCfg) {
    var cfg = mergeConfig(rawCfg);
    var spec = normalize(rawSpec, cfg);
    var warnings = validate(spec, cfg);
    var t = spec.screenType;
    var info = spec.info;
    var files = [];
    var isMd = t === 'md-tb' || t === 'md-lr';

    if (t === 'meta') {
      files.push({ name: (info.spSearch || 'SP') + '.sql', label: '조회 SP', lang: 'sql',
        content: searchSp(spec, { name: info.spSearch, desc: info.screenNm + ' (공통 데이터 조회)', conds: spec.conds, cols: spec.cols, table: info.table, meta: true }) });
      files.push({ name: (info.screenId || 'meta') + '_메타등록.md', label: '메타 등록값', lang: 'md', content: metaDoc(spec, cfg) });
    } else {
      files.push({ name: (info.screenId || 'screen') + '.xml', label: '화면 XML', lang: 'xml', content: buildXml(spec, cfg) });
      files.push({ name: (info.spSearch || 'SP') + '.sql', label: isMd ? '마스터 조회 SP' : '조회 SP', lang: 'sql',
        content: searchSp(spec, { name: info.spSearch, desc: info.screenNm + ' 조회', conds: spec.conds, cols: spec.cols, table: info.table }) });
      if (t === 'edit' || t === 'grid-form') {
        files.push({ name: (info.spSave || 'SP_저장') + '.sql', label: '저장 SP', lang: 'sql',
          content: saveSp(info.spSave, info.screenNm + ' 저장', info.table, spec.cols) });
      }
      if (isMd) {
        var keys = info.mdKey.split(',').map(function (k) { return k.trim(); }).filter(Boolean);
        var kconds = keys.map(function (k) {
          var c = spec.cols.filter(function (x) { return x.id === k; })[0];
          return { id: k, nm: c ? c.nm : k, type: 'TEXT', req: true };
        }).concat(spec.conds.filter(isSession));
        files.push({ name: (info.spDetail || 'SP_상세') + '.sql', label: '상세 조회 SP', lang: 'sql',
          content: searchSp(spec, { name: info.spDetail, desc: info.screenNm + ' 상세 조회', conds: kconds, cols: spec.dcols, table: info.detailTable, keyMode: true }) });
        if (hasEdit(spec.dcols)) {
          files.push({ name: (info.spDetailSave || 'SP_상세_저장') + '.sql', label: '상세 저장 SP', lang: 'sql',
            content: saveSp(info.spDetailSave, info.screenNm + ' 상세 저장', info.detailTable, spec.dcols) });
        }
      }
    }
    files.push({ name: 'agent-request.md', label: '에이전트 요청문', lang: 'md', content: agentPrompt(spec, warnings) });
    files.push({ name: (info.screenId || 'screen') + '.json', label: '명세 JSON', lang: 'json', content: JSON.stringify(spec, null, 2) + '\n' });
    return { spec: spec, files: files, warnings: warnings };
  }

  return {
    SCREEN_TYPES: SCREEN_TYPES,
    COND_TYPES: COND_TYPES,
    EDIT_TYPES: EDIT_TYPES,
    SESSION_KEYS: SESSION_KEYS,
    DEFAULT_CONFIG: DEFAULT_CONFIG,
    emptySpec: emptySpec,
    mergeConfig: mergeConfig,
    normalize: normalize,
    condCells: condCells,
    generate: generate
  };
});
