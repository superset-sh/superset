/**
 * Bundles the host-service entry point into a single JS file that can be
 * executed by a standalone Node.js runtime. Native addons (better-sqlite3,
 * node-pty) are marked external and must be resolved at runtime from
 * lib/native/ in the distribution bundle.
 */
import { existsSync, mkdirSync } from "node:fs";

export const buildOptions = {
	entrypoints: ["src/serve.ts"],
	target: "node",
	outdir: "dist",
	naming: "host-service.js",
	format: "esm",
	// Bun inlines `process.env.NODE_ENV` from the build process's own env
	// unless overridden here. Pin it to "production" so dev-only branches
	// (serve.ts SIGTERM handler, DaemonSupervisor non-detached spawn) are
	// dead-code-eliminated from the shipped bundle regardless of how CI
	// or a contributor invokes the build script. See #4563.
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
	],
} satisfies Parameters<typeof Bun.build>[0];

if (import.meta.main) {
	if (!existsSync(buildOptions.outdir)) {
		mkdirSync(buildOptions.outdir, { recursive: true });
	}

	const result = await Bun.build(buildOptions);

	if (!result.success) {
		console.error("[host-service] build failed:");
		for (const log of result.logs) {
			console.error(log);
		}
		process.exit(1);
	}

	console.log(
		`[host-service] bundled to ${buildOptions.outdir}/host-service.js`,
	);
}
