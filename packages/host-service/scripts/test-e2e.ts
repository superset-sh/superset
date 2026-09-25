// Runs the host-service end-to-end terminal tests under Electron-as-Node.
//
// Why Electron and not raw `node`: host-service uses better-sqlite3, whose
// native module is compiled against the Electron bundled Node ABI for
// production. Running the tests under Electron-as-Node ensures the same
// native-module ABI as production. Raw `node` would fail with
// NODE_MODULE_VERSION mismatch.
//
// Why the tsx loader and not --experimental-strip-types: the import chain
// (terminal.ts → terminal-agents/persistence.ts) uses TypeScript parameter
// properties, which strip-only mode rejects; tsx transforms them.
//
// Usage: bun run test:e2e

import * as childProcess from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../../..");

// Resolve a binary from the workspace's node_modules. Bun's flat
// .bun/<pkg>@<version>/node_modules/<pkg> layout makes these globs.
function findInNodeModules(pattern: string, label: string): string {
	const candidates = childProcess
		.execSync(`find . -path '${pattern}'`, {
			cwd: repoRoot,
			encoding: "utf-8",
		})
		.split("\n")
		.filter(Boolean);
	const first = candidates[0];
	if (!first) {
		throw new Error(
			`${label} not found. Run \`bun install\` from the repo root first.`,
		);
	}
	return path.join(repoRoot, first);
}

const electronBin = findInNodeModules(
	"*/electron/dist/*.app/Contents/MacOS/Electron",
	"Electron binary",
);
const tsxLoader = findInNodeModules(
	"*/node_modules/tsx/dist/loader.mjs",
	"tsx loader",
);

const testFiles = [
	"src/terminal/terminal.adoption.node-test.ts",
	"src/terminal/terminal.seq-catchup.node-test.ts",
].map((file) => path.resolve(__dirname, "..", file));

for (const testFile of testFiles) {
	if (!fs.existsSync(testFile)) {
		console.error(`Test file missing: ${testFile}`);
		process.exit(1);
	}
}

const result = childProcess.spawnSync(
	electronBin,
	[
		"--import",
		tsxLoader,
		"--test",
		"--test-force-exit",
		"--test-reporter=spec",
		...testFiles,
	],
	{
		stdio: "inherit",
		env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
	},
);

process.exit(result.status ?? 1);
