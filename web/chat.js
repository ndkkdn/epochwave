/* ══════════ AI 가이드 챗봇 — Workers AI(Gemma-4), 대화는 KV에 저장 ══════════ */
(function () {
  var sending = false;

  /* 세션 ID — localStorage 에 두고 재방문·새로고침에도 KV의 같은 대화로 이어간다 */
  function getSessionId() {
    var KEY = 'btf_chat_session';
    try {
      var id = localStorage.getItem(KEY);
      if (!id) {
        id = (crypto.randomUUID ? crypto.randomUUID() : 'sid-' + Date.now() + '-' + Math.random().toString(36).slice(2));
        localStorage.setItem(KEY, id);
      }
      return id;
    } catch (e) {
      return null;   // 프라이빗 모드 등 localStorage 막힌 환경 — 세션 없이 그 대화만 동작
    }
  }
  var sessionId = getSessionId();

  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  function bubble(role, text) {
    var list = document.getElementById('chatList');
    var b = document.createElement('div');
    b.className = 'chat-msg ' + role;
    b.innerHTML = '<div class="chat-bubble">' + esc(text) + '</div>';
    list.appendChild(b);
    list.scrollTop = list.scrollHeight;
    return b;
  }

  function typingBubble() {
    var list = document.getElementById('chatList');
    var b = document.createElement('div');
    b.className = 'chat-msg assistant is-typing';
    b.innerHTML = '<div class="chat-bubble"><i></i><i></i><i></i></div>';
    list.appendChild(b);
    list.scrollTop = list.scrollHeight;
    return b;
  }

  async function send(text) {
    if (sending || !text.trim()) return;
    sending = true;

    var input = document.getElementById('chatInput');
    var sendBtn = document.getElementById('chatSend');
    input.value = '';
    input.disabled = true; sendBtn.disabled = true;

    bubble('user', text);
    var typing = typingBubble();

    try {
      var res = await fetch(App.API_BASE + 'api/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ message: text, sessionId: sessionId })
      });
      var data = await res.json();
      typing.remove();

      if (!res.ok || data.error) {
        bubble('assistant', '지금은 답변을 가져오지 못했어요. 잠시 후 다시 시도해 주세요.');
      } else {
        bubble('assistant', data.reply);
        App.highlightRefs(data.refs || []);
      }
    } catch (e) {
      typing.remove();
      bubble('assistant', '연결에 문제가 있어요. 네트워크를 확인해 주세요.');
    } finally {
      sending = false;
      input.disabled = false; sendBtn.disabled = false;
      input.focus();
    }
  }

  function init() {
    var toggle = document.getElementById('chatToggle');
    var panel  = document.getElementById('chatPanel');
    var closeBtn = document.getElementById('chatClose');
    var form = document.getElementById('chatForm');
    var input = document.getElementById('chatInput');

    toggle.addEventListener('click', function () {
      var opening = panel.hidden;
      panel.hidden = !opening;
      toggle.setAttribute('aria-expanded', String(opening));
      if (opening) input.focus();
    });
    closeBtn.addEventListener('click', function () {
      panel.hidden = true;
      toggle.setAttribute('aria-expanded', 'false');
      toggle.focus();
    });
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      send(input.value);
    });
    /* 일부 브라우저/IME 조합에서 암묵적 폼 제출이 안 먹는 경우를 대비해 직접 처리 */
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !e.isComposing && !e.shiftKey) {
        e.preventDefault();
        send(input.value);
      }
    });

    document.querySelectorAll('.chat-suggest').forEach(function (b) {
      b.addEventListener('click', function () { send(b.textContent); });
    });

    restoreHistory();
  }

  /* 페이지를 새로 열어도 KV에 저장된 이전 대화를 이어서 보여준다 */
  async function restoreHistory() {
    if (!sessionId) return;
    try {
      var res = await fetch(App.API_BASE + 'api/chat?sessionId=' + encodeURIComponent(sessionId));
      var data = await res.json();
      var messages = Array.isArray(data.messages) ? data.messages : [];
      if (!messages.length) return;

      var suggests = document.querySelector('.chat-suggests');
      messages.forEach(function (m) {
        if (m.role === 'user' || m.role === 'assistant') bubble(m.role, m.content);
      });
      if (suggests) suggests.hidden = true;   // 이미 대화가 있으면 처음 안내 문구는 굳이 필요 없다
    } catch (e) { /* 복원 실패해도 새 대화로 계속 쓸 수 있으니 조용히 넘어간다 */ }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  /* ── 답변에 언급된 사건·주가 지점을 타임라인에서 하이라이트 ── */
  App.highlightRefs = function (refs) {
    Array.prototype.forEach.call(document.querySelectorAll('.is-chat-highlight'), function (el) {
      el.classList.remove('is-chat-highlight');
    });
    if (!refs || !refs.length) return;

    var scroller = document.getElementById('scroller');
    var found = [];

    refs.forEach(function (ref) {
      if (ref.indexOf('mkt:') === 0) {
        var parts = ref.split(':');
        var mp = App.marketPoints.find(function (p) { return p.mkId === parts[1] && String(p.year) === parts[2]; });
        if (mp) {
          mp.dot.classList.add('is-chat-highlight');
          mp.halo.classList.add('is-chat-highlight');
          found.push({ kind: 'market', x: mp.x, y: mp.y, ref: mp });
        }
      } else {
        var n = App.nodes.find(function (n) { return n.ev.id === ref; });
        if (n) {
          n.el.classList.add('is-chat-highlight');
          found.push({ kind: 'event', x: n.x, y: n.y, ref: n });
        }
      }
    });
    if (!found.length) return;

    /* 카드를 자동으로 펼치지는 않는다 — 챗 패널에 가려 안 보일 수 있고,
       텍스트 답변으로 이미 설명했으니 펄스 하이라이트 + 스크롤만으로 위치를 짚어준다. */
    var first = found[0];
    var panel = document.getElementById('chatPanel');
    var usable = scroller.clientWidth;
    if (panel && !panel.hidden) usable -= panel.getBoundingClientRect().width + 12;
    scroller.scrollTo({
      left: Math.max(0, first.x - Math.max(usable, 160) / 2),
      behavior: App.reduced ? 'auto' : 'smooth'
    });
  };
})();
