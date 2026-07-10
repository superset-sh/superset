/**
 * Bundles the host-service entry point into a single JS file that can be
 * executed by a standalone Node.js runtime. Native addons (better-sqlite3,
 * node-pty) are marked external and must be resolved at runtime from
 * lib/native/ in the distribution bundle.
 */
import { existsSync, mkdirSync } from "node:fs";

const outdir = "dist";
if (!existsSync(outdir)) {
	mkdirSync(outdir, { recursive: true });
}

const result = await Bun.build({
	entrypoints: ["src/serve.ts"],
	target: "node",
	outdir,
	naming: "host-service.js",
	format: "esm",
	define: {
		"process.env.NODE_ENV": JSON.stringify("production"),
	},
	external: [
		"better-sqlite3",
		"node-pty",
		"@parcel/watcher",
		"libsql",
		"onnxruntime-node",
		"@anush008/tokenizers",
		"@anush008/tokenizers-darwin-universal",
		"@anush008/tokenizers-linux-x64-gnu",
		"@anush008/tokenizers-linux-arm64-gnu",
		"@anush008/tokenizers-win32-x64-msvc",
		"@mastra/duckdb",
		"@duckdb/node-api",
		"@duckdb/node-bindings",
		"@duckdb/node-bindings-darwin-arm64",
		"@duckdb/node-bindings-darwin-x64",
		"@duckdb/node-bindings-linux-x64",
		"@duckdb/node-bindings-linux-arm64",
		"@duckdb/node-bindings-win32-x64",
		"@duckdb/node-bindings-win32-arm64",
	],
});

if (!result.success) {
	console.error("[host-service] build failed:");
	for (const log of result.logs) {
		console.error(log);
	}
	process.exit(1);
}

console.log(`[host-service] bundled to ${outdir}/host-service.js`);
