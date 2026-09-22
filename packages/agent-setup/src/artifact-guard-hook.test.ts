import { describe, expect, it } from "bun:test";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
	ARTIFACT_GUARD_SCRIPT_MARKER,
	getArtifactGuardScriptContent,
} from "./artifact-guard-hook";
import { getTemplatePath } from "./config";

function renderScript(): string {
	return readFileSync(
		getTemplatePath("artifact-guard.template.sh"),
		"utf-8",
	).replaceAll("{{MARKER}}", ARTIFACT_GUARD_SCRIPT_MARKER);
}

function runGuard(
	input: Record<string, unknown>,
	envOverrides: Record<string, string> = {},
) {
	const result = Bun.spawnSync({
		cmd: ["bash", "-c", renderScript()],
		env: {
			...process.env,
			SUPERSET_TERMINAL_ID: "terminal-test",
			SUPERSET_ARTIFACT_GUARD_STATE_DIR: stateDir,
			...envOverrides,
		},
		stdin: Buffer.from(JSON.stringify(input)),
		stdout: "pipe",
		stderr: "pipe",
	});
	return {
		exitCode: result.exitCode,
		stdout: result.stdout.toString().trim(),
	};
}

function decisionOf(stdout: string): string | null {
	if (!stdout) return null;
	const parsed = JSON.parse(stdout) as {
		hookSpecificOutput: { permissionDecision: string };
	};
	return parsed.hookSpecificOutput.permissionDecision;
}

let stateDir = "";

function freshStateDir(): void {
	stateDir = mkdtempSync(path.join(tmpdir(), "artifact-guard-state-"));
}

const publishInput = (sessionId: string) => ({
	session_id: sessionId,
	hook_event_name: "PreToolUse",
	tool_name: "Artifact",
	tool_input: { file_path: "/tmp/report.html", favicon: "📊" },
});

describe("artifact guard hook", () => {
	it("denies the first Artifact publish of a session and points at the Pages skill", () => {
		freshStateDir();
		const { exitCode, stdout } = runGuard(publishInput("session-a"));
		expect(exitCode).toBe(0);
		expect(decisionOf(stdout)).toBe("deny");
		const reason = (
			JSON.parse(stdout) as {
				hookSpecificOutput: { permissionDecisionReason: string };
			}
		).hookSpecificOutput.permissionDecisionReason;
		expect(reason).toContain("superset:page");
		expect(reason).toContain("call Artifact again");
	});

	it("lets the second publish of the same session through", () => {
		freshStateDir();
		expect(decisionOf(runGuard(publishInput("session-a")).stdout)).toBe("deny");
		expect(runGuard(publishInput("session-a")).stdout).toBe("");
	});

	it("nudges each session independently", () => {
		freshStateDir();
		runGuard(publishInput("session-a"));
		expect(decisionOf(runGuard(publishInput("session-b")).stdout)).toBe("deny");
	});

	it("falls back to the terminal id when the payload carries no session id", () => {
		freshStateDir();
		const input = { ...publishInput("x"), session_id: undefined };
		expect(decisionOf(runGuard(input).stdout)).toBe("deny");
		expect(runGuard(input).stdout).toBe("");
	});

	it("ignores non-publish Artifact actions", () => {
		for (const action of ["list", "comments", "reply", "read_db", "write_db"]) {
			freshStateDir();
			const { stdout } = runGuard({
				session_id: "session-a",
				tool_name: "Artifact",
				tool_input: { action },
			});
			expect(stdout).toBe("");
		}
	});

	it("ignores a publish that updates an artifact the user already owns", () => {
		freshStateDir();
		const { stdout } = runGuard({
			session_id: "session-a",
			tool_name: "Artifact",
			tool_input: {
				file_path: "/tmp/report.html",
				url: "https://claude.ai/public/artifacts/abc",
			},
		});
		expect(stdout).toBe("");
	});

	it("ignores every other tool", () => {
		freshStateDir();
		const { stdout } = runGuard({
			session_id: "session-a",
			tool_name: "Write",
			tool_input: { file_path: "/tmp/report.html" },
		});
		expect(stdout).toBe("");
	});

	it("stays silent outside a Superset terminal", () => {
		freshStateDir();
		const { stdout } = runGuard(publishInput("session-a"), {
			SUPERSET_TERMINAL_ID: "",
			SUPERSET_TAB_ID: "",
		});
		expect(stdout).toBe("");
	});

	it("honours the SUPERSET_PAGES_NUDGE opt-out", () => {
		for (const value of ["0", "off", "false", "no"]) {
			freshStateDir();
			const { stdout } = runGuard(publishInput("session-a"), {
				SUPERSET_PAGES_NUDGE: value,
			});
			expect(stdout).toBe("");
		}
	});

	it("renders the marker into the provisioned script", () => {
		expect(getArtifactGuardScriptContent()).toContain(
			ARTIFACT_GUARD_SCRIPT_MARKER,
		);
		expect(getArtifactGuardScriptContent()).not.toContain("{{MARKER}}");
	});
});
