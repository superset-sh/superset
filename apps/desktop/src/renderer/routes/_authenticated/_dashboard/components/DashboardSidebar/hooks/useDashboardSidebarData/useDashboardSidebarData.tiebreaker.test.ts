import { describe, expect, test } from "bun:test";
import {
	createCollection,
	createLiveQueryCollection,
	eq,
	localOnlyCollectionOptions,
} from "@tanstack/db";

/**
 * Regression guard for #5214 — "renaming a v2 sidebar workspace can make the
 * workspace below it disappear."
 *
 * The sidebar workspace list is a `useLiveQuery` that joins
 * `v2WorkspaceLocalState` (holds `sidebarState.tabOrder`) with `v2Workspaces`
 * (holds `name`), ordered by `tabOrder`. Renaming optimistically updates
 * `v2Workspaces.name` only. When two sidebar rows share the same `tabOrder`,
 * the sort order is ambiguous and, under the real Electric + `useLiveQuery`
 * async optimistic→synced lifecycle, the optimistic update to one tied row can
 * knock its tied neighbor out of the result.
 *
 * NOTE: the full runtime failure cannot be reproduced in a plain unit test —
 * `apps/desktop` has no React/DOM harness, and isolated `@tanstack/db` join
 * row keys are strings that already form a total order, so the neighbor never
 * drops here regardless of the fix. What this test *does* pin is the invariant
 * the fix relies on: with a unique secondary `orderBy` tiebreaker, ordering by
 * a non-unique `tabOrder` is a total order, stable across an optimistic update
 * to a tied row, and the tiebreaker is inert when `tabOrder`s are already
 * distinct.
 */

type LocalState = { workspaceId: string; tabOrder: number };
type Workspace = { id: string; name: string };

function makeCollections() {
	const local = createCollection(
		localOnlyCollectionOptions<LocalState>({
			id: "tiebreaker-local",
			getKey: (row) => row.workspaceId,
		}),
	);
	const workspaces = createCollection(
		localOnlyCollectionOptions<Workspace>({
			id: "tiebreaker-workspaces",
			getKey: (row) => row.id,
		}),
	);
	return { local, workspaces };
}

describe("sidebar workspace ordering tiebreaker (#5214)", () => {
	test("renaming a tied row keeps a stable, total order and never drops its neighbor", async () => {
		const { local, workspaces } = makeCollections();
		// Two sidebar workspaces sharing the same tabOrder — the reachable
		// duplicate-tabOrder state described in the issue.
		local.insert({ workspaceId: "A", tabOrder: 0 });
		local.insert({ workspaceId: "B", tabOrder: 0 });
		workspaces.insert({ id: "A", name: "Alpha" });
		workspaces.insert({ id: "B", name: "Beta" });

		const live = createLiveQueryCollection((q) =>
			q
				.from({ sidebarWorkspaces: local })
				.innerJoin({ workspaces }, ({ sidebarWorkspaces, workspaces }) =>
					eq(sidebarWorkspaces.workspaceId, workspaces.id),
				)
				.orderBy(({ sidebarWorkspaces }) => sidebarWorkspaces.tabOrder, "asc")
				// The tiebreaker added by the fix.
				.orderBy(({ workspaces }) => workspaces.id, "asc")
				.select(({ sidebarWorkspaces, workspaces }) => ({
					id: workspaces.id,
					name: workspaces.name,
					tabOrder: sidebarWorkspaces.tabOrder,
				})),
		);
		await live.preload();

		const before = live.toArray;
		expect(before.map((row) => row.id)).toEqual(["A", "B"]);

		// Optimistic rename of one tied row — touches `name` only, never tabOrder.
		workspaces.update("A", (draft) => {
			draft.name = "Alpha (renamed)";
		});
		await new Promise((resolve) => setTimeout(resolve, 0));

		const after = live.toArray;
		// The neighbor must still be present, and the order stable.
		expect(after.map((row) => row.id)).toEqual(["A", "B"]);
		expect(after.find((row) => row.id === "A")?.name).toBe("Alpha (renamed)");
	});

	test("tiebreaker is inert when tabOrders are already distinct", async () => {
		const { local, workspaces } = makeCollections();
		local.insert({ workspaceId: "A", tabOrder: 1 });
		local.insert({ workspaceId: "B", tabOrder: 0 });
		workspaces.insert({ id: "A", name: "Alpha" });
		workspaces.insert({ id: "B", name: "Beta" });

		const live = createLiveQueryCollection((q) =>
			q
				.from({ sidebarWorkspaces: local })
				.innerJoin({ workspaces }, ({ sidebarWorkspaces, workspaces }) =>
					eq(sidebarWorkspaces.workspaceId, workspaces.id),
				)
				.orderBy(({ sidebarWorkspaces }) => sidebarWorkspaces.tabOrder, "asc")
				.orderBy(({ workspaces }) => workspaces.id, "asc")
				.select(({ workspaces }) => ({ id: workspaces.id })),
		);
		await live.preload();

		// tabOrder wins; the id tiebreaker does not reorder distinct rows.
		expect(live.toArray.map((row) => row.id)).toEqual(["B", "A"]);
	});
});
