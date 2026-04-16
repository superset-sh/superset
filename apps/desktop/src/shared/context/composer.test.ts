import { describe, expect, test } from "bun:test";
import { buildLaunchContext, CONTRIBUTOR_TIMEOUT_MS } from "./composer";
import type {
	ContextContributor,
	ContextSection,
	ContributorRegistry,
	LaunchSource,
	ResolveCtx,
} from "./types";

function makeContributor<K extends LaunchSource["kind"]>(
	kind: K,
	resolver: (
		source: Extract<LaunchSource, { kind: K }>,
	) => Promise<ContextSection | null>,
): ContextContributor<Extract<LaunchSource, { kind: K }>> {
	return {
		kind,
		displayName: kind,
		description: kind,
		requiresQuery: false,
		resolve: (source) => resolver(source),
	} as ContextContributor<Extract<LaunchSource, { kind: K }>>;
}

function registry(
	overrides: Partial<{
		[K in LaunchSource["kind"]]: ContextContributor<
			Extract<LaunchSource, { kind: K }>
		>;
	}>,
): ContributorRegistry {
	const defaults: ContributorRegistry = {
		"user-prompt": makeContributor("user-prompt", async (s) => ({
			id: "user-prompt",
			kind: "user-prompt",
			label: "Prompt",
			content: s.content,
		})),
		"github-issue": makeContributor("github-issue", async (s) => ({
			id: `issue:${s.url}`,
			kind: "github-issue",
			label: s.url,
			content: [{ type: "text", text: s.url }],
			meta: { url: s.url, taskSlug: `slug-${s.url}` },
		})),
		"github-pr": makeContributor("github-pr", async (s) => ({
			id: `pr:${s.url}`,
			kind: "github-pr",
			label: s.url,
			content: [{ type: "text", text: s.url }],
			meta: { url: s.url },
		})),
		"internal-task": makeContributor("internal-task", async (s) => ({
			id: `task:${s.id}`,
			kind: "internal-task",
			label: s.id,
			content: [{ type: "text", text: s.id }],
			meta: { taskSlug: `task-slug-${s.id}` },
		})),
		attachment: makeContributor("attachment", async (s) => ({
			id: `attachment:${s.file.filename ?? "unnamed"}`,
			kind: "attachment",
			label: s.file.filename ?? "attachment",
			content: [
				{
					type: "file",
					data: s.file.data,
					mediaType: s.file.mediaType,
					filename: s.file.filename,
				},
			],
		})),
	};

	return { ...defaults, ...overrides };
}

const resolveCtx: ResolveCtx = {
	projectId: "project-1",
	signal: new AbortController().signal,
	fetchIssue: async () => {
		throw new Error("not used in tests");
	},
	fetchPullRequest: async () => {
		throw new Error("not used in tests");
	},
	fetchInternalTask: async () => {
		throw new Error("not used in tests");
	},
};

describe("buildLaunchContext", () => {
	test("empty sources produce empty sections", async () => {
		const ctx = await buildLaunchContext(
			{ projectId: "p", sources: [], agent: { id: "none" } },
			{ contributors: registry({}), resolveCtx },
		);
		expect(ctx.sections).toEqual([]);
		expect(ctx.failures).toEqual([]);
		expect(ctx.taskSlug).toBeUndefined();
	});

	test("dedups github-issue sources by url before dispatch", async () => {
		let calls = 0;
		const ctx = await buildLaunchContext(
			{
				projectId: "p",
				sources: [
					{ kind: "github-issue", url: "https://x/issues/1" },
					{ kind: "github-issue", url: "https://x/issues/1" }, // dup
				],
				agent: { id: "none" },
			},
			{
				contributors: registry({
					"github-issue": makeContributor("github-issue", async (s) => {
						calls++;
						return {
							id: `issue:${s.url}`,
							kind: "github-issue",
							label: s.url,
							content: [{ type: "text", text: s.url }],
						};
					}),
				}),
				resolveCtx,
			},
		);
		expect(calls).toBe(1);
		expect(ctx.sections).toHaveLength(1);
	});

	test("preserves input order within a kind", async () => {
		const ctx = await buildLaunchContext(
			{
				projectId: "p",
				sources: [
					{ kind: "github-issue", url: "https://x/issues/2" },
					{ kind: "github-issue", url: "https://x/issues/1" },
				],
				agent: { id: "none" },
			},
			{ contributors: registry({}), resolveCtx },
		);
		expect(ctx.sections.map((s) => s.id)).toEqual([
			"issue:https://x/issues/2",
			"issue:https://x/issues/1",
		]);
	});

	test("applies default kind group order across sections", async () => {
		const ctx = await buildLaunchContext(
			{
				projectId: "p",
				sources: [
					{ kind: "github-pr", url: "https://x/pull/1" },
					{
						kind: "attachment",
						file: {
							data: new Uint8Array([0]),
							mediaType: "text/plain",
							filename: "a.txt",
						},
					},
					{ kind: "github-issue", url: "https://x/issues/1" },
					{ kind: "internal-task", id: "T-1" },
					{ kind: "user-prompt", content: [{ type: "text", text: "hi" }] },
				],
				agent: { id: "none" },
			},
			{ contributors: registry({}), resolveCtx },
		);
		expect(ctx.sections.map((s) => s.kind)).toEqual([
			"user-prompt",
			"internal-task",
			"github-issue",
			"github-pr",
			"attachment",
		]);
	});

	test("taskSlug: first internal-task wins", async () => {
		const ctx = await buildLaunchContext(
			{
				projectId: "p",
				sources: [
					{ kind: "github-issue", url: "https://x/issues/1" },
					{ kind: "internal-task", id: "T-1" },
					{ kind: "internal-task", id: "T-2" },
				],
				agent: { id: "none" },
			},
			{ contributors: registry({}), resolveCtx },
		);
		expect(ctx.taskSlug).toBe("task-slug-T-1");
	});

	test("taskSlug falls back to first github-issue when no task", async () => {
		const ctx = await buildLaunchContext(
			{
				projectId: "p",
				sources: [
					{ kind: "github-issue", url: "https://x/issues/2" },
					{ kind: "github-issue", url: "https://x/issues/1" },
				],
				agent: { id: "none" },
			},
			{ contributors: registry({}), resolveCtx },
		);
		expect(ctx.taskSlug).toBe("slug-https://x/issues/2");
	});

	test("taskSlug undefined when no task or issue", async () => {
		const ctx = await buildLaunchContext(
			{
				projectId: "p",
				sources: [
					{ kind: "user-prompt", content: [{ type: "text", text: "hi" }] },
				],
				agent: { id: "none" },
			},
			{ contributors: registry({}), resolveCtx },
		);
		expect(ctx.taskSlug).toBeUndefined();
	});

	test("per-source failure populates failures[] and launch continues", async () => {
		const ctx = await buildLaunchContext(
			{
				projectId: "p",
				sources: [
					{ kind: "github-issue", url: "https://x/issues/1" },
					{ kind: "github-issue", url: "https://x/issues/2" },
					{ kind: "user-prompt", content: [{ type: "text", text: "hi" }] },
				],
				agent: { id: "none" },
			},
			{
				contributors: registry({
					"github-issue": makeContributor("github-issue", async (s) => {
						if (s.url.endsWith("/2")) throw new Error("boom");
						return {
							id: `issue:${s.url}`,
							kind: "github-issue",
							label: s.url,
							content: [{ type: "text", text: s.url }],
						};
					}),
				}),
				resolveCtx,
			},
		);
		expect(ctx.sections).toHaveLength(2); // issue 1 + prompt
		expect(ctx.failures).toHaveLength(1);
		expect(ctx.failures[0]?.error).toBe("boom");
	});

	test("contributor returning null is dropped silently (not a failure)", async () => {
		const ctx = await buildLaunchContext(
			{
				projectId: "p",
				sources: [{ kind: "github-issue", url: "https://x/issues/1" }],
				agent: { id: "none" },
			},
			{
				contributors: registry({
					"github-issue": makeContributor("github-issue", async () => null),
				}),
				resolveCtx,
			},
		);
		expect(ctx.sections).toEqual([]);
		expect(ctx.failures).toEqual([]);
	});

	test("contributor exceeding timeout is a failure", async () => {
		const ctx = await buildLaunchContext(
			{
				projectId: "p",
				sources: [{ kind: "github-issue", url: "https://x/issues/1" }],
				agent: { id: "none" },
			},
			{
				contributors: registry({
					"github-issue": makeContributor(
						"github-issue",
						() => new Promise(() => {}), // never resolves
					),
				}),
				resolveCtx,
				timeoutMs: 10,
			},
		);
		expect(ctx.sections).toEqual([]);
		expect(ctx.failures).toHaveLength(1);
		expect(ctx.failures[0]?.error).toMatch(/timeout/i);
	});

	test("default timeout is 10s", () => {
		expect(CONTRIBUTOR_TIMEOUT_MS).toBe(10_000);
	});

	test("attachments are not deduped even without filename", async () => {
		const ctx = await buildLaunchContext(
			{
				projectId: "p",
				sources: [
					{
						kind: "attachment",
						file: { data: new Uint8Array([1]), mediaType: "text/plain" },
					},
					{
						kind: "attachment",
						file: { data: new Uint8Array([2]), mediaType: "text/plain" },
					},
				],
				agent: { id: "none" },
			},
			{ contributors: registry({}), resolveCtx },
		);
		expect(ctx.sections).toHaveLength(2);
	});
});
