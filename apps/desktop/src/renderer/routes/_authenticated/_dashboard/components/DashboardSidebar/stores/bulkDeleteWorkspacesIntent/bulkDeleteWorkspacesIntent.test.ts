import { beforeEach, describe, expect, test } from "bun:test";
import type { DashboardSidebarWorkspace } from "../../types";
import {
	type BulkWorkspaceDeleteFailure,
	useBulkDeleteWorkspacesIntent,
} from "./bulkDeleteWorkspacesIntent";

function workspace(id: string): DashboardSidebarWorkspace {
	return { id, name: id, branch: id } as DashboardSidebarWorkspace;
}

function failure(id: string): BulkWorkspaceDeleteFailure {
	return {
		workspace: workspace(id),
		error: { kind: "unknown", message: "boom" },
	};
}

const state = () => useBulkDeleteWorkspacesIntent.getState();

describe("useBulkDeleteWorkspacesIntent", () => {
	beforeEach(() => {
		useBulkDeleteWorkspacesIntent.setState({
			requestId: 0,
			targets: [],
			phase: "confirm",
			failures: [],
		});
	});

	test("request latches targets under a fresh request id awaiting confirmation", () => {
		state().request([workspace("a"), workspace("b")]);
		expect(state().requestId).toBe(1);
		expect(state().targets.map((w) => w.id)).toEqual(["a", "b"]);
		expect(state().phase).toBe("confirm");
	});

	test("an empty request is ignored", () => {
		state().request([]);
		expect(state().requestId).toBe(0);
	});

	test("a run moves through running to failed and keeps its failures", () => {
		state().request([workspace("a")]);
		const id = state().requestId;

		state().markRunning(id);
		expect(state().phase).toBe("running");

		state().markFailed(id, [failure("a")]);
		expect(state().phase).toBe("failed");
		expect(state().failures.map((f) => f.workspace.id)).toEqual(["a"]);

		// The retry pass hides the failures pane again.
		state().markRunning(id);
		expect(state().phase).toBe("running");
		expect(state().failures).toHaveLength(0);
	});

	test("a new request resets phase and failures", () => {
		state().request([workspace("a")]);
		state().markFailed(state().requestId, [failure("a")]);

		state().request([workspace("b")]);
		expect(state().phase).toBe("confirm");
		expect(state().failures).toHaveLength(0);
	});

	test("transitions from a superseded request are ignored", () => {
		state().request([workspace("a")]);
		const stale = state().requestId;
		state().request([workspace("b")]);

		state().markRunning(stale);
		expect(state().phase).toBe("confirm");
		state().markFailed(stale, [failure("a")]);
		expect(state().failures).toHaveLength(0);
		state().close(stale);
		expect(state().targets).toHaveLength(1);

		state().close(state().requestId);
		expect(state().targets).toHaveLength(0);
	});
});
