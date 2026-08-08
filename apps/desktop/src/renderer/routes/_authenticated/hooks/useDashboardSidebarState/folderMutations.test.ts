import { describe, expect, it } from "bun:test";
import {
	createFolderInState,
	deleteFolderInState,
	moveProjectToFolderInState,
	renameFolderInState,
	reorderFoldersInState,
	setFolderColorInState,
	setFolderIconInState,
	toggleFolderCollapsedInState,
} from "./folderMutations";

/**
 * Minimal in-memory stand-in for a TanStack DB collection, matching the surface
 * the folder mutations touch. Mirrors the harness in sidebarMutations.test.ts.
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

type FolderRow = {
	folderId: string;
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
	folderId: string | null;
};

function makeCollections(projects: ProjectRow[] = []) {
	const v2SidebarFolders = makeCollection<FolderRow>((row) => row.folderId);
	const v2SidebarProjects = makeCollection<ProjectRow>((row) => row.projectId);
	for (const project of projects) v2SidebarProjects.insert(project);
	// Cast: the harness implements only the surface these mutations use.
	return { v2SidebarFolders, v2SidebarProjects } as unknown as Parameters<
		typeof createFolderInState
	>[0] & {
		v2SidebarFolders: typeof v2SidebarFolders;
		v2SidebarProjects: typeof v2SidebarProjects;
	};
}

function projectRow(
	projectId: string,
	folderId: string | null = null,
): ProjectRow {
	return {
		projectId,
		createdAt: new Date("2026-01-01T00:00:00.000Z"),
		isCollapsed: false,
		tabOrder: 1,
		defaultOpenInApp: null,
		folderId,
	};
}

describe("folder mutations", () => {
	it("creates a folder with a name, colour and increasing tabOrder", () => {
		const collections = makeCollections();

		const first = createFolderInState(collections, { name: "Work" });
		const second = createFolderInState(collections, { name: "Personal" });

		const firstRow = collections.v2SidebarFolders.get(first);
		const secondRow = collections.v2SidebarFolders.get(second);
		expect(firstRow?.name).toBe("Work");
		expect(firstRow?.color).toBeTruthy();
		expect(secondRow?.tabOrder).toBeGreaterThan(firstRow?.tabOrder ?? 0);
	});

	it("defaults the name when none is given", () => {
		const collections = makeCollections();
		const folderId = createFolderInState(collections);
		expect(collections.v2SidebarFolders.get(folderId)?.name).toBe("New folder");
	});

	it("falls back to the default name when given a blank one", () => {
		const collections = makeCollections();
		// A whitespace-only name would fail the schema's .min(1) at insert.
		const folderId = createFolderInState(collections, { name: "   " });
		expect(collections.v2SidebarFolders.get(folderId)?.name).toBe("New folder");
	});

	it("trims the name on create", () => {
		const collections = makeCollections();
		const folderId = createFolderInState(collections, { name: "  Work  " });
		expect(collections.v2SidebarFolders.get(folderId)?.name).toBe("Work");
	});

	it("renames a folder and trims whitespace", () => {
		const collections = makeCollections();
		const folderId = createFolderInState(collections, { name: "Old" });

		renameFolderInState(collections, folderId, "  Renamed  ");

		expect(collections.v2SidebarFolders.get(folderId)?.name).toBe("Renamed");
	});

	it("ignores a blank rename", () => {
		const collections = makeCollections();
		const folderId = createFolderInState(collections, { name: "Keep" });

		renameFolderInState(collections, folderId, "   ");

		expect(collections.v2SidebarFolders.get(folderId)?.name).toBe("Keep");
	});

	it("toggles collapse", () => {
		const collections = makeCollections();
		const folderId = createFolderInState(collections);

		toggleFolderCollapsedInState(collections, folderId);
		expect(collections.v2SidebarFolders.get(folderId)?.isCollapsed).toBe(true);

		toggleFolderCollapsedInState(collections, folderId);
		expect(collections.v2SidebarFolders.get(folderId)?.isCollapsed).toBe(false);
	});

	it("sets and clears colour", () => {
		const collections = makeCollections();
		const folderId = createFolderInState(collections);

		setFolderColorInState(collections, folderId, "#ef4444");
		expect(collections.v2SidebarFolders.get(folderId)?.color).toBe("#ef4444");

		setFolderColorInState(collections, folderId, null);
		expect(collections.v2SidebarFolders.get(folderId)?.color).toBeNull();
	});

	it("moves a project into a folder and back to the root", () => {
		const collections = makeCollections([projectRow("project-1")]);
		const folderId = createFolderInState(collections);

		moveProjectToFolderInState(collections, "project-1", folderId);
		expect(collections.v2SidebarProjects.get("project-1")?.folderId).toBe(
			folderId,
		);

		moveProjectToFolderInState(collections, "project-1", null);
		expect(collections.v2SidebarProjects.get("project-1")?.folderId).toBeNull();
	});

	it("ignores a move into a folder that does not exist", () => {
		const collections = makeCollections([projectRow("project-1")]);

		moveProjectToFolderInState(collections, "project-1", "missing-folder");

		expect(collections.v2SidebarProjects.get("project-1")?.folderId).toBeNull();
	});

	it("returns projects to the root when their folder is deleted", () => {
		const collections = makeCollections([
			projectRow("project-1"),
			projectRow("project-2"),
		]);
		const folderId = createFolderInState(collections);
		moveProjectToFolderInState(collections, "project-1", folderId);
		moveProjectToFolderInState(collections, "project-2", folderId);

		deleteFolderInState(collections, folderId);

		// The folder is gone but both repos survive, back at the root.
		expect(collections.v2SidebarFolders.get(folderId)).toBeUndefined();
		expect(collections.v2SidebarProjects.get("project-1")?.folderId).toBeNull();
		expect(collections.v2SidebarProjects.get("project-2")?.folderId).toBeNull();
	});

	it("leaves projects in other folders untouched on delete", () => {
		const collections = makeCollections([
			projectRow("project-1"),
			projectRow("project-2"),
		]);
		const keptFolderId = createFolderInState(collections);
		const deletedFolderId = createFolderInState(collections);
		moveProjectToFolderInState(collections, "project-1", keptFolderId);
		moveProjectToFolderInState(collections, "project-2", deletedFolderId);

		deleteFolderInState(collections, deletedFolderId);

		expect(collections.v2SidebarProjects.get("project-1")?.folderId).toBe(
			keptFolderId,
		);
		expect(collections.v2SidebarProjects.get("project-2")?.folderId).toBeNull();
	});

	it("reorders folders by list position", () => {
		const collections = makeCollections();
		const a = createFolderInState(collections, { name: "A" });
		const b = createFolderInState(collections, { name: "B" });

		reorderFoldersInState(collections, [b, a]);

		expect(collections.v2SidebarFolders.get(b)?.tabOrder).toBe(1);
		expect(collections.v2SidebarFolders.get(a)?.tabOrder).toBe(2);
	});
});

describe("setFolderIconInState", () => {
	it("sets an emoji and clears it again", () => {
		const collections = makeCollections();
		const folderId = createFolderInState(collections);

		setFolderIconInState(collections, folderId, "💼");
		expect(collections.v2SidebarFolders.get(folderId)?.icon).toBe("💼");

		setFolderIconInState(collections, folderId, null);
		expect(collections.v2SidebarFolders.get(folderId)?.icon).toBeNull();
	});

	it("stores an image icon as given — a data URL is just a longer string", () => {
		const collections = makeCollections();
		const folderId = createFolderInState(collections);
		const dataUrl = "data:image/png;base64,iVBORw0KGgo=";

		setFolderIconInState(collections, folderId, dataUrl);

		expect(collections.v2SidebarFolders.get(folderId)?.icon).toBe(dataUrl);
	});

	it("ignores a folder that isn't there", () => {
		const collections = makeCollections();

		expect(() =>
			setFolderIconInState(
				collections,
				"11111111-1111-4111-8111-111111111111",
				"💼",
			),
		).not.toThrow();
	});
});
