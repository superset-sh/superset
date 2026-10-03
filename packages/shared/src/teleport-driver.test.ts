import { describe, expect, test } from "bun:test";
import { TELEPORT_STEPS, type TeleportStepId } from "./teleport";
import {
	runTeleport,
	type TeleportOperations,
	type TeleportProgress,
} from "./teleport-driver";

/**
 * The driver's whole job is order and the safety property that depends on
 * it, so these tests record the call sequence rather than inspecting state.
 */

function createOperations(
	failAt?: TeleportStepId,
	failure = new Error("boom"),
): { operations: TeleportOperations; calls: string[] } {
	const calls: string[] = [];
	const track = async (name: TeleportStepId) => {
		calls.push(name);
		if (name === failAt) throw failure;
	};

	return {
		calls,
		operations: {
			askAgentsForHandoff: () => track("handoff"),
			capture: async () => {
				await track("capture");
				return {
					ref: "refs/superset/teleport/w1",
					bundlePath: "/tmp/w1.bundle",
				};
			},
			createWorktree: async () => {
				await track("createWorktree");
				return { workspaceId: "dest-1", bundlePath: "/remote/w1.bundle" };
			},
			restore: () => track("restore"),
			runSetupScripts: () => track("setup"),
			rebuildTabs: () => track("tabs"),
			stopSource: () => track("stopSource"),
			startPrograms: () => track("launch"),
		},
	};
}

describe("runTeleport", () => {
	test("runs every step in the documented order", async () => {
		const { operations, calls } = createOperations();
		const result = await runTeleport(operations, () => {});

		expect(calls).toEqual([...TELEPORT_STEPS]);
		expect(result).toEqual({
			destinationWorkspaceId: "dest-1",
			failedAt: null,
			error: null,
		});
	});

	test("reports each step running then done", async () => {
		const { operations } = createOperations();
		const progress: TeleportProgress[] = [];
		await runTeleport(operations, (event) => progress.push(event));

		expect(progress).toHaveLength(TELEPORT_STEPS.length * 2);
		expect(progress[0]).toEqual({ step: "handoff", state: "running" });
		expect(progress[1]).toEqual({ step: "handoff", state: "done" });
		expect(progress.at(-1)).toEqual({ step: "launch", state: "done" });
	});

	test("stops at the first failure and reports it", async () => {
		const { operations, calls } = createOperations("restore");
		const progress: TeleportProgress[] = [];
		const result = await runTeleport(operations, (event) =>
			progress.push(event),
		);

		expect(calls).toEqual(["handoff", "capture", "createWorktree", "restore"]);
		expect(result.failedAt).toBe("restore");
		expect(result.error).toBe("boom");
		expect(progress.at(-1)).toEqual({
			step: "restore",
			state: "failed",
			error: "boom",
		});
	});

	test("never throws, whatever the operation threw", async () => {
		const { operations } = createOperations("capture", "a string" as never);
		const result = await runTeleport(operations, () => {});
		expect(result.failedAt).toBe("capture");
		expect(result.error).toBe("a string");
	});

	describe("the source is only given up once the work has landed", () => {
		// The property the whole design rests on. Each failure point before
		// `stopSource` must leave the source untouched.
		for (const failAt of [
			"handoff",
			"capture",
			"createWorktree",
			"restore",
			"setup",
			"tabs",
		] as const) {
			test(`a failure at ${failAt} never stops the source`, async () => {
				const { operations, calls } = createOperations(failAt);
				await runTeleport(operations, () => {});
				expect(calls).not.toContain("stopSource");
			});
		}

		test("stopSource runs only after restore and tabs succeeded", async () => {
			const { operations, calls } = createOperations();
			await runTeleport(operations, () => {});

			expect(calls.indexOf("stopSource")).toBeGreaterThan(
				calls.indexOf("restore"),
			);
			expect(calls.indexOf("stopSource")).toBeGreaterThan(
				calls.indexOf("tabs"),
			);
		});

		test("a failure launching programs still leaves the work delivered", async () => {
			// The one failure after the hand-over. The destination has the
			// work, so the result must name it rather than reporting nothing.
			const { operations } = createOperations("launch");
			const result = await runTeleport(operations, () => {});

			expect(result.failedAt).toBe("launch");
			expect(result.destinationWorkspaceId).toBe("dest-1");
		});
	});

	test("passes the capture through to the destination", async () => {
		const seen: unknown[] = [];
		const { operations } = createOperations();
		await runTeleport(
			{
				...operations,
				createWorktree: async (capture) => {
					seen.push(capture);
					return { workspaceId: "dest-1", bundlePath: "/remote/w1.bundle" };
				},
				restore: async (input) => {
					seen.push(input);
				},
			},
			() => {},
		);

		expect(seen[0]).toEqual({
			ref: "refs/superset/teleport/w1",
			bundlePath: "/tmp/w1.bundle",
		});
		// The restore uses the destination's copy of the bundle, not the
		// source path — getting this wrong makes restore fail on a remote host
		// while passing on a local one.
		expect(seen[1]).toEqual({
			workspaceId: "dest-1",
			ref: "refs/superset/teleport/w1",
			bundlePath: "/remote/w1.bundle",
		});
	});
});
