import { beforeEach, describe, expect, test } from "bun:test";
import type { DashboardSidebarWorkspace } from "../../types";
import { useBulkDeleteWorkspacesIntent } from "./bulkDeleteWorkspacesIntent";

function workspace(id: string): DashboardSidebarWorkspace {
	return { id, name: id, branch: id } as DashboardSidebarWorkspace;
}

describe("useBulkDeleteWorkspacesIntent", () => {
	beforeEach(() => {
		useBulkDeleteWorkspacesIntent.setState({ requestId: 0, targets: [] });
	});

	test("request latches targets under a fresh request id", () => {
		const store = useBulkDeleteWorkspacesIntent.getState();
		store.request([workspace("a"), workspace("b")]);
		const state = useBulkDeleteWorkspacesIntent.getState();
		expect(state.requestId).toBe(1);
		expect(state.targets.map((w) => w.id)).toEqual(["a", "b"]);
	});

	test("an empty request is ignored", () => {
		useBulkDeleteWorkspacesIntent.getState().request([]);
		expect(useBulkDeleteWorkspacesIntent.getState().requestId).toBe(0);
	});

	test("close only clears the request it was issued for", () => {
		const store = useBulkDeleteWorkspacesIntent.getState();
		store.request([workspace("a")]);
		const stale = useBulkDeleteWorkspacesIntent.getState().requestId;
		store.request([workspace("b")]);

		store.close(stale);
		expect(useBulkDeleteWorkspacesIntent.getState().targets).toHaveLength(1);

		store.close(useBulkDeleteWorkspacesIntent.getState().requestId);
		expect(useBulkDeleteWorkspacesIntent.getState().targets).toHaveLength(0);
	});
});
