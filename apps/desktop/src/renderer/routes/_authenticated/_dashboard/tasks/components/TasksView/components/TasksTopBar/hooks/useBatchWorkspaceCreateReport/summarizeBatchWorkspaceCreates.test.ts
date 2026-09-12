import { describe, expect, test } from "bun:test";
import type { SubmitOutcome } from "renderer/stores/workspace-creates";
import { summarizeBatchWorkspaceCreates } from "./summarizeBatchWorkspaceCreates";

const created: SubmitOutcome = { ok: true, workspaceId: "ws-1" };
const notCreated: SubmitOutcome = { ok: false, error: "no host" };
const agentFailed: SubmitOutcome = {
	ok: false,
	workspaceId: "ws-2",
	error: "Agent launch failed: boom",
};

describe("summarizeBatchWorkspaceCreates", () => {
	test("returns null when every create succeeded", () => {
		expect(summarizeBatchWorkspaceCreates([created, created])).toBeNull();
	});

	test("counts a surviving workspace as an agent failure, not a create failure", () => {
		expect(summarizeBatchWorkspaceCreates([created, agentFailed])).toEqual({
			notCreated: 0,
			agentFailed: 1,
			firstNotCreatedError: null,
			firstAgentError: "Agent launch failed: boom",
		});
	});

	test("counts a create that produced no workspace separately", () => {
		expect(summarizeBatchWorkspaceCreates([notCreated, created])).toEqual({
			notCreated: 1,
			agentFailed: 0,
			firstNotCreatedError: "no host",
			firstAgentError: null,
		});
	});

	test("keeps the two kinds apart in one batch, each with its own first error", () => {
		expect(
			summarizeBatchWorkspaceCreates([
				agentFailed,
				notCreated,
				{ ok: false, error: "second host failure" },
			]),
		).toEqual({
			notCreated: 2,
			agentFailed: 1,
			firstNotCreatedError: "no host",
			firstAgentError: "Agent launch failed: boom",
		});
	});
});
