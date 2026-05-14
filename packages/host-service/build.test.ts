// Regression test for #4563.
//
// `Bun.build` inlines `process.env.NODE_ENV` from the build process's own
// environment unless an explicit `define` override is provided. CI runs
// `bun run build:host` without setting NODE_ENV, so shipped binaries
// (`cli-v0.2.14`–`0.2.16`) had `"development"` baked into every
// `process.env.NODE_ENV === "..."` comparison. Dev-only branches in
// serve.ts (SIGTERM handler that kills the pty-daemon) and
// DaemonSupervisor.ts (non-detached spawn, no rotating log file) ran in
// production builds, masking real shutdown semantics under systemd and
// preventing daemon log rotation.
//
// The fix is to set `define: { "process.env.NODE_ENV": '"production"' }`
// in `build.ts`'s Bun.build options so the release artifact is
// deterministically production-mode regardless of the build host's env.

import { describe, expect, test } from "bun:test";
import { buildOptions } from "./build";

describe("host-service bundle pins NODE_ENV to production (#4563)", () => {
	test("buildOptions.define overrides process.env.NODE_ENV to production", () => {
		const define = (buildOptions as { define?: Record<string, string> }).define;
		expect(define).toBeDefined();
		expect(define?.["process.env.NODE_ENV"]).toBe(JSON.stringify("production"));
	});
});
