import { describe, expect, it } from "bun:test";
import {
	buildBulkWorkspaceInspectionSummary,
	executeBulkWorkspaceDeleteTargets,
} from "./bulkWorkspaceDelete";

const workspaces = [
	{ id: "clean", name: "Clean", branch: "clean" },
	{ id: "dirty", name: "Dirty", branch: "dirty" },
	{ id: "offline", name: "Offline", branch: "offline" },
	{ id: "main", name: "Main", branch: "main" },
];

describe("buildBulkWorkspaceInspectionSummary", () => {
	it("annotates risk and blocks confirmation only on hard blockers", () => {
		const summary = buildBulkWorkspaceInspectionSummary(
			workspaces,
			new Map([
				[
					"clean",
					{
						status: "ready" as const,
						preview: {
							canDelete: true as const,
							reason: null,
							hasChanges: false,
							hasUnpushedCommits: false,
						},
					},
				],
				[
					"dirty",
					{
						status: "ready" as const,
						preview: {
							canDelete: true as const,
							reason: null,
							hasChanges: true,
							hasUnpushedCommits: true,
						},
					},
				],
				["offline", { status: "error" as const }],
				[
					"main",
					{
						status: "ready" as const,
						preview: {
							canDelete: false as const,
							reason: "Main workspaces cannot be deleted",
							hasChanges: false as const,
							hasUnpushedCommits: false as const,
						},
					},
				],
			]),
		);

		// The main-workspace blocker gates confirmation; the failed check
		// ("offline") does not — it flips the copy to "Delete without checking".
		expect(summary.canConfirm).toBeFalse();
		expect(summary.changedCount).toBe(1);
		expect(summary.unpushedCount).toBe(1);
		expect(summary.errorCount).toBe(1);
		expect(summary.uncheckedCount).toBe(1);
		expect(summary.blocked).toEqual([
			{
				workspaceId: "main",
				workspaceName: "Main",
				reason: "Main workspaces cannot be deleted",
			},
		]);
		expect(
			summary.items.find((item) => item.workspaceId === "dirty"),
		).toMatchObject({
			status: "ready",
			hasChanges: true,
			hasUnpushedCommits: true,
		});
	});

	it("keeps confirmation enabled while checks are pending or failed", () => {
		const summary = buildBulkWorkspaceInspectionSummary(
			workspaces.slice(0, 3),
			new Map([
				["clean", { status: "loading" as const }],
				["offline", { status: "error" as const }],
			]),
		);

		expect(summary.canConfirm).toBeTrue();
		expect(summary.loadingCount).toBe(2);
		expect(summary.errorCount).toBe(1);
		expect(summary.uncheckedCount).toBe(3);
	});

	it("enables confirmation when every target has a ready deletable preview", () => {
		const summary = buildBulkWorkspaceInspectionSummary(
			workspaces.slice(0, 2),
			new Map([
				[
					"clean",
					{
						status: "ready" as const,
						preview: {
							canDelete: true as const,
							reason: null,
							hasChanges: false,
							hasUnpushedCommits: false,
						},
					},
				],
				[
					"dirty",
					{
						status: "ready" as const,
						preview: {
							canDelete: true as const,
							reason: null,
							hasChanges: true,
							hasUnpushedCommits: false,
						},
					},
				],
			]),
		);

		expect(summary.canConfirm).toBeTrue();
		expect(summary.loadingCount).toBe(0);
	});
});

describe("executeBulkWorkspaceDeleteTargets", () => {
	it("runs targets sequentially with each target's confirmed force choice", async () => {
		const calls: Array<{ workspace: string; force: boolean }> = [];
		let activeCalls = 0;
		let maxActiveCalls = 0;
		let settledCount = 0;

		const result = await executeBulkWorkspaceDeleteTargets<
			string,
			string,
			Error
		>({
			targets: ["clean", "dirty"],
			shouldForce: (workspace) => workspace === "dirty",
			destroy: async (workspace, force) => {
				activeCalls += 1;
				maxActiveCalls = Math.max(maxActiveCalls, activeCalls);
				calls.push({ workspace, force });
				await Promise.resolve();
				activeCalls -= 1;
				return `${workspace}-deleted`;
			},
			onSettled: () => {
				settledCount += 1;
			},
		});

		expect(calls).toEqual([
			{ workspace: "clean", force: false },
			{ workspace: "dirty", force: true },
		]);
		expect(maxActiveCalls).toBe(1);
		expect(settledCount).toBe(2);
		expect(result.successes.map(({ workspace }) => workspace)).toEqual([
			"clean",
			"dirty",
		]);
	});

	it("retains failures without force-retrying a clean-to-dirty race", async () => {
		const callCount = new Map<string, number>();
		const conflict = new Error("Worktree became dirty");

		const result = await executeBulkWorkspaceDeleteTargets<
			string,
			string,
			Error
		>({
			targets: ["clean", "raced", "later"],
			shouldForce: () => false,
			destroy: async (workspace) => {
				callCount.set(workspace, (callCount.get(workspace) ?? 0) + 1);
				if (workspace === "raced") throw conflict;
				return `${workspace}-deleted`;
			},
		});

		expect(callCount.get("raced")).toBe(1);
		expect(result.successes.map(({ workspace }) => workspace)).toEqual([
			"clean",
			"later",
		]);
		expect(result.failures).toEqual([{ workspace: "raced", error: conflict }]);
	});

	it("force-retries once when shouldRetryWithForce accepts the failure", async () => {
		const calls: Array<{ workspace: string; force: boolean }> = [];
		const conflict = new Error("Worktree has uncommitted changes");

		const result = await executeBulkWorkspaceDeleteTargets<
			string,
			string,
			Error
		>({
			targets: ["unchecked", "clean"],
			shouldForce: () => false,
			shouldRetryWithForce: (workspace, error) =>
				workspace === "unchecked" && error === conflict,
			destroy: async (workspace, force) => {
				calls.push({ workspace, force });
				if (workspace === "unchecked" && !force) throw conflict;
				return `${workspace}-deleted`;
			},
		});

		expect(calls).toEqual([
			{ workspace: "unchecked", force: false },
			{ workspace: "unchecked", force: true },
			{ workspace: "clean", force: false },
		]);
		expect(result.successes.map(({ workspace }) => workspace)).toEqual([
			"unchecked",
			"clean",
		]);
		expect(result.failures).toEqual([]);
	});

	it("does not retry an already-forced destroy", async () => {
		const calls: Array<{ workspace: string; force: boolean }> = [];
		const failure = new Error("still failing");

		const result = await executeBulkWorkspaceDeleteTargets<
			string,
			string,
			Error
		>({
			targets: ["ws"],
			shouldForce: () => true,
			shouldRetryWithForce: () => true,
			destroy: async (workspace, force) => {
				calls.push({ workspace, force });
				throw failure;
			},
		});

		expect(calls).toEqual([{ workspace: "ws", force: true }]);
		expect(result.failures).toEqual([{ workspace: "ws", error: failure }]);
	});
});
