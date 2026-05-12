#!/usr/bin/env bun
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { runSetup } from "./superset-setup/setup.ts";

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const ok = await runSetup({
	args: process.argv.slice(2),
	cwd: process.cwd(),
	env: process.env,
	scriptDir: join(repoRoot, ".superset"),
});

process.exit(ok ? 0 : 1);
