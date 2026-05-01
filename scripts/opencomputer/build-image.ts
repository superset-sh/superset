/**
 * Smoke test: build the Superset OpenComputer image, spawn a sandbox from it,
 * and run a few sanity commands. Does NOT require the Superset SDK or Doppler
 * — exercises only the OpenComputer side so we can validate the image
 * independently.
 *
 * Usage:
 *   OC_API_KEY=<key> bun run build-image.ts
 *   OC_API_KEY=<key> OC_API_URL=https://app.opencomputer.dev bun run build-image.ts
 */

import { Sandbox } from "@opencomputer/sdk";
import { REPO_PATH, supersetImage } from "./image";

const OC_API_KEY = process.env.OC_API_KEY;
const OC_API_URL = process.env.OC_API_URL ?? "https://app.opencomputer.dev";

if (!OC_API_KEY) {
  console.error("OC_API_KEY env var is required");
  process.exit(1);
}

console.error(`[image] cacheKey: ${supersetImage.cacheKey()}`);
console.error(`[image] manifest steps: ${supersetImage.toJSON().steps.length}`);

console.error(`[sandbox] creating from image…`);
const sandbox = await Sandbox.create({
  image: supersetImage,
  apiKey: OC_API_KEY,
  apiUrl: OC_API_URL,
  timeout: 600,
  onBuildLog: (log) => process.stderr.write(`[oc-build] ${log}\n`),
});
console.error(`[sandbox] sandboxId: ${sandbox.sandboxId}`);

const checks: Array<{ name: string; cmd: string; expectExit?: number }> = [
  { name: "node", cmd: "node --version" },
  { name: "bun", cmd: "bun --version" },
  { name: "neonctl", cmd: "neonctl --version" },
  { name: "caddy", cmd: "caddy version" },
  { name: "docker (cli)", cmd: "docker --version" },
  { name: "doppler", cmd: "doppler --version" },
  { name: "claude", cmd: "claude --version" },
  { name: "superset cli", cmd: "superset --version" },
  { name: "repo cloned", cmd: `test -f ${REPO_PATH}/package.json` },
  { name: "node_modules present", cmd: `test -d ${REPO_PATH}/node_modules` },
  { name: "init script executable", cmd: `test -x /usr/local/bin/superset-init.sh` },
];

let failed = 0;
for (const check of checks) {
  const r = await sandbox.exec.run(check.cmd);
  const ok = r.exitCode === (check.expectExit ?? 0);
  if (!ok) failed++;
  console.error(
    `[check] ${ok ? "✓" : "✗"} ${check.name.padEnd(22)} ${(r.stdout || r.stderr).trim().split("\n")[0] ?? ""}`,
  );
}

await sandbox.kill();

if (failed > 0) {
  console.error(`\n${failed}/${checks.length} checks failed`);
  process.exit(1);
}
console.error(`\nall ${checks.length} checks passed`);
