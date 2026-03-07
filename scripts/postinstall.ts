// scripts/postinstall.ts
// Cross-platform replacement for postinstall.sh

// Prevent infinite recursion during postinstall
// electron-builder install-app-deps can trigger nested bun installs
if (process.env.SUPERSET_POSTINSTALL_RUNNING) {
	process.exit(0);
}

process.env.SUPERSET_POSTINSTALL_RUNNING = "1";

import { $ } from "bun";

// Run sherif for workspace validation
await $`sherif`.nothrow();

// Install native dependencies for desktop app
await $`bun run --filter=@superset/desktop install:deps`;
