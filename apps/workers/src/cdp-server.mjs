#!/usr/bin/env node
/**
 * Antigravity Remote Control — CDP Server
 *
 * 원격 Mac에서 실행. CDP(Chrome DevTools Protocol)로 Antigravity의
 * Agent 프롬프트를 제어하는 HTTP API 서버.
 *
 * 사용법:
 *   node cdp-server.mjs                              # 기본 설정
 *   node cdp-server.mjs --port 9300 --cdp-port 9221  # 커스텀 포트
 *   node cdp-server.mjs --key my-secret              # API 키 인증
 *
 * 요구사항:
 *   npm install ws   (WebSocket 클라이언트)
 *
 * API (server.mjs와 동일):
 *   POST /type    { "text": "hello world" }
 *   POST /send    { "text": "hello world" }
 *   POST /enter
 *   POST /clear
 *   GET  /status
 *   GET  /read
 */

import { createServer } from "node:http";
import { parseArgs } from "node:util";
import WebSocket from "ws";

// ---------------------------------------------------------------------------
// Args
// ---------------------------------------------------------------------------

const { values: args } = parseArgs({
  options: {
    port: { type: "string", short: "p", default: "9300" },
    "cdp-port": { type: "string", default: "9221" },
    "cdp-host": { type: "string", default: "127.0.0.1" },
    key: { type: "string", short: "k", default: "" },
    help: { type: "boolean", short: "h", default: false },
  },
});

if (args.help) {
  console.log(`
Antigravity Remote Control — CDP Server

Usage:
  node cdp-server.mjs [options]

Options:
  -p, --port <port>         HTTP API 포트 (default: 9300)
  --cdp-port <port>         Antigravity CDP 포트 (default: 9221)
  --cdp-host <host>         CDP 호스트 (default: 127.0.0.1)
  -k, --key <key>           API 키 인증
  -h, --help                도움말
`);
  process.exit(0);
}

const PORT = parseInt(args.port, 10);
const CDP_PORT = parseInt(args["cdp-port"], 10);
const CDP_HOST = args["cdp-host"];
const API_KEY = args.key;

// ---------------------------------------------------------------------------
// CDP Connection Manager
// ---------------------------------------------------------------------------

let ws = null;
let msgId = 0;
const pending = new Map();

/** CDP 타겟 목록 조회 */
async function listTargets() {
  const res = await fetch(`http://${CDP_HOST}:${CDP_PORT}/json/list`);
  return res.json();
}

/** Agent 사이드 패널 타겟 찾기 */
async function findAgentTarget() {
  const targets = await listTargets();

  // 1순위: Antigravity 메인 (에디터가 여기에 있음)
  const antigravity = targets.find(
    (t) => t.type === "page" && t.title === "Antigravity",
  );
  if (antigravity) return antigravity;

  // 2순위: Launchpad (agent side panel)
  const launchpad = targets.find(
    (t) => t.type === "page" && t.title === "Launchpad",
  );
  if (launchpad) return launchpad;

  // 3순위: jetski-agent 포함 URL
  const jetski = targets.find(
    (t) => t.type === "page" && t.url.includes("jetski-agent"),
  );
  if (jetski) return jetski;

  // 4순위: 아무 page 타겟
  const anyPage = targets.find((t) => t.type === "page");
  if (anyPage) return anyPage;

  throw new Error("No suitable CDP target found");
}

/** WebSocket CDP 연결 */
async function connectCDP() {
  if (ws && ws.readyState === WebSocket.OPEN) return ws;

  // 기존 연결 정리
  if (ws) {
    try { ws.close(); } catch {}
    ws = null;
  }

  const target = await findAgentTarget();
  console.log(`  CDP target: ${target.title} (${target.id})`);

  return new Promise((resolve, reject) => {
    const socket = new WebSocket(target.webSocketDebuggerUrl);

    socket.on("open", () => {
      ws = socket;
      console.log(`  CDP connected`);
      resolve(socket);
    });

    socket.on("error", (err) => {
      reject(new Error(`CDP WebSocket error: ${err.message}`));
    });

    socket.on("close", () => {
      ws = null;
      // 모든 pending 요청 reject
      for (const [id, { reject: rej }] of pending) {
        rej(new Error("CDP connection closed"));
        pending.delete(id);
      }
    });

    socket.on("message", (data) => {
      const msg = JSON.parse(data.toString());
      if (msg.id && pending.has(msg.id)) {
        const { resolve: res, reject: rej } = pending.get(msg.id);
        pending.delete(msg.id);
        if (msg.error) {
          rej(new Error(msg.error.message));
        } else {
          res(msg.result);
        }
      }
    });
  });
}

/** CDP 명령 전송 */
async function cdpSend(method, params = {}) {
  await connectCDP();
  const id = ++msgId;

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`CDP timeout: ${method}`));
    }, 15000);

    pending.set(id, {
      resolve: (result) => {
        clearTimeout(timeout);
        resolve(result);
      },
      reject: (err) => {
        clearTimeout(timeout);
        reject(err);
      },
    });

    ws.send(JSON.stringify({ id, method, params }));
  });
}

/** 브라우저 컨텍스트에서 JS 실행 */
async function evaluate(expression, awaitPromise = false) {
  const result = await cdpSend("Runtime.evaluate", {
    expression,
    awaitPromise,
    returnByValue: true,
  });

  if (result.exceptionDetails) {
    throw new Error(
      result.exceptionDetails.exception?.description ||
        result.exceptionDetails.text ||
        "Evaluation failed",
    );
  }

  return result.result?.value;
}

// ---------------------------------------------------------------------------
// Editor interaction via CDP
// ---------------------------------------------------------------------------

const FIND_EDITOR_JS = `
(() => {
  // Lexical editor 찾기
  const selectors = [
    '[data-lexical-editor="true"]',
    'div[role="textbox"]',
    '.antigravity-agent-side-panel div[role="textbox"]',
    'div[contenteditable="true"][role="textbox"]',
    'div[contenteditable="true"]',
  ];
  for (const sel of selectors) {
    const el = document.querySelector(sel);
    if (el) return { found: true, selector: sel, tag: el.tagName, role: el.getAttribute('role') };
  }
  return { found: false };
})()
`;

async function findEditor() {
  const result = await evaluate(FIND_EDITOR_JS);
  if (!result?.found) {
    throw new Error("Editor element not found in this target");
  }
  return result.selector;
}

async function typeText(text) {
  const selector = await findEditor();
  const escaped = text.replace(/\\/g, "\\\\").replace(/`/g, "\\`").replace(/\$/g, "\\$");

  // Focus → Select All → Delete → Insert Text
  const js = `
    (() => {
      const el = document.querySelector('${selector}');
      if (!el) return { ok: false, error: 'Element not found' };

      el.focus();

      // Select all and delete existing content
      document.execCommand('selectAll', false, null);
      document.execCommand('delete', false, null);

      // Insert new text
      document.execCommand('insertText', false, \`${escaped}\`);

      // Read back value
      const value = el.textContent || el.innerText || '';
      return { ok: true, value };
    })()
  `;

  return await evaluate(js);
}

async function pressEnter() {
  // Dispatch Enter key event via CDP Input domain
  await cdpSend("Input.dispatchKeyEvent", {
    type: "keyDown",
    key: "Enter",
    code: "Enter",
    windowsVirtualKeyCode: 13,
    nativeVirtualKeyCode: 13,
  });

  await new Promise((r) => setTimeout(r, 50));

  await cdpSend("Input.dispatchKeyEvent", {
    type: "keyUp",
    key: "Enter",
    code: "Enter",
    windowsVirtualKeyCode: 13,
    nativeVirtualKeyCode: 13,
  });

  return { ok: true };
}

async function sendText(text) {
  const result = await typeText(text);
  if (!result?.ok) return result;

  await new Promise((r) => setTimeout(r, 300));
  return pressEnter();
}

async function clearPrompt() {
  const selector = await findEditor();

  const js = `
    (() => {
      const el = document.querySelector('${selector}');
      if (!el) return { ok: false, error: 'Element not found' };
      el.focus();
      document.execCommand('selectAll', false, null);
      document.execCommand('delete', false, null);
      return { ok: true };
    })()
  `;

  return await evaluate(js);
}

async function readPrompt() {
  const selector = await findEditor();

  const js = `
    (() => {
      const el = document.querySelector('${selector}');
      if (!el) return { ok: false, error: 'Element not found' };
      const value = el.textContent || el.innerText || '';
      return { ok: true, value };
    })()
  `;

  return await evaluate(js);
}

async function getStatus() {
  try {
    const targets = await listTargets();
    const pageTargets = targets.filter((t) => t.type === "page");

    let editorFound = false;
    try {
      await findEditor();
      editorFound = true;
    } catch {}

    return {
      ok: true,
      cdp: `${CDP_HOST}:${CDP_PORT}`,
      targets: pageTargets.map((t) => ({ title: t.title, id: t.id })),
      connected: ws?.readyState === WebSocket.OPEN,
      editorFound,
    };
  } catch (e) {
    return { ok: false, error: e.message };
  }
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
      json(200, await getStatus());
    } else if (req.method === "GET" && path === "/read") {
      json(200, await readPrompt());
    } else if (req.method === "POST" && path === "/type") {
      const body = await readBody(req);
      if (!body.text) return json(400, { error: "text required" });
      json(200, await typeText(body.text));
    } else if (req.method === "POST" && path === "/send") {
      const body = await readBody(req);
      if (!body.text) return json(400, { error: "text required" });
      json(200, await sendText(body.text));
    } else if (req.method === "POST" && path === "/enter") {
      json(200, await pressEnter());
    } else if (req.method === "POST" && path === "/clear") {
      json(200, await clearPrompt());
    } else {
      json(404, {
        error: "Not found",
        endpoints: [
          "GET /status",
          "GET /read",
          "POST /type",
          "POST /send",
          "POST /enter",
          "POST /clear",
        ],
      });
    }
  } catch (e) {
    // CDP 연결 끊김 시 재연결 시도
    if (e.message.includes("connection closed") || e.message.includes("WebSocket")) {
      ws = null;
      try {
        await connectCDP();
        // 재시도는 클라이언트에게 맡김
      } catch {}
    }
    json(500, { error: e.message });
  }
});

server.listen(PORT, "0.0.0.0", async () => {
  console.log(`Antigravity Remote Control — CDP Server`);
  console.log(`  HTTP API: 0.0.0.0:${PORT}`);
  console.log(`  CDP:      ${CDP_HOST}:${CDP_PORT}`);
  console.log(`  Auth:     ${API_KEY ? "enabled" : "disabled"}`);
  console.log();

  // 시작 시 CDP 연결 시도
  try {
    await connectCDP();
    try {
      const selector = await findEditor();
      console.log(`  Editor:   found (${selector})`);
    } catch {
      console.log(`  Editor:   not found yet (will retry on request)`);
    }
  } catch (e) {
    console.log(`  CDP:      connection failed — ${e.message}`);
    console.log(`            (will retry on first request)`);
  }

  console.log();
  console.log(`Endpoints:`);
  console.log(`  GET  /status          — 연결 상태 확인`);
  console.log(`  GET  /read            — 프롬프트 내용 읽기`);
  console.log(`  POST /type  {text}    — 텍스트 입력`);
  console.log(`  POST /send  {text}    — 텍스트 입력 + Enter 전송`);
  console.log(`  POST /enter           — Enter 키 전송`);
  console.log(`  POST /clear           — 프롬프트 비우기`);
  console.log();
  console.log(`Ready.`);
});
