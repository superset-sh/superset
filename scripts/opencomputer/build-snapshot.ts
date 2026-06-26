/**
 * Build a named snapshot of the Superset host-service image. Run this from CI
 * on superset main commits, or manually whenever the image manifest changes.
 *
 * Snapshots vs on-demand image build:
 *   - Snapshots are designed for long builds and don't share the synchronous
 *     timeout that Sandbox.create({ image }) hits when bun install takes a while.
 *   - Once created, `Sandbox.create({ snapshot: name })` skips the build entirely
 *     and boots from the saved checkpoint.
 *
 * Usage:
 *   OC_API_KEY=<key> bun run build-snapshot.ts [name]
 *   # default name is "superset-host:main"
 */

import { Snapshots } from "@opencomputer/sdk/node";
import { supersetImage } from "./image";

const OC_API_KEY = process.env.OC_API_KEY;
const OC_API_URL = process.env.OC_API_URL ?? "https://app.opencomputer.dev";

if (!OC_API_KEY) {
  console.error("OC_API_KEY env var is required");
  process.exit(1);
}

const name = process.argv[2] ?? "superset-host:main";

console.error(`[snapshot] image cacheKey: ${supersetImage.cacheKey()}`);
console.error(`[snapshot] image manifest steps: ${supersetImage.toJSON().steps.length}`);
console.error(`[snapshot] creating snapshot "${name}"…`);

const snapshots = new Snapshots({ apiKey: OC_API_KEY, apiUrl: OC_API_URL });
const info = await snapshots.create({
  name,
  image: supersetImage,
  onBuildLogs: (log) => process.stderr.write(`[oc-build] ${log}\n`),
});

console.error(`[snapshot] created`);
console.error(JSON.stringify(info, null, 2));
