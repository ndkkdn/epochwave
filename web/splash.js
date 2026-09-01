/* ══════════ 공용 네임스페이스 ══════════ */
var App = {
  data: null,
  nodes: [],
  eraMap: {},
  open: null,
  reduced: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  /* API는 항상 이 Worker에서 서빙한다 — 이 페이지 자체가 workers.dev에서 열렸으면
     상대경로와 결과가 같고, Cloudflare Pages 같은 다른 오리진에서 열렸어도 그대로 동작한다. */
  API_BASE: 'https://ndk.hello-world-history.workers.dev/'
};

/* ══════════ 스플래시: 로딩 + 진입 ══════════ */
(function () {
  var splash   = document.getElementById('splash');
  var appEl    = document.getElementById('app');
  var btn      = document.getElementById('enterBtn');
  var fill     = document.getElementById('gaugeFill');
  var gtxt     = document.getElementById('gaugeTxt');
  var hint     = document.getElementById('splashHint');
  var ledDest  = document.getElementById('ledDest');
  var ledPres  = document.getElementById('ledPres');

  var loaded = false, failed = false, charging = false;

  function paint(p) {
    fill.style.width = (p * 100).toFixed(1) + '%';
    gtxt.textContent = (p * 1.21).toFixed(2) + ' GIGAWATTS';
  }
  paint(0);

  /* LED 깜빡임 — 충전이 시작되면 멈춘다 */
  var flick = setInterval(function () {
    var t = Math.random() < 0.5 ? ledDest : ledPres;
    t.style.opacity = '.35';
    setTimeout(function () { t.style.opacity = ''; }, 70);
  }, 1400);

  function ready() {
    btn.disabled = false;
    hint.textContent = '준비 완료 — 버튼을 누르면 플럭스 캐패시터가 충전됩니다.';
    btn.focus();
  }

  function fail(msg) {
    failed = true;
    clearInterval(flick);
    hint.textContent = '데이터를 불러오지 못했습니다 · ' + msg;
    hint.style.color = '#FF8080';
  }

  /* ── 버튼을 누르면 1.21 GIGAWATTS 까지 충전하고, 다 차면 워프로 이어진다 ── */
  var CHARGE_MS = 1500;
  function charge(done) {
    charging = true;
    clearInterval(flick);
    splash.classList.add('charging');
    hint.textContent = '플럭스 캐패시터 충전 중…';

    var t0 = performance.now();
    (function step(now) {
      var p = Math.min(1, (now - t0) / CHARGE_MS);
      /* 후반으로 갈수록 빨라지는 곡선 — 마지막에 확 차오르는 느낌 */
      paint(p * p * (3 - 2 * p));
      if (p < 1) return requestAnimationFrame(step);

      paint(1);
      splash.classList.remove('charging');
      splash.classList.add('charged');
      gtxt.textContent = '1.21 GIGAWATTS';
      hint.textContent = '어디로 가든 길은 필요 없다.';
      setTimeout(done, 260);   // 만충을 눈으로 확인할 짧은 여유
    })(t0);
  }

  fetch(App.API_BASE + 'api/history', { cache: 'no-cache' })
    .then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    })
    .then(function (json) {
      App.data = json;
      var f = json.meta && json.meta.range ? json.meta.range.from : 1955;
      var t = json.meta && json.meta.range ? json.meta.range.to : 2026;
      ledDest.textContent = f; ledPres.textContent = t;
      loaded = true;
      ready();
    })
    .catch(function (e) { fail(e.message); });

  btn.addEventListener('click', function () {
    if (failed || !App.data || charging) return;
    btn.disabled = true;

    if (App.reduced) {
      paint(1);
      gtxt.textContent = '1.21 GIGAWATTS';
      splash.hidden = true;
      launch();
      return;
    }

    /* 충전이 끝나면 워프: 950ms 동안 화면이 중심으로 빨려들어간다.
       본편은 백색 코어가 터지는 순간(~700ms)에 뒤에서 미리 만들어 둔다. */
    charge(function warp() {
      splash.classList.add('leaving');
      setTimeout(launch, 700);
      setTimeout(function () { splash.hidden = true; }, 980);
    });
  });

  function launch() {
    appEl.hidden = false;
    appEl.classList.add('enter-anim');
    /* 연출이 끝나면(또는 어떤 이유로 재생되지 않으면) 클래스를 떼서
       0% 키프레임에 화면이 투명하게 붙잡히는 일이 없게 한다 */
    var clear = function () { appEl.classList.remove('enter-anim'); };
    appEl.addEventListener('animationend', clear, { once: true });
    setTimeout(clear, 1400);

    App.build(App.data);
    document.getElementById('scroller').focus({ preventScroll: true });

    /* 소실점으로 빨려들어간 빛이 여기, 1955년의 첫 시점에 도착했다는 걸 보여준다 */
    if (!App.reduced) arrive();
  }

  function arrive() {
    var flash = document.createElement('div');
    flash.className = 'arrival-flash';
    document.body.appendChild(flash);
    setTimeout(function () { flash.remove(); }, 700);

    var glow = [].slice.call(document.querySelectorAll('.depart-mark'));
    var first = App.nodes[0];
    if (first) glow.push(first.el);

    glow.forEach(function (el) { el.classList.add('is-arrival'); });
    setTimeout(function () {
      glow.forEach(function (el) { el.classList.remove('is-arrival'); });
    }, 1500);
  }
})();
