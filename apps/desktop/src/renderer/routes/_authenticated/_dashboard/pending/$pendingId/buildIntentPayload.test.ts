import { describe, expect, test } from "bun:test";
import type { PendingWorkspaceRow } from "renderer/routes/_authenticated/providers/CollectionsProvider/dashboardSidebarLocal/schema";
import {
	buildAdoptPayload,
	buildCheckoutPayload,
	buildForkPayload,
	buildPrCheckoutPayload,
	mapLinkedContextFromPending,
} from "./buildIntentPayload";

function makePending(
	overrides: Partial<PendingWorkspaceRow> = {},
): PendingWorkspaceRow {
	return {
		id: "11111111-1111-1111-1111-111111111111",
		projectId: "22222222-2222-2222-2222-222222222222",
		hostTarget: { kind: "local" },
		intent: "fork",
		name: "my-workspace",
		branchName: "feature-foo",
		status: "creating",
		error: null,
		workspaceId: null,
		warnings: [],
		terminals: [],
		createdAt: new Date("2026-04-13T00:00:00Z"),
		prompt: "",
		baseBranch: null,
		baseBranchSource: null,
		linkedIssues: [],
		linkedPR: null,
		attachmentCount: 0,
		runSetupScript: true,
		terminalLaunch: null,
		chatLaunch: null,
		...overrides,
	};
}

describe("mapLinkedContextFromPending", () => {
	test("extracts internal task ids from linkedIssues", () => {
		const mapped = mapLinkedContextFromPending({
			linkedIssues: [
				{ slug: "SUP-1", title: "a", source: "internal", taskId: "t1" },
				{ slug: "SUP-2", title: "b", source: "internal", taskId: "t2" },
			],
			linkedPR: null,
		});
		expect(mapped.internalIssueIds).toEqual(["t1", "t2"]);
		expect(mapped.githubIssueUrls).toBeUndefined();
		expect(mapped.linkedPrUrl).toBeUndefined();
	});

	test("extracts github urls from linkedIssues", () => {
		const mapped = mapLinkedContextFromPending({
			linkedIssues: [
				{
					slug: "#1",
					title: "a",
					source: "github",
					url: "https://github.com/o/r/issues/1",
				},
			],
			linkedPR: null,
		});
		expect(mapped.githubIssueUrls).toEqual(["https://github.com/o/r/issues/1"]);
		expect(mapped.internalIssueIds).toBeUndefined();
	});

	test("skips internal issues missing taskId and github issues missing url", () => {
		const mapped = mapLinkedContextFromPending({
			linkedIssues: [
				{ slug: "SUP-1", title: "no task id", source: "internal" },
				{ slug: "#1", title: "no url", source: "github" },
			],
			linkedPR: null,
		});
		expect(mapped.internalIssueIds).toBeUndefined();
		expect(mapped.githubIssueUrls).toBeUndefined();
	});

	test("surfaces linkedPR.url", () => {
		const mapped = mapLinkedContextFromPending({
			linkedIssues: [],
			linkedPR: {
				prNumber: 42,
				title: "PR 42",
				url: "https://github.com/o/r/pull/42",
				state: "open",
			},
		});
		expect(mapped.linkedPrUrl).toBe("https://github.com/o/r/pull/42");
	});

	test("returns all undefined for empty input", () => {
		const mapped = mapLinkedContextFromPending({
			linkedIssues: [],
			linkedPR: null,
		});
		expect(mapped).toEqual({
			internalIssueIds: undefined,
			githubIssueUrls: undefined,
			linkedPrUrl: undefined,
		});
	});
});

describe("buildForkPayload", () => {
	test("passes fork-specific fields and linked context", () => {
		const pending = makePending({
			intent: "fork",
			prompt: "do the thing",
			baseBranch: "main",
			baseBranchSource: "local",
			linkedIssues: [
				{ slug: "SUP-1", title: "a", source: "internal", taskId: "t1" },
			],
			linkedPR: {
				prNumber: 3,
				title: "p",
				url: "https://github.com/o/r/pull/3",
				state: "open",
			},
		});
		const payload = buildForkPayload("pid", pending, undefined);
		expect(payload.pendingId).toBe("pid");
		expect(payload.projectId).toBe(pending.projectId);
		expect(payload.hostTarget).toEqual({ kind: "local" });
		expect(payload.names).toEqual({
			workspaceName: "my-workspace",
			branchName: "feature-foo",
		});
		expect(payload.composer.prompt).toBe("do the thing");
		expect(payload.composer.baseBranch).toBe("main");
		expect(payload.composer.baseBranchSource).toBe("local");
		expect(payload.linkedContext?.internalIssueIds).toEqual(["t1"]);
		expect(payload.linkedContext?.linkedPrUrl).toBe(
			"https://github.com/o/r/pull/3",
		);
	});

	test("empty prompt/baseBranch become undefined, not empty strings", () => {
		const pending = makePending({ prompt: "", baseBranch: null });
		const payload = buildForkPayload("pid", pending, undefined);
		expect(payload.composer.prompt).toBeUndefined();
		expect(payload.composer.baseBranch).toBeUndefined();
	});

	test("attachments are plumbed through linkedContext", () => {
		const pending = makePending();
		const payload = buildForkPayload("pid", pending, [
			{ data: "b64", mediaType: "image/png", filename: "a.png" },
		]);
		expect(payload.linkedContext?.attachments).toHaveLength(1);
	});

	test("host-tracking hostTarget survives the map", () => {
		const pending = makePending({
			hostTarget: { kind: "host", hostId: "h-1" },
		});
		const payload = buildForkPayload("pid", pending, undefined);
		expect(payload.hostTarget).toEqual({ kind: "host", hostId: "h-1" });
	});
});

describe("buildCheckoutPayload", () => {
	test("sends branch + runSetupScript; no composer prompt/baseBranch", () => {
		const pending = makePending({
			intent: "checkout",
			branchName: "feature-foo",
			runSetupScript: false,
		});
		const payload = buildCheckoutPayload("pid", pending);
		expect(payload.branch).toBe("feature-foo");
		expect(payload.workspaceName).toBe("my-workspace");
		expect(payload.composer).toEqual({ runSetupScript: false });
	});
});

describe("buildPrCheckoutPayload", () => {
	const prContent = {
		number: 42,
		url: "https://github.com/o/r/pull/42",
		title: "Fix typo",
		branch: "fix/typo",
		baseBranch: "main",
		headRepositoryOwner: "kietho",
		isCrossRepository: true,
		state: "open",
		body: "body text",
	};

	test("maps PR content into the pr input with normalized state", () => {
		const pending = makePending({
			intent: "pr-checkout",
			prompt: "review this PR",
			linkedPR: {
				prNumber: 42,
				title: "Fix typo",
				url: "https://github.com/o/r/pull/42",
				state: "open",
			},
		});
		const payload = buildPrCheckoutPayload("pid", pending, prContent);

		expect(payload.pr).toEqual({
			number: 42,
			url: "https://github.com/o/r/pull/42",
			title: "Fix typo",
			headRefName: "fix/typo",
			baseRefName: "main",
			headRepositoryOwner: "kietho",
			isCrossRepository: true,
			state: "open",
		});
		expect(payload.branch).toBeUndefined();
	});

	test("composer.baseBranch = PR's baseRefName (Changes-tab authority)", () => {
		const pending = makePending({ intent: "pr-checkout" });
		const payload = buildPrCheckoutPayload("pid", pending, {
			...prContent,
			baseBranch: "develop",
		});
		expect(payload.composer.baseBranch).toBe("develop");
	});

	test("preserves prompt and runSetupScript from pending row", () => {
		const pending = makePending({
			intent: "pr-checkout",
			prompt: "hey",
			runSetupScript: false,
		});
		const payload = buildPrCheckoutPayload("pid", pending, prContent);
		expect(payload.composer.prompt).toBe("hey");
		expect(payload.composer.runSetupScript).toBe(false);
	});

	test("linkedPrUrl falls back to PR content URL when linkedPR-level missing", () => {
		// linkedPR exists but for some reason url isn't in the linkedIssues map
		// (shouldn't happen normally, but be resilient).
		const pending = makePending({
			intent: "pr-checkout",
			linkedPR: null,
		});
		const payload = buildPrCheckoutPayload("pid", pending, prContent);
		expect(payload.linkedContext?.linkedPrUrl).toBe(
			"https://github.com/o/r/pull/42",
		);
	});

	test("closed state maps to closed", () => {
		const pending = makePending({ intent: "pr-checkout" });
		const payload = buildPrCheckoutPayload("pid", pending, {
			...prContent,
			state: "closed",
		});
		expect(payload.pr?.state).toBe("closed");
	});

	test("merged state maps to merged", () => {
		const pending = makePending({ intent: "pr-checkout" });
		const payload = buildPrCheckoutPayload("pid", pending, {
			...prContent,
			state: "merged",
		});
		expect(payload.pr?.state).toBe("merged");
	});

	test("unknown state falls back to open (safe default)", () => {
		const pending = makePending({ intent: "pr-checkout" });
		const payload = buildPrCheckoutPayload("pid", pending, {
			...prContent,
			state: "draft",
		});
		expect(payload.pr?.state).toBe("open");
	});

	test("throws clear error for cross-repo PR with deleted fork (null owner)", () => {
		const pending = makePending({ intent: "pr-checkout" });
		expect(() =>
			buildPrCheckoutPayload("pid", pending, {
				...prContent,
				headRepositoryOwner: null,
				isCrossRepository: true,
			}),
		).toThrow("head fork repository has been deleted");
	});

	test("same-repo PR with null owner is fine (owner not needed)", () => {
		const pending = makePending({ intent: "pr-checkout" });
		const payload = buildPrCheckoutPayload("pid", pending, {
			...prContent,
			headRepositoryOwner: null,
			isCrossRepository: false,
		});
		expect(payload.pr?.headRepositoryOwner).toBe("");
	});
});

describe("buildAdoptPayload", () => {
	test("minimal payload: projectId + host + name + branch", () => {
		const pending = makePending({
			intent: "adopt",
			branchName: "agreeable-ermine",
		});
		const payload = buildAdoptPayload(pending);
		expect(payload).toEqual({
			projectId: pending.projectId,
			hostTarget: { kind: "local" },
			workspaceName: "my-workspace",
			branch: "agreeable-ermine",
		});
	});
});
