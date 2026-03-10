#!/usr/bin/env node
/**
 * Antigravity Remote Control — Client CLI
 *
 * 원격 Mac의 Antigravity IDE Agent 프롬프트를 제어하는 CLI 클라이언트.
 * 이름(--name)으로 인스턴스를 지정하거나, 호스트/포트를 직접 지정할 수 있다.
 *
 * 사용법:
 *   node client.mjs <command> [options]
 *
 * Commands:
 *   send <text>        텍스트 입력 + Enter 전송
 *   type <text>        텍스트만 입력 (Enter 안 누름)
 *   enter              Enter 키만 전송
 *   clear              프롬프트 비우기
 *   read               현재 프롬프트 내용 읽기
 *   status             연결 상태 확인
 *   list               등록된 인스턴스 목록
 *   broadcast <text>   그룹 전체에 전송 (--group 필수)
 *
 * 인스턴스 지정:
 *   -n, --name <name>         인스턴스 이름 (instances.json에서 조회)
 *   -g, --group <group>       그룹 이름 (broadcast용)
 *   -H, --host <host>         직접 호스트 지정
 *   -p, --port <port>         직접 포트 지정
 *
 * 예시:
 *   node client.mjs -n design-1 send "hello world"
 *   node client.mjs -g design broadcast "디자인 시스템 점검해줘"
 *   node client.mjs -H 100.98.136.93 -p 9401 status
 *   node client.mjs list
 */

import { parseArgs } from "node:util";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// Args
// ---------------------------------------------------------------------------

const { values: opts, positionals } = parseArgs({
  options: {
    host: { type: "string", short: "H", default: "" },
    port: { type: "string", short: "p", default: "" },
    name: { type: "string", short: "n", default: "" },
    group: { type: "string", short: "g", default: "" },
    key: { type: "string", short: "k", default: "" },
    config: { type: "string", short: "c", default: join(__dirname, "..", "instances.json") },
    help: { type: "boolean", short: "h", default: false },
  },
  allowPositionals: true,
});

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

let instances = [];
try {
  const config = JSON.parse(readFileSync(opts.config, "utf-8"));
  instances = config.instances || [];
} catch {}

// ---------------------------------------------------------------------------
// Help
// ---------------------------------------------------------------------------

if (opts.help || positionals.length === 0) {
  console.log(`
Antigravity Remote Control Client

Usage:
  node client.mjs <command> [text] [options]

Commands:
  send <text>       텍스트 입력 + Enter 전송
  type <text>       텍스트만 입력
  enter             Enter 키 전송
  clear             프롬프트 비우기
  read              프롬프트 내용 읽기
  status            연결 상태 확인
  list              인스턴스 목록
  broadcast <text>  그룹 전체에 전송 (--group 필수)

Target (택1):
  -n, --name <name>     인스턴스 이름 (instances.json)
  -g, --group <group>   그룹 이름 (broadcast용)
  -H, --host + -p, --port   직접 지정

Options:
  -k, --key <key>       API 키
  -c, --config <path>   설정 파일 (default: instances.json)
  -h, --help            도움말

Examples:
  node client.mjs -n design-1 send "디자인 시스템 만들어줘"
  node client.mjs -n qa-2 status
  node client.mjs -g design broadcast "컬러 토큰 점검해줘"
  node client.mjs -H 100.98.136.93 -p 9401 send "hello"
  node client.mjs list
`);
  process.exit(0);
}

const command = positionals[0];
const text = positionals.slice(1).join(" ");

// ---------------------------------------------------------------------------
// Resolve target
// ---------------------------------------------------------------------------

function resolveTarget(name) {
  const inst = instances.find((i) => i.name === name);
  if (!inst) {
    console.error(`Instance not found: "${name}"`);
    console.error(`Available: ${instances.map((i) => i.name).join(", ")}`);
    process.exit(1);
  }
  return inst;
}

function getBaseUrl(host, port) {
  return `http://${host}:${port}`;
}

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------

async function request(baseUrl, method, path, body) {
  const headers = { "Content-Type": "application/json" };
  if (opts.key) {
    headers["Authorization"] = `Bearer ${opts.key}`;
  }

  const fetchOpts = { method, headers };
  if (body) {
    fetchOpts.body = JSON.stringify(body);
  }

  try {
    const res = await fetch(`${baseUrl}${path}`, fetchOpts);
    const data = await res.json();

    if (!res.ok) {
      return { _error: true, status: res.status, ...(typeof data === "object" ? data : { message: data }) };
    }

    return data;
  } catch (e) {
    if (e.cause?.code === "ECONNREFUSED") {
      return { _error: true, message: `Connection refused: ${baseUrl}` };
    }
    return { _error: true, message: e.message };
  }
}

// ---------------------------------------------------------------------------
// Single-target commands
// ---------------------------------------------------------------------------

function resolveOne() {
  if (opts.name) {
    const inst = resolveTarget(opts.name);
    return { host: opts.host || "localhost", port: inst.apiPort, name: inst.name };
  }
  if (opts.host && opts.port) {
    return { host: opts.host, port: opts.port, name: `${opts.host}:${opts.port}` };
  }
  if (opts.port) {
    return { host: "localhost", port: opts.port, name: `localhost:${opts.port}` };
  }
  console.error("Target required: --name <name> 또는 --host <host> --port <port>");
  process.exit(1);
}

async function runSingle(command, text) {
  const target = resolveOne();
  const baseUrl = getBaseUrl(target.host, target.port);

  switch (command) {
    case "send": {
      if (!text) { console.error("Error: send 명령에는 텍스트가 필요합니다."); process.exit(1); }
      const r = await request(baseUrl, "POST", "/send", { text });
      if (r._error) { console.error(`[${target.name}] Error:`, r.message || r.error); process.exit(1); }
      console.log(`[${target.name}] Sent: ${text}`);
      break;
    }
    case "type": {
      if (!text) { console.error("Error: type 명령에는 텍스트가 필요합니다."); process.exit(1); }
      const r = await request(baseUrl, "POST", "/type", { text });
      if (r._error) { console.error(`[${target.name}] Error:`, r.message || r.error); process.exit(1); }
      console.log(`[${target.name}] Typed: ${text}`);
      if (r.value) console.log(`[${target.name}] Value: ${r.value}`);
      break;
    }
    case "enter": {
      const r = await request(baseUrl, "POST", "/enter");
      if (r._error) { console.error(`[${target.name}] Error:`, r.message || r.error); process.exit(1); }
      console.log(`[${target.name}] Enter sent.`);
      break;
    }
    case "clear": {
      const r = await request(baseUrl, "POST", "/clear");
      if (r._error) { console.error(`[${target.name}] Error:`, r.message || r.error); process.exit(1); }
      console.log(`[${target.name}] Cleared.`);
      break;
    }
    case "read": {
      const r = await request(baseUrl, "GET", "/read");
      if (r._error) { console.error(`[${target.name}] Error:`, r.message || r.error); process.exit(1); }
      console.log(`[${target.name}] Prompt: ${JSON.stringify(r.value)}`);
      break;
    }
    case "status": {
      const r = await request(baseUrl, "GET", "/status");
      if (r._error) {
        console.log(`[${target.name}] OFFLINE — ${r.message || r.error}`);
      } else {
        console.log(`[${target.name}] OK`);
        if (r.targets) {
          for (const t of r.targets) console.log(`  Target: ${t.title}`);
        }
        console.log(`  Connected: ${r.connected}`);
        console.log(`  Editor: ${r.editorFound}`);
      }
      break;
    }
    default:
      console.error(`Unknown command: ${command}`);
      process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// list
// ---------------------------------------------------------------------------

function listInstances() {
  if (instances.length === 0) {
    console.log("No instances configured. Edit instances.json to add.");
    process.exit(0);
  }

  console.log();
  console.log("  Name         Group         CDP     API");
  console.log("  " + "-".repeat(48));
  for (const inst of instances) {
    console.log(
      `  ${inst.name.padEnd(13)}${inst.group.padEnd(14)}${String(inst.cdpPort).padEnd(8)}${inst.apiPort}`,
    );
  }
  console.log();
}

// ---------------------------------------------------------------------------
// broadcast
// ---------------------------------------------------------------------------

async function broadcast(text) {
  if (!opts.group) {
    console.error("Error: broadcast에는 --group 옵션이 필요합니다.");
    console.error("Usage: node client.mjs -g design broadcast \"텍스트\"");
    process.exit(1);
  }
  if (!text) {
    console.error("Error: broadcast에는 텍스트가 필요합니다.");
    process.exit(1);
  }

  const targets = instances.filter((i) => i.group === opts.group);
  if (targets.length === 0) {
    console.error(`No instances in group: "${opts.group}"`);
    process.exit(1);
  }

  const host = opts.host || "localhost";

  console.log(`Broadcasting to ${targets.length} instances [${opts.group}]:`);
  console.log(`  Text: ${text}`);
  console.log();

  const results = await Promise.allSettled(
    targets.map(async (inst) => {
      const baseUrl = getBaseUrl(host, inst.apiPort);
      const r = await request(baseUrl, "POST", "/send", { text });
      return { inst, result: r };
    }),
  );

  for (const res of results) {
    if (res.status === "rejected") {
      console.log(`  [${res.reason?.inst?.name || "?"}] FAILED: ${res.reason?.message}`);
    } else {
      const { inst, result } = res.value;
      if (result._error) {
        console.log(`  [${inst.name}] FAILED: ${result.message || result.error}`);
      } else {
        console.log(`  [${inst.name}] OK`);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// status-all (--group 또는 전체)
// ---------------------------------------------------------------------------

async function statusAll() {
  const host = opts.host || "localhost";
  const targets = opts.group
    ? instances.filter((i) => i.group === opts.group)
    : instances;

  if (targets.length === 0) {
    console.error("No instances to check.");
    process.exit(1);
  }

  console.log(`Checking ${targets.length} instances...`);
  console.log();

  const results = await Promise.allSettled(
    targets.map(async (inst) => {
      const baseUrl = getBaseUrl(host, inst.apiPort);
      const r = await request(baseUrl, "GET", "/status");
      return { inst, result: r };
    }),
  );

  for (const res of results) {
    if (res.status === "rejected") {
      console.log(`  [?] FAILED`);
    } else {
      const { inst, result } = res.value;
      if (result._error) {
        console.log(`  [${inst.name}] OFFLINE`);
      } else {
        const editor = result.editorFound ? "editor OK" : "no editor";
        console.log(`  [${inst.name}] OK (${editor})`);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

switch (command) {
  case "list":
    listInstances();
    break;

  case "broadcast":
    await broadcast(text);
    break;

  case "status":
    // --name 지정 시 단일, 아니면 전체
    if (opts.name || opts.port) {
      await runSingle("status", text);
    } else {
      await statusAll();
    }
    break;

  case "send":
  case "type":
  case "enter":
  case "clear":
  case "read":
    await runSingle(command, text);
    break;

  default:
    console.error(`Unknown command: ${command}`);
    console.error("Available: send, type, enter, clear, read, status, list, broadcast");
    process.exit(1);
}
