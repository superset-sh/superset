// Lockstep guard for the three daemon-version sources of truth:
//
//   1. packages/pty-daemon/package.json#version           — what npm calls it
//   2. packages/pty-daemon/src/index.ts#DAEMON_PACKAGE_VERSION
//      — inlined into the desktop bundle (electron-vite can't read package.json
//      at runtime). The desktop's pty-daemon entry uses this in handoff mode.
//   3. packages/host-service/src/daemon/expected-version.ts#EXPECTED_DAEMON_VERSION
//      — what the host-service compares the running daemon's version against.
//      Drift here = false updatePending or false "running == expected".
//
// All three must move together. Without this check, a hand-edit that misses
// one source rots silently — the existing 0.1.0 → 0.2.0 bump ahead of this
// PR was nearly that exact mistake.

import { describe, expect, test } from "bun:test";
import { DAEMON_PACKAGE_VERSION } from "@superset/pty-daemon";
import packageJson from "../../../pty-daemon/package.json" with {
	type: "json",
};
import { EXPECTED_DAEMON_VERSION } from "./expected-version.ts";

describe("daemon version sources are in lockstep", () => {
	test("DAEMON_PACKAGE_VERSION matches pty-daemon/package.json#version", () => {
		expect(DAEMON_PACKAGE_VERSION).toBe(packageJson.version);
	});

	test("EXPECTED_DAEMON_VERSION matches pty-daemon/package.json#version", () => {
		expect(EXPECTED_DAEMON_VERSION).toBe(packageJson.version);
	});
});
