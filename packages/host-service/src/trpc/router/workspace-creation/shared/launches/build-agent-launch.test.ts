import { describe, expect, it } from "bun:test";
import type { ResolveCtx } from "@superset/launch-context";
import {
	buildAgentLaunch,
	type HostAgentPresetRow,
} from "./build-agent-launch";

const stubResolveCtx: ResolveCtx = {
	projectId: "p1",
	signal: new AbortController().signal,
	fetchIssue: async () => {
		throw new Error("not used in this test");
	},
	fetchPullRequest: async () => {
		throw new Error("not used in this test");
	},
	fetchInternalTask: async () => {
		throw new Error("not used in this test");
	},
};

const claudePreset: HostAgentPresetRow = {
	presetId: "claude",
	label: "Claude",
	command: "claude",
	args: ["--permission-mode", "acceptEdits"],
	promptTransport: "argv",
	promptArgs: [],
	env: {},
};

const codexPreset: HostAgentPresetRow = {
	presetId: "codex",
	label: "Codex",
	command: "codex",
	args: ["--sandbox", "workspace-write"],
	promptTransport: "argv",
	promptArgs: ["--"],
	env: {},
};

const mastracodePreset: HostAgentPresetRow = {
	presetId: "mastracode",
	label: "Mastracode",
	command: "mastracode",
	args: [],
	promptTransport: "stdin",
	promptArgs: [],
	env: {},
};

describe("buildAgentLaunch", () => {
	it("returns null when there are no sources", async () => {
		const plan = await buildAgentLaunch({
			projectId: "p1",
			preset: claudePreset,
			internalTaskIds: [],
			githubIssueUrls: [],
			attachments: [],
			resolveCtx: stubResolveCtx,
		});
		expect(plan).toBeNull();
	});

	it("composes argv with prompt appended for argv-transport agents", async () => {
		const plan = await buildAgentLaunch({
			projectId: "p1",
			preset: claudePreset,
			prompt: "fix the failing test",
			internalTaskIds: [],
			githubIssueUrls: [],
			attachments: [],
			resolveCtx: stubResolveCtx,
		});
		expect(plan).not.toBeNull();
		expect(plan?.spawn.command).toBe("claude");
		expect(plan?.spawn.args).toEqual([
			"--permission-mode",
			"acceptEdits",
			"fix the failing test",
		]);
		expect(plan?.stdinPrompt).toBeUndefined();
	});

	it("inserts promptArgs between args and prompt (codex --)", async () => {
		const plan = await buildAgentLaunch({
			projectId: "p1",
			preset: codexPreset,
			prompt: "do the thing",
			internalTaskIds: [],
			githubIssueUrls: [],
			attachments: [],
			resolveCtx: stubResolveCtx,
		});
		expect(plan?.spawn.args).toEqual([
			"--sandbox",
			"workspace-write",
			"--",
			"do the thing",
		]);
	});

	it("returns prompt as stdinPrompt for stdin-transport agents", async () => {
		const plan = await buildAgentLaunch({
			projectId: "p1",
			preset: mastracodePreset,
			prompt: "implement feature X",
			internalTaskIds: [],
			githubIssueUrls: [],
			attachments: [],
			resolveCtx: stubResolveCtx,
		});
		expect(plan?.spawn.command).toBe("mastracode");
		expect(plan?.spawn.args).toEqual([]);
		expect(plan?.stdinPrompt).toBe("implement feature X");
	});

	it("omits prompt entirely when there is no user prompt and no other sources", async () => {
		// claudePreset alone with no prompt → no sources → null
		const plan = await buildAgentLaunch({
			projectId: "p1",
			preset: claudePreset,
			internalTaskIds: [],
			githubIssueUrls: [],
			attachments: [],
			resolveCtx: stubResolveCtx,
		});
		expect(plan).toBeNull();
	});

	it("emits attachmentsToWrite for non-image file attachments preserving filenames", async () => {
		const plan = await buildAgentLaunch({
			projectId: "p1",
			preset: claudePreset,
			prompt: "look at the diff",
			internalTaskIds: [],
			githubIssueUrls: [],
			attachments: [
				{
					filename: "diff.patch",
					mediaType: "text/x-diff",
					data: new Uint8Array([1, 2, 3]),
				},
			],
			resolveCtx: stubResolveCtx,
		});
		expect(plan?.attachmentsToWrite.map((a) => a.filename)).toEqual([
			"diff.patch",
		]);
	});

	// Image attachments lose their filename through the launch-context
	// attachment contributor (image parts don't carry filenames). Falls
	// back to `attachment_N` numbering — matches renderer behavior.
	it("falls back to attachment_N for image attachments", async () => {
		const plan = await buildAgentLaunch({
			projectId: "p1",
			preset: claudePreset,
			prompt: "look at the screenshot",
			internalTaskIds: [],
			githubIssueUrls: [],
			attachments: [
				{
					filename: "screenshot.png",
					mediaType: "image/png",
					data: new Uint8Array([1, 2, 3]),
				},
			],
			resolveCtx: stubResolveCtx,
		});
		expect(plan?.attachmentsToWrite.map((a) => a.filename)).toEqual([
			"attachment_1",
		]);
	});
});
