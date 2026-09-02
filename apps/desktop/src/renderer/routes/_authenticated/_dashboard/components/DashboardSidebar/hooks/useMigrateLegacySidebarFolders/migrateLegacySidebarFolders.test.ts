import { describe, expect, it } from "bun:test";
import { buildSidebarFolderKey } from "renderer/routes/_authenticated/utils/workspaceTagFolders";
import {
	type LegacyFolderMigrationIo,
	type MigrationHostRow,
	type MigrationLocalRow,
	type MigrationSectionRow,
	migrateLegacySidebarFolders,
} from "./migrateLegacySidebarFolders";

const PROJECT = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const LEGACY_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const DATE = new Date("2026-01-01T00:00:00.000Z");

function makeLegacySection(
	overrides: Partial<MigrationSectionRow> = {},
): MigrationSectionRow {
	return {
		sectionId: LEGACY_ID,
		projectId: PROJECT,
		name: "Perf Work",
		tag: null,
		color: "#abcdef",
		tabOrder: 3,
		isCollapsed: true,
		createdAt: DATE,
		...overrides,
	};
}

function makeHarness(args: {
	sections: MigrationSectionRow[];
	localRows?: MigrationLocalRow[];
	hostRows?: Array<
		Omit<MigrationHostRow, "projectId"> & { projectId?: string | null }
	>;
	rejectWritesFor?: Set<string>;
}) {
	const writes: Array<{ workspaceId: string; tags: string[] }> = [];
	const inserted: Array<MigrationSectionRow & { tag: string }> = [];
	const deleted: string[] = [];
	const cleared: Array<{ workspaceId: string; legacySectionId: string }> = [];
	const io: LegacyFolderMigrationIo = {
		sections: args.sections,
		localRows: args.localRows ?? [],
		hostRowsById: new Map(
			(args.hostRows ?? []).map((row) => [
				row.id,
				{ projectId: PROJECT, ...row },
			]),
		),
		writeTags: async (workspaceId, tags) => {
			if (args.rejectWritesFor?.has(workspaceId)) {
				throw new Error("rejected");
			}
			writes.push({ workspaceId, tags });
		},
		insertSection: (row) => inserted.push(row),
		deleteSection: (sectionId) => deleted.push(sectionId),
		clearLocalSectionId: (workspaceId, legacySectionId) =>
			cleared.push({ workspaceId, legacySectionId }),
	};
	return { io, writes, inserted, deleted, cleared };
}

describe("migrateLegacySidebarFolders", () => {
	it("converts a legacy folder: tags members, swaps the row, clears pointers", async () => {
		const h = makeHarness({
			sections: [makeLegacySection()],
			localRows: [
				{ workspaceId: "w1", sectionId: LEGACY_ID, isVisible: true },
				{ workspaceId: "w2", sectionId: LEGACY_ID, isVisible: true },
				{ workspaceId: "w3", sectionId: null, isVisible: true },
			],
			hostRows: [
				{ id: "w1", tags: [], hostReachable: true },
				{ id: "w2", tags: ["scratch"], hostReachable: true },
				{ id: "w3", tags: [], hostReachable: true },
			],
		});
		const result = await migrateLegacySidebarFolders(h.io, new Set());

		expect(result.converted).toEqual([LEGACY_ID]);
		expect(h.writes).toEqual([
			{ workspaceId: "w1", tags: ["perf work"] },
			// Existing tags survive — the folder tag is ADDED, never a replace.
			{ workspaceId: "w2", tags: ["perf work", "scratch"] },
		]);
		expect(h.inserted).toHaveLength(1);
		expect(h.inserted[0]).toMatchObject({
			sectionId: buildSidebarFolderKey(PROJECT, "perf work"),
			tag: "perf work",
			name: "Perf Work",
			color: "#abcdef",
			tabOrder: 3,
			isCollapsed: true,
			createdAt: DATE,
		});
		expect(h.deleted).toEqual([LEGACY_ID]);
		expect(h.cleared).toEqual([
			{ workspaceId: "w1", legacySectionId: LEGACY_ID },
			{ workspaceId: "w2", legacySectionId: LEGACY_ID },
		]);
	});

	it("never resurrects a hidden tombstone as a member", async () => {
		const h = makeHarness({
			sections: [makeLegacySection()],
			localRows: [
				{ workspaceId: "w1", sectionId: LEGACY_ID, isVisible: true },
				{ workspaceId: "w-hidden", sectionId: LEGACY_ID, isVisible: false },
			],
			hostRows: [{ id: "w1", tags: [], hostReachable: true }],
		});
		const result = await migrateLegacySidebarFolders(h.io, new Set());
		expect(result.converted).toEqual([LEGACY_ID]);
		expect(h.writes.map((w) => w.workspaceId)).toEqual(["w1"]);
		expect(h.cleared.map((c) => c.workspaceId)).toEqual(["w1"]);
	});

	it("defers the whole folder when any member's host is unreachable", async () => {
		const h = makeHarness({
			sections: [makeLegacySection()],
			localRows: [
				{ workspaceId: "w1", sectionId: LEGACY_ID, isVisible: true },
				{ workspaceId: "w2", sectionId: LEGACY_ID, isVisible: true },
			],
			hostRows: [
				{ id: "w1", tags: [], hostReachable: true },
				{ id: "w2", tags: [], hostReachable: false },
			],
		});
		const result = await migrateLegacySidebarFolders(h.io, new Set());
		expect(result.deferred).toEqual([LEGACY_ID]);
		expect(result.converted).toEqual([]);
		expect(h.writes).toEqual([]);
		expect(h.inserted).toEqual([]);
		expect(h.deleted).toEqual([]);
	});

	it("parks the folder for the session when a host rejects a write", async () => {
		const parked = new Set<string>();
		const h = makeHarness({
			sections: [makeLegacySection()],
			localRows: [{ workspaceId: "w1", sectionId: LEGACY_ID, isVisible: true }],
			hostRows: [{ id: "w1", tags: [], hostReachable: true }],
			rejectWritesFor: new Set(["w1"]),
		});
		const result = await migrateLegacySidebarFolders(h.io, parked);
		expect(result.parked).toEqual([LEGACY_ID]);
		expect(parked.has(LEGACY_ID)).toBe(true);
		expect(h.inserted).toEqual([]);
		expect(h.deleted).toEqual([]);

		// A parked folder is skipped on the next run.
		const again = await migrateLegacySidebarFolders(h.io, parked);
		expect(again.parked).toEqual([]);
		expect(again.converted).toEqual([]);
	});

	it("is idempotent: tag-backed rows are skipped, already-tagged members are not rewritten", async () => {
		const converted = makeLegacySection({
			sectionId: buildSidebarFolderKey(PROJECT, "perf work"),
			tag: "perf work",
		});
		const retry = makeLegacySection();
		const h = makeHarness({
			sections: [converted, retry],
			localRows: [{ workspaceId: "w1", sectionId: LEGACY_ID, isVisible: true }],
			// Partial earlier run already tagged w1.
			hostRows: [{ id: "w1", tags: ["perf work"], hostReachable: true }],
		});
		const result = await migrateLegacySidebarFolders(h.io, new Set());
		// The retry folder's name collides with the converted row's tag, so it
		// mints perf work-2 rather than merging into the customised folder.
		expect(h.writes).toEqual([
			{ workspaceId: "w1", tags: ["perf work", "perf work-2"] },
		]);
		expect(result.converted).toEqual([LEGACY_ID]);
	});

	it("falls back to `group` for an unsluggable name and suffixes collisions across folders in one run", async () => {
		const first = makeLegacySection({
			sectionId: "11111111-1111-4111-8111-111111111111",
			name: "  ",
			tabOrder: 1,
		});
		const second = makeLegacySection({
			sectionId: "22222222-2222-4222-8222-222222222222",
			name: "\t",
			tabOrder: 2,
		});
		const h = makeHarness({ sections: [first, second] });
		const result = await migrateLegacySidebarFolders(h.io, new Set());
		expect(result.converted).toHaveLength(2);
		expect(h.inserted.map((row) => row.tag)).toEqual(["group", "group-2"]);
	});

	it("converts an empty folder immediately (vacuously all-landed)", async () => {
		const h = makeHarness({ sections: [makeLegacySection()] });
		const result = await migrateLegacySidebarFolders(h.io, new Set());
		expect(result.converted).toEqual([LEGACY_ID]);
		expect(h.writes).toEqual([]);
		expect(h.inserted[0]?.tag).toBe("perf work");
		expect(h.deleted).toEqual([LEGACY_ID]);
	});

	it("skips a stale member whose workspace no host serves and still converts", async () => {
		const h = makeHarness({
			sections: [makeLegacySection()],
			localRows: [
				{ workspaceId: "w1", sectionId: LEGACY_ID, isVisible: true },
				// Points at a deleted workspace: no host row anywhere. Must not
				// hold the folder legacy forever.
				{ workspaceId: "w-dead", sectionId: LEGACY_ID, isVisible: true },
			],
			hostRows: [{ id: "w1", tags: [], hostReachable: true }],
		});
		const result = await migrateLegacySidebarFolders(h.io, new Set());
		expect(result.converted).toEqual([LEGACY_ID]);
		expect(h.writes.map((w) => w.workspaceId)).toEqual(["w1"]);
		expect(h.cleared.map((c) => c.workspaceId)).toEqual(["w1"]);
	});

	it("a partial earlier run's tag is reused on retry, not suffixed", async () => {
		// w1 was tagged by a previous run that died before the row swap; no
		// stored row exists and no non-member carries the tag. The retry must
		// converge on the same tag.
		const h = makeHarness({
			sections: [makeLegacySection()],
			localRows: [
				{ workspaceId: "w1", sectionId: LEGACY_ID, isVisible: true },
				{ workspaceId: "w2", sectionId: LEGACY_ID, isVisible: true },
			],
			hostRows: [
				{ id: "w1", tags: ["perf work"], hostReachable: true },
				{ id: "w2", tags: [], hostReachable: true },
			],
		});
		const result = await migrateLegacySidebarFolders(h.io, new Set());
		expect(result.converted).toEqual([LEGACY_ID]);
		expect(h.writes).toEqual([{ workspaceId: "w2", tags: ["perf work"] }]);
		expect(h.inserted[0]?.tag).toBe("perf work");
	});

	it("a derived folder (tag on a NON-member workspace) collides to -2 instead of merging", async () => {
		const h = makeHarness({
			sections: [makeLegacySection()],
			localRows: [{ workspaceId: "w1", sectionId: LEGACY_ID, isVisible: true }],
			hostRows: [
				{ id: "w1", tags: [], hostReachable: true },
				// An agent tagged an unrelated workspace "perf work" — that
				// derived folder must not absorb the legacy group.
				{ id: "w-outsider", tags: ["perf work"], hostReachable: true },
			],
		});
		const result = await migrateLegacySidebarFolders(h.io, new Set());
		expect(result.converted).toEqual([LEGACY_ID]);
		expect(h.writes).toEqual([{ workspaceId: "w1", tags: ["perf work-2"] }]);
		expect(h.inserted[0]?.tag).toBe("perf work-2");
	});

	it("handles a section row with the tag field ABSENT as legacy", async () => {
		const section = makeLegacySection();
		delete (section as { tag?: unknown }).tag;
		const h = makeHarness({ sections: [section] });
		const result = await migrateLegacySidebarFolders(h.io, new Set());
		expect(result.converted).toEqual([LEGACY_ID]);
	});
});
