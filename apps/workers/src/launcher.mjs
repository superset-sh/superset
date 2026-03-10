#!/usr/bin/env node
/**
 * Antigravity Remote Control — Launcher
 *
 * instances.json에 정의된 모든 CDP 서버를 한번에 시작/중지한다.
 * 원격 Mac(맥미니)에서 실행.
 *
 * 사용법:
 *   node launcher.mjs                    # 전체 인스턴스 시작
 *   node launcher.mjs --group design     # design 그룹만 시작
 *   node launcher.mjs --group design-qa  # QA 그룹만 시작
 *   node launcher.mjs --key my-secret    # API 키 설정
 *   node launcher.mjs --webhook          # Linear 웹훅 서버도 함께 시작
 *   node launcher.mjs --tunnel           # ngrok 터널도 함께 시작
 *   node launcher.mjs --list             # 인스턴스 목록 확인
 */

import { spawn } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

const { values: args } = parseArgs({
  options: {
    group: { type: "string", short: "g", default: "" },
    key: { type: "string", short: "k", default: "" },
    webhook: { type: "boolean", short: "w", default: false },
    "webhook-port": { type: "string", default: "9500" },
    "signing-secret": { type: "string", short: "s", default: "" },
    tunnel: { type: "boolean", short: "t", default: false },
    "ngrok-domain": { type: "string", default: "" },
    list: { type: "boolean", short: "l", default: false },
    config: { type: "string", short: "c", default: join(__dirname, "..", "instances.json") },
    help: { type: "boolean", short: "h", default: false },
  },
});

if (args.help) {
  console.log(`
Antigravity Remote Control — Launcher

Usage:
  node launcher.mjs [options]

Options:
  -g, --group <name>           특정 그룹만 시작 (design, design-qa)
  -k, --key <key>              모든 인스턴스에 API 키 설정
  -w, --webhook                Linear 웹훅 서버도 함께 시작
  --webhook-port <port>        웹훅 서버 포트 (default: 9500)
  -s, --signing-secret <key>   Linear 웹훅 서명 시크릿
  -t, --tunnel                 ngrok 터널 시작 (webhook 포트를 외부에 노출)
  --ngrok-domain <domain>      ngrok 고정 도메인 (예: my-app.ngrok-free.app)
  -l, --list                   인스턴스 목록 확인
  -c, --config <path>          설정 파일 경로 (default: instances.json)
  -h, --help                   도움말
`);
  process.exit(0);
}

// ---------------------------------------------------------------------------
// Load .env
// ---------------------------------------------------------------------------

const envPath = join(__dirname, "..", ".env");
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf-8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim();
    if (!process.env[key]) process.env[key] = val;
  }
}

// ---------------------------------------------------------------------------
// Load config
// ---------------------------------------------------------------------------

const config = JSON.parse(readFileSync(args.config, "utf-8"));
let instances = config.instances;

if (args.group) {
  instances = instances.filter((i) => i.group === args.group);
}

// ---------------------------------------------------------------------------
// List mode
// ---------------------------------------------------------------------------

if (args.list) {
  console.log("Instances:");
  console.log();
  console.log("  Name        Group        CDP Port   API Port");
  console.log("  " + "-".repeat(52));
  for (const inst of config.instances) {
    const mark = args.group && inst.group !== args.group ? "  (skip)" : "";
    console.log(
      `  ${inst.name.padEnd(12)}${inst.group.padEnd(13)}${String(inst.cdpPort).padEnd(11)}${inst.apiPort}${mark}`,
    );
  }
  console.log();
  process.exit(0);
}

// ---------------------------------------------------------------------------
// Launch
// ---------------------------------------------------------------------------

if (instances.length === 0) {
  console.error(`No instances found${args.group ? ` for group "${args.group}"` : ""}`);
  process.exit(1);
}

console.log(`Antigravity Remote Control — Launcher`);
console.log(`  Instances: ${instances.length}`);
console.log(`  Auth:      ${args.key ? "enabled" : "disabled"}`);
console.log(`  Webhook:   ${args.webhook ? `enabled (port ${args["webhook-port"]})` : "disabled"}`);
console.log(`  Tunnel:    ${args.tunnel ? "enabled (ngrok)" : "disabled"}`);
console.log();

const children = [];

for (const inst of instances) {
  const cmdArgs = [
    join(__dirname, "cdp-server.mjs"),
    "--port", String(inst.apiPort),
    "--cdp-port", String(inst.cdpPort),
  ];
  if (args.key) {
    cmdArgs.push("--key", args.key);
  }

  const child = spawn("node", cmdArgs, {
    stdio: ["ignore", "pipe", "pipe"],
  });

  const prefix = `[${inst.name}]`;

  child.stdout.on("data", (data) => {
    for (const line of data.toString().trimEnd().split("\n")) {
      console.log(`${prefix} ${line}`);
    }
  });

  child.stderr.on("data", (data) => {
    for (const line of data.toString().trimEnd().split("\n")) {
      console.error(`${prefix} ${line}`);
    }
  });

  child.on("exit", (code) => {
    console.log(`${prefix} exited (code ${code})`);
  });

  children.push({ inst, child });
  console.log(`  Starting ${inst.name}: CDP ${inst.cdpPort} → API ${inst.apiPort}`);
}

// ---------------------------------------------------------------------------
// Linear Webhook Server (optional)
// ---------------------------------------------------------------------------

if (args.webhook) {
  const webhookArgs = [
    join(__dirname, "linear-webhook.mjs"),
    "--port", args["webhook-port"],
    "--config", args.config,
  ];
  if (args.key) {
    webhookArgs.push("--api-key", args.key);
  }
  if (args["signing-secret"]) {
    webhookArgs.push("--signing-secret", args["signing-secret"]);
  }

  const webhookChild = spawn("node", webhookArgs, {
    stdio: ["ignore", "pipe", "pipe"],
  });

  const webhookPrefix = "[webhook]";

  webhookChild.stdout.on("data", (data) => {
    for (const line of data.toString().trimEnd().split("\n")) {
      console.log(`${webhookPrefix} ${line}`);
    }
  });

  webhookChild.stderr.on("data", (data) => {
    for (const line of data.toString().trimEnd().split("\n")) {
      console.error(`${webhookPrefix} ${line}`);
    }
  });

  webhookChild.on("exit", (code) => {
    console.log(`${webhookPrefix} exited (code ${code})`);
  });

  children.push({ inst: { name: "webhook" }, child: webhookChild });
  console.log(`  Starting Linear webhook: port ${args["webhook-port"]}`);
}

// ---------------------------------------------------------------------------
// ngrok Tunnel (optional)
// ---------------------------------------------------------------------------

if (args.tunnel) {
  if (!args.webhook) {
    console.error("--tunnel requires --webhook (터널을 열 웹훅 서버가 필요합니다)");
    process.exit(1);
  }

  const ngrokArgs = ["http", args["webhook-port"]];

  // 고정 도메인이 있으면 사용 (env 또는 CLI)
  const ngrokDomain = args["ngrok-domain"] || process.env.NGROK_DOMAIN || "";
  if (ngrokDomain) {
    ngrokArgs.push("--domain", ngrokDomain);
  }

  const ngrokChild = spawn("ngrok", ngrokArgs, {
    stdio: ["ignore", "pipe", "pipe"],
  });

  const ngrokPrefix = "[ngrok]";

  ngrokChild.stdout.on("data", (data) => {
    for (const line of data.toString().trimEnd().split("\n")) {
      console.log(`${ngrokPrefix} ${line}`);
    }
  });

  ngrokChild.stderr.on("data", (data) => {
    for (const line of data.toString().trimEnd().split("\n")) {
      console.error(`${ngrokPrefix} ${line}`);
    }
  });

  ngrokChild.on("exit", (code) => {
    console.log(`${ngrokPrefix} exited (code ${code})`);
  });

  children.push({ inst: { name: "ngrok" }, child: ngrokChild });
  console.log(`  Starting ngrok tunnel: port ${args["webhook-port"]}`);

  // ngrok API에서 public URL 가져오기 (잠시 대기 후)
  setTimeout(async () => {
    try {
      const res = await fetch("http://127.0.0.1:4040/api/tunnels");
      const data = await res.json();
      const tunnel = data.tunnels?.find((t) => t.proto === "https") || data.tunnels?.[0];
      if (tunnel) {
        const publicUrl = tunnel.public_url;
        console.log();
        console.log(`  ╔══════════════════════════════════════════════════════╗`);
        console.log(`  ║  Linear Webhook URL (이 URL을 Linear에 등록):       ║`);
        console.log(`  ║  POST ${publicUrl}/webhook/linear`);
        console.log(`  ╚══════════════════════════════════════════════════════╝`);
        console.log();
      }
    } catch {
      console.log(`${ngrokPrefix} ngrok API 응답 대기 중... (http://127.0.0.1:4040 에서 확인 가능)`);
    }
  }, 3000);
}

console.log();
console.log(`All ${instances.length} servers${args.webhook ? " + webhook" : ""}${args.tunnel ? " + ngrok" : ""} starting...`);
console.log(`Press Ctrl+C to stop all.`);
console.log();

// Graceful shutdown
function shutdown() {
  console.log("\nShutting down all servers...");
  for (const { inst, child } of children) {
    child.kill("SIGTERM");
    console.log(`  Stopped ${inst.name}`);
  }
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
