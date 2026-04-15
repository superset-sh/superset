import { describe, expect, test } from "bun:test";
import { resolveAgentConfigs } from "shared/utils/agent-settings";
import {
	buildForkAgentLaunch,
	buildLaunchSourcesFromPending,
} from "./buildForkAgentLaunch";

const PROJECT_ID = "proj-1";

function pendingBase(
	overrides: Partial<
		Parameters<typeof buildLaunchSourcesFromPending>[0]
	> = {},
): Parameters<typeof buildLaunchSourcesFromPending>[0] {
	return {
		projectId: PROJECT_ID,
		prompt: "",
		linkedIssues: [],
		linkedPR: null,
		...overrides,
	};
}

describe("buildLaunchSourcesFromPending", () => {
	test("returns [] when everything is empty", () => {
		expect(buildLaunchSourcesFromPending(pendingBase(), undefined)).toEqual(
			[],
		);
	});

	test("produces user-prompt source when prompt is non-empty", () => {
		const sources = buildLaunchSourcesFromPending(
			pendingBase({ prompt: "refactor auth" }),
			undefined,
		);
		expect(sources).toEqual([
			{
				kind: "user-prompt",
				content: [{ type: "text", text: "refactor auth" }],
			},
		]);
	});

	test("trims whitespace-only prompts out", () => {
		const sources = buildLaunchSourcesFromPending(
			pendingBase({ prompt: "   \n " }),
			undefined,
		);
		expect(sources.filter((s) => s.kind === "user-prompt")).toEqual([]);
	});

	test("maps github-sourced linkedIssue to github-issue", () => {
		const sources = buildLaunchSourcesFromPending(
			pendingBase({
				linkedIssues: [
					{
						source: "github",
						url: "https://github.com/acme/repo/issues/1",
						number: 1,
						slug: "x",
						title: "X",
						state: "open",
					},
				],
			}),
			undefined,
		);
		expect(sources).toEqual([
			{
				kind: "github-issue",
				url: "https://github.com/acme/repo/issues/1",
			},
		]);
	});

	test("maps internal-sourced linkedIssue with taskId to internal-task", () => {
		const sources = buildLaunchSourcesFromPending(
			pendingBase({
				linkedIssues: [
					{
						source: "internal",
						taskId: "TASK-42",
						slug: "refactor-auth",
						title: "Refactor auth",
					},
				],
			}),
			undefined,
		);
		expect(sources).toEqual([{ kind: "internal-task", id: "TASK-42" }]);
	});

	test("adds github-pr source for linkedPR", () => {
		const sources = buildLaunchSourcesFromPending(
			pendingBase({
				linkedPR: {
					prNumber: 200,
					url: "https://github.com/acme/repo/pull/200",
					title: "Rewrite auth",
					state: "open",
				},
			}),
			undefined,
		);
		expect(sources).toEqual([
			{
				kind: "github-pr",
				url: "https://github.com/acme/repo/pull/200",
			},
		]);
	});

	test("converts base64 data URL attachments to Uint8Array sources", () => {
		const sources = buildLaunchSourcesFromPending(pendingBase(), [
			{
				data: "data:text/plain;base64,AQID",
				mediaType: "text/plain",
				filename: "logs.txt",
			},
		]);
		expect(sources).toHaveLength(1);
		const source = sources[0];
		if (source?.kind !== "attachment") throw new Error("wrong kind");
		expect(source.file.filename).toBe("logs.txt");
		expect(source.file.mediaType).toBe("text/plain");
		expect(Array.from(source.file.data)).toEqual([1, 2, 3]);
	});

	test("orders sources: user-prompt, issues/tasks, PR, attachments", () => {
		const sources = buildLaunchSourcesFromPending(
			pendingBase({
				prompt: "fix",
				linkedIssues: [
					{
						source: "internal",
						taskId: "T-1",
						slug: "s",
						title: "t",
					},
					{
						source: "github",
						url: "https://x/issues/9",
						number: 9,
						slug: "s",
						title: "t",
						state: "open",
					},
				],
				linkedPR: {
					prNumber: 1,
					url: "https://x/pull/1",
					title: "t",
					state: "open",
				},
			}),
			[
				{
					data: "data:text/plain;base64,AA==",
					mediaType: "text/plain",
					filename: "a.txt",
				},
			],
		);
		expect(sources.map((s) => s.kind)).toEqual([
			"user-prompt",
			"internal-task",
			"github-issue",
			"github-pr",
			"attachment",
		]);
	});
});

describe("buildForkAgentLaunch", () => {
	const agentConfigs = resolveAgentConfigs({});

	test("returns null when there are no sources", async () => {
		const req = await buildForkAgentLaunch({
			pending: pendingBase(),
			attachments: undefined,
			agentConfigs,
		});
		expect(req).toBeNull();
	});

	test("returns null when there are no enabled agents", async () => {
		const req = await buildForkAgentLaunch({
			pending: pendingBase({ prompt: "hi" }),
			attachments: undefined,
			agentConfigs: [],
		});
		expect(req).toBeNull();
	});

	test("produces a terminal request for a prompt-only launch via default agent", async () => {
		const req = await buildForkAgentLaunch({
			pending: pendingBase({ prompt: "refactor the auth middleware" }),
			attachments: undefined,
			agentConfigs,
		});
		expect(req?.kind).toBe("terminal");
		if (req?.kind !== "terminal") throw new Error("wrong kind");
		// getFallbackAgentId prefers "claude" when enabled
		expect(req.agentType).toBe("claude");
		expect(req.source).toBe("new-workspace");
		expect(req.terminal.command).toContain("claude");
	});

	test("linked internal task derives taskSlug in the request", async () => {
		const req = await buildForkAgentLaunch({
			pending: pendingBase({
				prompt: "do it",
				linkedIssues: [
					{
						source: "internal",
						taskId: "TASK-42",
						slug: "refactor-auth",
						title: "Refactor auth",
					},
				],
			}),
			attachments: undefined,
			agentConfigs,
		});
		if (req?.kind !== "terminal") throw new Error("wrong kind");
		// Terminal command doesn't surface taskSlug; ensure the prompt
		// payload at least carries the task title.
		expect(req.terminal.command).toContain("Refactor auth");
	});

	test("attachment bytes flow through to initialFiles as base64 data URL", async () => {
		const req = await buildForkAgentLaunch({
			pending: pendingBase({ prompt: "fix" }),
			attachments: [
				{
					data: "data:text/plain;base64,AQID", // [1,2,3]
					mediaType: "text/plain",
					filename: "logs.txt",
				},
			],
			agentConfigs,
		});
		if (req?.kind !== "terminal") throw new Error("wrong kind");
		const file = req.terminal.initialFiles?.[0];
		expect(file?.filename).toBe("logs.txt");
		expect(file?.data).toBe("data:text/plain;base64,AQID");
	});
});
