// Runs the host-service end-to-end adoption test under Electron-as-Node.
//
// Why Electron and not raw `node`: host-service uses better-sqlite3, whose
// native module is compiled against the Electron bundled Node ABI for
// production. Running the test under Electron-as-Node ensures the same
// native-module ABI as production. Raw `node` would fail with
// NODE_MODULE_VERSION mismatch.
//
// Usage: bun run test:e2e

import * as childProcess from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../../..");

// Resolve the Electron binary from the workspace's node_modules. Bun's flat
// .bun/<pkg>@<version>/node_modules/<pkg> layout makes this a glob.
function findElectronBinary(): string {
	const candidates = childProcess
		.execSync("find . -path '*/electron/dist/*.app/Contents/MacOS/Electron'", {
			cwd: repoRoot,
			encoding: "utf-8",
		})
		.split("\n")
		.filter(Boolean);
	const first = candidates[0];
	if (!first) {
		throw new Error(
			"Electron binary not found. Run `bun install` from the repo root first.",
		);
	}
	return path.join(repoRoot, first);
}

const electronBin = findElectronBinary();
const testFile = path.resolve(
	__dirname,
	"..",
	"src/terminal/terminal.adoption.node-test.ts",
);

if (!fs.existsSync(testFile)) {
	console.error(`Test file missing: ${testFile}`);
	process.exit(1);
}

const result = childProcess.spawnSync(
	electronBin,
	["--experimental-strip-types", "--test", "--test-reporter=spec", testFile],
	{
		stdio: "inherit",
		env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
	},
);

process.exit(result.status ?? 1);
