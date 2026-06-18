#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import os from "node:os";

function formatBytes(bytes) {
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

function run(command, args) {
  try {
    return execFileSync(command, args, { encoding: "utf8" }).trim();
  } catch {
    return "";
  }
}

function diskInfo() {
  const output = run("df", ["-kP", "/"]);
  const line = output.split(/\r?\n/)[1];
  if (!line) return null;
  const parts = line.trim().split(/\s+/);
  const sizeKb = Number(parts[1]);
  const usedKb = Number(parts[2]);
  const availableKb = Number(parts[3]);
  const usedPercent = parts[4] ?? "";
  return {
    mount: parts[5] ?? "/",
    size: Number.isFinite(sizeKb) ? formatBytes(sizeKb * 1024) : "unknown",
    used: Number.isFinite(usedKb) ? formatBytes(usedKb * 1024) : "unknown",
    available: Number.isFinite(availableKb)
      ? formatBytes(availableKb * 1024)
      : "unknown",
    usedPercent,
  };
}

function cpuInfo() {
  const cpus = os.cpus();
  const load = os.loadavg();
  return {
    model: cpus[0]?.model ?? "unknown",
    cores: cpus.length,
    load1m: load[0],
    load5m: load[1],
    load15m: load[2],
  };
}

function memoryInfo() {
  const total = os.totalmem();
  const free = os.freemem();
  const used = total - free;
  return {
    total: formatBytes(total),
    free: formatBytes(free),
    used: formatBytes(used),
    usedPercent: `${Math.round((used / total) * 100)}%`,
  };
}

function uptimeInfo() {
  const seconds = os.uptime();
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return `${days}d ${hours}h ${minutes}m`;
}

const report = {
  generatedAt: new Date().toISOString(),
  hostname: os.hostname(),
  platform: `${os.type()} ${os.release()} (${os.arch()})`,
  uptime: uptimeInfo(),
  cpu: cpuInfo(),
  memory: memoryInfo(),
  disk: diskInfo(),
};

if (process.argv.includes("--json")) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log(`# System Health: ${report.hostname}`);
  console.log("");
  console.log(`- Generated: ${report.generatedAt}`);
  console.log(`- Platform: ${report.platform}`);
  console.log(`- Uptime: ${report.uptime}`);
  console.log(
    `- CPU: ${report.cpu.cores} cores, load ${report.cpu.load1m.toFixed(2)} / ${report.cpu.load5m.toFixed(2)} / ${report.cpu.load15m.toFixed(2)}`,
  );
  console.log(
    `- Memory: ${report.memory.used} used of ${report.memory.total} (${report.memory.usedPercent})`,
  );
  if (report.disk) {
    console.log(
      `- Disk ${report.disk.mount}: ${report.disk.used} used of ${report.disk.size} (${report.disk.usedPercent}), ${report.disk.available} available`,
    );
  } else {
    console.log("- Disk: unavailable");
  }
}
