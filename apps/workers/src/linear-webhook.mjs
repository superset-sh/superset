#!/usr/bin/env node
/**
 * Antigravity Remote Control — Linear Webhook Handler
 *
 * Linear에서 이슈 이벤트가 발생하면 라벨(예: "design-9221")을 파싱하여
 * 해당 Antigravity 인스턴스에 프롬프트를 전송한다.
 *
 * 라벨 형식: "{group}-{cdpPort}" (예: design-9221, qa-9331)
 * → instances.json에서 cdpPort로 인스턴스를 찾아 apiPort로 전송
 *
 * 사용법:
 *   node linear-webhook.mjs                          # 기본 (포트 9500)
 *   node linear-webhook.mjs --port 9500              # 커스텀 포트
 *   node linear-webhook.mjs --signing-secret abc123  # 서명 검증
 *   node linear-webhook.mjs --cdp-host 127.0.0.1     # CDP 서버 호스트
 *
 * Linear 웹훅 설정:
 *   URL: http://<this-server>:9500/webhook/linear
 *   Events: Issues (Create, Update)
 */

import { createServer } from "node:http";
import { createHmac, timingSafeEqual } from "node:crypto";
import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// Args
// ---------------------------------------------------------------------------

const { values: args } = parseArgs({
  options: {
    port: { type: "string", short: "p", default: "9500" },
    "signing-secret": { type: "string", short: "s", default: "" },
    "cdp-host": { type: "string", default: "127.0.0.1" },
    "api-key": { type: "string", short: "k", default: "" },
    config: { type: "string", short: "c", default: join(__dirname, "..", "instances.json") },
    help: { type: "boolean", short: "h", default: false },
  },
});

if (args.help) {
  console.log(`
Antigravity Remote Control — Linear Webhook Handler

Usage:
  node linear-webhook.mjs [options]

Options:
  -p, --port <port>              Listen port (default: 9500)
  -s, --signing-secret <secret>  Linear webhook signing secret
  --cdp-host <host>              CDP 서버 호스트 (default: 127.0.0.1)
  -k, --api-key <key>            CDP 서버 API 키
  -c, --config <path>            instances.json 경로
  -h, --help                     도움말

Linear Webhook URL:
  POST http://<host>:9500/webhook/linear

Label Format:
  "design-9221" → cdpPort 9221 → design-1 인스턴스로 전송
`);
  process.exit(0);
}

const PORT = parseInt(args.port, 10);
const SIGNING_SECRET = args["signing-secret"] || process.env.LINEAR_WEBHOOK_SECRET || "";
const CDP_HOST = args["cdp-host"] || process.env.CDP_HOST || "127.0.0.1";
const API_KEY = args["api-key"] || process.env.API_KEY || "";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const config = JSON.parse(readFileSync(args.config, "utf-8"));
const instances = config.instances;

/** cdpPort → instance 매핑 */
const portMap = new Map();
for (const inst of instances) {
  portMap.set(String(inst.cdpPort), inst);
}

/**
 * 라벨 이름에서 인스턴스 찾기
 * "design-9221" → cdpPort 9221 → instance
 */
function findInstanceByLabel(labelName) {
  // 라벨에서 포트 번호 추출 (마지막 숫자 부분)
  const match = labelName.match(/(\d{4,5})$/);
  if (!match) return null;
  return portMap.get(match[1]) || null;
}

// ---------------------------------------------------------------------------
// Webhook signature verification
// ---------------------------------------------------------------------------

function verifySignature(rawBody, signature) {
  if (!SIGNING_SECRET) return true; // 시크릿 미설정 시 검증 스킵

  if (!signature) return false;

  const computed = createHmac("sha256", SIGNING_SECRET)
    .update(rawBody)
    .digest("hex");

  try {
    return timingSafeEqual(
      Buffer.from(computed, "hex"),
      Buffer.from(signature, "hex"),
    );
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Prompt builder
// ---------------------------------------------------------------------------

/**
 * Linear 이슈 데이터로부터 Antigravity에 보낼 프롬프트를 생성
 */
function buildPrompt(issueData, action) {
  const title = issueData.title || "";
  const description = issueData.description || "";
  const identifier = issueData.identifier || issueData.id || "";
  const url = issueData.url || "";
  const priority = issueData.priority != null ? `P${issueData.priority}` : "";
  const status = issueData.state?.name || issueData.status || "";

  const parts = [];

  parts.push(`[Linear Issue: ${identifier}] ${title}`);

  if (description) {
    // 너무 긴 설명은 잘라냄
    const trimmed = description.length > 2000
      ? description.slice(0, 2000) + "\n...(truncated)"
      : description;
    parts.push(trimmed);
  }

  if (priority || status) {
    const meta = [priority, status].filter(Boolean).join(" | ");
    parts.push(`(${meta})`);
  }

  return parts.join("\n\n");
}

// ---------------------------------------------------------------------------
// Send to Antigravity instance
// ---------------------------------------------------------------------------

async function sendToInstance(inst, prompt) {
  const url = `http://${CDP_HOST}:${inst.apiPort}/send`;
  const headers = { "Content-Type": "application/json" };
  if (API_KEY) {
    headers["Authorization"] = `Bearer ${API_KEY}`;
  }

  try {
    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({ text: prompt }),
    });

    const data = await res.json();
    return { ok: res.ok, instance: inst.name, apiPort: inst.apiPort, ...data };
  } catch (e) {
    return { ok: false, instance: inst.name, error: e.message };
  }
}

// ---------------------------------------------------------------------------
// Webhook handler
// ---------------------------------------------------------------------------

async function handleLinearWebhook(rawBody, headers) {
  // 서명 검증
  const signature = headers["linear-signature"];
  if (!verifySignature(rawBody, signature)) {
    return { status: 401, body: { error: "Invalid signature" } };
  }

  let payload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return { status: 400, body: { error: "Invalid JSON" } };
  }

  const { action, type, data } = payload;

  // Issue 이벤트만 처리
  if (type !== "Issue") {
    console.log(`  Skip: type=${type} (not Issue)`);
    return { status: 200, body: { ok: true, skipped: true, reason: `type ${type} not handled` } };
  }

  console.log(`  Event: ${action} Issue "${data?.title || data?.id}"`);

  // 상태가 "In Progress"일 때만 작업 시작
  const stateName = data?.state?.name || "";
  if (stateName !== "In Progress") {
    console.log(`  Skip: state="${stateName}" (waiting for "In Progress")`);
    return { status: 200, body: { ok: true, skipped: true, reason: `state "${stateName}" is not In Progress` } };
  }

  // 라벨에서 대상 인스턴스 찾기
  const labels = data?.labels || data?.labelIds || [];
  const targetInstances = [];

  for (const label of labels) {
    const labelName = typeof label === "string" ? label : label.name;
    if (!labelName) continue;

    const inst = findInstanceByLabel(labelName);
    if (inst) {
      targetInstances.push({ inst, label: labelName });
      console.log(`  Label "${labelName}" → ${inst.name} (API ${inst.apiPort})`);
    }
  }

  if (targetInstances.length === 0) {
    console.log(`  No matching labels found`);
    return { status: 200, body: { ok: true, skipped: true, reason: "no matching labels" } };
  }

  // 프롬프트 생성 및 전송
  const prompt = buildPrompt(data, action);
  console.log(`  Prompt: ${prompt.slice(0, 100)}...`);

  const results = await Promise.all(
    targetInstances.map(({ inst }) => sendToInstance(inst, prompt)),
  );

  const success = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok).length;

  console.log(`  Sent: ${success} ok, ${failed} failed`);

  return {
    status: 200,
    body: { ok: true, sent: success, failed, results },
  };
}

// ---------------------------------------------------------------------------
// HTTP Server
// ---------------------------------------------------------------------------

async function readRawBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks).toString();
}

const server = createServer(async (req, res) => {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Linear-Signature");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  const json = (status, data) => {
    res.writeHead(status, { "Content-Type": "application/json" });
    res.end(JSON.stringify(data));
  };

  const url = new URL(req.url, `http://localhost:${PORT}`);

  // Health check
  if (req.method === "GET" && url.pathname === "/health") {
    json(200, {
      ok: true,
      instances: instances.map((i) => ({
        name: i.name,
        group: i.group,
        cdpPort: i.cdpPort,
        apiPort: i.apiPort,
      })),
    });
    return;
  }

  // Linear webhook endpoint
  if (req.method === "POST" && url.pathname === "/webhook/linear") {
    const rawBody = await readRawBody(req);
    const timestamp = new Date().toISOString().slice(11, 19);
    console.log(`[${timestamp}] Webhook received`);

    try {
      const result = await handleLinearWebhook(rawBody, req.headers);
      json(result.status, result.body);
    } catch (e) {
      console.error(`  Error: ${e.message}`);
      json(500, { error: e.message });
    }
    return;
  }

  // Manual trigger (테스트용)
  if (req.method === "POST" && url.pathname === "/trigger") {
    const rawBody = await readRawBody(req);
    let body;
    try {
      body = JSON.parse(rawBody);
    } catch {
      return json(400, { error: "Invalid JSON" });
    }

    const { label, text } = body;
    if (!label || !text) {
      return json(400, { error: "label and text required" });
    }

    const inst = findInstanceByLabel(label);
    if (!inst) {
      return json(404, { error: `No instance for label: ${label}` });
    }

    console.log(`[manual] "${label}" → ${inst.name}: ${text.slice(0, 80)}`);
    const result = await sendToInstance(inst, text);
    json(result.ok ? 200 : 502, result);
    return;
  }

  json(404, {
    error: "Not found",
    endpoints: [
      "GET  /health",
      "POST /webhook/linear",
      "POST /trigger  { label, text }",
    ],
  });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Antigravity Remote Control — Linear Webhook Handler`);
  console.log(`  Port:     ${PORT}`);
  console.log(`  CDP Host: ${CDP_HOST}`);
  console.log(`  Auth:     ${API_KEY ? "enabled" : "disabled"}`);
  console.log(`  Signing:  ${SIGNING_SECRET ? "enabled" : "disabled"}`);
  console.log();
  console.log(`  Label → Instance mapping:`);
  for (const inst of instances) {
    console.log(`    *-${inst.cdpPort} → ${inst.name} (API ${inst.apiPort})`);
  }
  console.log();
  console.log(`Endpoints:`);
  console.log(`  GET  /health              — 상태 확인`);
  console.log(`  POST /webhook/linear      — Linear 웹훅 수신`);
  console.log(`  POST /trigger {label,text} — 수동 테스트`);
  console.log();
  console.log(`Linear Webhook URL:`);
  console.log(`  POST http://<this-host>:${PORT}/webhook/linear`);
  console.log();
  console.log(`Ready.`);
});
