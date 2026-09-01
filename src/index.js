const HTML = { "content-type": "text/html; charset=UTF-8", "cache-control": "public, max-age=60" };
const JSON_H = { "content-type": "application/json; charset=UTF-8", "cache-control": "public, max-age=60" };
const JSON_NC = { "content-type": "application/json; charset=UTF-8", "cache-control": "no-store" };

const CHAT_MODEL = "@cf/google/gemma-4-26b-a4b-it";
const MAX_HISTORY_TURNS = 6;    // 프롬프트에 넣는 최근 대화 개수
const MAX_STORED_TURNS = 40;    // KV 에 보관하는 최대 대화 개수
const SESSION_RE = /^[a-zA-Z0-9-]{8,64}$/;

// Cloudflare Pages(epochwave.pages.dev, 브랜치별 프리뷰 포함)에서도 이 API를
// 그대로 호출할 수 있게 CORS를 열어준다. 그 외 오리진은 그냥 허용하지 않는다.
const ALLOWED_ORIGIN_RE = /^https:\/\/([a-z0-9-]+\.)?epochwave\.pages\.dev$/i;

function corsHeaders(request) {
  const origin = request.headers.get("Origin");
  if (!origin || !ALLOWED_ORIGIN_RE.test(origin)) return {};
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "content-type",
    "Vary": "Origin",
  };
}

function chatKey(sessionId) { return `chat:${sessionId}`; }

async function loadHistory(env, sessionId) {
  if (!sessionId) return [];
  const raw = await env.HTML_KV.get(chatKey(sessionId));
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed.messages) ? parsed.messages : [];
  } catch { return []; }
}

async function saveHistory(env, sessionId, messages) {
  if (!sessionId) return;
  const capped = messages.slice(-MAX_STORED_TURNS);
  await env.HTML_KV.put(chatKey(sessionId), JSON.stringify({ messages: capped, updatedAt: Date.now() }));
}

// 연도별 YoY 등락률 중 상위/하위 n개 — 사고 모델이 71개 값을 손으로 다시 계산하며
// max_tokens 를 다 써버리는 걸 막기 위해 서버에서 미리 계산해서 answer-ready 로 준다.
function topMoves(series, n = 3) {
  const moves = [];
  for (let i = 1; i < series.length; i++) {
    const [y, v] = series[i], [, pv] = series[i - 1];
    moves.push({ year: y, pct: Math.round((v - pv) / pv * 1000) / 10 });
  }
  moves.sort((a, b) => b.pct - a.pct);
  return { topGainers: moves.slice(0, n), topLosers: moves.slice(-n).reverse() };
}

function buildSystemPrompt(data) {
  // 사건·주가 데이터를 통째로 근거 자료로 준다 — 지어내지 말고 이 안에서만 답하게 한다.
  const compact = {
    range: data.meta.range,
    events: data.events.map((e) => ({
      id: e.id, year: e.year, month: e.month, title: e.title,
      korea: e.korea && e.korea.headline, world: e.world && e.world.headline,
    })),
    markets: (data.markets || []).map((m) => ({
      id: m.id, label: m.label,
      notes: (m.notes || []).map((n) => ({ year: n.year, headline: n.headline })),
      series: m.series,             // [[연도,값], ...] — 특정 연도 값 조회용
      ...topMoves(m.series),        // 등락률 상위/하위 — 이미 계산됨, 다시 계산하지 말 것
    })),
  };

  return (
    "당신은 'Back to the Future — 1955→2026' 역사 연표 웹사이트의 안내 챗봇이다. " +
    "아래 DATA에 있는 사건과 주가 경제사만 근거로 한국어로 짧고 정확하게 답한다. " +
    "markets[].topGainers/topLosers 에는 연도별 등락률 상위·하위가 이미 계산되어 있다 — " +
    "'가장 많이 오른/떨어진 해' 같은 질문은 이 값을 그대로 인용하고 71개 연도를 직접 재계산하지 마라. " +
    "series 는 특정 연도의 값을 조회할 때만 참고한다. " +
    "DATA에 없는 내용은 추측하지 말고 모른다고 말한다. " +
    "내부적으로 생각할 때는 간결하게 핵심만 짚고, 같은 계산을 여러 번 재확인하지 말고 바로 결론을 낸다.\n\n" +
    "DATA:\n" + JSON.stringify(compact) + "\n\n" +
    "반드시 아래 형식의 순수 JSON 한 개만 출력한다 (마크다운, 설명, 코드블록 금지):\n" +
    '{"reply":"사용자에게 보여줄 한국어 답변(2~4문장)","refs":["관련id", ...]}\n' +
    "refs 규칙: 답변에서 언급한 사건은 그 id를(예:\"1997-11\"), " +
    "언급한 주가 지점은 \"mkt:마켓id:연도\" 형식으로(예:\"mkt:kospi:1997\") 넣는다. " +
    "DATA에 실제로 존재하는 id만 쓰고, 관련 없으면 refs는 빈 배열로 둔다. 최대 5개."
  );
}

function extractJSON(text) {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) return null;
  try { return JSON.parse(text.slice(start, end + 1)); } catch { return null; }
}

// gemma-4-26b-a4b-it 같은 "사고" 모델은 OpenAI 호환 choices[].message 형태로 오고,
// 최종 답은 content 에, 사고 과정은 reasoning 에 따로 담긴다. 토큰이 부족해 잘리면
// content 가 비어 있을 수 있어 reasoning 을 최후의 수단으로 뒤진다.
function extractText(result) {
  if (!result) return "";
  if (typeof result === "string") return result;
  if (typeof result.response === "string" && result.response) return result.response;
  const msg = result.choices && result.choices[0] && result.choices[0].message;
  if (msg) {
    if (typeof msg.content === "string" && msg.content) return msg.content;
    if (typeof msg.reasoning === "string" && msg.reasoning) return msg.reasoning;
  }
  if (result.result) return typeof result.result === "string" ? result.result : (result.result.response || "");
  return "";
}

async function handleChatGet(request, env) {
  const headers = { ...JSON_NC, ...corsHeaders(request) };
  const sessionId = new URL(request.url).searchParams.get("sessionId") || "";
  if (!SESSION_RE.test(sessionId)) return new Response(JSON.stringify({ messages: [] }), { headers });
  const messages = await loadHistory(env, sessionId);
  return new Response(JSON.stringify({ messages }), { headers });
}

async function handleChatPost(request, env) {
  const headers = { ...JSON_NC, ...corsHeaders(request) };

  let body;
  try { body = await request.json(); } catch { return new Response('{"error":"invalid json"}', { status: 400, headers }); }

  const message = (body && body.message || "").toString().slice(0, 800).trim();
  if (!message) return new Response('{"error":"empty message"}', { status: 400, headers });

  const sessionId = typeof body.sessionId === "string" && SESSION_RE.test(body.sessionId) ? body.sessionId : null;

  const rawData = await env.HTML_KV.get("data:events");
  if (!rawData) return new Response('{"error":"no data"}', { status: 503, headers });
  const data = JSON.parse(rawData);

  // KV 에 저장된 대화가 있으면 그걸 근거로, 없으면(세션 없는 요청 등) 클라이언트가 보낸 history 로 대체
  const stored = await loadHistory(env, sessionId);
  const clientHistory = Array.isArray(body.history) ? body.history : [];
  const fullHistory = stored.length ? stored : clientHistory;
  const forPrompt = fullHistory.slice(-MAX_HISTORY_TURNS)
    .filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
    .map((m) => ({ role: m.role, content: m.content.slice(0, 500) }));

  const messages = [
    { role: "system", content: buildSystemPrompt(data) },
    ...forPrompt,
    { role: "user", content: message },
  ];

  // 사고 모델 특성상 가끔 결론을 못 내고 토큰이 잘리는 경우가 있다(finish_reason:"length" + content 없음).
  // 한 번은 그냥 재시도해 본다 — 같은 질문이라도 사고 분량은 매번 달라진다.
  let result, raw, parsed;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      result = await env.AI.run(CHAT_MODEL, { messages, max_tokens: 2048 });
    } catch (err) {
      if (attempt === 1) return new Response(JSON.stringify({ error: "ai_error", detail: String(err) }), { status: 502, headers });
      continue;
    }
    raw = extractText(result);
    parsed = extractJSON(raw);
    if (parsed && typeof parsed.reply === "string") break;
    const truncated = result && result.choices && result.choices[0] && result.choices[0].finish_reason === "length";
    if (!truncated) break;   // 잘린 게 아니라 형식만 안 맞으면 재시도해도 소용없다
  }

  const validEventIds = new Set(data.events.map((e) => e.id));
  const validMarketRefs = new Set();
  for (const m of data.markets || []) for (const [y] of m.series) validMarketRefs.add(`mkt:${m.id}:${y}`);

  const reply = parsed && typeof parsed.reply === "string" ? parsed.reply : raw.trim() || "죄송해요, 답변을 만들지 못했어요.";
  const refs = Array.isArray(parsed && parsed.refs)
    ? parsed.refs.filter((r) => typeof r === "string" && (validEventIds.has(r) || validMarketRefs.has(r))).slice(0, 5)
    : [];

  if (sessionId) {
    await saveHistory(env, sessionId, [
      ...fullHistory,
      { role: "user", content: message, ts: Date.now() },
      { role: "assistant", content: reply, refs, ts: Date.now() },
    ]);
  }

  return new Response(JSON.stringify({ reply, refs }), { headers });
}

async function handleChat(request, env) {
  if (request.method === "GET") return handleChatGet(request, env);
  if (request.method === "POST") return handleChatPost(request, env);
  return new Response("Method Not Allowed", { status: 405 });
}

export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);

    // Cloudflare Pages(다른 오리진)에서 오는 preflight
    if (request.method === "OPTIONS" && (pathname === "/api/history" || pathname === "/api/chat")) {
      return new Response(null, { status: 204, headers: corsHeaders(request) });
    }

    if (pathname === "/api/history") {
      const headers = { ...JSON_H, ...corsHeaders(request) };
      const data = await env.HTML_KV.get("data:events");
      if (!data) return new Response('{"error":"no data"}', { status: 404, headers });
      return new Response(data, { headers });
    }

    if (pathname === "/api/chat") {
      return handleChat(request, env);
    }

    if (pathname === "/" || pathname === "/index.html") {
      const html = await env.HTML_KV.get("page:index");
      if (!html) return new Response("Not deployed yet", { status: 503 });
      return new Response(html, { headers: HTML });
    }

    return new Response("Not Found", { status: 404 });
  },
};
