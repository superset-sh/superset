#!/usr/bin/env node
// Post-build smoke check: assert the desktop's pty-daemon bundle has all
// the runtime markers Phase 2's fd-handoff depends on. Catches bundler
// regressions where esbuild / Bun statically inline `process.env.X`
// references and dead-code-eliminate handoff branches.
//
// Wired into apps/desktop's build flow (post compile:app). Fails the
// build with a clear diagnostic if any marker is missing.
//
// Run manually:
//   bun run scripts/check-pty-daemon-bundle.ts
//   bun run scripts/check-pty-daemon-bundle.ts --bundle=path/to/pty-daemon.js

import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

interface Marker {
	pattern: RegExp;
	description: string;
	min?: number;
}

const MARKERS: Marker[] = [
	{
		pattern: /runHandoffReceiver/,
		description:
			"runHandoffReceiver function — Phase 2 successor entry point. " +
			"If missing, the bundler dead-code-eliminated the receiver " +
			"branch, which means the handoff signal is being statically " +
			'inlined. Verify the entry uses `process.argv.includes("--handoff")`, NOT `process.env.X`.',
	},
	{
		pattern: /--handoff/,
		description:
			"--handoff argv flag — predecessor uses this to signal " +
			"the spawned successor that it's a handoff receiver. Both the " +
			"spawn site (in Server.prepareUpgrade) and the receiver-side " +
			"check should mention this string.",
		min: 2,
	},
	{
		pattern: /upgrade-ack/,
		description:
			"upgrade-ack message type — successor sends this to predecessor " +
			"over the IPC control channel after adopting sessions. Missing " +
			"means the receiver protocol code was eliminated.",
	},
	{
		pattern: /adoptSnapshot/,
		description:
			"Server.adoptSnapshot — rebuilds session store from the snapshot " +
			"file. Missing means the adopt path was DCE'd.",
	},
	{
		pattern: /adoptFromFd/,
		description:
			"Pty.adoptFromFd — wraps an inherited PTY master fd into a Pty " +
			"adapter. Missing means the receiver can't actually take over " +
			"sessions even if the rest of the protocol survives.",
	},
];

function parseArgs(argv: string[]): { bundle: string } {
	// fileURLToPath, not URL.pathname — the latter returns a URL-encoded string
	// that doesn't round-trip on Windows (drive-letter paths break).
	const here = path.dirname(fileURLToPath(import.meta.url));
	let bundle = path.resolve(here, "..", "dist", "main", "pty-daemon.js");
	for (const arg of argv) {
		if (arg.startsWith("--bundle=")) {
			bundle = path.resolve(arg.slice("--bundle=".length));
		}
	}
	return { bundle };
}

function main(): void {
	const { bundle } = parseArgs(process.argv.slice(2));
	if (!fs.existsSync(bundle)) {
		console.error(
			`[check-pty-daemon-bundle] FAIL: bundle not found at ${bundle}\n` +
				`Run \`bun run compile:app\` first, or pass --bundle=<path>.`,
		);
		process.exit(1);
	}
	const contents = fs.readFileSync(bundle, "utf8");
	const failures: string[] = [];
	for (const m of MARKERS) {
		const matches = contents.match(new RegExp(m.pattern.source, "g")) ?? [];
		const min = m.min ?? 1;
		if (matches.length < min) {
			failures.push(
				`  ✗ ${m.pattern} — found ${matches.length}, expected >= ${min}\n` +
					`    ${m.description}`,
			);
		}
	}
	if (failures.length > 0) {
		console.error(
			`[check-pty-daemon-bundle] FAIL: ${failures.length} marker(s) missing in ${bundle}:\n` +
				failures.join("\n\n") +
				"\n\nThis is the Phase 2 fd-handoff regression class. See\n" +
				'  packages/pty-daemon/src/main.ts (`process.argv.includes("--handoff")`)\n' +
				"  apps/desktop/src/main/pty-daemon/index.ts (mirror of package main)\n" +
				"for the runtime conditions that need to survive bundling.",
		);
		process.exit(1);
	}
	console.log(
		`[check-pty-daemon-bundle] OK: ${MARKERS.length} marker(s) present in ${path.relative(process.cwd(), bundle)}`,
	);
}

main();
