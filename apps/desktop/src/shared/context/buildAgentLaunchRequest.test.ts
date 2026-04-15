import { describe, expect, test } from "bun:test";
import {
	indexResolvedAgentConfigs,
	type ResolvedAgentConfig,
	resolveAgentConfigs,
} from "shared/utils/agent-settings";
import { buildAgentLaunchRequest } from "./buildAgentLaunchRequest";
import type { AgentLaunchSpec } from "./types";

function getConfig(id: string): ResolvedAgentConfig {
	const configs = indexResolvedAgentConfigs(resolveAgentConfigs({}));
	const config = configs.get(id as never);
	if (!config) throw new Error(`agent not found: ${id}`);
	return config;
}

const PNG_BYTES = new Uint8Array([137, 80, 78, 71]);

function baseSpec(overrides: Partial<AgentLaunchSpec> = {}): AgentLaunchSpec {
	return {
		agentId: "claude",
		system: [],
		user: [{ type: "text", text: "hello" }],
		attachments: [],
		taskSlug: undefined,
		...overrides,
	};
}

describe("buildAgentLaunchRequest", () => {
	test("returns null for agentId 'none'", () => {
		const req = buildAgentLaunchRequest(
			baseSpec({ agentId: "none" as never }),
			getConfig("claude"),
			{ workspaceId: "ws-1", source: "new-workspace" },
		);
		expect(req).toBeNull();
	});

	test("terminal: flattens user text into buildPromptCommand", () => {
		const req = buildAgentLaunchRequest(
			baseSpec({
				agentId: "codex",
				user: [{ type: "text", text: "refactor the auth middleware" }],
			}),
			getConfig("codex"),
			{ workspaceId: "ws-1", source: "new-workspace" },
		);
		expect(req?.kind).toBe("terminal");
		if (req?.kind !== "terminal") throw new Error("wrong kind");
		expect(req.workspaceId).toBe("ws-1");
		expect(req.agentType).toBe("codex");
		expect(req.source).toBe("new-workspace");
		// Command is rendered via buildPromptCommandFromAgentConfig — contains codex CLI base
		expect(req.terminal.command).toContain("codex");
		expect(req.terminal.name).toBe("Codex");
	});

	test("chat: user text becomes initialPrompt + taskSlug flows through", () => {
		const req = buildAgentLaunchRequest(
			baseSpec({
				agentId: "superset-chat",
				user: [{ type: "text", text: "refactor" }],
				taskSlug: "refactor-auth",
			}),
			getConfig("superset-chat"),
			{ workspaceId: "ws-1", source: "new-workspace" },
		);
		expect(req?.kind).toBe("chat");
		if (req?.kind !== "chat") throw new Error("wrong kind");
		expect(req.chat.initialPrompt).toBe("refactor");
		expect(req.chat.taskSlug).toBe("refactor-auth");
	});

	test("terminal: inline image in user flattens to path ref with assigned filename", () => {
		const req = buildAgentLaunchRequest(
			baseSpec({
				agentId: "codex",
				user: [
					{ type: "text", text: "see this:" },
					{ type: "image", data: PNG_BYTES, mediaType: "image/png" },
					{ type: "text", text: "fix it" },
				],
			}),
			getConfig("codex"),
			{ workspaceId: "ws-1", source: "new-workspace" },
		);
		if (req?.kind !== "terminal") throw new Error("wrong kind");
		// Command should contain the inline path ref
		expect(req.terminal.command).toContain("attachment_1");
		// Same filename in initialFiles[]
		expect(req.terminal.initialFiles).toHaveLength(1);
		expect(req.terminal.initialFiles?.[0]?.filename).toBe("attachment_1");
	});

	test("terminal: explicit attachment keeps its original filename", () => {
		const req = buildAgentLaunchRequest(
			baseSpec({
				agentId: "codex",
				attachments: [
					{
						type: "file",
						data: new Uint8Array([1, 2, 3]),
						mediaType: "text/plain",
						filename: "logs.txt",
					},
				],
			}),
			getConfig("codex"),
			{ workspaceId: "ws-1", source: "new-workspace" },
		);
		if (req?.kind !== "terminal") throw new Error("wrong kind");
		expect(req.terminal.initialFiles?.[0]?.filename).toBe("logs.txt");
	});

	test("terminal: dedupes colliding filenames across user + attachments", () => {
		const req = buildAgentLaunchRequest(
			baseSpec({
				agentId: "codex",
				user: [
					{
						type: "file",
						data: new Uint8Array([1]),
						mediaType: "text/plain",
						filename: "logs.txt",
					},
				],
				attachments: [
					{
						type: "file",
						data: new Uint8Array([2]),
						mediaType: "text/plain",
						filename: "logs.txt",
					},
				],
			}),
			getConfig("codex"),
			{ workspaceId: "ws-1", source: "new-workspace" },
		);
		if (req?.kind !== "terminal") throw new Error("wrong kind");
		const filenames = req.terminal.initialFiles?.map((f) => f.filename);
		expect(new Set(filenames).size).toBe(filenames?.length ?? 0);
	});

	test("chat: attachments are converted to base64 data URLs", () => {
		const req = buildAgentLaunchRequest(
			baseSpec({
				agentId: "superset-chat",
				attachments: [
					{
						type: "file",
						data: new Uint8Array([1, 2, 3]),
						mediaType: "text/plain",
						filename: "logs.txt",
					},
				],
			}),
			getConfig("superset-chat"),
			{ workspaceId: "ws-1", source: "new-workspace" },
		);
		if (req?.kind !== "chat") throw new Error("wrong kind");
		const file = req.chat.initialFiles?.[0];
		expect(file?.data).toMatch(/^data:text\/plain;base64,/);
		// base64 of [1,2,3]
		expect(file?.data).toBe("data:text/plain;base64,AQID");
	});

	test("chat: initialPrompt includes inline file/image refs", () => {
		const req = buildAgentLaunchRequest(
			baseSpec({
				agentId: "superset-chat",
				user: [
					{ type: "text", text: "look at" },
					{
						type: "file",
						data: new Uint8Array([1]),
						mediaType: "text/plain",
						filename: "trace.log",
					},
				],
			}),
			getConfig("superset-chat"),
			{ workspaceId: "ws-1", source: "new-workspace" },
		);
		if (req?.kind !== "chat") throw new Error("wrong kind");
		expect(req.chat.initialPrompt).toContain("trace.log");
	});

	test("empty user content + empty attachments → still produces a valid launch (uses command without prompt)", () => {
		const req = buildAgentLaunchRequest(
			baseSpec({ agentId: "codex", user: [] }),
			getConfig("codex"),
			{ workspaceId: "ws-1", source: "new-workspace" },
		);
		expect(req?.kind).toBe("terminal");
		if (req?.kind !== "terminal") throw new Error("wrong kind");
		expect(req.terminal.command).toBeTruthy();
	});

	test("uses passed workspaceId + source verbatim", () => {
		const req = buildAgentLaunchRequest(
			baseSpec({ agentId: "codex" }),
			getConfig("codex"),
			{ workspaceId: "some-workspace-42", source: "mcp" },
		);
		expect(req?.workspaceId).toBe("some-workspace-42");
		expect(req?.source).toBe("mcp");
	});
});
