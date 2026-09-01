/* ══════════ 타임라인 레이아웃 & 렌더 ══════════ */
(function () {
  var NS = 'http://www.w3.org/2000/svg';

  var PX_PER_MONTH = 5.6;
  var PAD_L = 180, PAD_R = 260;
  var MIN_GAP = 172;          // 같은 레인 내 최소 간격
  var Y0 = 1955;

  function S(tag, attrs) {
    var e = document.createElementNS(NS, tag);
    for (var k in attrs) if (attrs[k] != null) e.setAttribute(k, attrs[k]);
    return e;
  }
  function months(y, m) { return (y - Y0) * 12 + (m - 1); }
  function X(y, m) { return PAD_L + months(y, m) * PX_PER_MONTH; }

  var wired = false;       // 전역 리스너는 한 번만
  var keepScroll = 0;      // 재배치 시 스크롤 위치 유지

  App.build = function (data) {
    var stage    = document.getElementById('stage');
    var scroller = document.getElementById('scroller');
    var wires    = document.getElementById('wires');
    var nodesEl  = document.getElementById('nodes');
    var eraNav   = document.getElementById('eraNav');

    /* 다시 그리기 전 초기화 (리사이즈 재배치용) — 열려 있던 카드는 복원한다 */
    var reopenId = App.open && App.open.id;
    App.closeCard(true);
    wires.innerHTML = '';
    nodesEl.innerHTML = '';
    eraNav.innerHTML = '';
    App.nodes = [];
    App.marketPoints = [];

    var from = data.meta.range.from, to = data.meta.range.to;
    var stageW = PAD_L + months(to, 12) * PX_PER_MONTH + PAD_R;
    var stageH = stage.offsetHeight;
    var cy = Math.round(stageH / 2);
    /* 레인 거리는 무대 높이에 비례 — 낮은 화면에서도 시대 라벨과 겹치지 않게 */
    var LANE = [Math.round(stageH * 0.185), Math.round(stageH * 0.325)];
    /* 주가 곡선은 레일에 붙여 노드 레인 안쪽 공간만 쓴다 */
    var MKT_BASE = 14;                                     // 레일에서 띄우는 거리
    var BAND = Math.min(64, Math.round(stageH * 0.11));    // 곡선이 차지하는 세로 높이

    stage.style.width = stageW + 'px';
    wires.setAttribute('viewBox', '0 0 ' + stageW + ' ' + stageH);
    wires.setAttribute('width', stageW);
    wires.setAttribute('height', stageH);

    data.eras.forEach(function (e) { App.eraMap[e.id] = e; });

    var gBg   = S('g'); wires.appendChild(gBg);
    var gMkt  = S('g', { id: 'marketLayer' }); wires.appendChild(gMkt);
    var gStem = S('g'); wires.appendChild(gStem);
    var gEdge = S('g', { id: 'edgeLayer' }); wires.appendChild(gEdge);

    /* ── 시대 밴드 + 이름 ── */
    data.eras.forEach(function (e) {
      var x1 = X(e.from, 1), x2 = X(Math.min(e.to, to), 12);
      var band = S('rect', {
        x: x1, y: cy - 4, width: x2 - x1, height: 8, rx: 4,
        fill: e.color, class: 'era-band', 'data-era': e.id
      });
      gBg.appendChild(band);
      var mid = (x1 + x2) / 2;
      var t1 = S('text', { x: mid, y: 26, 'text-anchor': 'middle', fill: e.color, class: 'era-name', 'data-era': e.id });
      t1.textContent = e.from + ' — ' + (e.to >= to ? 'NOW' : e.to);
      var t2 = S('text', { x: mid, y: 45, 'text-anchor': 'middle', fill: e.color, class: 'era-name-ko', 'data-era': e.id });
      t2.textContent = e.label;
      gBg.appendChild(t1); gBg.appendChild(t2);

      var b = document.createElement('button');
      b.className = 'era-btn'; b.dataset.era = e.id;
      b.style.setProperty('--c', e.color);
      b.innerHTML = '<i></i>' + e.label;
      b.title = e.from + '–' + e.to;
      b.addEventListener('click', function () {
        scroller.scrollTo({ left: Math.max(0, x1 - 120), behavior: App.reduced ? 'auto' : 'smooth' });
      });
      eraNav.appendChild(b);
    });

    /* ── 레일 + 연도 눈금 ── */
    gBg.appendChild(S('line', { x1: PAD_L - 60, y1: cy, x2: stageW - PAD_R + 60, y2: cy, class: 'rail-glow' }));
    gBg.appendChild(S('line', { x1: PAD_L - 60, y1: cy, x2: stageW - PAD_R + 60, y2: cy, class: 'rail' }));

    for (var y = from; y <= to; y++) {
      var major = (y % 5 === 0) || y === from || y === to;
      var x = X(y, 1);
      gBg.appendChild(S('line', {
        x1: x, y1: cy - (major ? 13 : 7), x2: x, y2: cy + (major ? 13 : 7),
        class: 'tick' + (major ? ' major' : ''), 'data-year': y
      }));
      if (major) {
        var ty = S('text', { x: x, y: cy + 30, 'text-anchor': 'middle', class: 'yr major', 'data-year': y });
        ty.textContent = y;
        gBg.appendChild(ty);
      }
    }

    /* ── 1955 출발점 마커 (영화의 그 시점) — 워프의 소실점이 도착하는 자리이기도 하다 ── */
    var bx = X(1955, 11);
    var markY = cy - MKT_BASE - BAND - 18;   // 주가 밴드 위쪽
    var departMark = S('path', {
      d: 'M' + bx + ' ' + markY + 'l7 7-7 7-7-7z', fill: '#FFB03A', opacity: '.9', class: 'depart-mark'
    });
    gBg.appendChild(departMark);
    var bt = S('text', { x: bx, y: markY - 8, 'text-anchor': 'middle', class: 'terminus depart-mark' });
    bt.textContent = '1955.11 DEPART';
    gBg.appendChild(bt);
    App.arrivalTarget = { x: bx, y: markY };

    /* ── 종점 마커 ── */
    var ex = X(to, 8);
    gBg.appendChild(S('circle', { cx: ex, cy: cy, r: 6, fill: '#FFB03A' }));
    gBg.appendChild(S('circle', { cx: ex, cy: cy, r: 13, fill: 'none', stroke: '#FFB03A', 'stroke-width': 1.2, opacity: '.5' }));
    var et = S('text', { x: ex + 22, y: cy + 4, class: 'terminus' });
    et.textContent = 'NOW';
    gBg.appendChild(et);

    /* ── 주가 곡선 (트랙별 · 로그 스케일) ── */
    /* 기간 선택 시 밝게 남길 영역 — applyRange 가 이 rect 를 움직인다 */
    var defs = S('defs');
    var cp = S('clipPath', { id: 'rangeClipPath' });
    cp.appendChild(S('rect', { id: 'rangeClip', x: 0, y: 0, width: stageW, height: stageH }));
    defs.appendChild(cp);
    gMkt.appendChild(defs);
    var gDim = S('g', { class: 'mkt-dim' });  gMkt.appendChild(gDim);
    var gHi  = S('g', { 'clip-path': 'url(#rangeClipPath)' }); gMkt.appendChild(gHi);

    (data.markets || []).forEach(function (mk) {
      var pts = mk.series.filter(function (p) { return p[0] >= from && p[0] <= to; });
      if (pts.length < 2) return;

      /* 로그 스케일 — 70년간 100배 넘게 오르므로 선형으로는 초반이 납작해진다 */
      var vals = pts.map(function (p) { return Math.log10(p[1]); });
      var vMin = Math.min.apply(null, vals), vMax = Math.max.apply(null, vals);
      var span = (vMax - vMin) || 1;

      /* 세계=레일 위쪽, 한국=레일 아래쪽. 레일에서 살짝 띄운다 */
      var up = mk.track === 'world';
      var base = up ? cy - MKT_BASE : cy + MKT_BASE;   // 값이 가장 낮을 때의 y
      function Y(v) {
        var t = (Math.log10(v) - vMin) / span;        // 0~1
        return up ? base - t * BAND : base + t * BAND;
      }

      var line = '', area = '';
      pts.forEach(function (p, i) {
        var x = X(p[0], 6), y = Y(p[1]);              // 연중(6월)에 점을 둔다
        line += (i ? ' L' : 'M') + x.toFixed(1) + ' ' + y.toFixed(1);
      });
      var x0 = X(pts[0][0], 6), xN = X(pts[pts.length - 1][0], 6);
      area = line + ' L' + xN.toFixed(1) + ' ' + base + ' L' + x0.toFixed(1) + ' ' + base + ' Z';

      /* 전 구간을 흐리게 한 벌, 선택 구간만 밝게 한 벌 — 추세 맥락을 잃지 않는다 */
      [gDim, gHi].forEach(function (g) {
        g.appendChild(S('path', { d: area, fill: mk.color, class: 'mkt-area' }));
        g.appendChild(S('path', { d: line, fill: 'none', stroke: mk.color, class: 'mkt-line' }));
      });

      /* 시리즈 이름 — 곡선 시작점 옆에 */
      var t0 = S('text', {
        x: x0 + 6, y: Y(pts[0][1]) + (up ? -9 : 15),
        fill: mk.color, class: 'mkt-name'
      });
      t0.textContent = mk.label;
      gHi.appendChild(t0);

      /* 연도별 점 + 히트 영역 (히트는 클립 밖에 둬야 전 구간에서 호버·클릭된다) */
      pts.forEach(function (p) {
        var x = X(p[0], 6), y = Y(p[1]);
        var halo = S('circle', { cx: x, cy: y, r: 5, class: 'mkt-halo' });
        gHi.appendChild(halo);
        var dot = S('circle', { cx: x, cy: y, r: 3.4, fill: mk.color, class: 'mkt-dot' });
        dot.style.color = mk.color;   // drop-shadow(currentColor) 용
        gHi.appendChild(dot);
        var hit = S('circle', { cx: x, cy: y, r: 9, fill: 'transparent', class: 'mkt-hit' });
        hit.addEventListener('mouseenter', function () {
          App.showQuote(mk, p, x, y, up);
          dot.classList.add('is-hover'); halo.classList.add('is-hover');
        });
        hit.addEventListener('mouseleave', function () {
          App.hideQuote();
          dot.classList.remove('is-hover'); halo.classList.remove('is-hover');
        });
        hit.addEventListener('click', function (e) {
          e.stopPropagation();
          App.hideQuote();
          if (App.open && App.open.id === 'mkt:' + mk.id + ':' + p[0]) App.closeCard();
          else App.openMarketCard(mk, p, x, y, dot);
        });
        gMkt.appendChild(hit);

        App.marketPoints.push({ mkId: mk.id, year: p[0], x: x, y: y, track: mk.track, dot: dot, halo: halo });
      });
    });

    /* ── 노드 배치 (트랙별 레인 충돌 회피) ── */
    var evs = data.events.slice().sort(function (a, b) {
      return months(a.year, a.month) - months(b.year, b.month);
    });
    var last = { world: [-1e9, -1e9], korea: [-1e9, -1e9] };

    evs.forEach(function (ev) {
      var track = ev.anchor === 'korea' ? 'korea' : 'world';
      var x = X(ev.year, ev.month);
      var lane = (x - last[track][0] >= MIN_GAP) ? 0 : 1;
      last[track][lane] = x;
      var dist = LANE[lane];
      var ny = track === 'world' ? cy - dist : cy + dist;
      var era = App.eraMap[ev.era] || { color: '#8899BB' };

      /* 줄기 */
      gStem.appendChild(S('line', {
        x1: x, y1: cy, x2: x, y2: track === 'world' ? ny + 24 : ny - 24,
        stroke: era.color, class: 'stem', 'data-id': ev.id
      }));

      /* 노드 버튼 */
      var b = document.createElement('button');
      b.className = 'node';
      b.type = 'button';
      b.dataset.id = ev.id;
      b.dataset.track = track;
      b.style.setProperty('--x', x + 'px');
      b.style.setProperty('--y', ny + 'px');
      b.style.setProperty('--c', era.color);
      b.setAttribute('aria-expanded', 'false');
      b.setAttribute('aria-label', ev.year + '년 ' + ev.month + '월 ' + ev.title);
      b.innerHTML =
        '<span class="dot"><svg viewBox="0 0 24 24" aria-hidden="true"><use href="#i-' + ev.icon + '"/></svg></span>' +
        '<span class="lbl">' + ev.year + '.' + String(ev.month).padStart(2, '0') + '</span>' +
        '<span class="nm">' + ev.title + '</span>';

      b.addEventListener('click', function (e) {
        e.stopPropagation();
        if (App.open && App.open.id === ev.id) App.closeCard();
        else App.openCard(ev, b, { x: x, y: ny, track: track, era: era });
      });

      nodesEl.appendChild(b);
      App.nodes.push({ ev: ev, el: b, x: x, y: ny, track: track, era: era });
    });

    App.stage = { w: stageW, h: stageH, cy: cy };

    /* 리사이즈로 다시 그려도 선택된 기간 필터는 유지한다 */
    if (App.range) App.applyRange(App.range.from, App.range.to, { scroll: false });

    if (wired) {
      scroller.scrollLeft = keepScroll;
      if (reopenId) {
        var r = App.nodes.find(function (n) { return n.ev.id === reopenId; });
        if (r) App.openCard(r.ev, r.el, { x: r.x, y: r.y, track: r.track, era: r.era }, true);
      }
      return;
    }
    wired = true;
    App.initRange();

    /* ── 주가 곡선 표시 토글 ── */
    var mktBtn = document.getElementById('mktToggle');
    if (mktBtn) mktBtn.addEventListener('click', function () {
      var on = !document.getElementById('app').classList.contains('no-mkt');
      document.getElementById('app').classList.toggle('no-mkt', on);
      mktBtn.classList.toggle('is-on', !on);
      mktBtn.setAttribute('aria-pressed', String(!on));
      if (on) App.hideQuote();
    });

    /* ── 닫기 트리거 ── */
    stage.addEventListener('click', function () { App.closeCard(); });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') App.closeCard();
    });

    /* ── 크기 변경 시 재배치 (실제로 바뀐 경우에만) ── */
    var rt, lastW = scroller.clientWidth, lastH = scroller.clientHeight;
    window.addEventListener('resize', function () {
      clearTimeout(rt);
      rt = setTimeout(function () {
        var w = scroller.clientWidth, h = scroller.clientHeight;
        if (Math.abs(w - lastW) < 3 && Math.abs(h - lastH) < 3) return;
        lastW = w; lastH = h;
        keepScroll = scroller.scrollLeft;
        App.build(App.data);
      }, 160);
    });

    /* ── 세로 휠을 가로 스크롤로 — 연표는 가로로만 흐른다 ── */
    scroller.addEventListener('wheel', function (e) {
      if (e.ctrlKey) return;                       // 브라우저 확대/축소는 건드리지 않음
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;  // 트랙패드 가로 스와이프는 그대로
      if (!e.deltaY) return;
      e.preventDefault();
      scroller.scrollLeft += e.deltaY;
    }, { passive: false });

    /* ── 키보드 내비게이션 (숨겨진 노드는 건너뜀) ── */
    scroller.addEventListener('keydown', function (e) {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      var visible = App.nodes.filter(function (n) { return !n.el.classList.contains('is-hidden'); });
      var cur = visible.findIndex(function (n) { return n.el === document.activeElement; });
      var next = e.key === 'ArrowRight'
        ? Math.min(visible.length - 1, cur + 1)
        : Math.max(0, cur - 1);
      if (cur === -1) next = 0;
      var n = visible[next];
      if (!n) return;
      e.preventDefault();
      n.el.focus();
      scroller.scrollTo({
        left: Math.max(0, n.x - scroller.clientWidth / 2),
        behavior: App.reduced ? 'auto' : 'smooth'
      });
    });

    /* 시작 위치 */
    scroller.scrollLeft = 0;
  };

  /* ══════════ 주가 툴팁 ══════════ */
  App.showQuote = function (mk, point, x, y, up) {
    var tip = document.getElementById('quote');
    if (!tip) return;
    var series = mk.series;
    var i = series.findIndex(function (p) { return p[0] === point[0]; });
    var prev = i > 0 ? series[i - 1][1] : null;
    var chg = prev ? ((point[1] - prev) / prev * 100) : null;

    tip.innerHTML =
      '<span class="q-mkt" style="color:' + mk.color + '">' + mk.label + '</span>' +
      '<span class="q-yr">' + point[0] + '</span>' +
      '<span class="q-val">' + point[1].toLocaleString() + '</span>' +
      (chg === null ? '' :
        '<span class="q-chg ' + (chg >= 0 ? 'up' : 'dn') + '">' +
        (chg >= 0 ? '▲' : '▼') + Math.abs(chg).toFixed(1) + '%</span>');

    tip.style.setProperty('--qx', x + 'px');
    tip.style.setProperty('--qy', (up ? y - 14 : y + 14) + 'px');
    tip.dataset.side = up ? 'above' : 'below';
    tip.hidden = false;
  };
  App.hideQuote = function () {
    var tip = document.getElementById('quote');
    if (tip) tip.hidden = true;
  };

  /* ══════════ 기간 선택 — 노드·줄기를 숨기고 시대·눈금을 흐리게 ══════════ */
  App.applyRange = function (from, to, opts) {
    opts = opts || {};
    App.range = { from: from, to: to };

    var full = from <= App.data.meta.range.from && to >= App.data.meta.range.to;
    var loKey = from * 12 + 1, hiKey = to * 12 + 12;

    App.nodes.forEach(function (n) {
      var key = n.ev.year * 12 + n.ev.month;
      var show = full || (key >= loKey && key <= hiKey);
      n.el.classList.toggle('is-hidden', !show);
      var stem = document.querySelector('.stem[data-id="' + n.ev.id + '"]');
      if (stem) stem.classList.toggle('is-hidden', !show);
    });

    /* 열려 있던 카드가 범위 밖으로 밀려나면 닫는다 */
    if (App.open) {
      var openNode = App.nodes.find(function (n) { return n.ev.id === App.open.id; });
      if (openNode && openNode.el.classList.contains('is-hidden')) App.closeCard(true);
    }

    Array.prototype.forEach.call(document.querySelectorAll('[data-era]'), function (el) {
      var era = App.eraMap[el.dataset.era];
      var overlap = full || !(era.to < from || era.from > to);
      el.classList.toggle('is-dim', !overlap);
    });
    Array.prototype.forEach.call(document.querySelectorAll('[data-year]'), function (el) {
      var y = +el.dataset.year;
      el.classList.toggle('is-dim', !full && (y < from || y > to));
    });

    /* 곡선은 잘라내지 않고 구간만 밝게 — 추세의 맥락은 남겨 둔다 */
    var clip = document.getElementById('rangeClip');
    if (clip) {
      clip.setAttribute('x', full ? 0 : X(from, 1));
      clip.setAttribute('width', full ? App.stage.w : Math.max(1, X(to, 12) - X(from, 1)));
    }

    var badge = document.getElementById('rangeCount');
    if (badge) {
      var shown = App.nodes.filter(function (n) { return !n.el.classList.contains('is-hidden'); }).length;
      badge.textContent = full ? (App.nodes.length + '개 전체') : (shown + '개 사건');
    }

    if (opts.scroll !== false && !full) {
      var scroller = document.getElementById('scroller');
      scroller.scrollTo({ left: Math.max(0, X(from, 1) - 70), behavior: App.reduced ? 'auto' : 'smooth' });
    }
  };

  /* 듀얼 슬라이더 UI — HUD 바깥(#stage 밖)에 있어 리빌드돼도 한 번만 초기화하면 된다 */
  App.initRange = function () {
    var elFrom = document.getElementById('rangeFrom');
    var elTo   = document.getElementById('rangeTo');
    var fill   = document.getElementById('rangeFill');
    var label  = document.getElementById('rangeLabel');
    var reset  = document.getElementById('rangeReset');
    if (!elFrom) return;

    var lo = App.data.meta.range.from, hi = App.data.meta.range.to;
    elFrom.min = elTo.min = lo;
    elFrom.max = elTo.max = hi;
    elFrom.value = lo; elTo.value = hi;

    function pct(v) { return (v - lo) / (hi - lo) * 100; }
    function paint() {
      var a = +elFrom.value, b = +elTo.value;
      fill.style.left  = pct(Math.min(a, b)) + '%';
      fill.style.right = (100 - pct(Math.max(a, b))) + '%';
      label.textContent = Math.min(a, b) + ' — ' + Math.max(a, b);
    }
    var t;
    function schedule() { clearTimeout(t); t = setTimeout(commit, 120); }
    function commit() {
      App.applyRange(Math.min(+elFrom.value, +elTo.value), Math.max(+elFrom.value, +elTo.value));
    }
    elFrom.addEventListener('input', function () {
      if (+elFrom.value > +elTo.value) elTo.value = elFrom.value;
      paint(); schedule();
    });
    elTo.addEventListener('input', function () {
      if (+elTo.value < +elFrom.value) elFrom.value = elTo.value;
      paint(); schedule();
    });
    reset.addEventListener('click', function () {
      elFrom.value = lo; elTo.value = hi; paint(); commit();
    });

    /* 마우스 스크롤로 선택 구간을 통째로 밀어 이동 (폭은 그대로 유지) */
    document.querySelector('.period-bar').addEventListener('wheel', function (e) {
      var dir = e.deltaY > 0 ? 1 : (e.deltaY < 0 ? -1 : 0);
      if (!dir) return;
      e.preventDefault();
      var span = (+elTo.value) - (+elFrom.value);
      var newFrom = Math.max(lo, Math.min(hi - span, (+elFrom.value) + dir));
      if (newFrom === +elFrom.value) return;   // 이미 끝에 닿음
      elFrom.value = newFrom;
      elTo.value = newFrom + span;
      paint();
      schedule();
    }, { passive: false });

    paint();
  };
})();
