import { afterEach, describe, expect, test } from "bun:test";
import { tmpdir } from "node:os";
import {
	getHeadlessCreatePrRun,
	HeadlessCreatePrAlreadyRunning,
	type HeadlessCreatePrRun,
	resetHeadlessCreatePrRunsForTests,
	startHeadlessCreatePr,
} from "./headless-create-pr";

function finished(
	args: Omit<Parameters<typeof startHeadlessCreatePr>[0], "onFinished">,
): Promise<HeadlessCreatePrRun> {
	return new Promise((resolve) => {
		startHeadlessCreatePr({ ...args, onFinished: resolve });
	});
}

describe("startHeadlessCreatePr", () => {
	afterEach(() => resetHeadlessCreatePrRunsForTests());

	test("tracks a clean exit as succeeded and passes the prompt as the last argument", async () => {
		const run = await finished({
			workspaceId: "ws",
			presetId: "claude",
			command: "printf '%s'",
			prompt: "hello\nworld",
			cwd: tmpdir(),
		});
		expect(run.status).toBe("succeeded");
		expect(run.outputTail).toBe("hello\nworld");
		expect(getHeadlessCreatePrRun("ws")?.status).toBe("succeeded");
	});

	test("a non-zero exit is failed with the stderr tail", async () => {
		const run = await finished({
			workspaceId: "ws",
			presetId: "claude",
			command: "sh -c 'echo boom >&2; exit 3' sh",
			prompt: "p",
			cwd: tmpdir(),
		});
		expect(run.status).toBe("failed");
		expect(run.error).toBe("claude exited with 3: boom");
	});

	test("a run past the timeout is killed and failed", async () => {
		const run = await finished({
			workspaceId: "ws",
			presetId: "claude",
			command: "sh -c 'sleep 30' sh",
			prompt: "p",
			cwd: tmpdir(),
			timeoutMs: 200,
		});
		expect(run.status).toBe("failed");
		expect(run.error).toMatch(/^Timed out/);
	});

	test("one run per workspace at a time", async () => {
		const first = new Promise<HeadlessCreatePrRun>((resolve) => {
			startHeadlessCreatePr({
				workspaceId: "ws",
				presetId: "claude",
				command: "sh -c 'sleep 0.3' sh",
				prompt: "p",
				cwd: tmpdir(),
				onFinished: resolve,
			});
		});
		expect(() =>
			startHeadlessCreatePr({
				workspaceId: "ws",
				presetId: "claude",
				command: "true",
				prompt: "p",
				cwd: tmpdir(),
			}),
		).toThrow(HeadlessCreatePrAlreadyRunning);
		expect(getHeadlessCreatePrRun("ws")?.status).toBe("running");
		await first;
		expect(getHeadlessCreatePrRun("other")).toBeNull();
	});
});
