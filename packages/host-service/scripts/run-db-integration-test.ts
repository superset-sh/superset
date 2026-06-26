#!/usr/bin/env bun
// Runs the host-service DB integration tests under Electron-as-node.
//
// These tests load better-sqlite3 in-process, and in this workspace that native
// addon is built for the Electron ABI (the host-service's real runtime) — plain
// `node` is the wrong ABI and `bun` doesn't support better-sqlite3 at all. So we
// resolve the Electron binary from the desktop package and run `node --test`
// through it with ELECTRON_RUN_AS_NODE=1.

import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../../..");

// The `electron` package's main export is the path to its binary (cross-platform).
const requireFromDesktop = createRequire(
	path.join(repoRoot, "apps/desktop/package.json"),
);
const electronBinary = requireFromDesktop("electron") as string;

const testFiles = ["src/db/db.contention.node-test.ts"];

const result = spawnSync(
	electronBinary,
	["--experimental-strip-types", "--test", ...testFiles],
	{
		cwd: path.resolve(__dirname, ".."),
		stdio: "inherit",
		env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
	},
);

process.exit(result.status ?? 1);
