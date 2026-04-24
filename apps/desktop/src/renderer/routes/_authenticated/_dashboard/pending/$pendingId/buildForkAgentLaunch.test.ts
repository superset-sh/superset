import { describe, expect, test } from "bun:test";
import { resolveAgentConfigs } from "@superset/shared/agent-settings";
import {
	buildForkAgentLaunch,
	buildLaunchSourcesFromPending,
} from "./buildForkAgentLaunch";

const PROJECT_ID = "proj-1";

function pendingBase(
	overrides: Partial<Parameters<typeof buildLaunchSourcesFromPending>[0]> = {},
): Parameters<typeof buildLaunchSourcesFromPending>[0] {
	return {
		projectId: PROJECT_ID,
		prompt: "",
		linkedIssues: [],
		linkedPR: null,
		agentId: null,
		...overrides,
	};
}

describe("buildLaunchSourcesFromPending", () => {
	test("returns [] when everything is empty", () => {
		expect(buildLaunchSourcesFromPending(pendingBase(), undefined)).toEqual([]);
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

	test("orders sources: user-prompt, task, issue, pr, attachment", () => {
		const sources = buildLaunchSourcesFromPending(
			pendingBase({
				prompt: "fix",
				linkedIssues: [
					{ source: "internal", taskId: "T-1", slug: "s", title: "t" },
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

	test("decodes base64 data URLs to Uint8Array", () => {
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
		expect(Array.from(source.file.data)).toEqual([1, 2, 3]);
	});
});

describe("buildForkAgentLaunch", () => {
	const agentConfigs = resolveAgentConfigs({});

	test("returns null when there are no sources", async () => {
		const build = await buildForkAgentLaunch({
			pending: pendingBase(),
			attachments: undefined,
			agentConfigs,
		});
		expect(build).toBeNull();
	});

	test("returns null when there are no enabled agents", async () => {
		const build = await buildForkAgentLaunch({
			pending: pendingBase({ prompt: "hi" }),
			attachments: undefined,
			agentConfigs: [],
		});
		expect(build).toBeNull();
	});

	test("selected claude agent → terminal launch", async () => {
		const build = await buildForkAgentLaunch({
			pending: pendingBase({
				prompt: "refactor the auth middleware",
				agentId: "claude",
			}),
			attachments: undefined,
			agentConfigs,
		});
		expect(build?.kind).toBe("terminal");
		if (build?.kind !== "terminal") throw new Error("wrong kind");
		expect(build.launch.name).toBe("Claude");
		expect(build.launch.command).toContain("claude");
		expect(build.launch.command).toContain("refactor the auth middleware");
		expect(build.launch.attachmentNames).toEqual([]);
		expect(build.attachmentsToWrite).toEqual([]);
	});

	test("linked internal task renders into the command", async () => {
		const build = await buildForkAgentLaunch({
			pending: pendingBase({
				prompt: "do it",
				agentId: "claude",
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
		if (build?.kind !== "terminal") throw new Error("wrong kind");
		expect(build.launch.command).toContain("Refactor auth");
	});

	test("attachments produce disk-ready bytes + matching names", async () => {
		const build = await buildForkAgentLaunch({
			pending: pendingBase({ prompt: "fix", agentId: "claude" }),
			attachments: [
				{
					data: "data:text/plain;base64,AQID", // [1,2,3]
					mediaType: "text/plain",
					filename: "logs.txt",
				},
			],
			agentConfigs,
		});
		if (build?.kind !== "terminal") throw new Error("wrong kind");
		expect(build.attachmentsToWrite).toHaveLength(1);
		expect(build.attachmentsToWrite[0]?.filename).toBe("logs.txt");
		expect(Array.from(build.attachmentsToWrite[0]?.data ?? [])).toEqual([
			1, 2, 3,
		]);
		expect(build.launch.attachmentNames).toEqual(["logs.txt"]);
	});

	test("chat agent → chat launch with initialPrompt + files", async () => {
		const build = await buildForkAgentLaunch({
			pending: pendingBase({
				prompt: "help me refactor",
				agentId: "superset-chat",
			}),
			attachments: [
				{
					data: "data:text/plain;base64,AQID",
					mediaType: "text/plain",
					filename: "logs.txt",
				},
			],
			agentConfigs,
		});
		expect(build?.kind).toBe("chat");
		if (build?.kind !== "chat") throw new Error("wrong kind");
		expect(build.launch.initialPrompt).toContain("help me refactor");
		expect(build.launch.initialFiles).toHaveLength(1);
		expect(build.launch.initialFiles?.[0]?.data).toBe(
			"data:text/plain;base64,AQID",
		);
		expect(build.launch.initialFiles?.[0]?.filename).toBe("logs.txt");
	});

	test("disabled agent → null", async () => {
		const disabled = agentConfigs.map((c) => ({ ...c, enabled: false }));
		const build = await buildForkAgentLaunch({
			pending: pendingBase({ prompt: "hi", agentId: "claude" }),
			attachments: undefined,
			agentConfigs: disabled,
		});
		expect(build).toBeNull();
	});

	test("agentId null → null (no user selection, no launch)", async () => {
		const build = await buildForkAgentLaunch({
			pending: pendingBase({ prompt: "hi", agentId: null }),
			attachments: undefined,
			agentConfigs,
		});
		expect(build).toBeNull();
	});

	test('agentId "none" → null (explicit opt-out)', async () => {
		const build = await buildForkAgentLaunch({
			pending: pendingBase({ prompt: "hi", agentId: "none" }),
			attachments: undefined,
			agentConfigs,
		});
		expect(build).toBeNull();
	});
});
