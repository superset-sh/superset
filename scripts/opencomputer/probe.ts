/**
 * Tiny probe: spawn a base sandbox and inspect the filesystem layout to debug
 * why `curl -o /usr/local/bin/caddy` is failing in the build.
 */
import { Sandbox } from "@opencomputer/sdk";

const OC_API_KEY = process.env.OC_API_KEY;
const OC_API_URL = process.env.OC_API_URL ?? "https://app.opencomputer.dev";
if (!OC_API_KEY) {
  console.error("OC_API_KEY required");
  process.exit(1);
}

const sb = await Sandbox.create({
  template: "base",
  apiKey: OC_API_KEY,
  apiUrl: OC_API_URL,
  timeout: 120,
});

const probes = [
  "ls /usr/local/lib/ 2>&1 | head -10",
  "which claude jq direnv docker",
  "apt list --installed 2>/dev/null | grep -E '^(jq|docker|direnv|postgresql-client|libnss3-tools)/' | head",
  "uname -m; cat /etc/os-release | grep PRETTY",
  "ls -la ~/",
  "groups",
  "test -e /var/run/docker.sock && echo 'docker sock exists' || echo 'no docker sock'",
];

for (const cmd of probes) {
  const r = await sb.exec.run(cmd);
  console.log(`$ ${cmd}`);
  console.log(`  exit=${r.exitCode}`);
  console.log((r.stdout || r.stderr).split("\n").map((l) => `  ${l}`).join("\n"));
}

await sb.kill();
