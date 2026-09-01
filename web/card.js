/* ══════════ 노드 → 엣지 → 사각형 전개 인터랙션 ══════════ */
(function () {
  var NS = 'http://www.w3.org/2000/svg';

  var EDGE_MS   = 200;   // 엣지가 뻗는 시간
  var UNFOLD_MS = 430;   // 사각형이 펼쳐지는 시간
  var CLOSE_MS  = 200;   // 접히는 시간
  var RADIUS    = 16;    // 카드 라운드 (clip-path와 CSS가 동일해야 함)
  var NODE_R    = 25;    // 엣지가 출발하는 노드 반경
  var GAP       = 58;    // 노드와 카드 사이 가로 여백
  var VOFF      = 34;    // 노드와 앵커 모서리 사이 세로 어긋남
  var INSET     = 7;     // 앵커 지점을 모서리에서 살짝 안쪽으로

  /* 앵커 모서리별 clip-path 시퀀스: 시작 → 폭 전개 완료 → 높이 전개 완료 */
  var CLIP = {
    'top-left':     ['inset(0 100% 100% 0',   'inset(0 0 100% 0'],
    'top-right':    ['inset(0 0 100% 100%',   'inset(0 0 100% 0'],
    'bottom-left':  ['inset(100% 100% 0 0',   'inset(100% 0 0 0'],
    'bottom-right': ['inset(100% 0 0 100%',   'inset(100% 0 0 0']
  };
  var R = ' round ' + RADIUS + 'px)';
  var DONE = 'inset(0 0 0 0' + R;

  var state = null;   // { id, card, path, cap, key, anims:[], deactivate }

  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }
  App._esc = esc;

  function sideHTML(kind, d, delay) {
    if (!d) return '';
    var tag = kind === 'world' ? 'WORLD · 세계' : 'KOREA · 한국';
    var figs = (d.figures || []).map(function (f) {
      return '<span class="fig">' + esc(f) + '</span>';
    }).join('');
    return '' +
      '<section class="side ' + kind + ' stagger" style="animation-delay:' + delay + 'ms">' +
        '<div class="side-top">' +
          '<span class="side-tag">' + tag + '</span>' +
          '<span class="side-head">' + esc(d.headline) + '</span>' +
        '</div>' +
        '<p class="side-body">' + esc(d.body) + '</p>' +
        (figs ? '<div class="figs">' + figs + '</div>' : '') +
      '</section>';
  }

  /* 노드/사건 카드와 주가 상세 팝업이 공유하는 저수준 전개 로직.
     opts: { id, x, y, track, color, ariaLabel, html, originR, afterRender(card), activate(), deactivate() } */
  App._openUnfold = function (opts, instant) {
    App.closeCard(true);
    /* 안전망 — 직전 카드가 닫히는 중(지연된 drop() 대기)이었다면 state 에는
       이미 없지만 DOM에는 남아 있다. 새로 열기 전에 잔여물을 강제로 치운다. */
    Array.prototype.forEach.call(document.querySelectorAll('#cards .card'), function (el) { el.remove(); });
    Array.prototype.forEach.call(document.querySelectorAll('#edgeLayer .edge, #edgeLayer .edge-cap'), function (el) { el.remove(); });

    var scroller = document.getElementById('scroller');
    var cardsEl  = document.getElementById('cards');
    var edgeLayer = document.getElementById('edgeLayer');
    var stage = App.stage;
    var originR = opts.originR != null ? opts.originR : NODE_R;

    var CARD_W = Math.min(380, Math.max(252, scroller.clientWidth - 44));

    /* ── 카드 DOM (먼저 만들어 높이를 잰다) ── */
    var card = document.createElement('article');
    card.className = 'card';
    card.setAttribute('role', 'dialog');
    card.setAttribute('aria-label', opts.ariaLabel);
    card.style.setProperty('--c', opts.color);
    card.style.setProperty('--cw', CARD_W + 'px');
    card.style.setProperty('--cmh', (stage.h - 46) + 'px');
    card.style.setProperty('--cx', '0px');
    card.style.setProperty('--cy', '0px');
    card.style.clipPath = 'inset(0 100% 100% 0' + R;
    card.innerHTML = opts.html;
    card.addEventListener('click', function (e) { e.stopPropagation(); });
    cardsEl.appendChild(card);
    if (opts.afterRender) opts.afterRender(card);

    var H = card.offsetHeight;

    /* ── 카드가 화면 안에 들어오도록 필요한 만큼만 스크롤 ── */
    var vw = scroller.clientWidth;
    var sc = scroller.scrollLeft;
    /* 노드 옆에 카드를 놓을 가로 여유가 없으면 세로 배치로 전환한다 */
    var narrow = CARD_W + GAP + 40 > vw;

    var target, cx;
    if (narrow) {
      target = opts.x - vw / 2;                       // 노드를 화면 중앙으로
      target = Math.max(0, Math.min(target, stage.w - vw));
      cx = opts.x - 30;                               // 앵커 모서리를 노드 바로 옆에
      cx = Math.max(target + 12, Math.min(cx, target + vw - CARD_W - 12));
    } else {
      var need = CARD_W + GAP + 60;
      target = sc;
      if (opts.x - sc > vw - need) target = opts.x - (vw - need);
      if (opts.x - sc < 100) target = opts.x - 100;
      target = Math.max(0, Math.min(target, stage.w - vw));
      cx = (opts.x - target <= vw * 0.5) ? opts.x + GAP : opts.x - GAP - CARD_W;
    }
    cx = Math.max(14, Math.min(cx, stage.w - CARD_W - 14));
    if (target !== sc) scroller.scrollTo({ left: target, behavior: App.reduced ? 'auto' : 'smooth' });

    /* 수직으로는 트랙 바깥쪽으로 비켜 놓는다 —
       노드와 앵커 모서리가 대각선으로 벌어져야 엣지가 눈에 보인다 */
    var cyTop = opts.track === 'world' ? opts.y + VOFF : opts.y - VOFF - H;
    cyTop = Math.max(14, Math.min(cyTop, stage.h - H - 32));  // 32 = 가로 스크롤바 여유

    card.style.setProperty('--cx', cx + 'px');
    card.style.setProperty('--cy', cyTop + 'px');

    /* ── 앵커 = 노드에서 가장 가까운 모서리 = 사각형의 시작점 ── */
    var cornerX = (opts.x <= cx + CARD_W / 2) ? 'left' : 'right';
    var cornerY = (opts.y <= cyTop + H / 2) ? 'top' : 'bottom';
    var key = cornerY + '-' + cornerX;

    var ax = cornerX === 'left' ? cx + INSET : cx + CARD_W - INSET;
    var ay = cornerY === 'top' ? cyTop + INSET : cyTop + H - INSET;

    /* ── 엣지: 노드에서 앵커까지 ── */
    var dx = ax - opts.x, dy = ay - opts.y;
    var L = Math.hypot(dx, dy) || 1;
    var sx = opts.x + dx / L * originR;
    var sy = opts.y + dy / L * originR;
    var d = 'M' + sx + ' ' + sy +
            ' C' + (sx + dx * 0.5) + ' ' + sy +
            ' ' + (ax - dx * 0.25) + ' ' + ay +
            ' ' + ax + ' ' + ay;

    var path = document.createElementNS(NS, 'path');
    path.setAttribute('class', 'edge');
    path.setAttribute('d', d);
    path.setAttribute('stroke', opts.color);
    path.style.color = opts.color;   // drop-shadow 의 currentColor 용
    edgeLayer.appendChild(path);

    var cap = document.createElementNS(NS, 'circle');
    cap.setAttribute('class', 'edge-cap');
    cap.setAttribute('cx', ax); cap.setAttribute('cy', ay); cap.setAttribute('r', 4);
    cap.setAttribute('fill', opts.color);
    cap.style.opacity = '0';
    edgeLayer.appendChild(cap);

    if (opts.activate) opts.activate();
    document.getElementById('app').classList.add('has-open');

    state = { id: opts.id, card: card, path: path, cap: cap, key: key, anims: [], deactivate: opts.deactivate };

    /* ── 애니메이션 ── */
    if (App.reduced || instant) {
      card.style.clipPath = DONE;
      card.classList.add('revealing');
      cap.style.opacity = '1';
      return;
    }

    var len = path.getTotalLength();
    path.style.strokeDasharray = len;
    path.style.strokeDashoffset = len;
    state.anims.push(path.animate(
      [{ strokeDashoffset: len }, { strokeDashoffset: 0 }],
      { duration: EDGE_MS, easing: 'cubic-bezier(.4,0,.2,1)', fill: 'forwards' }
    ));
    state.anims.push(cap.animate(
      [{ opacity: 0, transform: 'scale(.2)' }, { opacity: 1, transform: 'scale(1)' }],
      { duration: 160, delay: EDGE_MS - 30, easing: 'ease-out', fill: 'forwards' }
    ));

    var seq = CLIP[key];
    state.anims.push(card.animate([
      { clipPath: seq[0] + R, offset: 0 },
      { clipPath: seq[1] + R, offset: 0.45 },
      { clipPath: DONE,       offset: 1 }
    ], {
      duration: UNFOLD_MS, delay: EDGE_MS - 10,
      easing: 'cubic-bezier(.22,.61,.36,1)', fill: 'both'
    }));

    setTimeout(function () {
      if (state && state.card === card) card.classList.add('revealing');
    }, EDGE_MS + 190);
  };

  /* ══════════ 사건 카드 ══════════ */
  App.openCard = function (ev, nodeEl, pos, instant) {
    var era = pos.era;
    App._openUnfold({
      id: ev.id, x: pos.x, y: pos.y, track: pos.track, color: era.color,
      ariaLabel: ev.title,
      html:
        '<header class="card-head">' +
          '<div class="card-when stagger" style="animation-delay:0ms">' +
            '<span class="ym">' + ev.year + '.' + String(ev.month).padStart(2, '0') + '</span>' +
            '<span class="era">' + esc(era.label || '') + '</span>' +
          '</div>' +
          '<h2 class="card-title stagger" style="animation-delay:60ms">' + esc(ev.title) + '</h2>' +
          (ev.note ? '<p class="card-note stagger" style="animation-delay:110ms">' + esc(ev.note) + '</p>' : '') +
        '</header>' +
        '<div class="card-body">' +
          sideHTML('world', ev.world, 150) +
          sideHTML('korea', ev.korea, 210) +
        '</div>',
      activate: function () { nodeEl.classList.add('is-open'); nodeEl.setAttribute('aria-expanded', 'true'); },
      deactivate: function () { nodeEl.classList.remove('is-open'); nodeEl.setAttribute('aria-expanded', 'false'); }
    }, instant);
  };

  /* ══════════ 주가 상세 팝업 — 같은 해에 등록된 사건으로 바로 이어준다 ══════════ */
  App.openMarketCard = function (mk, point, x, y, dotEl) {
    var series = mk.series;
    var i = series.findIndex(function (p) { return p[0] === point[0]; });
    var prev = i > 0 ? series[i - 1][1] : null;
    var chg = prev != null ? (point[1] - prev) / prev * 100 : null;
    var track = mk.track;

    var econNote = (mk.notes || []).find(function (n) { return n.year === point[0]; });
    var related = App.data.events.filter(function (e) { return e.year === point[0]; });
    var delay = 170;

    var econHTML = '';
    if (econNote) {
      econHTML =
        '<section class="side mkt-econ stagger" style="animation-delay:' + delay + 'ms">' +
          '<div class="side-top">' +
            '<span class="side-tag" style="color:' + mk.color + '">ECONOMY · 경제사</span>' +
            '<span class="side-head">' + esc(econNote.headline) + '</span>' +
          '</div>' +
          '<p class="side-body">' + esc(econNote.body) + '</p>' +
        '</section>';
      delay += 45;
    }

    var relHTML = related.length
      ? related.map(function (e, idx) {
          var side = e.anchor === 'korea' ? e.korea : e.world;
          var era = App.eraMap[e.era] || {};
          var d = delay + idx * 45;
          return (
            '<section class="side mkt-rel stagger" data-event-id="' + e.id + '" style="animation-delay:' + d + 'ms">' +
              '<div class="side-top">' +
                '<span class="side-tag" style="color:' + (era.color || '#8899BB') + '">' + e.year + '.' + String(e.month).padStart(2, '0') + '</span>' +
                '<span class="side-head">' + esc(e.title) + '</span>' +
              '</div>' +
              '<p class="side-body">' + esc(side.headline) + '</p>' +
              '<div class="figs"><span class="fig mkt-jump">이 사건 열기 →</span></div>' +
            '</section>'
          );
        }).join('')
      : (econNote ? '' : '<p class="mkt-empty stagger" style="animation-delay:' + delay + 'ms">등록된 사건이 없는 해입니다.</p>');

    App._openUnfold({
      id: 'mkt:' + mk.id + ':' + point[0], x: x, y: y, track: track, color: mk.color,
      ariaLabel: mk.label + ' ' + point[0] + '년',
      originR: 7,
      html:
        '<header class="card-head">' +
          '<div class="card-when stagger" style="animation-delay:0ms">' +
            '<span class="ym">' + point[0] + '</span>' +
            '<span class="era" style="color:' + mk.color + '; border-color:' + mk.color + '55">' + mk.label + '</span>' +
          '</div>' +
          '<h2 class="card-title stagger" style="animation-delay:60ms">' + point[1].toLocaleString() + '</h2>' +
          (chg != null
            ? '<p class="card-note mkt-chg-note ' + (chg >= 0 ? 'up' : 'dn') + ' stagger" style="animation-delay:110ms">' +
                (chg >= 0 ? '▲' : '▼') + Math.abs(chg).toFixed(1) + '% 전년 대비' +
              '</p>'
            : '') +
        '</header>' +
        '<div class="card-body">' + econHTML + relHTML + '</div>',
      afterRender: function (card) {
        Array.prototype.forEach.call(card.querySelectorAll('.mkt-rel'), function (sec) {
          sec.addEventListener('click', function () {
            var target = App.nodes.find(function (n) { return n.ev.id === sec.dataset.eventId; });
            if (target) App.openCard(target.ev, target.el, { x: target.x, y: target.y, track: target.track, era: target.era });
          });
        });
      },
      activate: function () {
        if (!dotEl) return;
        dotEl.classList.add('is-active');
        if (dotEl.previousElementSibling) dotEl.previousElementSibling.classList.add('is-active');
      },
      deactivate: function () {
        if (!dotEl) return;
        dotEl.classList.remove('is-active');
        if (dotEl.previousElementSibling) dotEl.previousElementSibling.classList.remove('is-active');
      }
    });
  };

  App.closeCard = function (instant) {
    if (!state) return;
    var s = state;
    state = null;

    if (s.deactivate) s.deactivate();
    document.getElementById('app').classList.remove('has-open');

    s.anims.forEach(function (a) { try { a.cancel(); } catch (e) {} });

    function drop() {
      if (s.card.parentNode) s.card.parentNode.removeChild(s.card);
      if (s.path.parentNode) s.path.parentNode.removeChild(s.path);
      if (s.cap.parentNode) s.cap.parentNode.removeChild(s.cap);
    }
    if (instant || App.reduced) { drop(); return; }

    var seq = CLIP[s.key];
    s.card.classList.remove('revealing');
    s.card.animate([
      { clipPath: DONE,       offset: 0 },
      { clipPath: seq[1] + R, offset: 0.55 },
      { clipPath: seq[0] + R, offset: 1 }
    ], { duration: CLOSE_MS, easing: 'cubic-bezier(.4,0,1,1)', fill: 'forwards' });

    s.cap.animate([{ opacity: 1 }, { opacity: 0 }],
      { duration: 110, delay: CLOSE_MS - 60, fill: 'forwards' });

    var len = s.path.getTotalLength();
    s.path.animate([{ strokeDashoffset: 0 }, { strokeDashoffset: len }],
      { duration: 160, delay: CLOSE_MS - 40, easing: 'cubic-bezier(.4,0,1,1)', fill: 'forwards' });

    setTimeout(drop, CLOSE_MS + 140);
  };

  Object.defineProperty(App, 'open', {
    get: function () { return state ? { id: state.id } : null; }
  });
})();
