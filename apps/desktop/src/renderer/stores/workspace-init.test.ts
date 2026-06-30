import { beforeEach, describe, expect, test } from "bun:test";
import {
	canDiscardPendingSetupOnFailure,
	type PendingTerminalSetup,
	useWorkspaceInitStore,
} from "./workspace-init";

const baseSetup: PendingTerminalSetup = {
	workspaceId: "ws-1",
	projectId: "p-1",
	initialCommands: null,
};

function resetStore() {
	useWorkspaceInitStore.setState({
		initProgress: {},
		pendingTerminalSetups: {},
		completedInits: {},
	});
}

/**
 * Reproduces #5088: a prompt typed in the new-workspace dialog is stored as the
 * pending setup's `agentCommand`. When init fails, WorkspaceInitEffects must not
 * discard that prompt — otherwise the user has no way to recover it after retry.
 */
describe("canDiscardPendingSetupOnFailure (#5088)", () => {
	test("keeps a failed setup that still carries a launch prompt", () => {
		const withPrompt: PendingTerminalSetup = {
			...baseSetup,
			agentCommand: "fix the failing test",
		};
		expect(canDiscardPendingSetupOnFailure(withPrompt)).toBe(false);
	});

	test("keeps a failed setup that carries a canonical launch request", () => {
		const withRequest = {
			...baseSetup,
			agentLaunchRequest: {
				kind: "terminal",
				workspaceId: "ws-1",
				command: "claude",
				name: "Agent",
				source: "workspace-init",
				terminal: {},
			},
		} as unknown as PendingTerminalSetup;
		expect(canDiscardPendingSetupOnFailure(withRequest)).toBe(false);
	});

	test("discards a failed setup with no recoverable prompt", () => {
		expect(canDiscardPendingSetupOnFailure(baseSetup)).toBe(true);
	});

	test("treats a missing setup as discardable", () => {
		expect(canDiscardPendingSetupOnFailure(undefined)).toBe(true);
	});
});

/**
 * Models the effect's "failed" branch end-to-end against the real store: the
 * prompt must survive a failure so it can be replayed when the user retries.
 */
describe("failed-init handling preserves the launch prompt (#5088)", () => {
	beforeEach(() => {
		resetStore();
	});

	test("prompt survives a failed init for recovery on retry", () => {
		const store = useWorkspaceInitStore.getState();
		store.addPendingTerminalSetup({
			...baseSetup,
			agentCommand: "implement the feature",
		});
		store.updateProgress({
			workspaceId: "ws-1",
			projectId: "p-1",
			step: "failed",
			message: "Failed",
			error: "boom",
		});

		// Same decision WorkspaceInitEffects makes when progress.step === "failed".
		const setup =
			useWorkspaceInitStore.getState().pendingTerminalSetups["ws-1"];
		if (canDiscardPendingSetupOnFailure(setup)) {
			store.removePendingTerminalSetup("ws-1");
		}

		expect(
			useWorkspaceInitStore.getState().pendingTerminalSetups["ws-1"]
				?.agentCommand,
		).toBe("implement the feature");
	});

	test("promptless failed setup is cleaned up", () => {
		const store = useWorkspaceInitStore.getState();
		store.addPendingTerminalSetup(baseSetup);

		const setup =
			useWorkspaceInitStore.getState().pendingTerminalSetups["ws-1"];
		if (canDiscardPendingSetupOnFailure(setup)) {
			store.removePendingTerminalSetup("ws-1");
		}

		expect(
			useWorkspaceInitStore.getState().pendingTerminalSetups["ws-1"],
		).toBeUndefined();
	});
});
