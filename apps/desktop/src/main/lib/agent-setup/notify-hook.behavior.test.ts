import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import {
	chmodSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

/**
 * Behavioral reproduction for #5531: Superset's notify hook fires the v1
 * Electron localhost notification even when the agent (codex/claude) runs
 * OUTSIDE Superset, e.g. in a standalone terminal like Ghostty.
 *
 * These tests render the real notify-hook template, run it with a stub `curl`
 * on PATH, and assert whether it attempts to dispatch to the localhost
 * /hook/complete endpoint.
 */

const TEST_PORT = "54999";

let workDir: string;
let scriptPath: string;
let curlLogPath: string;

function renderTemplate(): string {
	const template = readFileSync(
		path.join(import.meta.dir, "templates", "notify-hook.template.sh"),
		"utf-8",
	);
	return template
		.replaceAll("{{MARKER}}", "# Superset agent notification hook v3")
		.replaceAll("{{DEFAULT_PORT}}", TEST_PORT);
}

/**
 * Runs the notify script with the given payload as codex-style argv and the
 * given SUPERSET_* markers. Returns the recorded curl invocations (one line
 * per call to the stub curl).
 */
function runHook(payload: string, supersetEnv: Record<string, string>): string {
	// Start from a clean env with every SUPERSET_* marker stripped, so the
	// only Superset signals are the ones the caller opts into.
	const env: Record<string, string> = {};
	for (const [key, value] of Object.entries(process.env)) {
		if (value === undefined) continue;
		if (key.startsWith("SUPERSET_")) continue;
		env[key] = value;
	}
	// Prepend the stub-curl directory so the script's `curl` resolves to ours.
	env.PATH = `${workDir}${path.delimiter}${env.PATH ?? ""}`;
	Object.assign(env, supersetEnv);

	writeFileSync(curlLogPath, "");
	Bun.spawnSync(["bash", scriptPath, payload], { env });
	return readFileSync(curlLogPath, "utf-8").trim();
}

beforeAll(() => {
	workDir = mkdtempSync(path.join(tmpdir(), "notify-hook-test-"));

	scriptPath = path.join(workDir, "notify.sh");
	writeFileSync(scriptPath, renderTemplate(), { mode: 0o755 });

	// Stub curl that records every invocation instead of hitting the network.
	curlLogPath = path.join(workDir, "curl.log");
	const stubCurl = path.join(workDir, "curl");
	writeFileSync(
		stubCurl,
		`#!/bin/bash\necho "$@" >> "${curlLogPath}"\nexit 0\n`,
		{ mode: 0o755 },
	);
	chmodSync(stubCurl, 0o755);
});

afterAll(() => {
	rmSync(workDir, { recursive: true, force: true });
});

// Codex passes its event JSON as argv; agent-turn-complete maps to a Stop.
const CODEX_STOP_PAYLOAD =
	'{"type":"agent-turn-complete","session_id":"sess-abc-123"}';

describe("notify-hook v1 fallback scoping (#5531)", () => {
	it("does NOT notify when the agent runs outside Superset", () => {
		// Ghostty-style launch: an agent session_id exists (always parsed from
		// the payload) but none of the real Superset markers are present.
		const calls = runHook(CODEX_STOP_PAYLOAD, {});

		expect(calls).not.toContain("/hook/complete");
	});

	it("still notifies when launched inside a Superset (v1) terminal", () => {
		const calls = runHook(CODEX_STOP_PAYLOAD, {
			SUPERSET_TAB_ID: "tab-1",
			SUPERSET_PANE_ID: "pane-1",
		});

		expect(calls).toContain("/hook/complete");
	});
});
