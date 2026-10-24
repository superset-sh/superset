import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runSandboxArchiveHook } from "./sandbox-archive-hook";
import type { SandboxIdentity } from "./sandbox-self-seed";

let root: string;
let previousRunMode: string | undefined;

function identity(): SandboxIdentity {
	return {
		workspaceId: "ws-1",
		workspaceName: "ws",
		projectName: "repo",
		branch: "main",
		workspaceRoot: root,
		worktreePath: root,
		repositories: [],
		launch: null,
		launchMarkerPath: join(root, "launch.marker"),
	};
}

function writeConfig(content: string) {
	mkdirSync(join(root, ".superset"), { recursive: true });
	writeFileSync(join(root, ".superset", "config.toml"), content, "utf-8");
}

beforeEach(() => {
	root = mkdtempSync(join(tmpdir(), "archive-hook-test-"));
	previousRunMode = process.env.SUPERSET_HOST_RUN_MODE;
	process.env.SUPERSET_HOST_RUN_MODE = "sandbox";
});

afterEach(() => {
	rmSync(root, { recursive: true, force: true });
	if (previousRunMode === undefined) delete process.env.SUPERSET_HOST_RUN_MODE;
	else process.env.SUPERSET_HOST_RUN_MODE = previousRunMode;
});

describe("runSandboxArchiveHook", () => {
	it("runs the cloud archive commands, not the shared ones", async () => {
		writeConfig(
			'[archive]\nrun = "echo shared"\n[archive.cloud]\nrun = ["echo cloud", "echo done"]\n',
		);
		const result = await runSandboxArchiveHook(identity());
		expect(result.status).toBe("ok");
		expect(result.status === "ok" && result.outputTail).toBe("cloud\ndone\n");
	});

	it("is skipped when there is nothing to run", async () => {
		writeConfig('[archive]\nrun = "echo x"\n[archive.cloud]\nrun = []\n');
		expect(await runSandboxArchiveHook(identity())).toEqual({
			status: "skipped",
		});
	});

	it("reports a failing command with its output", async () => {
		writeConfig('[archive]\nrun = "echo boom >&2; exit 3"\n');
		const result = await runSandboxArchiveHook(identity());
		expect(result).toMatchObject({
			status: "failed",
			exitCode: 3,
			timedOut: false,
		});
		expect(result.status === "failed" && result.outputTail).toContain("boom");
	});

	it("stops every process of a command that runs past the timeout", async () => {
		writeConfig('[archive]\nrun = ["sleep 5", "echo late"]\n');
		const started = Date.now();
		const result = await runSandboxArchiveHook(identity(), { timeoutMs: 200 });
		expect(result).toMatchObject({ status: "failed", timedOut: true });
		expect(Date.now() - started).toBeLessThan(2_000);
	});

	it("never runs a v1 config.json teardown", async () => {
		mkdirSync(join(root, ".superset"), { recursive: true });
		writeFileSync(
			join(root, ".superset", "config.json"),
			JSON.stringify({ teardown: ["echo local-only"] }),
		);
		expect(await runSandboxArchiveHook(identity())).toEqual({
			status: "skipped",
		});
	});
});
