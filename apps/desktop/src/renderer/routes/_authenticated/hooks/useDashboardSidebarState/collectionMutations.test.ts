import { describe, expect, it } from "bun:test";
import {
	createCollectionInState,
	deleteCollectionInState,
	moveProjectToCollectionInState,
	renameCollectionInState,
	reorderCollectionsInState,
	setCollectionColorInState,
	setCollectionIconInState,
	toggleCollectionCollapsedInState,
} from "./collectionMutations";

/**
 * Minimal in-memory stand-in for a TanStack DB collection, matching the surface
 * the collection mutations touch. Mirrors the harness in sidebarMutations.test.ts.
 */
function makeCollection<T>(getKey: (item: T) => string) {
	const state = new Map<string, T>();
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
		delete: (keys: string | string[]) => {
			for (const key of Array.isArray(keys) ? keys : [keys]) {
				state.delete(key);
			}
		},
	};
}

type CollectionRow = {
	collectionId: string;
	name: string;
	createdAt: Date;
	tabOrder: number;
	isCollapsed: boolean;
	color: string | null;
};

type ProjectRow = {
	projectId: string;
	createdAt: Date;
	isCollapsed: boolean;
	tabOrder: number;
	defaultOpenInApp: string | null;
	collectionId: string | null;
};

function makeCollections(projects: ProjectRow[] = []) {
	const v2SidebarCollections = makeCollection<CollectionRow>(
		(row) => row.collectionId,
	);
	const v2SidebarProjects = makeCollection<ProjectRow>((row) => row.projectId);
	for (const project of projects) v2SidebarProjects.insert(project);
	// Cast: the harness implements only the surface these mutations use.
	return { v2SidebarCollections, v2SidebarProjects } as unknown as Parameters<
		typeof createCollectionInState
	>[0] & {
		v2SidebarCollections: typeof v2SidebarCollections;
		v2SidebarProjects: typeof v2SidebarProjects;
	};
}

function projectRow(
	projectId: string,
	collectionId: string | null = null,
): ProjectRow {
	return {
		projectId,
		createdAt: new Date("2026-01-01T00:00:00.000Z"),
		isCollapsed: false,
		tabOrder: 1,
		defaultOpenInApp: null,
		collectionId,
	};
}

describe("collection mutations", () => {
	it("creates a collection with a name, colour and increasing tabOrder", () => {
		const collections = makeCollections();

		const first = createCollectionInState(collections, { name: "Work" });
		const second = createCollectionInState(collections, { name: "Personal" });

		const firstRow = collections.v2SidebarCollections.get(first);
		const secondRow = collections.v2SidebarCollections.get(second);
		expect(firstRow?.name).toBe("Work");
		expect(firstRow?.color).toBeTruthy();
		expect(secondRow?.tabOrder).toBeGreaterThan(firstRow?.tabOrder ?? 0);
	});

	it("defaults the name when none is given", () => {
		const collections = makeCollections();
		const collectionId = createCollectionInState(collections);
		expect(collections.v2SidebarCollections.get(collectionId)?.name).toBe(
			"New collection",
		);
	});

	it("falls back to the default name when given a blank one", () => {
		const collections = makeCollections();
		// A whitespace-only name would fail the schema's .min(1) at insert.
		const collectionId = createCollectionInState(collections, { name: "   " });
		expect(collections.v2SidebarCollections.get(collectionId)?.name).toBe(
			"New collection",
		);
	});

	it("trims the name on create", () => {
		const collections = makeCollections();
		const collectionId = createCollectionInState(collections, {
			name: "  Work  ",
		});
		expect(collections.v2SidebarCollections.get(collectionId)?.name).toBe(
			"Work",
		);
	});

	it("renames a collection and trims whitespace", () => {
		const collections = makeCollections();
		const collectionId = createCollectionInState(collections, { name: "Old" });

		renameCollectionInState(collections, collectionId, "  Renamed  ");

		expect(collections.v2SidebarCollections.get(collectionId)?.name).toBe(
			"Renamed",
		);
	});

	it("ignores a blank rename", () => {
		const collections = makeCollections();
		const collectionId = createCollectionInState(collections, { name: "Keep" });

		renameCollectionInState(collections, collectionId, "   ");

		expect(collections.v2SidebarCollections.get(collectionId)?.name).toBe(
			"Keep",
		);
	});

	it("toggles collapse", () => {
		const collections = makeCollections();
		const collectionId = createCollectionInState(collections);

		toggleCollectionCollapsedInState(collections, collectionId);
		expect(
			collections.v2SidebarCollections.get(collectionId)?.isCollapsed,
		).toBe(true);

		toggleCollectionCollapsedInState(collections, collectionId);
		expect(
			collections.v2SidebarCollections.get(collectionId)?.isCollapsed,
		).toBe(false);
	});

	it("sets and clears colour", () => {
		const collections = makeCollections();
		const collectionId = createCollectionInState(collections);

		setCollectionColorInState(collections, collectionId, "#ef4444");
		expect(collections.v2SidebarCollections.get(collectionId)?.color).toBe(
			"#ef4444",
		);

		setCollectionColorInState(collections, collectionId, null);
		expect(
			collections.v2SidebarCollections.get(collectionId)?.color,
		).toBeNull();
	});

	it("moves a project into a collection and back to the root", () => {
		const collections = makeCollections([projectRow("project-1")]);
		const collectionId = createCollectionInState(collections);

		moveProjectToCollectionInState(collections, "project-1", collectionId);
		expect(collections.v2SidebarProjects.get("project-1")?.collectionId).toBe(
			collectionId,
		);

		moveProjectToCollectionInState(collections, "project-1", null);
		expect(
			collections.v2SidebarProjects.get("project-1")?.collectionId,
		).toBeNull();
	});

	it("ignores a move into a collection that does not exist", () => {
		const collections = makeCollections([projectRow("project-1")]);

		moveProjectToCollectionInState(
			collections,
			"project-1",
			"missing-collection",
		);

		expect(
			collections.v2SidebarProjects.get("project-1")?.collectionId,
		).toBeNull();
	});

	it("returns projects to the root when their collection is deleted", () => {
		const collections = makeCollections([
			projectRow("project-1"),
			projectRow("project-2"),
		]);
		const collectionId = createCollectionInState(collections);
		moveProjectToCollectionInState(collections, "project-1", collectionId);
		moveProjectToCollectionInState(collections, "project-2", collectionId);

		deleteCollectionInState(collections, collectionId);

		// The collection is gone but both repos survive, back at the root.
		expect(collections.v2SidebarCollections.get(collectionId)).toBeUndefined();
		expect(
			collections.v2SidebarProjects.get("project-1")?.collectionId,
		).toBeNull();
		expect(
			collections.v2SidebarProjects.get("project-2")?.collectionId,
		).toBeNull();
	});

	it("leaves projects in other collections untouched on delete", () => {
		const collections = makeCollections([
			projectRow("project-1"),
			projectRow("project-2"),
		]);
		const keptCollectionId = createCollectionInState(collections);
		const deletedCollectionId = createCollectionInState(collections);
		moveProjectToCollectionInState(collections, "project-1", keptCollectionId);
		moveProjectToCollectionInState(
			collections,
			"project-2",
			deletedCollectionId,
		);

		deleteCollectionInState(collections, deletedCollectionId);

		expect(collections.v2SidebarProjects.get("project-1")?.collectionId).toBe(
			keptCollectionId,
		);
		expect(
			collections.v2SidebarProjects.get("project-2")?.collectionId,
		).toBeNull();
	});

	it("reorders collections by list position", () => {
		const collections = makeCollections();
		const a = createCollectionInState(collections, { name: "A" });
		const b = createCollectionInState(collections, { name: "B" });

		reorderCollectionsInState(collections, [b, a]);

		expect(collections.v2SidebarCollections.get(b)?.tabOrder).toBe(1);
		expect(collections.v2SidebarCollections.get(a)?.tabOrder).toBe(2);
	});
});

describe("setCollectionIconInState", () => {
	it("sets an emoji and clears it again", () => {
		const collections = makeCollections();
		const collectionId = createCollectionInState(collections);

		setCollectionIconInState(collections, collectionId, "💼");
		expect(collections.v2SidebarCollections.get(collectionId)?.icon).toBe("💼");

		setCollectionIconInState(collections, collectionId, null);
		expect(collections.v2SidebarCollections.get(collectionId)?.icon).toBeNull();
	});

	it("stores an image icon as given — a data URL is just a longer string", () => {
		const collections = makeCollections();
		const collectionId = createCollectionInState(collections);
		const dataUrl = "data:image/png;base64,iVBORw0KGgo=";

		setCollectionIconInState(collections, collectionId, dataUrl);

		expect(collections.v2SidebarCollections.get(collectionId)?.icon).toBe(
			dataUrl,
		);
	});

	it("ignores a collection that isn't there", () => {
		const collections = makeCollections();

		expect(() =>
			setCollectionIconInState(
				collections,
				"11111111-1111-4111-8111-111111111111",
				"💼",
			),
		).not.toThrow();
	});
});
