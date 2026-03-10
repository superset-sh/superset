#!/usr/bin/env node
/**
 * Antigravity Remote Control — Server
 *
 * 원격 Mac에서 실행. HTTP API로 Antigravity IDE의 Agent 프롬프트를 제어한다.
 * macOS Accessibility API (JXA)를 사용하므로 반드시 macOS에서 실행해야 한다.
 *
 * 사용법:
 *   node server.mjs                    # 기본 포트 9300
 *   node server.mjs --port 9301        # 커스텀 포트
 *   node server.mjs --port 9301 --key my-secret  # API 키 인증
 *
 * API:
 *   POST /type    { "text": "hello world" }          → 프롬프트에 텍스트 입력
 *   POST /send    { "text": "hello world" }          → 텍스트 입력 + Enter 전송
 *   POST /enter                                       → Enter 키만 전송
 *   POST /clear                                       → 프롬프트 내용 지우기
 *   GET  /status                                      → 연결 상태 확인
 *   GET  /read                                        → 현재 프롬프트 내용 읽기
 */

import { createServer } from "node:http";
import { execFileSync } from "node:child_process";
import { parseArgs } from "node:util";

// ---------------------------------------------------------------------------
// Args
// ---------------------------------------------------------------------------

const { values: args } = parseArgs({
  options: {
    port: { type: "string", short: "p", default: "9300" },
    key: { type: "string", short: "k", default: "" },
    process: { type: "string", default: "Electron" },
    help: { type: "boolean", short: "h", default: false },
  },
});

if (args.help) {
  console.log(`
Antigravity Remote Control Server

Usage:
  node server.mjs [options]

Options:
  -p, --port <port>       Listen port (default: 9300)
  -k, --key <key>         API key for authentication
  --process <name>        macOS process name (default: Electron)
  -h, --help              Show help
`);
  process.exit(0);
}

const PORT = parseInt(args.port, 10);
const API_KEY = args.key;
const PROCESS_NAME = args.process;

// ---------------------------------------------------------------------------
// Accessibility path cache
// ---------------------------------------------------------------------------

/** @type {number[] | null} */
let cachedPath = null;

// ---------------------------------------------------------------------------
// JXA helpers
// ---------------------------------------------------------------------------

function runJxa(code, timeout = 15000) {
  return execFileSync("osascript", ["-l", "JavaScript", "-e", code], {
    timeout,
    encoding: "utf-8",
  }).trim();
}

/**
 * AXTextArea 탐색 — 캐시된 경로가 있으면 먼저 시도, 없으면 전체 탐색
 * @returns {number[]} element path
 */
function findTextArea() {
  if (cachedPath) {
    // Verify cached path is still valid
    const verify = runJxa(buildVerifyJxa(cachedPath));
    if (verify === "AXTextArea") return cachedPath;
    cachedPath = null; // invalidate
  }

  // Full search
  const jxa = [
    "function run() {",
    `  const se = Application("System Events");`,
    `  const proc = se.processes.byName("${PROCESS_NAME}");`,
    "  const win = proc.windows[0];",
    "  if (!win) return JSON.stringify({error: 'no window'});",
    "  let found = null;",
    "  let searched = 0;",
    "  function search(el, depth, path) {",
    "    if (found || depth > 30 || searched > 10000) return;",
    "    searched++;",
    "    try {",
    '      if (el.role() === "AXTextArea") {',
    '        let rd = ""; try { rd = el.roleDescription(); } catch(e) {}',
    '        if (rd.includes("텍스트") || rd.includes("text")) {',
    "          found = path;",
    "          return;",
    "        }",
    "      }",
    "      const ch = el.uiElements();",
    "      for (let i = 0; i < ch.length; i++) {",
    "        search(ch[i], depth + 1, path.concat(i));",
    "      }",
    "    } catch(e) {}",
    "  }",
    "  search(win, 0, []);",
    "  return JSON.stringify({searched, path: found});",
    "}",
  ].join("\n");

  const result = JSON.parse(runJxa(jxa, 60000));
  if (result.error) throw new Error(result.error);
  if (!result.path) throw new Error("AXTextArea not found (searched " + result.searched + " elements)");

  cachedPath = result.path;
  return cachedPath;
}

function buildVerifyJxa(path) {
  const nav = path.map((i) => `.uiElements[${i}]`).join("");
  return [
    "function run() {",
    `  const se = Application("System Events");`,
    `  try {`,
    `    return se.processes.byName("${PROCESS_NAME}").windows[0]${nav}.role();`,
    `  } catch(e) { return "error"; }`,
    "}",
  ].join("\n");
}

function buildNavCode(path) {
  return [
    `const se = Application("System Events");`,
    `const proc = se.processes.byName("${PROCESS_NAME}");`,
    `let el = proc.windows[0];`,
    ...path.map((i) => `el = el.uiElements[${i}];`),
  ].join("\n");
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

function typeText(text) {
  const path = findTextArea();
  // Escape text for JXA string
  const escaped = text.replace(/\\/g, "\\\\").replace(/"/g, '\\"');

  const jxa = [
    "function run() {",
    buildNavCode(path),
    "  proc.frontmost = true;",
    "  delay(0.2);",
    "  try { el.focused = true; } catch(e) {}",
    "  delay(0.2);",
    '  se.keystroke("a", {using: "command down"});',
    "  delay(0.1);",
    "  se.keyCode(51);", // Delete
    "  delay(0.1);",
    `  se.keystroke("${escaped}");`,
    "  delay(0.2);",
    '  let v = ""; try { v = el.value(); } catch(e) {}',
    "  return JSON.stringify({ok: true, value: v});",
    "}",
  ].join("\n");

  return JSON.parse(runJxa(jxa));
}

function pressEnter() {
  const jxa = [
    "function run() {",
    `  const se = Application("System Events");`,
    `  const proc = se.processes.byName("${PROCESS_NAME}");`,
    "  proc.frontmost = true;",
    "  delay(0.1);",
    "  se.keyCode(36);", // Return
    "  delay(0.2);",
    '  return JSON.stringify({ok: true});',
    "}",
  ].join("\n");

  return JSON.parse(runJxa(jxa));
}

function sendText(text) {
  const result = typeText(text);
  if (!result.ok) return result;
  // Small delay before sending
  execFileSync("sleep", ["0.3"]);
  return pressEnter();
}

function clearPrompt() {
  const path = findTextArea();
  const jxa = [
    "function run() {",
    buildNavCode(path),
    "  proc.frontmost = true;",
    "  delay(0.2);",
    "  try { el.focused = true; } catch(e) {}",
    "  delay(0.2);",
    '  se.keystroke("a", {using: "command down"});',
    "  delay(0.1);",
    "  se.keyCode(51);",
    "  delay(0.1);",
    '  return JSON.stringify({ok: true});',
    "}",
  ].join("\n");

  return JSON.parse(runJxa(jxa));
}

function readPrompt() {
  const path = findTextArea();
  const nav = path.map((i) => `.uiElements[${i}]`).join("");

  const jxa = [
    "function run() {",
    `  const se = Application("System Events");`,
    `  const el = se.processes.byName("${PROCESS_NAME}").windows[0]${nav};`,
    '  let v = ""; try { v = el.value(); } catch(e) {}',
    "  return JSON.stringify({ok: true, value: v});",
    "}",
  ].join("\n");

  return JSON.parse(runJxa(jxa));
}

function getStatus() {
  const jxa = [
    "function run() {",
    `  const se = Application("System Events");`,
    `  const procs = se.processes.whose({name: "${PROCESS_NAME}"});`,
    "  if (procs.length === 0) return JSON.stringify({ok: false, error: 'process not found'});",
    "  const wc = procs[0].windows.length;",
    "  return JSON.stringify({ok: true, process: procs[0].name(), windows: wc});",
    "}",
  ].join("\n");

  const result = JSON.parse(runJxa(jxa, 5000));
  result.cachedPath = cachedPath;
  return result;
}

// ---------------------------------------------------------------------------
// HTTP Server
// ---------------------------------------------------------------------------

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString();
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

const server = createServer(async (req, res) => {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  // Auth
  if (API_KEY) {
    const auth = req.headers.authorization;
    if (auth !== `Bearer ${API_KEY}`) {
      res.writeHead(401, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Unauthorized" }));
      return;
    }
  }

  const url = new URL(req.url, `http://localhost:${PORT}`);
  const path = url.pathname;

  const json = (status, data) => {
    res.writeHead(status, { "Content-Type": "application/json" });
    res.end(JSON.stringify(data));
  };

  try {
    if (req.method === "GET" && path === "/status") {
      json(200, getStatus());
    } else if (req.method === "GET" && path === "/read") {
      json(200, readPrompt());
    } else if (req.method === "POST" && path === "/type") {
      const body = await readBody(req);
      if (!body.text) return json(400, { error: "text required" });
      json(200, typeText(body.text));
    } else if (req.method === "POST" && path === "/send") {
      const body = await readBody(req);
      if (!body.text) return json(400, { error: "text required" });
      json(200, sendText(body.text));
    } else if (req.method === "POST" && path === "/enter") {
      json(200, pressEnter());
    } else if (req.method === "POST" && path === "/clear") {
      json(200, clearPrompt());
    } else {
      json(404, { error: "Not found", endpoints: ["GET /status", "GET /read", "POST /type", "POST /send", "POST /enter", "POST /clear"] });
    }
  } catch (e) {
    json(500, { error: e.message });
  }
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Antigravity Remote Control Server`);
  console.log(`  Port:    ${PORT}`);
  console.log(`  Auth:    ${API_KEY ? "enabled" : "disabled"}`);
  console.log(`  Process: ${PROCESS_NAME}`);
  console.log(`\nEndpoints:`);
  console.log(`  GET  /status          — 연결 상태 확인`);
  console.log(`  GET  /read            — 프롬프트 내용 읽기`);
  console.log(`  POST /type  {text}    — 텍스트 입력`);
  console.log(`  POST /send  {text}    — 텍스트 입력 + Enter 전송`);
  console.log(`  POST /enter           — Enter 키 전송`);
  console.log(`  POST /clear           — 프롬프트 비우기`);
  console.log(`\nReady.`);
});
