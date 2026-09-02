import { describe, expect, it } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { writeFileIfChanged } from "./write-file-if-changed";

// No mock.module here on purpose: buildWrapperScript is pure string
// generation, and the behavioral cases below execute the generated script
// with a self-contained fake PATH/home, so the real ./paths module is fine.
const { buildWrapperScript } = await import("./agent-wrappers-common");

/**
 * The launch report waits this long before checking the agent is still
 * alive. Tests that assert the report fired (or didn't) must outlast it.
 */
const REPORT_DELAY_MS = 2000;

interface Scenario {
	root: string;
	supersetHome: string;
	notifyLog: string;
	wrapperPath: string;
}

/**
 * Builds an isolated scenario: a fake agent binary on PATH, a fake
 * notify.sh that records its payload, and a generated wrapper for it.
 */
function setupScenario(binaryBody: string): Scenario {
	const root = mkdtempSync(path.join(tmpdir(), "wrapper-launch-report-"));
	const binDir = path.join(root, "bin");
	const supersetHome = path.join(root, "superset-home");
	const hooksDir = path.join(supersetHome, "hooks");
	mkdirSync(binDir, { recursive: true });
	mkdirSync(hooksDir, { recursive: true });

	const notifyLog = path.join(root, "notify.log");
	writeFileIfChanged(
		path.join(hooksDir, "notify.sh"),
		`#!/bin/bash\nprintf '%s|%s\\n' "$SUPERSET_AGENT_ID" "$1" >> "${notifyLog}"\n`,
		0o755,
	);
	writeFileIfChanged(
		path.join(binDir, "testagent"),
		`#!/bin/bash\n${binaryBody}\n`,
		0o755,
	);

	const wrapperPath = path.join(root, "wrapper");
	writeFileIfChanged(
		wrapperPath,
		buildWrapperScript("testagent", `exec "$REAL_BIN" "$@"`, {
			agentId: "testagent",
		}),
		0o755,
	);

	return { root, supersetHome, notifyLog, wrapperPath };
}

async function runWrapper(
	scenario: Scenario,
	args: string[],
	envOverrides: Record<string, string> = {},
): Promise<void> {
	const proc = Bun.spawn({
		cmd: ["bash", scenario.wrapperPath, ...args],
		env: {
			...process.env,
			PATH: `${path.dirname(scenario.wrapperPath)}:${path.join(scenario.root, "bin")}:${process.env.PATH ?? ""}`,
			SUPERSET_TERMINAL_ID: "terminal-test",
			SUPERSET_HOME_DIR: scenario.supersetHome,
			...envOverrides,
		},
		stdout: "ignore",
		stderr: "ignore",
	});
	await proc.exited;
}

function readNotifyLog(scenario: Scenario): string {
	return existsSync(scenario.notifyLog)
		? readFileSync(scenario.notifyLog, "utf-8")
		: "";
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe("wrapper launch report", () => {
	it("emits SessionStart at launch and skips help/version/fast-exit/non-Superset runs", async () => {
		// The report is liveness-gated behind a real 2s delay, so run every
		// scenario concurrently to keep the suite fast.
		const longRun = `sleep ${(REPORT_DELAY_MS + 1200) / 1000}`;
		const running = setupScenario(longRun);
		const fastExit = setupScenario("exit 0");
		const helpFlag = setupScenario(longRun);
		const afterDashDash = setupScenario(longRun);
		const outsideSuperset = setupScenario(longRun);

		await Promise.all([
			runWrapper(running, ["chat"]),
			runWrapper(fastExit, []),
			runWrapper(helpFlag, ["--help"]),
			// Tokens past `--` are prompt text, never flags.
			runWrapper(afterDashDash, ["--", "--help"]),
			runWrapper(outsideSuperset, [], {
				SUPERSET_TERMINAL_ID: "",
				SUPERSET_TAB_ID: "",
			}),
		]);
		// The fast-exit wrapper returns immediately; give its (never-firing)
		// report window time to elapse before asserting absence.
		await sleep(REPORT_DELAY_MS + 600);

		expect(readNotifyLog(running)).toContain(
			'testagent|{"hook_event_name":"SessionStart"}',
		);
		expect(readNotifyLog(afterDashDash)).toContain(
			'testagent|{"hook_event_name":"SessionStart"}',
		);
		expect(readNotifyLog(fastExit)).toBe("");
		expect(readNotifyLog(helpFlag)).toBe("");
		expect(readNotifyLog(outsideSuperset)).toBe("");
	}, 15000);

	it("only injects the launch report for wrappers with an agent identity", () => {
		const withAgent = buildWrapperScript("claude", 'exec "$REAL_BIN" "$@"', {
			agentId: "claude",
		});
		const withoutAgent = buildWrapperScript("tool", 'exec "$REAL_BIN" "$@"');

		expect(withAgent).toContain('{"hook_event_name":"SessionStart"}');
		// Must be armed before the agent replaces the shell.
		expect(
			withAgent.indexOf('{"hook_event_name":"SessionStart"}'),
		).toBeLessThan(withAgent.indexOf('exec "$REAL_BIN"'));
		expect(withoutAgent).not.toContain("SessionStart");
	});
});
