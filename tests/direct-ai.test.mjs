// AI without the helper (src/parts/40-direct-ai.js), loaded on its own with Umbra's core stubbed:
// storage in memory, and a fake network that records each request and answers like the provider would.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import vm from "node:vm";

const SRC = readFileSync(new URL("../src/parts/40-direct-ai.js", import.meta.url), "utf8");
const HELPER_PY = new URL("../helper/umbra_helper.py", import.meta.url);
const plain = (x) => (x === undefined ? x : JSON.parse(JSON.stringify(x)));
const today = () => { const d = new Date(); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); };

const KEYS = { gemini: "AIzaSyTESTKEY0000000000000000000000000", openai: "sk-test-openai-1234567890", anthropic: "sk-ant-test-0987654321" };
const withKey = (provider, extra) => Object.assign({ provider, [provider + "_key"]: KEYS[provider] }, extra);

/* replies: what the network answers, in order: { status, body } | (req) => that | "hang" | "error" */
function load({ saved, replies = [], LanguageModel } = {}) {
  const mem = new Map();
  if (saved) mem.set("ai-direct", plain(saved));
  const sent = [];
  const queue = [...replies];
  const GM_xmlhttpRequest = (o) => {
    let body;
    try { body = o.data === undefined ? undefined : JSON.parse(o.data); } catch (e) { body = Object.fromEntries(new URLSearchParams(o.data)); } // (a form)
    const req = { method: o.method, url: o.url, headers: Object.assign({}, o.headers), body, anonymous: o.anonymous };
    sent.push(req);
    const next = queue.shift();
    setTimeout(() => {
      const r = typeof next === "function" ? next(req) : next;
      if (r === "hang") return;
      if (!r || r === "error") { o.onerror({}); return; }
      o.onload({ status: r.status || 200, responseText: typeof r.body === "string" ? r.body : JSON.stringify(r.body) });
    });
    return { abort() {} };
  };
  const ctx = {
    console, setTimeout, clearTimeout, AbortController, crypto: globalThis.crypto, URL,
    store: { get: (k, f) => (mem.has(k) ? plain(mem.get(k)) : f), set: (k, v) => mem.set(k, plain(v)), del: (k) => mem.delete(k) },
    prefs: {}, savePrefs() {}, VERSION: "test", wait: (ms) => new Promise((r) => setTimeout(r, ms)), GM_xmlhttpRequest,
    TAB_ID: "tab-1", IN_EXTENSION: false, btoa, atob, TextEncoder, TextDecoder,
  };
  if (LanguageModel) ctx.LanguageModel = LanguageModel;
  vm.createContext(ctx);
  vm.runInContext(SRC, ctx, { filename: "40-direct-ai.js" });
  return {
    sent,
    reply: (...r) => queue.push(...r),
    call: async (path, body, timeout) => plain(await ctx.directHelper(path, body, timeout)),
    raw: (path, body, timeout) => ctx.directHelper(path, body, timeout),
    get: (name) => vm.runInContext(name, ctx),
    saved: () => mem.get("ai-direct"),
    mem,
  };
}

/* ---- what each provider sends back ---- */
const oaText = (text, usage = { input_tokens: 100, output_tokens: 20, input_tokens_details: { cached_tokens: 40 } }) => ({
  status: 200, body: { id: "resp_1", object: "response", status: "completed", output: [{ type: "message", id: "msg_1", role: "assistant", status: "completed", content: [{ type: "output_text", text, annotations: [] }] }], usage },
});
const oaCalls = (calls, usage = { input_tokens: 100, output_tokens: 20, input_tokens_details: { cached_tokens: 40 } }) => ({
  status: 200, body: { id: "resp_2", status: "completed", usage,
    output: [{ type: "reasoning", id: "rs_1", summary: [], encrypted_content: "enc" }].concat(calls.map(([id, name, args]) => ({ type: "function_call", id: "fc_" + id, call_id: id, name, arguments: JSON.stringify(args), status: "completed" }))) },
});
const gmText = (text, usage = { promptTokenCount: 50, candidatesTokenCount: 10, thoughtsTokenCount: 5, cachedContentTokenCount: 20 }) => ({
  status: 200, body: { candidates: [{ content: { role: "model", parts: [{ text }] }, finishReason: "STOP" }], usageMetadata: usage },
});
const gmCall = (name, args, sig) => ({
  status: 200, body: { candidates: [{ content: { role: "model", parts: [Object.assign({ functionCall: { name, args } }, sig ? { thoughtSignature: sig } : {})] } }], usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 2 } },
});
const anText = (text, usage = { input_tokens: 30, output_tokens: 12, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }) => ({
  status: 200, body: { id: "msg_1", type: "message", role: "assistant", model: "claude-haiku-4-5", content: [{ type: "text", text }], stop_reason: "end_turn", usage },
});

const CONTEXT = {
  me: { name: "Mason" },
  accounts: [{ label: "Personal", email: "me@example.com", current: true }, { label: "Work", email: "Me@Work.example" }],
  about: "Builds NumPlay.",
  now: "Thursday, October 8, 2026 at 7:05 PM EDT",
  screen: { where: "Inbox list" },
};

/* =================================================================== the instructions */
test("the instructions and tools are the helper's, word for word", { skip: !existsSync(HELPER_PY) && "no helper here" }, () => {
  const py = readFileSync(HELPER_PY, "utf8");
  const s = load();
  const prompts = s.get("DAI_PROMPTS");
  const pyStr = (name) => {
    const m = py.match(new RegExp("^" + name + ' = """([\\s\\S]*?)"""', "m"));
    assert.ok(m, name + " is in the helper");
    return m[1].replace(/\\(\\|n|"|')/g, (x, c) => (c === "n" ? "\n" : c));
  };
  const names = { brief: "BRIEF_SYSTEM", thread: "THREAD_SYSTEM", points: "POINTS_SYSTEM", find: "FIND_SYSTEM", query: "QUERY_SYSTEM", replies: "REPLIES_SYSTEM", draft: "DRAFT_SYSTEM", profile: "PROFILE_SYSTEM" };
  for (const [k, name] of Object.entries(names)) assert.equal(prompts[k], pyStr(name), k);
  assert.equal(s.get("DAI_AGENT_INSTRUCTIONS"), pyStr("AGENT_INSTRUCTIONS"));
  assert.match(prompts.draft, /with \\n between lines/, "the draft's \\n stays two characters, as in the helper");
  // the tools' descriptions, in order
  const descs = (text) => [...text.matchAll(/"description": ?"((?:[^"\\]|\\.)*)"/g)].map((m) => JSON.parse('"' + m[1] + '"'));
  const pyTools = py.slice(py.indexOf("AGENT_TOOLS = ["), py.indexOf("AGENT_SCHEMA ="));
  assert.deepEqual(descs(JSON.stringify(s.get("DAI_TOOLS"))), descs(pyTools));
  assert.deepEqual(plain(s.get("DAI_TOOLS")).map((t) => t.name), ["search_mail", "read_mail"]);
  assert.equal(s.get("DAI_ROUNDS"), 6);
  assert.equal(s.get("DAI_SESSION_MS"), 1800 * 1000);
});

/* =================================================================== quick jobs */
test("Gemini: a conversation's summary", async () => {
  const s = load({ saved: withKey("gemini"), replies: [gmText('{"summary":"  Moved to Thursday at 1:30.  "}')] });
  const res = await s.call("/summarize", { kind: "thread", subject: "Design review", text: "Can we move it?" });
  assert.deepEqual(res, { summary: "Moved to Thursday at 1:30." });
  const [req] = s.sent;
  assert.equal(req.method, "POST");
  assert.equal(req.url, "https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent");
  assert.equal(req.headers["x-goog-api-key"], KEYS.gemini);
  assert.ok(!req.url.includes(KEYS.gemini), "the key never goes in the address");
  assert.equal(req.anonymous, true, "no cookies go along");
  assert.deepEqual(req.body, {
    systemInstruction: { parts: [{ text: s.get("DAI_PROMPTS").thread }] },
    contents: [{ role: "user", parts: [{ text: "Subject: Design review\n\nCan we move it?" }] }],
    generationConfig: { responseMimeType: "application/json", temperature: 0.2 },
  });
  const u = s.saved().usage;
  assert.deepEqual(u, { day: today(), requests: 1, input: 50, cached: 20, output: 15, kinds: { thread: [1, 65] } });
});

test("Gemini: a model of your own, and what a blocked answer says", async () => {
  const s = load({ saved: withKey("gemini", { model: { gemini: "gemini-2.5-flash" } }), replies: [{ status: 200, body: { promptFeedback: { blockReason: "SAFETY" } } }] });
  await assert.rejects(s.raw("/summarize", { kind: "points", subject: "x", text: "y" }), { message: "Gemini returned nothing (it may have blocked the request)." });
  assert.match(s.sent[0].url, /\/models\/gemini-2\.5-flash:generateContent$/);
});

test("OpenAI: the brief, sent and shaped like the helper's", async () => {
  const lines = [{ text: "Priya wants Thursday.", refs: [0] }, { text: "" }, "loose", { text: "AP Chem lab due Friday.", refs: [1] }, { text: "Third.", refs: [] }, { text: "Fourth.", refs: [] }];
  const s = load({ saved: withKey("openai"), replies: [oaText(JSON.stringify({ lines }))] });
  const items = [{ index: 0, from: "Priya", subject: "Review", preview: "Thursday?", time: "Oct 8", unread: true, important: false, includesMe: true, automated: false }];
  const res = await s.call("/summarize", { kind: "brief", today: "Thu Oct 08 2026", items });
  assert.deepEqual(res, { lines: [lines[0], lines[3], lines[4]] }, "empty lines and strings dropped, at most three");
  const [req] = s.sent;
  assert.equal(req.url, "https://api.openai.com/v1/responses");
  assert.equal(req.headers.Authorization, "Bearer " + KEYS.openai);
  assert.equal(req.headers["Content-Type"], "application/json");
  const schema = plain(s.get("DAI_SCHEMAS")).brief;
  assert.deepEqual(req.body, {
    model: "gpt-5-mini",
    instructions: s.get("DAI_PROMPTS").brief,
    // Python's json.dumps spacing, so the model reads exactly what the helper sent
    input: [{ role: "user", content: '{"today": "Thu Oct 08 2026", "conversations": [{"index": 0, "from": "Priya", "subject": "Review", "preview": "Thursday?", "time": "Oct 8", "unread": true, "important": false, "includesMe": true, "automated": false}]}' }],
    store: false,
    text: { format: { type: "json_schema", name: "brief", schema, strict: true }, verbosity: "low" },
    reasoning: { effort: "none" },
    prompt_cache_key: "umbra-brief",
  });
  assert.deepEqual(s.saved().usage, { day: today(), requests: 1, input: 100, cached: 40, output: 20, kinds: { brief: [1, 120] } });
});

test("OpenAI: a model that turns down a setting is asked again, and remembered", async () => {
  const no = { status: 400, body: { error: { message: "Unsupported value: 'none' is not supported with the 'gpt-5-mini' model. Supported values are: 'minimal', 'low', 'medium', and 'high'.", type: "invalid_request_error", param: "reasoning.effort", code: "unsupported_value" } } };
  const noVerb = { status: 400, body: { error: { message: "Unsupported parameter: 'text.verbosity' is not supported with this model.", param: "text.verbosity" } } };
  const s = load({ saved: withKey("openai"), replies: [no, noVerb, oaText('{"query":"from:priya hike"}'), oaText('{"points":["A."]}')] });
  assert.deepEqual(await s.call("/summarize", { kind: "query", query: "when is the hike?", today: "Thu Oct 08 2026" }), { query: "from:priya hike" });
  assert.equal(s.sent.length, 3);
  assert.deepEqual(s.sent[0].body.reasoning, { effort: "none" });
  assert.deepEqual(s.sent[1].body.reasoning, { effort: "minimal" });
  assert.deepEqual(s.sent[2].body.text, { format: s.sent[0].body.text.format }, "verbosity left out");
  assert.equal(s.sent[0].body.input[0].content, '{"question": "when is the hike?", "today": "Thu Oct 08 2026"}');
  // the next job starts out fitting the model
  await s.call("/summarize", { kind: "points", subject: "s", text: "t" });
  assert.deepEqual(s.sent[3].body.reasoning, { effort: "minimal" });
  assert.equal(s.sent[3].body.text.verbosity, undefined);
  assert.equal(s.saved().usage.requests, 2, "only answers are counted");
});

test("Anthropic: a suggested reply and the points of an email", async () => {
  const s = load({ saved: withKey("anthropic"), replies: [
    anText('Here you go:\n```json\n{"replies":[{"label":"Say yes to Friday, and thank Priya for setting it all up","text":" Friday works, thanks! "},{"label":"Two","text":"Second"}]}\n```'),
    anText('{"points":["  Every project has a long, flat middle. ","That is where the work happens.","Third."," "]}', { input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 90, cache_creation_input_tokens: 0 }),
  ] });
  const res = await s.call("/summarize", { kind: "replies", me: "Mason Chen", about: "Student.", subject: "Friday?", text: "Priya: Does Friday work?" });
  assert.deepEqual(res, { replies: [{ label: "Say yes to Friday, and thank Priya for s", text: "Friday works, thanks!" }] });
  const [req] = s.sent;
  assert.equal(req.url, "https://api.anthropic.com/v1/messages");
  assert.equal(req.headers["x-api-key"], KEYS.anthropic);
  assert.equal(req.headers["anthropic-version"], "2023-06-01");
  assert.deepEqual(req.body, {
    model: "claude-haiku-4-5", max_tokens: 2048, temperature: 0.2, system: s.get("DAI_PROMPTS").replies,
    messages: [{ role: "user", content: "Reader: Mason Chen\nAbout the reader: Student.\nSubject: Friday?\n\nPriya: Does Friday work?" }],
  });
  assert.deepEqual(await s.call("/summarize", { kind: "points", subject: "Newsletter", text: "..." }), { points: ["Every project has a long, flat middle.", "That is where the work happens."] });
  const u = s.saved().usage;
  assert.equal(u.requests, 2);
  assert.equal(u.input, 30 + 100, "input counts what came from the cache too");
  assert.equal(u.cached, 90);
  assert.equal(u.output, 17);
});

test("every job's request text, and what comes back when the answer isn't JSON", async () => {
  const s = load({ saved: withKey("anthropic"), replies: [
    anText("Moved to Thursday."), anText("Sure, here is a draft"), anText('{"answer":" Nov 1, $1,875. ","refs":[0, "1", 2.5, 3, 4, 5, 6]}'), anText('{"facts":["Mason is a student.", 3, ""]}'), anText('{"text":"Hi Priya,\\nFriday works."}'),
  ] });
  assert.deepEqual(await s.call("/summarize", { kind: "thread", subject: "S", text: "T" }), { summary: "Moved to Thursday." });
  assert.deepEqual(await s.call("/summarize", { kind: "draft", me: "Mason", to: "Priya", subject: "S", text: "T" }), { text: "" }, "as in the helper: a draft needs JSON");
  assert.deepEqual(await s.call("/summarize", { kind: "find", query: "renewal?", today: "D", items: [{ index: 0, from: "A", subject: "Renewal", preview: "p", date: "Oct 1" }] }), { answer: "Nov 1, $1,875.", refs: [0, 3, 4, 5, 6] });
  assert.deepEqual(await s.call("/summarize", { kind: "profile", me: "Mason", accounts: [{ label: "Personal", email: "me@example.com" }], people: [], sent: [] }), { facts: ["Mason is a student."] });
  const draft = await s.call("/summarize", { kind: "draft", me: "Mason", about: "", to: "Priya", subject: "S", instruction: "Say yes", draft: "", text: "T" });
  assert.deepEqual(draft, { text: "Hi Priya,\nFriday works." });
  const users = s.sent.map((r) => r.body.messages[0].content);
  assert.equal(users[1], '{"reader": "Mason", "about_reader": "", "to": "Priya", "subject": "S", "instruction": "", "draft": "", "conversation": "T"}');
  assert.equal(users[2], '{"query": "renewal?", "today": "D", "results": [{"index": 0, "from": "A", "subject": "Renewal", "preview": "p", "date": "Oct 1"}]}');
  assert.equal(users[3], '{"me": "Mason", "accounts": [{"label": "Personal", "email": "me@example.com"}], "people": [], "sent": []}');
  assert.deepEqual(s.sent.map((r) => r.body.system), ["thread", "draft", "find", "profile", "draft"].map((k) => s.get("DAI_PROMPTS")[k]));
});

test("long text is cut where the helper cuts it", async () => {
  const s = load({ saved: withKey("gemini"), replies: [gmText('{"summary":"ok"}'), gmText('{"replies":[]}')] });
  await s.call("/summarize", { kind: "thread", subject: "S", text: "x".repeat(20000) });
  assert.equal(s.sent[0].body.contents[0].parts[0].text.length, "Subject: S\n\n".length + 16000);
  await s.call("/summarize", { kind: "replies", me: "M", about: "a".repeat(1000), subject: "S", text: "y".repeat(13000) });
  const t = s.sent[1].body.contents[0].parts[0].text;
  assert.ok(t.startsWith("Reader: M\nAbout the reader: " + "a".repeat(900) + "\nSubject: S\n\n"));
  assert.ok(t.endsWith("y".repeat(12000)) && !t.endsWith("y".repeat(12001)));
});

test("jobs that can't run say why", async () => {
  await assert.rejects(load().raw("/summarize", { kind: "thread", text: "x" }), { message: "Summaries are off." });
  await assert.rejects(load({ saved: { provider: "gemini" } }).raw("/summarize", { kind: "thread" }), { message: "Add a Gemini key in Umbra's settings." });
  await assert.rejects(load({ saved: { provider: "anthropic" } }).raw("/summarize", { kind: "thread" }), { message: "Add an Anthropic key in Umbra's settings." });
  await assert.rejects(load({ saved: withKey("gemini") }).raw("/summarize", { kind: "poem" }), { message: "Unknown request." });
  const s = load({ saved: withKey("openai"), replies: [{ status: 429, body: { error: { message: "Rate limit reached for gpt-5-mini.", code: "rate_limit_exceeded" } } }] });
  await assert.rejects(s.raw("/summarize", { kind: "thread", text: "x" }), { message: "rate_limit_exceeded Rate limit reached for gpt-5-mini." });
  const off = load({ saved: withKey("openai"), replies: ["error"] });
  await assert.rejects(off.raw("/summarize", { kind: "thread", text: "x" }), { message: "Couldn't reach api.openai.com." });
});

test("a caller that stops waiting hears Timed out", async () => {
  const s = load({ saved: withKey("gemini"), replies: ["hang"] });
  await assert.rejects(s.raw("/summarize", { kind: "thread", text: "x" }, 30), { message: "Timed out" });
});

/* =================================================================== status and settings */
test("status: the helper's shape, and never a key", async () => {
  const s = load({ saved: withKey("gemini", { openai_key: KEYS.openai, anthropic_key: KEYS.anthropic, flow: { sheet: "1AbC_def-ghIJKLmnopQRstuv", account: "me@example.com" } }) });
  const st = await s.call("/status", null, 6000);
  assert.deepEqual(st, {
    provider: "gemini", providerName: "Gemini", ready: true, model: "gemini-flash-latest", smart: "", agent: true, usage: {},
    chatgpt: { signedIn: false, email: "", planUsage: false },
    gemini: { hasKey: true }, openai: { hasKey: true }, anthropic: { hasKey: true },
    chrome: { available: false, state: "missing" },
    flow: { sheet: "1AbC_def-ghIJKLmnopQRstuv", account: "me@example.com" }, message: "", direct: true,
  });
  assert.equal(s.sent.length, 0, "a plain status asks no one");
  const text = JSON.stringify(st);
  for (const k of Object.values(KEYS)) assert.ok(!text.includes(k));
  const off = await load().call("/status");
  assert.equal(off.provider, "off");
  assert.equal(off.ready, false);
  assert.equal(off.model, null);
  assert.equal(off.agent, false);
  assert.deepEqual(off.flow, {});
});

test("status with models: each provider's own list", async () => {
  const g = load({ saved: withKey("gemini"), replies: [{ body: { models: [
    { name: "models/gemini-flash-latest", displayName: "Gemini Flash Latest", supportedGenerationMethods: ["generateContent", "countTokens"] },
    { name: "models/text-embedding-004", supportedGenerationMethods: ["embedContent"] },
    { name: "models/gemini-2.5-flash-preview-tts", supportedGenerationMethods: ["generateContent"] },
    { name: "models/gemini-2.5-pro", displayName: "Gemini 2.5 Pro", supportedGenerationMethods: ["generateContent"] },
  ] } }] });
  const st = await g.call("/status?models=1");
  assert.deepEqual(st.models, [{ id: "gemini-flash-latest", name: "Gemini Flash Latest" }, { id: "gemini-2.5-pro", name: "Gemini 2.5 Pro" }]);
  assert.equal(g.sent[0].url, "https://generativelanguage.googleapis.com/v1beta/models?pageSize=200");
  assert.equal(g.sent[0].method, "GET");
  assert.equal(g.sent[0].body, undefined);

  const o = load({ saved: withKey("openai"), replies: [{ body: { data: [{ id: "gpt-5-mini" }, { id: "gpt-4o-realtime-preview" }, { id: "o3" }, { id: "gpt-5" }, { id: "dall-e-3" }, { id: "gpt-5" }] } }] });
  assert.deepEqual((await o.call("/status?models=1")).models, [{ id: "gpt-5", name: "gpt-5" }, { id: "gpt-5-mini", name: "gpt-5-mini" }, { id: "o3", name: "o3" }]);

  const a = load({ saved: withKey("anthropic"), replies: [{ body: { data: [{ id: "claude-sonnet-4-5", display_name: "Claude Sonnet 4.5", type: "model" }, { id: "claude-haiku-4-5", display_name: "Claude Haiku 4.5", type: "model" }], has_more: false } }] });
  const ast = await a.call("/status?models=1");
  assert.deepEqual(ast.models, [{ id: "claude-sonnet-4-5", name: "Claude Sonnet 4.5" }, { id: "claude-haiku-4-5", name: "Claude Haiku 4.5" }]);
  assert.equal(ast.model, "claude-haiku-4-5");
  assert.equal(ast.smart, "claude-sonnet-4-5");
  assert.equal(a.sent[0].url, "https://api.anthropic.com/v1/models?limit=100");
  assert.equal(a.sent[0].headers["anthropic-version"], "2023-06-01");

  // a list that fails says so, and the rest still answers
  const bad = load({ saved: withKey("openai"), replies: [{ status: 500, body: "oops" }] });
  const bst = await bad.call("/status?models=1");
  assert.equal(bst.ready, true);
  assert.equal(bst.models, undefined);
  assert.equal(bst.message, "HTTP 500");
});

test("config: a key is checked before it's kept", async () => {
  const s = load({ replies: [{ body: { models: [{ name: "models/gemini-flash-latest", supportedGenerationMethods: ["generateContent"] }] } }, { body: { models: [] } }] });
  const st = await s.call("/config", { provider: "gemini", gemini_key: "  " + KEYS.gemini + "  " }, 30000);
  assert.equal(s.sent.length, 2, "one check, then the list for the settings");
  for (const r of s.sent) {
    assert.equal(r.headers["x-goog-api-key"], KEYS.gemini);
    assert.ok(!r.url.includes(KEYS.gemini));
  }
  assert.equal(st.provider, "gemini");
  assert.equal(st.ready, true);
  assert.deepEqual(st.gemini, { hasKey: true });
  assert.ok(!JSON.stringify(st).includes(KEYS.gemini));
  assert.equal(s.saved().gemini_key, KEYS.gemini);

  const bad = load({ replies: [{ status: 400, body: { error: { code: 400, message: "API key not valid. Please pass a valid API key.", status: "INVALID_ARGUMENT" } } }] });
  await assert.rejects(bad.raw("/config", { provider: "gemini", gemini_key: "nope" }), { message: "That key didn't work: 400 API key not valid. Please pass a valid API key." });
  assert.equal(bad.saved(), undefined, "nothing changed");

  // OpenAI repeats part of a wrong key in its error: never shown
  const oa = load({ replies: [{ status: 401, body: { error: { message: "Incorrect API key provided: sk-bad-12345***6789. You can find your API key at https://platform.openai.com/account/api-keys.", type: "invalid_request_error", param: null, code: "invalid_api_key" } } }] });
  const err = await oa.raw("/config", { provider: "openai", openai_key: "sk-bad-1234567896789" }).catch((e) => e);
  assert.equal(err.message, "That key didn't work: invalid_api_key Incorrect API key provided: (hidden). You can find your API key at https://platform.openai.com/account/api-keys.");
  assert.equal(oa.sent[0].url, "https://api.openai.com/v1/models");
  assert.equal(oa.sent[0].headers.Authorization, "Bearer sk-bad-1234567896789");

  const an = load({ replies: [{ body: { data: [{ id: "claude-haiku-4-5", display_name: "Claude Haiku 4.5" }] } }, { body: { data: [] } }] });
  const ast = await an.call("/config", { provider: "anthropic", anthropic_key: KEYS.anthropic });
  assert.equal(an.sent[0].url, "https://api.anthropic.com/v1/models?limit=100");
  assert.equal(an.sent[0].headers["x-api-key"], KEYS.anthropic);
  assert.equal(an.sent[0].headers["anthropic-version"], "2023-06-01");
  assert.deepEqual(ast.anthropic, { hasKey: true });
  assert.equal(ast.agent, true);
});

test("config: models, the flow's sheet, forgetting a key, and ChatGPT", async () => {
  const s = load({ saved: withKey("anthropic"), replies: [{ body: { data: [] } }, { body: { data: [] } }, { body: { data: [] } }] });
  let st = await s.call("/config", { smart: "claude-opus-4-1" });
  assert.equal(st.smart, "claude-opus-4-1");
  st = await s.call("/config", { model: "claude-sonnet-4-5" });
  assert.equal(st.model, "claude-sonnet-4-5");
  assert.deepEqual(s.saved().model, { anthropic: "claude-sonnet-4-5" }, "kept per provider");
  await assert.rejects(s.raw("/config", { flow: { sheet: "short" } }), { message: "That isn't a sheet id." });
  st = await s.call("/config", { flow: { sheet: "1AbC_def-ghIJKLmnopQRstuv", account: "  Me@Example.com " } });
  assert.deepEqual(st.flow, { sheet: "1AbC_def-ghIJKLmnopQRstuv", account: "me@example.com" });
  st = await s.call("/config", { provider: "off", flow: { sheet: "" } });
  assert.deepEqual(st.flow, {});
  assert.equal(st.provider, "off");
  st = await s.call("/config", { anthropic_key: null });
  assert.deepEqual(st.anthropic, { hasKey: false });
  assert.equal(s.saved().anthropic_key, undefined);
  st = await s.call("/config", { provider: "chatgpt" });
  assert.equal(st.provider, "chatgpt");
  assert.equal(st.ready, false);
  assert.equal(st.message, "Not signed in yet.");
  await assert.rejects(s.raw("/umbra.user.js", null), { message: "not found" });
});

test("usage is counted per day", async () => {
  const s = load({ saved: withKey("gemini", { usage: { day: "2000-01-01", requests: 9, input: 9, cached: 9, output: 9, kinds: {} } }), replies: [gmText('{"summary":"a"}'), gmText('{"points":["b"]}', { promptTokenCount: 7, candidatesTokenCount: 3 })] });
  assert.deepEqual((await s.call("/status")).usage, {}, "yesterday's isn't today's");
  await s.call("/summarize", { kind: "thread", text: "x" });
  await s.call("/summarize", { kind: "points", text: "y" });
  assert.deepEqual((await s.call("/status")).usage, { day: today(), requests: 2, input: 57, cached: 20, output: 18, kinds: { thread: [1, 65], points: [1, 10] } });
});

test("/log sends nothing anywhere", async () => {
  const s = load({ saved: withKey("openai") });
  assert.deepEqual(await s.call("/log", { event: "boot", data: { n: 1 }, version: "1" }, 5000), {});
  assert.equal(s.sent.length, 0);
});

/* =================================================================== questions */
test("OpenAI agent: a search, its results, an answer with sources, a follow-up", async () => {
  const s = load({ saved: withKey("openai"), replies: [oaCalls([["call_1", "search_mail", { account: "all", query: "hike" }]])] });
  const q = "When do the buses leave for the hike?";
  const first = await s.call("/agent", { op: "start", question: q, context: CONTEXT }, 90000);
  assert.equal(first.status, "tools");
  assert.match(first.id, /^[0-9a-f]{16}$/);
  assert.deepEqual(first.tasks, [{ call: "call_1", tool: "search", query: "hike", accounts: ["me@example.com", "me@work.example"] }]);
  assert.deepEqual(first.usage, { input_tokens: 100, output_tokens: 20, cached: 40 });

  const [r1] = s.sent;
  assert.equal(r1.url, "https://api.openai.com/v1/responses");
  assert.equal(r1.body.model, "gpt-5-mini");
  assert.equal(r1.body.instructions, s.get("DAI_AGENT_INSTRUCTIONS"));
  assert.deepEqual(r1.body.tools, plain(s.get("DAI_TOOLS")));
  assert.equal(r1.body.parallel_tool_calls, true);
  assert.equal(r1.body.tool_choice, undefined);
  assert.deepEqual(r1.body.text.format, { type: "json_schema", name: "answer", schema: plain(s.get("DAI_AGENT_SCHEMA"))[1], strict: true });
  assert.deepEqual(r1.body.reasoning, { effort: "low" });
  assert.deepEqual(r1.body.include, ["reasoning.encrypted_content"]);
  assert.equal(r1.body.prompt_cache_key, "umbra-agent-1");
  assert.equal(r1.body.store, false);
  assert.deepEqual(r1.body.input, [
    { role: "developer", content: 'Reader: Mason.\nAccounts: "Personal" = me@example.com (this tab); "Work" = Me@Work.example.\nNotes about the reader:\nBuilds NumPlay.' },
    { role: "developer", content: "Now: Thursday, October 8, 2026 at 7:05 PM EDT.\nOn screen: Inbox list." },
    { role: "user", content: q },
  ]);

  s.reply(oaText('{"answer":"Saturday at 7:15 AM, from the school.","sources":["p1","[P1]","zz"]}'));
  const results = [{ call: "call_1", byAccount: {
    "me@example.com": { rows: [{ id: "18f2a", from: "Priya", subject: "Saturday hike", snippet: "Buses leave at 7:15", date: "Oct 1", unread: true, count: 3,
      excerpt: { from: "Priya", email: "priya@example.com", date: "Oct 1", text: "The buses leave at 7:15 AM\n\nfrom the school." } }], more: true },
    "me@work.example": { rows: [] },
  } }];
  const done = await s.call("/agent", { op: "results", id: first.id, results }, 90000);
  assert.deepEqual(done, {
    id: first.id, status: "done", answer: "Saturday at 7:15 AM, from the school.",
    sources: [{ acct: "me@example.com", id: "18f2a", subject: "Saturday hike", from: "Priya", date: "Oct 1" }],
    usage: { input_tokens: 200, output_tokens: 40, cached: 80 }, rounds: 2,
  });
  const r2 = s.sent[1].body;
  assert.equal(r2.input.length, 6);
  assert.equal(r2.input[3].type, "reasoning");
  assert.equal(r2.input[3].encrypted_content, "enc");
  assert.equal(r2.input[4].type, "function_call");
  assert.deepEqual(r2.input[5], { type: "function_call_output", call_id: "call_1", output:
    'Personal: 1 result for "hike" (more exist)\n' +
    "[p1] Oct 1 · Priya · Saturday hike · Buses leave at 7:15 (unread, 3 messages)\n" +
    "    latest, Priya <priya@example.com>, Oct 1: The buses leave at 7:15 AM  from the school.\n\n" +
    'Work: nothing found for "hike".' });

  // a follow-up goes on in the same conversation
  s.reply(oaText('{"answer":"About an hour.","sources":[]}'));
  const more = await s.call("/agent", { op: "ask", id: first.id, question: "How long is the ride?" });
  assert.equal(more.answer, "About an hour.");
  assert.equal(more.rounds, 1);
  const r3 = s.sent[2].body.input;
  assert.equal(r3[6].type, "message");
  assert.deepEqual(r3[7], { role: "user", content: "How long is the ride?" });

  assert.deepEqual(await s.call("/agent", { op: "drop", id: first.id }), { ok: true });
  await assert.rejects(s.raw("/agent", { op: "results", id: first.id, results: [] }), { message: "That question expired. Ask again." });
  assert.equal((await s.call("/status")).usage.kinds.ask[0], 3);
});

test("Anthropic agent: reading the conversation on screen", async () => {
  const screen = { acct: "me@example.com", id: "18f2a", subject: "Saturday hike", from: "Priya", count: 3 };
  const s = load({ saved: withKey("anthropic"), replies: [{ status: 200, body: { id: "msg_1", type: "message", role: "assistant", stop_reason: "tool_use",
    content: [{ type: "text", text: "Reading it." }, { type: "tool_use", id: "toolu_1", name: "read_mail", input: { refs: ["[p1]", "p9"] } }],
    usage: { input_tokens: 30, output_tokens: 12 } } }] });
  const first = await s.call("/agent", { op: "start", question: "When is this?", context: Object.assign({}, CONTEXT, { screen }) });
  assert.deepEqual(first.tasks, [{ call: "toolu_1", tool: "read", threads: [{ ref: "p1", acct: "me@example.com", id: "18f2a", subject: "Saturday hike" }], missing: ["p9"] }]);
  const r1 = s.sent[0];
  assert.equal(r1.url, "https://api.anthropic.com/v1/messages");
  assert.equal(r1.headers["anthropic-version"], "2023-06-01");
  assert.equal(r1.body.model, "claude-sonnet-4-5");
  assert.deepEqual(r1.body.tool_choice, { type: "auto" });
  assert.deepEqual(r1.body.tools.map((t) => [t.name, t.input_schema.required]), [["search_mail", ["account", "query"]], ["read_mail", ["refs"]]]);
  assert.equal(r1.body.system[0].text, s.get("DAI_AGENT_INSTRUCTIONS") + s.get("DAI_ANSWER_JSON"));
  assert.deepEqual(r1.body.system[0].cache_control, { type: "ephemeral" });
  assert.equal(r1.body.system[2].text, 'Now: Thursday, October 8, 2026 at 7:05 PM EDT.\nOn screen: the conversation [p1] from Priya, 3 messages, in Personal. Subject (untrusted): "Saturday hike"');
  assert.deepEqual(r1.body.messages, [{ role: "user", content: "When is this?" }]);

  s.reply(anText('```json\n{"answer":"7:15 AM on Saturday.","sources":["p1"]}\n```', { input_tokens: 10, output_tokens: 20, cache_read_input_tokens: 1000, cache_creation_input_tokens: 0 }));
  const done = await s.call("/agent", { op: "results", id: first.id, results: [{ call: "toolu_1", threads: [{ ref: "p1", subject: "Saturday hike", messages: [
    { from: "Priya", email: "priya@example.com", date: "Oct 1", to: [["Mason", "me@example.com"]], text: "Buses at 7:15.", files: ["map.pdf"] },
    { from: "Mason", email: "me@example.com", date: "Oct 2", to: [["Priya", "priya@example.com"]], text: "Thanks!", files: [] },
  ] }] }] });
  assert.equal(done.answer, "7:15 AM on Saturday.");
  assert.deepEqual(done.sources, [{ acct: "me@example.com", id: "18f2a", subject: "Saturday hike", from: "Priya", date: "" }]);
  assert.deepEqual(done.usage, { input_tokens: 1040, output_tokens: 32, cached: 1000 });
  assert.deepEqual(s.sent[1].body.messages, [
    { role: "user", content: "When is this?" },
    { role: "assistant", content: [{ type: "text", text: "Reading it." }, { type: "tool_use", id: "toolu_1", name: "read_mail", input: { refs: ["[p1]", "p9"] } }] },
    { role: "user", content: [{ type: "tool_result", tool_use_id: "toolu_1", content:
      "[p1] Saturday hike (Personal, 2 messages)\n\n— Priya <priya@example.com> · Oct 1 · to you · files: map.pdf\nBuses at 7:15.\n\n— you · Oct 2 · to Priya <priya@example.com>\nThanks!\n\nUnknown ref(s): p9." }] },
  ]);
});

test("Gemini agent: an impossible call answered at once, and the last round can't use tools", async () => {
  const s = load({ saved: withKey("gemini"), replies: [gmCall("search_mail", { account: "Nope", query: "x" }, "sig1"), gmCall("search_mail", { account: "work", query: "invoice" })] });
  const first = await s.call("/agent", { op: "start", question: "Did the invoice come?", context: CONTEXT });
  assert.equal(s.sent.length, 2, "the unknown account went straight back to the model");
  assert.deepEqual(first.tasks, [{ call: "g2", tool: "search", query: "invoice", accounts: ["me@work.example"] }]);
  const r1 = s.sent[0];
  assert.equal(r1.url, "https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent");
  assert.deepEqual(r1.body.toolConfig, { functionCallingConfig: { mode: "AUTO" } });
  assert.equal(r1.body.generationConfig, undefined, "no JSON-only answers alongside tools");
  assert.deepEqual(r1.body.tools[0].functionDeclarations[0].parameters, { type: "object", properties: { account: { type: "string", description: "An account label from the context, or \"all\"." }, query: { type: "string", description: "A Gmail search query." } }, required: ["account", "query"] });
  assert.equal(r1.body.systemInstruction.parts.length, 3);
  assert.deepEqual(r1.body.contents, [{ role: "user", parts: [{ text: "Did the invoice come?" }] }]);
  assert.deepEqual(s.sent[1].body.contents.slice(1), [
    { role: "model", parts: [{ functionCall: { name: "search_mail", args: { account: "Nope", query: "x" } }, thoughtSignature: "sig1" }] },
    { role: "user", parts: [{ functionResponse: { name: "search_mail", response: { result: "No account called 'Nope'. Accounts: Personal, Work." } } }] },
  ]);
  // keep searching until the rounds run out: the seventh round is told to answer
  let res = first;
  for (let i = 0; i < 4; i++) {
    s.reply(gmCall("search_mail", { account: "all", query: "invoice " + i }));
    res = await s.call("/agent", { op: "results", id: res.id, results: [{ call: res.tasks[0].call, byAccount: {} }] });
    assert.equal(res.status, "tools");
  }
  s.reply(gmText('{"answer":"No invoice has come yet.","sources":[]}'));
  res = await s.call("/agent", { op: "results", id: res.id, results: [] });
  assert.equal(res.status, "done");
  assert.equal(res.answer, "No invoice has come yet.");
  assert.equal(res.rounds, 7);
  assert.deepEqual(s.sent.map((r) => r.body.toolConfig.functionCallingConfig.mode), ["AUTO", "AUTO", "AUTO", "AUTO", "AUTO", "AUTO", "NONE"]);
  const last = s.sent[6].body.contents;
  assert.deepEqual(last[last.length - 1], { role: "user", parts: [{ functionResponse: { name: "search_mail", response: { result: "Personal: couldn't search (no result).\n\nWork: couldn't search (no result)." } } }] });
});

test("questions that can't be asked", async () => {
  await assert.rejects(load({ saved: withKey("openai") }).raw("/agent", { op: "start", question: "q", context: { accounts: [] } }), { message: "No accounts." });
  await assert.rejects(load({ saved: { provider: "chrome" } }).raw("/agent", { op: "start", question: "q", context: CONTEXT }), { message: "Questions need ChatGPT, or a Gemini, OpenAI or Anthropic key, in Umbra's settings." });
  await assert.rejects(load({ saved: withKey("openai") }).raw("/agent", { op: "ask", id: "nope", question: "q" }), { message: "That question expired. Ask again." });
  // a session made with one provider ends when the provider changes
  const s = load({ saved: withKey("openai", { gemini_key: KEYS.gemini }), replies: [oaText('{"answer":"Yes.","sources":[]}'), { body: { models: [] } }] });
  const done = await s.call("/agent", { op: "start", question: "q", context: CONTEXT });
  await s.call("/config", { provider: "gemini" });
  await assert.rejects(s.raw("/agent", { op: "ask", id: done.id, question: "and?" }), { message: "That question expired. Ask again." });
  await assert.rejects(s.raw("/agent", { op: "jump", id: done.id }), { message: "Unknown step." });
});

/* =================================================================== Chrome's built-in model */
function fakeLM(state, answer) {
  const log = { created: [], prompts: [], destroyed: 0 };
  const LanguageModel = {
    availability: async () => state,
    create: async (opts) => {
      log.created.push(plain(opts || {}));
      return { inputUsage: 120, prompt: async (text, o) => { log.prompts.push([text, plain(o)]); return answer; }, destroy() { log.destroyed++; } };
    },
  };
  return { log, LanguageModel };
}

test("Chrome: not in this browser, or can't run here", async () => {
  const none = load({ saved: { provider: "chrome" } });
  const st = await none.call("/status");
  assert.equal(st.ready, false);
  assert.equal(st.agent, false);
  assert.deepEqual(st.chrome, { available: false, state: "missing" });
  assert.match(st.message, /isn't in this browser/);
  await assert.rejects(none.raw("/summarize", { kind: "thread", text: "x" }), { message: st.message });

  const no = load({ saved: { provider: "chrome" }, LanguageModel: fakeLM("unavailable").LanguageModel });
  const st2 = await no.call("/status?models=1");
  assert.deepEqual(st2.chrome, { available: false, state: "unavailable" });
  assert.match(st2.message, /can't run here/);
  assert.equal(st2.models, undefined);
});

test("Chrome: choosing it starts the model's download", async () => {
  const lm = fakeLM("downloadable");
  const s = load({ LanguageModel: lm.LanguageModel });
  const st = await s.call("/config", { provider: "chrome" });
  assert.equal(st.provider, "chrome");
  assert.equal(st.ready, false);
  assert.match(st.message, /download/);
  await new Promise((r) => setTimeout(r, 5));
  assert.equal(lm.log.created.length, 1);
  assert.equal(lm.log.destroyed, 1);
  assert.equal(s.sent.length, 0);
});

test("Chrome: a job on this computer, held to the job's JSON", async () => {
  const lm = fakeLM("available", '{"points":["One.","Two.","Three."]}');
  const s = load({ saved: { provider: "chrome" }, LanguageModel: lm.LanguageModel });
  const st = await s.call("/status?models=1");
  assert.equal(st.ready, true);
  assert.deepEqual(st.chrome, { available: true, state: "available" });
  assert.deepEqual(st.models, [{ id: "gemini-nano", name: "Gemini Nano (on this computer)" }]);
  assert.deepEqual(await s.call("/summarize", { kind: "points", subject: "S", text: "T" }), { points: ["One.", "Two."] });
  assert.deepEqual(lm.log.created[0].initialPrompts, [{ role: "system", content: s.get("DAI_PROMPTS").points }]);
  assert.equal(lm.log.prompts[0][0], "Subject: S\n\nT");
  assert.deepEqual(lm.log.prompts[0][1].responseConstraint, { type: "object", properties: { points: { type: "array", items: { type: "string" } } }, required: ["points"] });
  assert.equal(lm.log.destroyed, 1);
  assert.equal(s.sent.length, 0, "nothing leaves the computer");
  const u = (await s.call("/status")).usage;
  assert.equal(u.requests, 1);
  assert.equal(u.input, 120);
});

/* =================================================================== ChatGPT, signed in from the browser */
const b64u = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const idToken = (claims) => b64u({ alg: "RS256", kid: "k1" }) + "." + b64u(claims) + ".c2ln";
const sse = (events) => ({ status: 200, body: events.map((e) => "event: " + e.type + "\ndata: " + JSON.stringify(e) + "\n\n").join("") });

test("ChatGPT: sign in, a job on the plan, a renewal, signing out", async () => {
  const s = load({});
  // the start: everything OpenAI's sign-in for open-source apps asks for, and the secret kept here
  const start = await s.call("/chatgpt/start", {});
  const u = new URL(start.url);
  assert.equal(u.origin + u.pathname, "https://auth.openai.com/api/accounts/authorize");
  const q = Object.fromEntries(u.searchParams);
  assert.equal(q.client_id, "dynamic_agent_client");
  assert.equal(q.agent_name_hint, "Umbra Mail");
  assert.match(q.ext_agent_host_id, /^urn:uuid:/);
  assert.equal(q.redirect_uri, "http://127.0.0.1:47824/auth/callback");
  assert.equal(q.scope, "openid profile email offline_access resource.invoke chatgpt.tokens.use.direct");
  assert.equal(q.resource, "https://api.openai.com/v1");
  assert.equal(q.code_challenge_method, "S256");
  const pend = s.mem.get("chatgpt-pending");
  const challenge = Buffer.from(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(pend.verifier))).toString("base64url");
  assert.equal(q.code_challenge, challenge, "the challenge is the verifier's hash");
  assert.equal(pend.state, q.state);
  assert.equal(pend.tab, "tab-1");
  assert.equal(start.auto, false, "a userscript asks for the address to be pasted");
  // a pasted address from another try, or not ChatGPT's at all
  await assert.rejects(s.raw("/chatgpt/finish", { url: "https://example.com/?code=x" }), /starts with http:\/\/127\.0\.0\.1/);
  await assert.rejects(s.raw("/chatgpt/finish", { url: "http://127.0.0.1:47824/auth/callback?code=c&state=other" }), /earlier try/);
  // the real one: the code becomes tokens (with the secret), the ID token is checked
  const claims = { iss: "https://auth.openai.com", aud: ["oaiapp_123"], nonce: pend.nonce, exp: Math.floor(Date.now() / 1000) + 3600, email: "me@example.com", sub: "user-1" };
  s.reply({ status: 200, body: { access_token: "at1", refresh_token: "rt1", id_token: idToken(claims), expires_in: 3600, scope: "openid profile email offline_access resource.invoke chatgpt.tokens.use.direct" } },
    "error", // (OpenAI's keys can't be fetched: the token came straight from OpenAI over HTTPS)
    { status: 200, body: { models: [{ slug: "gpt-6.1-sol", display_name: "GPT-6.1 Sol", visibility: "list" }, { slug: "gpt-6.1-mini", display_name: "GPT-6.1 mini", visibility: "list" }, { slug: "hidden", visibility: "hide" }] } },
    { status: 200, body: { models: [{ slug: "gpt-6.1-sol", visibility: "list" }, { slug: "gpt-6.1-mini", visibility: "list" }] } });
  const st = await s.call("/chatgpt/finish", { url: "http://127.0.0.1:47824/auth/callback?code=c0de&state=" + encodeURIComponent(q.state) + "&client_id=oaiapp_123" });
  const tokenReq = s.sent[0];
  assert.equal(tokenReq.url, "https://auth.openai.com/api/accounts/oauth/token");
  assert.equal(tokenReq.headers["Content-Type"], "application/x-www-form-urlencoded");
  assert.deepEqual(plain(tokenReq.body), { grant_type: "authorization_code", client_id: "oaiapp_123", code: "c0de", code_verifier: pend.verifier, redirect_uri: "http://127.0.0.1:47824/auth/callback", resource: "https://api.openai.com/v1" });
  assert.equal(tokenReq.anonymous, true, "no cookies");
  assert.equal(st.provider, "chatgpt");
  assert.equal(st.ready, true);
  assert.deepEqual(st.chatgpt, { signedIn: true, email: "me@example.com", planUsage: true });
  assert.deepEqual(st.models.map((m) => m.id), ["gpt-6.1-sol", "gpt-6.1-mini"], "only the listed ones");
  assert.equal(st.model, "gpt-6.1-mini");
  assert.equal(st.smart, "gpt-6.1-sol");
  assert.equal(s.mem.get("chatgpt-pending"), undefined, "each sign-in, once");
  assert.equal(JSON.stringify(await s.call("/status")).includes("at1"), false, "no token in what /status says");
  // a job on the plan: streamed, stored nowhere, the token as the key
  s.sent.length = 0;
  s.reply(sse([{ type: "response.output_text.delta", delta: '{"summary":' }, { type: "response.output_item.done", item: { type: "message", content: [{ type: "output_text", text: '{"summary":"Moved to Thursday."}' }] } },
    { type: "response.completed", response: { status: "completed", usage: { input_tokens: 10, output_tokens: 4 } } }]));
  const r = await s.call("/summarize", { kind: "thread", subject: "Plan", text: "Moved to Thursday." });
  assert.deepEqual(r, { summary: "Moved to Thursday." });
  assert.equal(s.sent[0].url, "https://api.openai.com/v1/responses");
  assert.equal(s.sent[0].headers.Authorization, "Bearer at1");
  assert.equal(s.sent[0].body.stream, true);
  assert.equal(s.sent[0].body.store, false);
  assert.equal(s.sent[0].body.model, "gpt-6.1-mini");
  // an hour on: renewed first (the refresh token is replaced too)
  const cfg = s.saved();
  cfg.chatgpt.expires_at = Date.now() - 1000;
  s.mem.set("ai-direct", cfg);
  s.sent.length = 0;
  s.reply({ status: 200, body: { access_token: "at2", refresh_token: "rt2", expires_in: 3600 } }, sse([{ type: "response.completed", response: { status: "completed", output: [{ type: "message", content: [{ type: "output_text", text: '{"points":["One."]}' }] }] } }]));
  assert.deepEqual(await s.call("/summarize", { kind: "points", subject: "x", text: "y" }), { points: ["One."] });
  assert.deepEqual(plain(s.sent[0].body), { grant_type: "refresh_token", client_id: "oaiapp_123", refresh_token: "rt1", resource: "https://api.openai.com/v1" });
  assert.equal(s.sent[1].headers.Authorization, "Bearer at2");
  assert.equal(s.saved().chatgpt.refresh_token, "rt2");
  // ChatGPT's own words when the plan can't be used
  s.reply({ status: 429, body: { error: { code: "subscription_sharing_usage_limit_exceeded", message: "limit" } } });
  await assert.rejects(s.raw("/summarize", { kind: "points", subject: "x", text: "z" }), /ChatGPT › Settings › Usage/);
  // signing out: the refresh token is revoked at OpenAI, and the tokens are gone from here
  s.sent.length = 0;
  s.reply({ status: 200, body: { revocation_endpoint: "https://auth.openai.com/oauth/revoke" } }, { status: 200, body: {} });
  const out = await s.call("/chatgpt/signout", {});
  assert.equal(s.sent[1].url, "https://auth.openai.com/oauth/revoke");
  assert.equal(s.sent[1].body.token, "rt2");
  assert.equal(out.provider, "off");
  assert.equal(out.chatgpt.signedIn, false);
  assert.equal(s.saved().chatgpt.client_id, "oaiapp_123", "the registration is kept for next time");
  // the next sign-in reuses it
  const again = Object.fromEntries(new URL((await s.call("/chatgpt/start", {})).url).searchParams);
  assert.equal(again.client_id, "oaiapp_123");
  assert.equal(again.agent_name_hint, undefined);
  assert.equal(again.login_hint, "me@example.com");
});

test("ChatGPT: a sign-in that didn't match, or wasn't allowed", async () => {
  const s = load({});
  let q = Object.fromEntries(new URL((await s.call("/chatgpt/start", {})).url).searchParams);
  await assert.rejects(s.raw("/chatgpt/finish", { url: "http://127.0.0.1:47824/auth/callback?error=access_denied&state=" + q.state }), /didn't allow/);
  q = Object.fromEntries(new URL((await s.call("/chatgpt/start", {})).url).searchParams);
  const bad = { iss: "https://auth.openai.com", aud: "oaiapp_9", nonce: "not-ours", exp: Math.floor(Date.now() / 1000) + 3600 };
  s.reply({ status: 200, body: { access_token: "a", refresh_token: "r", id_token: idToken(bad), expires_in: 3600, scope: "openid" } });
  await assert.rejects(s.raw("/chatgpt/finish", { url: "http://127.0.0.1:47824/auth/callback?code=c&client_id=oaiapp_9&state=" + q.state }), /didn't match/);
  assert.equal(s.saved().chatgpt.access_token, undefined, "nothing kept");
});
