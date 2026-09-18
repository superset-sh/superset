import { describe, expect, test } from "bun:test";
import { completeWorkspaceCreate } from "./completeWorkspaceCreate";

const UNKNOWN = "unknown error";

function harness() {
	const calls: string[] = [];
	return {
		calls,
		effects: {
			recordWorkspaceCreated: () => {
				calls.push("recordWorkspaceCreated");
			},
			queueCreationPresets: (workspace: { id: string; projectId: string }) => {
				calls.push(`queueCreationPresets:${workspace.id}`);
			},
		},
	};
}

const newProjectWorkspace = {
	workspace: { id: "ws-1", projectId: "project-1" },
	alreadyExists: false,
	requestedAgents: true,
	skipsCreationPresets: false,
	unknownError: UNKNOWN,
};

describe("completeWorkspaceCreate", () => {
	test("keeps the created workspace's presets and star-nag count when an agent fails", () => {
		const { calls, effects } = harness();

		const detail = completeWorkspaceCreate(
			{ ...newProjectWorkspace, agents: [{ ok: false, error: "boom" }] },
			effects,
		);

		expect(detail).toBe("boom");
		expect(calls).toEqual([
			"recordWorkspaceCreated",
			"queueCreationPresets:ws-1",
		]);
	});

	test("runs the same bookkeeping when every agent launched", () => {
		const { calls, effects } = harness();

		const detail = completeWorkspaceCreate(
			{ ...newProjectWorkspace, agents: [{ ok: true }] },
			effects,
		);

		expect(detail).toBeNull();
		expect(calls).toEqual([
			"recordWorkspaceCreated",
			"queueCreationPresets:ws-1",
		]);
	});

	test("skips presets but still counts the workspace when the create opted out", () => {
		const { calls, effects } = harness();

		completeWorkspaceCreate(
			{
				...newProjectWorkspace,
				skipsCreationPresets: true,
				agents: [{ ok: false, error: "boom" }],
			},
			effects,
		);

		expect(calls).toEqual(["recordWorkspaceCreated"]);
	});

	test("counts neither a reopened workspace nor a session", () => {
		const reopened = harness();
		completeWorkspaceCreate(
			{ ...newProjectWorkspace, alreadyExists: true, agents: [{ ok: true }] },
			reopened.effects,
		);
		expect(reopened.calls).toEqual([]);

		const session = harness();
		completeWorkspaceCreate(
			{
				...newProjectWorkspace,
				workspace: { id: "ws-2", projectId: null },
				agents: [{ ok: true }],
			},
			session.effects,
		);
		expect(session.calls).toEqual([]);
	});

	test("reports no failure when the caller asked for no agents", () => {
		const { effects } = harness();

		expect(
			completeWorkspaceCreate(
				{
					...newProjectWorkspace,
					requestedAgents: false,
					agents: [{ ok: false, error: "boom" }],
				},
				effects,
			),
		).toBeNull();
	});
});
