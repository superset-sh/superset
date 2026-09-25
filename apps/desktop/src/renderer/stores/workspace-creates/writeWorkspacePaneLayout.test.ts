import { describe, expect, it } from "bun:test";
import type { AppCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider/collections";
import { writeWorkspacePaneLayout } from "./writeWorkspacePaneLayout";

const PROJECT_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_PROJECT_ID = "22222222-2222-4222-8222-222222222222";

type LocalStateRow = {
	workspaceId: string;
	sidebarState: {
		projectId: string | null;
		tabOrder: number;
		sectionId: string | null;
		isHidden: boolean;
	};
};

type SectionRow = { sectionId: string; projectId: string; tabOrder: number };

function makeCollection<T>(getKey: (item: T) => string, rows: T[]) {
	const state = new Map(rows.map((row) => [getKey(row), row]));
	return {
		state,
		get: (key: string) => state.get(key),
		insert: (item: T) => {
			state.set(getKey(item), structuredClone(item));
		},
		update: (key: string, producer: (draft: T) => void) => {
			const existing = state.get(key);
			if (!existing) return;
			const draft = structuredClone(existing);
			producer(draft);
			state.set(key, draft);
		},
	};
}

function draggedRow(
	workspaceId: string,
	tabOrder: number,
	projectId = PROJECT_ID,
): LocalStateRow {
	return {
		workspaceId,
		sidebarState: { projectId, tabOrder, sectionId: null, isHidden: false },
	};
}

function makeCollections(rows: LocalStateRow[], sections: SectionRow[] = []) {
	const v2WorkspaceLocalState = makeCollection(
		(row: LocalStateRow) => row.workspaceId,
		rows,
	);
	const collections = {
		v2WorkspaceLocalState,
		v2SidebarSections: makeCollection(
			(row: SectionRow) => row.sectionId,
			sections,
		),
		v2SidebarProjects: makeCollection(
			(row: { projectId: string }) => row.projectId,
			[],
		),
	} as unknown as AppCollections;
	const projectOrder = (projectId: string) =>
		[...v2WorkspaceLocalState.state.values()]
			.filter((row) => row.sidebarState.projectId === projectId)
			.sort(
				(left, right) =>
					left.sidebarState.tabOrder - right.sidebarState.tabOrder,
			)
			.map((row) => row.workspaceId);
	const tabOrderOf = (workspaceId: string) =>
		v2WorkspaceLocalState.state.get(workspaceId)?.sidebarState.tabOrder;
	return { collections, projectOrder, tabOrderOf };
}

function create(collections: AppCollections, id: string) {
	writeWorkspacePaneLayout(collections, { id, projectId: PROJECT_ID }, [], []);
}

describe("writeWorkspacePaneLayout", () => {
	it("keeps a dragged order and puts the new workspace first", () => {
		const { collections, projectOrder, tabOrderOf } = makeCollections([
			draggedRow("zeta", 1),
			draggedRow("alpha", 2),
			draggedRow("mid", 3),
		]);

		create(collections, "beta");

		expect(projectOrder(PROJECT_ID)).toEqual(["beta", "zeta", "alpha", "mid"]);
		expect([
			tabOrderOf("zeta"),
			tabOrderOf("alpha"),
			tabOrderOf("mid"),
		]).toEqual([1, 2, 3]);
	});

	it("keeps the order across repeated creates", () => {
		const { collections, projectOrder } = makeCollections([
			draggedRow("zeta", 1),
			draggedRow("alpha", 2),
		]);

		create(collections, "first");
		create(collections, "second");

		expect(projectOrder(PROJECT_ID)).toEqual([
			"second",
			"first",
			"zeta",
			"alpha",
		]);
	});

	it("lands above a folder dragged to the top of the project", () => {
		const { collections, tabOrderOf } = makeCollections(
			[draggedRow("alpha", 2)],
			[{ sectionId: "folder", projectId: PROJECT_ID, tabOrder: 1 }],
		);

		create(collections, "beta");

		expect(tabOrderOf("beta")).toBe(0);
		expect(tabOrderOf("alpha")).toBe(2);
	});

	it("leaves other projects' order alone", () => {
		const { collections, projectOrder, tabOrderOf } = makeCollections([
			draggedRow("alpha", 1),
			draggedRow("other-b", 1, OTHER_PROJECT_ID),
			draggedRow("other-a", 2, OTHER_PROJECT_ID),
		]);

		create(collections, "beta");

		expect(projectOrder(OTHER_PROJECT_ID)).toEqual(["other-b", "other-a"]);
		expect(tabOrderOf("other-b")).toBe(1);
	});

	it("does not move a workspace that is already placed", () => {
		const { collections, projectOrder } = makeCollections([
			draggedRow("zeta", 1),
			draggedRow("alpha", 2),
		]);

		create(collections, "alpha");

		expect(projectOrder(PROJECT_ID)).toEqual(["zeta", "alpha"]);
	});
});
