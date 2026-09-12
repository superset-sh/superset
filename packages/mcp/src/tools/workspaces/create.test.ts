import { beforeEach, describe, expect, mock, test } from "bun:test";
import { createHarness } from "./test-harness";

const harness = createHarness();

mock.module("../../define-tool", () => ({
	defineTool: harness.defineTool,
}));
mock.module("../../host-service-client", () => ({
	hostServiceCall: harness.hostServiceCall,
}));

const mod = await import("./create");
const tool = harness.register(mod);

const PROJECT_ID = "11111111-1111-4111-8111-111111111111";
const WORKSPACE_ID = "22222222-2222-4222-8222-222222222222";

function okAgent() {
	return {
		ok: true as const,
		kind: "terminal" as const,
		sessionId: "sess-1",
		label: "Claude",
	};
}

beforeEach(() => {
	harness.calls.length = 0;
	harness.setResponse({
		workspace: {
			id: WORKSPACE_ID,
			projectId: PROJECT_ID,
			name: "probe",
			branch: "fix/probe",
		},
		terminals: [],
		agents: [],
		alreadyExists: false,
	});
});

describe("workspaces_create", () => {
	test("is a non-destructive tool", () => {
		expect(tool.name).toBe("workspaces_create");
		expect(tool.annotations).toEqual({ destructiveHint: false });
	});

	test("fails loud when a requested agent never launched (#5767)", async () => {
		harness.setResponse({
			workspace: {
				id: WORKSPACE_ID,
				projectId: PROJECT_ID,
				name: "probe",
				branch: "fix/probe",
			},
			terminals: [],
			agents: [{ ok: false, error: "no agent config for `claude`" }],
			alreadyExists: false,
		});

		await expect(
			harness.invoke(tool, {
				projectId: PROJECT_ID,
				name: "probe",
				branch: "fix/probe",
				hostId: "host-1",
				agents: [{ agent: "claude", prompt: "do the thing" }],
			}),
		).rejects.toThrow(
			/Agent launch failed: no agent config for `claude`.*Workspace 22222222-2222-4222-8222-222222222222/,
		);

		expect(harness.calls[0]?.procedure).toBe("workspaces.create");
	});

	test("reports every failed launch, not just the first", async () => {
		harness.setResponse({
			workspace: {
				id: WORKSPACE_ID,
				projectId: PROJECT_ID,
				name: "probe",
				branch: "fix/probe",
			},
			terminals: [],
			agents: [
				{ ok: false, error: "first failure" },
				{ ok: false, error: "second failure" },
			],
			alreadyExists: false,
		});

		await expect(
			harness.invoke(tool, {
				projectId: PROJECT_ID,
				name: "probe",
				branch: "fix/probe",
				hostId: "host-1",
				agents: [
					{ agent: "claude", prompt: "a" },
					{ agent: "codex", prompt: "b" },
				],
			}),
		).rejects.toThrow(/first failure; second failure/);
	});

	test("fails a project-less session the same way", async () => {
		harness.setResponse({
			workspace: {
				id: WORKSPACE_ID,
				projectId: null,
				name: "scratch",
				branch: "",
			},
			terminals: [],
			agents: [{ ok: false, error: "spawn failed" }],
		});

		await expect(
			harness.invoke(tool, {
				name: "scratch",
				hostId: "host-1",
				agents: [{ agent: "claude", prompt: "probe" }],
			}),
		).rejects.toThrow(/Agent launch failed: spawn failed/);

		expect(harness.calls[0]?.procedure).toBe("workspaces.createSession");
	});

	test("succeeds when every requested agent launched", async () => {
		harness.setResponse({
			workspace: {
				id: WORKSPACE_ID,
				projectId: PROJECT_ID,
				name: "probe",
				branch: "fix/probe",
			},
			terminals: [],
			agents: [okAgent()],
			alreadyExists: false,
		});

		const result = await harness.invoke(tool, {
			projectId: PROJECT_ID,
			name: "probe",
			branch: "fix/probe",
			hostId: "host-1",
			agents: [{ agent: "claude", prompt: "do the thing" }],
		});

		expect(result).toMatchObject({
			workspace: { id: WORKSPACE_ID },
			agents: [{ ok: true, sessionId: "sess-1" }],
		});
	});

	test("succeeds when no agents were requested even if agents[] is empty", async () => {
		const result = await harness.invoke(tool, {
			projectId: PROJECT_ID,
			name: "probe",
			branch: "fix/probe",
			hostId: "host-1",
		});

		expect(result).toMatchObject({
			workspace: { id: WORKSPACE_ID },
			agents: [],
		});
	});
});
